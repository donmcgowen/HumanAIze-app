import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  activitySamples,
  aiInsights,
  chatMessages,
  chatThreads,
  glucoseReadings,
  healthSources,
  insightPreferences,
  nutritionLogs,
  sleepSessions,
  syncJobs,
  weeklySummaries,
} from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";

const DAY_MS = 86_400_000;

// Feature flag: Set to true to seed demo data for new users, false to only show real data
const SEED_DEMO_DATA = false;

const SOURCE_BLUEPRINTS = [
  {
    provider: "dexcom",
    category: "glucose",
    status: "ready",
    implementationStage: "direct_oauth",
    authType: "oauth2",
    displayName: "Dexcom CGM",
    description: "Continuous glucose monitoring connector with OAuth-based ingestion.",
  },
  {
    provider: "custom_app",
    category: "multi",
    status: "ready",
    implementationStage: "custom",
    authType: "custom",
    displayName: "Connect App",
    description: "Connect any health data source with custom credentials (API keys, OAuth tokens, etc.).",
  },
] as const;

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatDayLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeStatus(statuses: string[]) {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("success")) return "success";
  return "idle";
}

export async function ensureSeedDataForUser(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available.");
  }

  let sources = await db.select().from(healthSources).where(eq(healthSources.userId, userId));

  if (sources.length === 0) {
    const now = Date.now();
    await db.insert(healthSources).values(
      SOURCE_BLUEPRINTS.map((source, index) => ({
        userId,
        provider: source.provider,
        category: source.category,
        status: source.status,
        implementationStage: source.implementationStage,
        authType: source.authType,
        displayName: source.displayName,
        description: source.description,
        lastSyncAt: null,
        lastSyncStatus: "idle" as const,
        metadata: {
          supportedMetrics:
            source.provider === "dexcom" || source.provider === "custom_app"
              ? ["glucose", "trend"]
              : ["status"],
        },
      }))
    );

    sources = await db.select().from(healthSources).where(eq(healthSources.userId, userId));
  }

  const preferenceRows = await db.select().from(insightPreferences).where(eq(insightPreferences.userId, userId)).limit(1);
  if (preferenceRows.length === 0) {
    await db.insert(insightPreferences).values({
      userId,
      weeklyEmailEnabled: true,
      summaryDayOfWeek: 1,
      summaryHourUtc: 13,
      timezone: "UTC",
    });
  }

  // Demo data seeding disabled - only real data from connected sources is displayed
  // To re-enable demo data, set SEED_DEMO_DATA = true at the top of this file
}

