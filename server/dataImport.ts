import { glucoseReadings, activitySamples, nutritionLogs, syncJobs, healthSources } from "../drizzle/schema";
import { getDb } from "./db";
import { eq } from "drizzle-orm";

/**
 * Data import service for connecting to third-party health APIs
 * Handles credential validation, data fetching, and normalization
 */

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  error?: string;
  lastSyncAt: number;
}

/**
 * Import glucose data from Dexcom API
 * Requires: accessToken (OAuth bearer token)
 */
export async function importDexcomGlucose(
  userId: number,
  sourceId: number,
  credentials: Record<string, string>,
  daysBack: number = 30
): Promise<ImportResult> {
  const { accessToken } = credentials;

  if (!accessToken) {
    return {
      success: false,
      recordsImported: 0,
      error: "Missing Dexcom access token",
      lastSyncAt: Date.now(),
    };
  }

  try {
    const now = new Date();
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Fetch glucose readings from Dexcom API
    const response = await fetch("https://api.dexcom.com/v2/users/self/glucoses", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      // Dexcom API supports date range filtering
    });

    if (!response.ok) {
      throw new Error(`Dexcom API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      records?: Array<{
        recordId: string;
        value: number;
        displayTime: string;
        trend?: string;
      }>;
    };

    if (!data.records || data.records.length === 0) {
      return {
        success: true,
        recordsImported: 0,
        lastSyncAt: Date.now(),
      };
    }

    // Normalize and insert glucose readings
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const readings = data.records.map((record) => ({
      userId,
      sourceId,
      readingAt: new Date(record.displayTime).getTime(),
      mgdl: record.value,
      trend: (record.trend || "steady") as "steady" | "rising" | "falling",
      mealContext: null as string | null,
      notes: null as string | null,
    }));

    // Upsert readings (avoid duplicates by recordId)
    for (const reading of readings) {
      await db
        .insert(glucoseReadings)
        .values(reading)
        .onDuplicateKeyUpdate({
          set: {
            mgdl: reading.mgdl,
            trend: reading.trend,
          },
        });
    }

    return {
      success: true,
      recordsImported: readings.length,
      lastSyncAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      recordsImported: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      lastSyncAt: Date.now(),
    };
  }
}

/**
 * Import diabetes management data from Glooko API
 * Requires: apiKey and apiSecret (partner credentials)
 */
export async function importGlookoData(
  userId: number,
  sourceId: number,
  credentials: Record<string, string>,
  daysBack: number = 30
): Promise<ImportResult> {
  const { apiKey, apiSecret } = credentials;

  if (!apiKey || !apiSecret) {
    return {
      success: false,
      recordsImported: 0,
      error: "Missing Glooko API credentials",
      lastSyncAt: Date.now(),
    };
  }

  try {
    // Create authorization header for Glooko (typically uses API key auth)
    const authHeader = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    const now = new Date();
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Fetch glucose data from Glooko API
    const response = await fetch("https://api.glooko.com/v1/users/self/glucose_readings", {
      method: "GET",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Glooko API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      glucose_readings?: Array<{
        id: string;
        value: number;
        timestamp: string;
        notes?: string;
      }>;
    };

    if (!data.glucose_readings || data.glucose_readings.length === 0) {
      return {
        success: true,
        recordsImported: 0,
        lastSyncAt: Date.now(),
      };
    }

    // Normalize and insert glucose readings
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const readings = data.glucose_readings.map((record) => ({
      userId,
      sourceId,
      readingAt: new Date(record.timestamp).getTime(),
      mgdl: record.value,
      trend: "steady" as const,
      mealContext: null as string | null,
      notes: record.notes || null,
    }));

    // Upsert readings
    for (const reading of readings) {
      await db
        .insert(glucoseReadings)
        .values(reading)
        .onDuplicateKeyUpdate({
          set: {
            mgdl: reading.mgdl,
            notes: reading.notes,
          },
        });
    }

    return {
      success: true,
      recordsImported: readings.length,
      lastSyncAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      recordsImported: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      lastSyncAt: Date.now(),
    };
  }
}

/**
 * Import activity data from Fitbit API
 * Requires: accessToken (OAuth bearer token)
 */
export async function importFitbitActivity(
  userId: number,
  sourceId: number,
  credentials: Record<string, string>,
  daysBack: number = 30
): Promise<ImportResult> {
  const { accessToken, userId: fitbitUserId } = credentials;

  if (!accessToken || !fitbitUserId) {
    return {
      success: false,
      recordsImported: 0,
      error: "Missing Fitbit credentials",
      lastSyncAt: Date.now(),
    };
  }

  try {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Fetch activity summary from Fitbit API
    const response = await fetch(
      `https://api.fitbit.com/1/user/${fitbitUserId}/activities/date/${startDate.toISOString().split("T")[0]}/today.json`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Fitbit API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      summary?: {
        steps: number;
        distance: number;
        activeMinutes: number;
        caloriesBurned: number;
      };
    };

    if (!data.summary) {
      return {
        success: true,
        recordsImported: 0,
        lastSyncAt: Date.now(),
      };
    }

    const sampleDate = startDate.getTime();
    await db
      .insert(activitySamples)
      .values({
        userId,
        sourceId,
        sampleDate,
        steps: data.summary.steps,
        activeMinutes: data.summary.activeMinutes,
        caloriesBurned: Math.round(data.summary.caloriesBurned),
        workoutMinutes: 0,
        distanceKm: data.summary.distance / 1000,
        sourceLabel: "Fitbit",
      })
      .onDuplicateKeyUpdate({
        set: {
          steps: data.summary.steps,
          activeMinutes: data.summary.activeMinutes,
          caloriesBurned: Math.round(data.summary.caloriesBurned),
        },
      });

    return {
      success: true,
      recordsImported: 1,
      lastSyncAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      recordsImported: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      lastSyncAt: Date.now(),
    };
  }
}

/**
 * Sync all connected sources for a user
 */
export async function syncAllSources(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Get all connected sources for the user
  const sources = await db.select().from(healthSources).where(eq(healthSources.userId, userId));

  for (const source of sources) {
    if (!source.metadata || typeof source.metadata !== "object") continue;

    const metadata = source.metadata as Record<string, unknown>;
    const credentials = (metadata.credentials as Record<string, string>) || {};

    let result: ImportResult | null = null;

    switch (source.provider) {
      case "dexcom":
        result = await importDexcomGlucose(userId, source.id, credentials);
        break;
      case "glooko":
        result = await importGlookoData(userId, source.id, credentials);
        break;
      case "fitbit":
        result = await importFitbitActivity(userId, source.id, credentials);
        break;
    }

    if (result) {
      // Update sync job status
      await db.insert(syncJobs).values({
        userId,
        sourceId: source.id,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        status: result.success ? "success" : "error",
        recordCount: result.recordsImported,
        errorMessage: result.error || null,
      })
    }
  }
}
