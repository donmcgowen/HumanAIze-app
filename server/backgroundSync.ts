import cron from "node-cron";
import { getDb } from "./db.pg";
import { eq } from "drizzle-orm";
import { healthSources, syncJobs } from "../drizzle/schema.pg";
import { importDexcomGlucose, importGlookoData, importFitbitActivity } from "./dataImport";

/**
 * Background sync scheduler for automated health data syncing
 * Runs every 5 minutes to sync all connected sources for all users
 */

let syncScheduler: ReturnType<typeof cron.schedule> | null = null;
let isSyncing = false;
let lastSyncTime: number | null = null;
let lastSyncStatus: "success" | "error" | null = null;

export async function startBackgroundSync(intervalMinutes: number = 5): Promise<void> {
  if (syncScheduler) {
    console.log("[BackgroundSync] Scheduler already running");
    return;
  }

  // Cron expression: every N minutes
  // Format: second minute hour day month dayOfWeek
  const cronExpression = `*/${intervalMinutes} * * * *`;

  syncScheduler = cron.schedule(cronExpression, async () => {
    if (isSyncing) {
      console.log("[BackgroundSync] Sync already in progress, skipping this cycle");
      return;
    }

    try {
      isSyncing = true;
      await performGlobalSync();
    } catch (error) {
      console.error("[BackgroundSync] Error during sync cycle:", error);
    } finally {
      isSyncing = false;
    }
  });

  console.log(`[BackgroundSync] Started scheduler - syncing every ${intervalMinutes} minutes`);
}

export async function stopBackgroundSync(): Promise<void> {
  if (syncScheduler) {
    syncScheduler.stop();
    syncScheduler = null;
    console.log("[BackgroundSync] Stopped scheduler");
  }
}

/**
 * Perform sync for all users and all their connected sources
 */
async function performGlobalSync(): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn("[BackgroundSync] Database not available");
    return;
  }

  try {
    // Get all connected sources across all users
    const connectedSources = await db
      .select()
      .from(healthSources)
      .where(eq(healthSources.status, "connected"));

    if (connectedSources.length === 0) {
      console.log("[BackgroundSync] No connected sources to sync");
      return;
    }

    console.log(`[BackgroundSync] Starting sync for ${connectedSources.length} sources`);

    // Group sources by user for efficient processing
    const sourcesByUser = new Map<number, typeof connectedSources>();
    for (const source of connectedSources) {
      if (!sourcesByUser.has(source.userId)) {
        sourcesByUser.set(source.userId, []);
      }
      sourcesByUser.get(source.userId)!.push(source);
    }

    // Sync each user's sources
    sourcesByUser.forEach(async (userSources, userId) => {
      await syncUserSources(userId, userSources);
    });

    console.log("[BackgroundSync] Global sync cycle completed");
  } catch (error) {
    console.error("[BackgroundSync] Failed to perform global sync:", error);
  }
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        console.log(
          `[BackgroundSync] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Sync all sources for a specific user
 */
async function syncUserSources(
  userId: number,
  sources: typeof healthSources.$inferSelect[]
): Promise<void> {
  const db = getDb();
  if (!db) return;

  for (const source of sources) {
    try {
      // Skip if no credentials stored
      if (!source.metadata || typeof source.metadata !== "object") {
        continue;
      }

      const metadata = source.metadata as Record<string, unknown>;
      const credentials = (metadata.credentials as Record<string, string>) || {};

      if (Object.keys(credentials).length === 0) {
        continue;
      }

      let result = null;

      // Call appropriate import function with retry logic
      try {
        switch (source.provider) {
          case "dexcom":
            result = await retryWithBackoff(
              () => importDexcomGlucose(userId, source.id, credentials, 1),
              2 // Max 2 retries for Dexcom
            );
            break;
          case "fitbit":
            result = await retryWithBackoff(
              () => importFitbitActivity(userId, source.id, credentials, 1),
              2
            );
            break;
          case "glooko":
            result = await retryWithBackoff(
              () => importGlookoData(userId, source.id, credentials, 1),
              2
            );
            break;
          default:
            continue;
        }
      } catch (retryError) {
        // If retries exhausted, record as error
        result = {
          success: false,
          recordsImported: 0,
          error: retryError instanceof Error ? retryError.message : "Max retries exceeded",
        };
      }

      if (result) {
        // Record sync job
        await db.insert(syncJobs).values({
          userId,
          sourceId: source.id,
          startedAt: Date.now() - 1000, // Approximate start time
          finishedAt: Date.now(),
          status: result.success ? "success" : "error",
          recordCount: result.recordsImported,
          errorMessage: result.error || null,
        });

        // Update source's last sync timestamp
        await db
          .update(healthSources)
          .set({
            lastSyncAt: Date.now(),
            lastSyncStatus: result.success ? "success" : "error",
            lastError: result.error || null,
          })
          .where(eq(healthSources.id, source.id));

        // Update global sync status
        updateSyncStatus(result.success ? "success" : "error");

        if (result.success) {
          console.log(
            `[BackgroundSync] ✓ ${source.displayName} (user: ${userId}): ${result.recordsImported} records`
          );
        } else {
          console.warn(
            `[BackgroundSync] ✗ ${source.displayName} (user: ${userId}): ${result.error}`
          );
        }
      }
    } catch (error) {
      console.error(
        `[BackgroundSync] Error syncing ${source.displayName} for user ${userId}:`,
        error
      );

      // Record failed sync
      try {
        await db.insert(syncJobs).values({
          userId,
          sourceId: source.id,
          startedAt: Date.now() - 1000,
          finishedAt: Date.now(),
          status: "error",
          recordCount: 0,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      } catch (e) {
        console.error("[BackgroundSync] Failed to record sync job:", e);
      }
    }
  }
}

/**
 * Update last sync status
 */
export function updateSyncStatus(status: "success" | "error"): void {
  lastSyncTime = Date.now();
  lastSyncStatus = status;
}

/**
 * Get current sync status
 */
export function getSyncStatus(): {
  isRunning: boolean;
  isSyncing: boolean;
  lastCheck: number;
  lastSyncTime: number | null;
  lastSyncStatus: "success" | "error" | null;
} {
  return {
    isRunning: syncScheduler !== null,
    isSyncing,
    lastCheck: Date.now(),
    lastSyncTime,
    lastSyncStatus,
  };
}