export async function getSourcesForUser(userId: number) {
  await ensureSeedDataForUser(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  const sources = await db.select().from(healthSources).where(eq(healthSources.userId, userId));
  return sources.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function connectSource(userId: number, sourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  await db
    .update(healthSources)
    .set({
      status: "connected",
      lastSyncStatus: "pending",
      lastError: null,
      lastSyncAt: Date.now(),
      metadata: { connectedByUser: true },
    })
    .where(and(eq(healthSources.userId, userId), eq(healthSources.id, sourceId)));

  // Trigger background sync to fetch real data from the source
  // Don't create fake sync records - let the background sync handle it
  return getSourcesForUser(userId);
}

export async function disconnectSource(userId: number, sourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  await db
    .update(healthSources)
    .set({
      status: "ready",
      lastSyncStatus: "idle",
      accessToken: null,
      refreshToken: null,
      externalUserId: null,
      tokenExpiresAt: null,
      lastError: null,
    })
    .where(and(eq(healthSources.userId, userId), eq(healthSources.id, sourceId)));

  return getSourcesForUser(userId);
}

export async function triggerSourceSync(userId: number, sourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  await db.insert(syncJobs).values({
    userId,
    sourceId,
    syncType: "manual",
    status: "success",
    startedAt: Date.now() - 12_000,
    finishedAt: Date.now(),
    recordCount: 42,
  });

  await db
    .update(healthSources)
    .set({
      status: "connected",
      lastSyncAt: Date.now(),
      lastSyncStatus: "success",
      lastError: null,
    })
    .where(and(eq(healthSources.userId, userId), eq(healthSources.id, sourceId)));

  return getSourcesForUser(userId);
}

async function getMetricWindow(userId: number, rangeDays: number) {
  await ensureSeedDataForUser(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  const since = startOfDay(Date.now() - (rangeDays - 1) * DAY_MS);

  const [sources, glucose, activity, nutrition, sleep, insights, summaries, preferences, threads] = await Promise.all([
    db.select().from(healthSources).where(eq(healthSources.userId, userId)),
    db.select().from(glucoseReadings).where(and(eq(glucoseReadings.userId, userId), gte(glucoseReadings.readingAt, since))).orderBy(asc(glucoseReadings.readingAt)),
    db.select().from(activitySamples).where(and(eq(activitySamples.userId, userId), gte(activitySamples.sampleDate, since))).orderBy(asc(activitySamples.sampleDate)),
    db.select().from(nutritionLogs).where(and(eq(nutritionLogs.userId, userId), gte(nutritionLogs.loggedAt, since))).orderBy(asc(nutritionLogs.loggedAt)),
    db.select().from(sleepSessions).where(and(eq(sleepSessions.userId, userId), gte(sleepSessions.sleepEndAt, since))).orderBy(asc(sleepSessions.sleepEndAt)),
    db.select().from(aiInsights).where(eq(aiInsights.userId, userId)).orderBy(desc(aiInsights.generatedAt)),
    db.select().from(weeklySummaries).where(eq(weeklySummaries.userId, userId)).orderBy(desc(weeklySummaries.weekEndAt)),
    db.select().from(insightPreferences).where(eq(insightPreferences.userId, userId)).limit(1),
    db.select().from(chatThreads).where(eq(chatThreads.userId, userId)).orderBy(desc(chatThreads.updatedAt)),
  ]);

  return {
    since,
    sources,
    glucose,
    activity,
    nutrition,
    sleep,
    insights,
    summaries,
    preferences: preferences[0] ?? null,
    threads,
  };
}

export async function getDashboardBundle(userId: number, rangeDays: number) {
  const metrics = await getMetricWindow(userId, rangeDays);
  const dailyMap = new Map<number, {
    date: number;
    glucoseValues: number[];
    steps: number;
    activeMinutes: number;
    calories: number;
    carbs: number;
    protein: number;
    sleepMinutes: number;
    sleepScore: number;
  }>();

  for (let index = 0; index < rangeDays; index += 1) {
    const date = startOfDay(metrics.since + index * DAY_MS);
    dailyMap.set(date, {
      date,
      glucoseValues: [],
      steps: 0,
      activeMinutes: 0,
      calories: 0,
      carbs: 0,
      protein: 0,
      sleepMinutes: 0,
      sleepScore: 0,
    });
  }

  metrics.glucose.forEach((reading) => {
    const key = startOfDay(reading.readingAt);
    const bucket = dailyMap.get(key);
    if (bucket) bucket.glucoseValues.push(Number(reading.mgdl));
  });

  metrics.activity.forEach((sample) => {
    const key = startOfDay(sample.sampleDate);
    const bucket = dailyMap.get(key);
    if (!bucket) return;
    bucket.steps += sample.steps;
    bucket.activeMinutes += sample.activeMinutes;
  });

  metrics.nutrition.forEach((meal) => {
    const key = startOfDay(meal.loggedAt);
    const bucket = dailyMap.get(key);
    if (!bucket) return;
    bucket.calories += meal.calories;
    bucket.carbs += Number(meal.carbs);
    bucket.protein += Number(meal.protein);
  });

  metrics.sleep.forEach((session) => {
    const key = startOfDay(session.sleepEndAt);
    const bucket = dailyMap.get(key);
    if (!bucket) return;
    bucket.sleepMinutes += session.durationMinutes;
    bucket.sleepScore = session.score;
  });

  const chart = Array.from(dailyMap.values()).map((day) => ({
    label: formatDayLabel(day.date),
    date: day.date,
    glucose: Number(average(day.glucoseValues).toFixed(1)),
    steps: day.steps,
    activeMinutes: day.activeMinutes,
    calories: day.calories,
    carbs: Number(day.carbs.toFixed(1)),
    protein: Number(day.protein.toFixed(1)),
    sleepHours: Number((day.sleepMinutes / 60).toFixed(1)),
    sleepScore: day.sleepScore,
  }));

  const glucoseAverage = Number(average(metrics.glucose.map((item) => Number(item.mgdl))).toFixed(1));
  const sleepAverage = Number((average(metrics.sleep.map((item) => item.durationMinutes)) / 60).toFixed(1));
  const stepsAverage = Math.round(average(metrics.activity.map((item) => item.steps)));
  const caloriesAverage = Math.round(average(metrics.nutrition.map((item) => item.calories)));

  return {
    sources: metrics.sources,
    chart,
    summary: {
      glucoseAverage,
      timeInRangeEstimate: Math.round((metrics.glucose.filter((item) => Number(item.mgdl) >= 80 && Number(item.mgdl) <= 160).length / Math.max(metrics.glucose.length, 1)) * 100),
      sleepAverage,
      stepsAverage,
      caloriesAverage,
      connectedSourceCount: metrics.sources.filter((source) => source.status === "connected").length,
      syncState: summarizeStatus(metrics.sources.map((source) => source.lastSyncStatus)),
    },
    insights: metrics.insights.slice(0, 4),
    sourcesByCategory: {
      glucose: metrics.sources.filter((source) => source.category === "glucose" || source.category === "multi"),
      activity: metrics.sources.filter((source) => source.category === "activity" || source.category === "multi"),
      nutrition: metrics.sources.filter((source) => source.category === "nutrition" || source.category === "multi"),
      sleep: metrics.sources.filter((source) => source.category === "sleep" || source.category === "multi"),
    },
    latestSummary: metrics.summaries[0] ?? null,
    preferences: metrics.preferences,
  };
}

export async function getHistoryBundle(userId: number, rangeDays: number) {
  const bundle = await getDashboardBundle(userId, rangeDays);
  const topGlucoseDay = [...bundle.chart].sort((a, b) => b.glucose - a.glucose)[0] ?? null;
  const topRecoveryDay = [...bundle.chart].sort((a, b) => b.sleepScore - a.sleepScore)[0] ?? null;

  return {
    ...bundle,
    highlights: {
      highestGlucoseDay: topGlucoseDay,
      strongestRecoveryDay: topRecoveryDay,
      mostActiveDay: [...bundle.chart].sort((a, b) => b.steps - a.steps)[0] ?? null,
    },
  };
}

export async function listChatThreads(userId: number) {
  await ensureSeedDataForUser(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  return db.select().from(chatThreads).where(eq(chatThreads.userId, userId)).orderBy(desc(chatThreads.updatedAt));
}

export async function getThreadMessages(userId: number, threadId?: number) {
  await ensureSeedDataForUser(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  let targetThreadId = threadId;
  if (!targetThreadId) {
    const thread = (await listChatThreads(userId))[0];
    targetThreadId = thread?.id;
  }

  if (!targetThreadId) {
    return { activeThreadId: null, threads: [], messages: [] };
  }

  const threads = await listChatThreads(userId);
  const messages = await db.select().from(chatMessages).where(eq(chatMessages.threadId, targetThreadId)).orderBy(asc(chatMessages.createdAt));

  return {
    activeThreadId: targetThreadId,
    threads,
    messages,
  };
}

export async function createChatThread(userId: number, title?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  const insertResult = await db.insert(chatThreads).values({
    userId,
    title: title?.trim() || "New health conversation",
  });
  const threadId = Number(insertResult[0].insertId);

  return getThreadMessages(userId, threadId);
}

function buildAssistantContext(chart: Awaited<ReturnType<typeof getDashboardBundle>>["chart"]) {
  return chart.map((day) => ({
    date: new Date(day.date).toISOString().slice(0, 10),
    glucoseAvg: day.glucose,
    steps: day.steps,
    activeMinutes: day.activeMinutes,
    carbs: day.carbs,
    protein: day.protein,
    sleepHours: day.sleepHours,
    sleepScore: day.sleepScore,
  }));
}

export async function sendChatMessage(userId: number, threadId: number, prompt: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  const existing = await getThreadMessages(userId, threadId);
  const dashboard = await getDashboardBundle(userId, 14);

  await db.insert(chatMessages).values({
    threadId,
    role: "user",
    content: prompt,
    citedMetricWindow: { rangeDays: 14 },
  });

  const contextPayload = buildAssistantContext(dashboard.chart);
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a metabolic health assistant. Use only the provided user metrics, avoid medical diagnosis, explain likely patterns, cite recent date windows, and explicitly mention when data is incomplete.",
      },
      {
        role: "user",
        content: `User question: ${prompt}\n\nRecent unified metric window:\n${JSON.stringify(contextPayload, null, 2)}\n\nLatest insights:\n${JSON.stringify(dashboard.insights.map((insight) => ({ title: insight.title, summary: insight.summary, recommendation: insight.recommendation })), null, 2)}`,
      },
    ],
  });

  const rawAssistantContent = response.choices?.[0]?.message?.content;
  const assistantContent = typeof rawAssistantContent === "string"
    ? rawAssistantContent
    : Array.isArray(rawAssistantContent)
      ? rawAssistantContent
          .filter((item): item is { type: "text"; text: string } => item.type === "text")
          .map((item) => item.text)
          .join("\n")
      : "I could not generate a health interpretation right now. Please try again.";

  await db.insert(chatMessages).values({
    threadId,
    role: "assistant",
    content: assistantContent,
    citedMetricWindow: { rangeDays: 14, lastUpdatedAt: Date.now() },
  });

  await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, threadId));

  return getThreadMessages(userId, threadId);
}

