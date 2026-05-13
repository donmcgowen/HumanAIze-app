import { ENV } from "./_core/env";

export type DexcomShareCredentials = {
  shareUsername: string;
  sharePassword: string;
  shareRegion?: string;
};

export type DexcomShareReading = {
  mgdl: number;
  trend: string;
  readingAt: string;
};

type BridgeResponse = {
  entries?: unknown[];
  readings?: unknown[];
  records?: unknown[];
  data?: unknown[];
};

const DEXCOM_SHARE_APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";

function getDexcomShareBaseUrl(region: string): string {
  return region === "eu"
    ? "https://shareous1.dexcom.com/ShareWebServices/Services"
    : "https://share2.dexcom.com/ShareWebServices/Services";
}

function normalizeRegion(region: string | undefined): string {
  const value = (region || "us").trim().toLowerCase();
  return value === "eu" ? "eu" : "us";
}

function normalizeBridgeBaseUrl(): string {
  const base = ENV.dexcomShareBridgeUrl.trim().replace(/\/+$/, "");
  if (!base) {
    return "";
  }
  return base;
}

function parseTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    const dexcomDateMatch = trimmed.match(/\/Date\((\d+)/);
    if (dexcomDateMatch) {
      return new Date(Number(dexcomDateMatch[1])).toISOString();
    }

    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
      return new Date(asNumber).toISOString();
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeTrend(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number") {
    const trendMap: Record<number, string> = {
      1: "DoubleUp",
      2: "SingleUp",
      3: "FortyFiveUp",
      4: "Flat",
      5: "FortyFiveDown",
      6: "SingleDown",
      7: "DoubleDown",
      8: "NotComputable",
      9: "RateOutOfRange",
    };
    return trendMap[value] || "Flat";
  }

  return "Flat";
}

function normalizeReading(record: any): DexcomShareReading | null {
  const mgdlRaw = record?.mgdl ?? record?.sgv ?? record?.value ?? record?.Value;
  const mgdl = Number(mgdlRaw);
  if (!Number.isFinite(mgdl) || mgdl <= 0) return null;

  const readingAt = parseTimestamp(
    record?.readingAt ?? record?.dateString ?? record?.date ?? record?.displayTime ?? record?.WT
  );

  const trend = normalizeTrend(record?.trend ?? record?.direction ?? record?.Trend);

  return { mgdl, trend, readingAt };
}

async function postBridge(pathname: string, payload: Record<string, unknown>): Promise<Response> {
  const base = normalizeBridgeBaseUrl();
  if (!base) {
    throw new Error("Dexcom Share bridge is not configured");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (ENV.dexcomShareBridgeApiKey.trim()) {
    headers["x-api-key"] = ENV.dexcomShareBridgeApiKey.trim();
  }

  return fetch(`${base}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

async function tryBridgePaths(
  paths: string[],
  payload: Record<string, unknown>
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (const path of paths) {
    const response = await postBridge(path, payload);
    if (response.ok) return response;

    lastResponse = response;
    if (response.status !== 404) break;
  }

  if (!lastResponse) {
    throw new Error("Dexcom Share bridge request failed");
  }

  const details = await lastResponse.text();
  throw new Error(
    `Dexcom Share bridge error: ${lastResponse.status} ${details || lastResponse.statusText}`
  );
}

function unwrapSessionId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function getDexcomShareSession(
  credentials: DexcomShareCredentials
): Promise<string> {
  const region = normalizeRegion(credentials.shareRegion);
  const baseUrl = getDexcomShareBaseUrl(region);

  const response = await fetch(`${baseUrl}/General/AuthenticatePublisherAccount`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      accountName: credentials.shareUsername,
      password: credentials.sharePassword,
      applicationId: DEXCOM_SHARE_APP_ID,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Dexcom Share auth failed: ${response.status} ${details || response.statusText}`);
  }

  const sessionId = unwrapSessionId(await response.text());
  if (!sessionId) {
    throw new Error("Dexcom Share auth failed: empty session id");
  }

  return sessionId;
}

async function fetchDexcomShareReadingsDirect(
  credentials: DexcomShareCredentials,
  minutes: number,
  maxCount: number
): Promise<DexcomShareReading[]> {
  const region = normalizeRegion(credentials.shareRegion);
  const baseUrl = getDexcomShareBaseUrl(region);
  const sessionId = await getDexcomShareSession(credentials);

  const query = new URLSearchParams({
    sessionID: sessionId,
    minutes: String(Math.max(1, minutes)),
    maxCount: String(Math.max(1, maxCount)),
  });

  const response = await fetch(`${baseUrl}/Publisher/ReadPublisherLatestGlucoseValues?${query.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Dexcom Share readings failed: ${response.status} ${details || response.statusText}`);
  }

  const json = (await response.json()) as unknown;
  const rawRecords = Array.isArray(json) ? json : [];

  return rawRecords
    .map((record) => normalizeReading(record))
    .filter((record): record is DexcomShareReading => !!record)
    .sort((a, b) => new Date(b.readingAt).getTime() - new Date(a.readingAt).getTime());
}

export async function validateDexcomShareCredentials(
  credentials: DexcomShareCredentials
): Promise<boolean> {
  const payload = {
    username: credentials.shareUsername,
    password: credentials.sharePassword,
    region: normalizeRegion(credentials.shareRegion),
  };

  try {
    if (normalizeBridgeBaseUrl()) {
      await tryBridgePaths(
        [
          "/api/v1/dexcom-share/validate",
          "/api/dexcom-share/validate",
          "/dexcom-share/validate",
        ],
        payload
      );
      return true;
    }

    await getDexcomShareSession(credentials);
    return true;
  } catch {
    return false;
  }
}

export async function fetchDexcomShareReadings(
  credentials: DexcomShareCredentials,
  minutes: number = 24 * 60,
  maxCount: number = 288
): Promise<DexcomShareReading[]> {
  if (!credentials.shareUsername || !credentials.sharePassword) {
    throw new Error("Dexcom Share username and password are required");
  }

  if (!normalizeBridgeBaseUrl()) {
    return fetchDexcomShareReadingsDirect(credentials, minutes, maxCount);
  }

  const payload = {
    username: credentials.shareUsername,
    password: credentials.sharePassword,
    region: normalizeRegion(credentials.shareRegion),
    minutes,
    maxCount,
  };

  const response = await tryBridgePaths(
    [
      "/api/v1/dexcom-share/entries",
      "/api/dexcom-share/entries",
      "/dexcom-share/entries",
    ],
    payload
  );

  const json = (await response.json()) as unknown;
  const rawRecords = Array.isArray(json)
    ? json
    : Array.isArray((json as BridgeResponse)?.entries)
      ? (json as BridgeResponse).entries
      : Array.isArray((json as BridgeResponse)?.readings)
        ? (json as BridgeResponse).readings
        : Array.isArray((json as BridgeResponse)?.records)
          ? (json as BridgeResponse).records
          : Array.isArray((json as BridgeResponse)?.data)
            ? (json as BridgeResponse).data
            : [];

  const normalized = (rawRecords ?? [])
    .map((record) => normalizeReading(record))
    .filter((record): record is DexcomShareReading => !!record)
    .sort((a, b) => new Date(b.readingAt).getTime() - new Date(a.readingAt).getTime());

  return normalized;
}
