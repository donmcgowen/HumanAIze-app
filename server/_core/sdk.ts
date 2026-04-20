import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify, decodeJwt } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

// ── Helpers ───────────────────────────────────────────────────────────────────
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

// ── Azure AD (Entra ID) endpoints ─────────────────────────────────────────────
function azureAdBaseUrl() {
  return `https://login.microsoftonline.com/${ENV.azureAdTenant}/oauth2/v2.0`;
}

export function buildB2CAuthorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(`${azureAdBaseUrl()}/authorize`);
  url.searchParams.set("client_id", ENV.azureAdClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface B2CTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface B2CUserInfo {
  openId: string;
  name: string;
  email: string | null;
  loginMethod: string | null;
}

export async function exchangeB2CCode(
  code: string,
  redirectUri: string
): Promise<B2CTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.azureAdClientId,
    client_secret: ENV.azureAdClientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${azureAdBaseUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`B2C token exchange failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<B2CTokenResponse>;
}

export function parseB2CIdToken(idToken: string): B2CUserInfo {
  // The id_token was just issued by B2C in response to our own code exchange —
  // we decode claims without re-verifying the signature here.
  const claims = decodeJwt(idToken) as Record<string, unknown>;

  // B2C uses "oid" (object ID) as the stable unique identifier
  const openId = (claims.oid ?? claims.sub ?? "") as string;
  const name = (claims.name ?? claims.given_name ?? "") as string;

  // B2C can return email as a string or an array (emails claim)
  let email: string | null = null;
  if (typeof claims.email === "string") email = claims.email;
  else if (Array.isArray(claims.emails) && typeof claims.emails[0] === "string")
    email = claims.emails[0];

  const idp = (claims.idp ?? claims.idp_access_token ?? null) as string | null;
  const loginMethod = idp ? idp.toLowerCase().replace(/\..+$/, "") : "azuread";

  return { openId, name, email, loginMethod };
}

// ── Session JWT ───────────────────────────────────────────────────────────────
export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const DEFAULT_APP_ID = "humanaize-local";

class SDKServer {
  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    const sessionAppId = ENV.azureAdClientId || ENV.appId || DEFAULT_APP_ID;

    return this.signSession(
      { openId, appId: sessionAppId, name: options.name ?? "" },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
    return new SignJWT({ openId: payload.openId, appId: payload.appId, name: payload.name })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), {
        algorithms: ["HS256"],
      });

      const parsed = payload as Record<string, unknown>;
      const openId = isNonEmptyString(parsed.openId) ? parsed.openId : "";
      const appId = isNonEmptyString(parsed.appId)
        ? parsed.appId
        : (ENV.azureAdClientId || ENV.appId || DEFAULT_APP_ID);
      const name = typeof parsed.name === "string" ? parsed.name : "";

      if (!openId) {
        console.warn("[Auth] Session payload missing required openId");
        return null;
      }

      return { openId, appId, name };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    // Support both cookie-based auth (web browser) and Bearer token auth (native mobile app)
    let tokenValue: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      tokenValue = authHeader.slice(7);
    } else {
      const cookies = this.parseCookies(req.headers.cookie);
      tokenValue = cookies.get(COOKIE_NAME);
    }
    const session = await this.verifySession(tokenValue);

    if (!session) throw ForbiddenError("Invalid session cookie");

    const signedInAt = new Date();

    // For local email/password auth we store numeric user id in session.openId.
    // Resolve this path via auth.getUserById so it works with either MySQL or Azure SQL fallback.
    if (/^\d+$/.test(session.openId)) {
      const numericUserId = Number(session.openId);
      if (Number.isFinite(numericUserId) && numericUserId > 0) {
        const { getUserById } = await import("../auth");
        const localUser = await getUserById(numericUserId);

        if (localUser) {
          return {
            id: localUser.id,
            openId: session.openId,
            username: localUser.username,
            passwordHash: null,
            name: localUser.name,
            email: localUser.email,
            loginMethod: "custom",
            role: localUser.role ?? "user",
            createdAt: signedInAt,
            updatedAt: signedInAt,
            lastSignedIn: signedInAt,
          } as User;
        }
      }
    }

    let user = await db.getUserByOpenId(session.openId);

    // User has a valid session but isn't in the DB — seed from session claims.
    // (Happens if the DB was migrated or on first request after table creation.)
    if (!user) {
      await db.upsertUser({
        openId: session.openId,
        name: session.name || null,
        email: null,
        loginMethod: "azuread",
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(session.openId);
    }

    if (!user) throw ForbiddenError("User not found");

    await db.upsertUser({ openId: user.openId, lastSignedIn: signedInAt });
    return user;
  }
}

export const sdk = new SDKServer();
