import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db.pg";
import { getSessionCookieOptions } from "./cookies";
import { sdk, buildB2CAuthorizeUrl, exchangeB2CCode, parseB2CIdToken } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getRedirectUri(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : req.protocol;
  return `${protocol}://${req.get("host")}/api/oauth/callback`;
}

function buildAuthorizeUrl(req: Request): string {
  if (!ENV.azureAdTenant || !ENV.azureAdClientId) {
    throw new Error(
      "Azure AD is not configured. Set AZURE_AD_TENANT and AZURE_AD_CLIENT_ID."
    );
  }
  const redirectUri = getRedirectUri(req);
  const state = Buffer.from(redirectUri).toString("base64");
  return buildB2CAuthorizeUrl(redirectUri, state);
}

async function handleOAuthCallback(req: Request, res: Response) {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");
  const errorParam = getQueryParam(req, "error");

  if (errorParam) {
    const desc = getQueryParam(req, "error_description") ?? errorParam;
    console.error("[OAuth] B2C returned error:", desc);
    res.status(400).json({ error: desc });
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: "code and state are required" });
    return;
  }

  try {
    const redirectUri = Buffer.from(state, "base64").toString("utf8");
    const tokens = await exchangeB2CCode(code, redirectUri);
    const userInfo = parseB2CIdToken(tokens.id_token);

    if (!userInfo.openId) {
      res.status(400).json({ error: "openId (oid) missing from B2C id_token" });
      return;
    }

    await db.upsertUser({
      openId: userInfo.openId,
      name: userInfo.name || null,
      email: userInfo.email ?? null,
      loginMethod: userInfo.loginMethod,
      lastSignedIn: new Date(),
    });

    const sessionToken = await sdk.createSessionToken(userInfo.openId, {
      name: userInfo.name || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.redirect(302, "/");
  } catch (error) {
    console.error("[OAuth] B2C callback failed", error);
    res.status(500).json({ error: "OAuth callback failed" });
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/start", (req: Request, res: Response) => {
    try {
      const authUrl = buildAuthorizeUrl(req);
      res.redirect(302, authUrl);
    } catch (error) {
      console.error("[OAuth] Start failed", error);
      res.status(500).json({ error: "OAuth start failed" });
    }
  });

  app.get("/api/oauth/callback", handleOAuthCallback);
  app.get("/auth/azure/callback", handleOAuthCallback);
}