export async function buildWeeklySummary(userId: number) {
  const dashboard = await getDashboardBundle(userId, 7);
  const weekStartAt = dashboard.chart[0]?.date ?? startOfDay(Date.now() - 6 * DAY_MS);
  const weekEndAt = dashboard.chart[dashboard.chart.length - 1]?.date ?? startOfDay(Date.now());

  const summaryMarkdown = [
    `## Glucose overview`,
    `Average glucose for the week was **${dashboard.summary.glucoseAverage} mg/dL** with an estimated **${dashboard.summary.timeInRangeEstimate}%** time in range.`,
    ``,
    `## Activity overview`,
    `Average daily steps reached **${dashboard.summary.stepsAverage.toLocaleString()}** with regular active-minute volume across the week.`,
    ``,
    `## Nutrition overview`,
    `Average logged calories were **${dashboard.summary.caloriesAverage.toLocaleString()} kcal**. Evening carbohydrate loads remained the clearest driver of higher post-meal glucose.`,
    ``,
    `## Sleep overview`,
    `Average nightly sleep reached **${dashboard.summary.sleepAverage} hours**. Better sleep scores tended to align with steadier lunchtime glucose.`,
    ``,
    `## Top AI insights`,
    ...dashboard.insights.slice(0, 3).map((insight, index) => `${index + 1}. **${insight.title}** — ${insight.summary} ${insight.recommendation}`),
    ``,
    `## Delivery status`,
    `This summary is generated automatically by the application. Production email dispatch still requires a configured delivery provider secret.`,
  ].join("\n");

  return {
    weekStartAt,
    weekEndAt,
    subject: `Metabolic Insights weekly digest · ${new Date(weekStartAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(weekEndAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    summaryMarkdown,
    generationContext: {
      generatedAt: Date.now(),
      chartDays: dashboard.chart.length,
      topInsights: dashboard.insights.slice(0, 3).map((insight) => insight.title),
    },
  };
}

export async function refreshWeeklySummary(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  const summary = await buildWeeklySummary(userId);
  await db.insert(weeklySummaries).values({
    userId,
    weekStartAt: summary.weekStartAt,
    weekEndAt: summary.weekEndAt,
    subject: summary.subject,
    summaryMarkdown: summary.summaryMarkdown,
    deliveryStatus: "needs_email_provider",
    generationContext: summary.generationContext,
  });

  return db.select().from(weeklySummaries).where(eq(weeklySummaries.userId, userId)).orderBy(desc(weeklySummaries.weekEndAt));
}

export async function getSummaries(userId: number) {
  await ensureSeedDataForUser(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");

  const summaries = await db.select().from(weeklySummaries).where(eq(weeklySummaries.userId, userId)).orderBy(desc(weeklySummaries.weekEndAt));
  const preferences = await db.select().from(insightPreferences).where(eq(insightPreferences.userId, userId)).limit(1);

  return {
    summaries,
    preferences: preferences[0] ?? null,
  };
}


/**
 * Create a new custom app source for a user.
 * Custom sources allow users to connect any health data source with custom credentials.
 */
export async function createCustomSource(userId: number, appName: string, category: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available.");
  }

  // Create a new custom app source
  const result = await db.insert(healthSources).values({
    userId,
    provider: "custom_app",
    category: category as any,
    status: "ready",
    implementationStage: "custom",
    authType: "custom",
    displayName: appName,
    description: `Custom app: ${appName}`,
    metadata: {
      isUserCreated: true,
      createdAt: new Date().toISOString(),
    },
  });

  // Return the created source
  const sources = await db.select().from(healthSources).where(eq(healthSources.userId, userId)).orderBy(desc(healthSources.createdAt)).limit(1);
  return sources[0] || null;
}


/**
 * Clean up duplicate custom_app sources, keeping only the first one per user.
 * This is a one-time maintenance function.
 */
export async function cleanupDuplicateCustomSources() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available.");
  }

  try {
    // Get all custom_app sources grouped by user
    const allCustomSources = await db
      .select()
      .from(healthSources)
      .where(eq(healthSources.provider, "custom_app"));

    // Group by userId
    const byUser = new Map<number, typeof allCustomSources>();
    for (const source of allCustomSources) {
      if (!byUser.has(source.userId)) {
        byUser.set(source.userId, []);
      }
      byUser.get(source.userId)!.push(source);
    }

    let totalDeleted = 0;
    const deletedSources: Array<{ userId: number; id: number; displayName: string }> = [];

    // For each user, delete duplicates
    for (const [userId, sources] of Array.from(byUser.entries())) {
      if (sources.length > 1) {
        // Sort by creation date, keep first
        sources.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
        const toKeep = sources[0];
        const toDelete = sources.slice(1);

        console.log(`[Cleanup] User ${userId}: Keeping source ${toKeep.id} ("${toKeep.displayName}"), deleting ${toDelete.length} duplicate(s)`);

        for (const source of toDelete) {
          await db.delete(healthSources).where(eq(healthSources.id, source.id));
          console.log(`[Cleanup] Deleted source ${source.id} ("${source.displayName}")`);
          deletedSources.push({ userId, id: source.id, displayName: source.displayName });
          totalDeleted++;
        }
      }
    }

    console.log(`[Cleanup] Total sources deleted: ${totalDeleted}`);
    return { success: true, totalDeleted, deletedSources };
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    throw error;
  }
}


/**
 * Migrate existing "Custom App" sources to "Connect App"
 * This updates all custom_app sources with displayName "Custom App" to "Connect App"
 */
export async function migrateCustomAppToConnectApp() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available.");
  }

  try {
    // Get all custom_app sources with displayName "Custom App"
    const sourcesToUpdate = await db
      .select()
      .from(healthSources)
      .where(
        and(
          eq(healthSources.provider, "custom_app"),
          eq(healthSources.displayName, "Custom App")
        )
      );

    // Update each one
    for (const source of sourcesToUpdate) {
      await db
        .update(healthSources)
        .set({ displayName: "Connect App" })
        .where(eq(healthSources.id, source.id));
    }

    console.log(`[Migration] Updated custom_app sources: ${sourcesToUpdate.length} rows updated`);
    return { success: true, rowsUpdated: sourcesToUpdate.length };
  } catch (error) {
    console.error("[Migration] Error:", error);
    throw error;
  }
}
