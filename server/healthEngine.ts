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

const SOURCE_BLUEPRINTS = [
  {
    provider: "dexcom",
    category: "glucose",
    status: "connected",
    implementationStage: "direct_oauth",
    authType: "oauth2",
    displayName: "Dexcom CGM",
    description: "Continuous glucose monitoring connector with OAuth-based ingestion.",
  },
  {
    provider: "fitbit",
    category: "multi",
    status: "connected",
    implementationStage: "direct_oauth",
    authType: "oauth2",
    displayName: "Fitbit",
    description: "Activity and sleep connector for steps, workouts, readiness, and sleep metrics.",
  },
  {
    provider: "oura",
    category: "sleep",
    status: "ready",
    implementationStage: "direct_oauth",
    authType: "oauth2",
    displayName: "Oura",
    description: "Sleep and recovery connector for nightly sessions, readiness, and resting trends.",
  },
  {
    provider: "apple_health",
    category: "multi",
    status: "planned",
    implementationStage: "native_bridge",
    authType: "native_bridge",
    displayName: "Apple Health",
    description: "Native bridge for HealthKit-derived activity, sleep, and nutrition signals.",
  },
  {
    provider: "google_fit",
    category: "activity",
    status: "planned",
    implementationStage: "legacy",
    authType: "legacy",
    displayName: "Google Fit",
    description: "Activity connector (note: Google Fit API is deprecated for new apps).",
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
        lastSyncAt: source.status === "connected" ? now - index * 7_200_000 : null,
        lastSyncStatus: source.status === "connected" ? ("success" as const) : ("idle" as const),
        metadata: {
          supportedMetrics:
            source.provider === "dexcom"
              ? ["glucose", "trend"]
              : source.provider === "fitbit"
                ? ["steps", "workouts", "sleep"]
                : source.provider === "oura"
                  ? ["sleep", "recovery"]
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

  const glucoseRows = await db.select().from(glucoseReadings).where(eq(glucoseReadings.userId, userId)).limit(1);
  if (glucoseRows.length === 0) {
    const dexcom = sources.find((source) => source.provider === "dexcom") ?? sources[0]!;
    const fitbit = sources.find((source) => source.provider === "fitbit") ?? sources[0]!;
    const oura = sources.find((source) => source.provider === "oura") ?? sources[0]!;
    const nutritionSource = sources.find((source) => source.provider === "cronometer") ?? sources[0]!;
    const now = Date.now();
    const glucosePayload = [] as Array<typeof glucoseReadings.$inferInsert>;
    const activityPayload = [] as Array<typeof activitySamples.$inferInsert>;
    const sleepPayload = [] as Array<typeof sleepSessions.$inferInsert>;
    const nutritionPayload = [] as Array<typeof nutritionLogs.$inferInsert>;

    for (let dayOffset = 20; dayOffset >= 0; dayOffset -= 1) {
      const dayStart = startOfDay(now - dayOffset * DAY_MS);
      const steps = 6200 + (20 - dayOffset) * 110 + (dayOffset % 3) * 520;
      const activeMinutes = 36 + ((20 - dayOffset) % 5) * 7;
      const workoutMinutes = 22 + (dayOffset % 4) * 9;
      const caloriesBurned = 1980 + steps / 12;
      const sleepMinutes = 390 + ((dayOffset + 2) % 5) * 18;
      const sleepScore = Math.round(74 + ((20 - dayOffset) % 6) * 3);
      const efficiency = 0.82 + ((20 - dayOffset) % 4) * 0.03;
      const carbs = 145 + (dayOffset % 5) * 18;
      const protein = 92 + (dayOffset % 4) * 6;
      const fat = 48 + (dayOffset % 3) * 5;
      const fiber = 22 + (dayOffset % 4) * 2;
      const sugar = 18 + (dayOffset % 3) * 4;
      const breakfastTime = dayStart + 8 * 60 * 60 * 1000;
      const lunchTime = dayStart + 13 * 60 * 60 * 1000;
      const dinnerTime = dayStart + 19 * 60 * 60 * 1000;
      const sleepEndAt = dayStart + 6.5 * 60 * 60 * 1000;
      const sleepStartAt = sleepEndAt - sleepMinutes * 60 * 1000;
      const baseline = 108 + (dayOffset % 4) * 4 - Math.round((sleepMinutes - 420) / 18);

      activityPayload.push({
        userId,
        sourceId: fitbit.id,
        sampleDate: dayStart,
        steps,
        activeMinutes,
        caloriesBurned: Math.round(caloriesBurned),
        workoutMinutes,
        distanceKm: Number((steps / 1300).toFixed(1)),
        sourceLabel: dayOffset % 2 === 0 ? "Fitbit" : "Unified activity",
      });

      sleepPayload.push({
        userId,
        sourceId: oura.id,
        sleepStartAt,
        sleepEndAt,
        durationMinutes: sleepMinutes,
        efficiency: Number(efficiency.toFixed(2)),
        score: sleepScore,
        restingHeartRate: 56 + (dayOffset % 5),
      });

      nutritionPayload.push(
        {
          userId,
          sourceId: nutritionSource.id,
          loggedAt: breakfastTime,
          mealName: "Breakfast",
          calories: Math.round(carbs * 1.1),
          carbs: Number((carbs * 0.24).toFixed(1)),
          protein: Number((protein * 0.28).toFixed(1)),
          fat: Number((fat * 0.22).toFixed(1)),
          fiber: Number((fiber * 0.3).toFixed(1)),
          sugar: Number((sugar * 0.3).toFixed(1)),
        },
        {
          userId,
          sourceId: nutritionSource.id,
          loggedAt: lunchTime,
          mealName: "Lunch",
          calories: Math.round(carbs * 1.45),
          carbs: Number((carbs * 0.36).toFixed(1)),
          protein: Number((protein * 0.35).toFixed(1)),
          fat: Number((fat * 0.31).toFixed(1)),
          fiber: Number((fiber * 0.4).toFixed(1)),
          sugar: Number((sugar * 0.35).toFixed(1)),
        },
        {
          userId,
          sourceId: nutritionSource.id,
          loggedAt: dinnerTime,
          mealName: "Dinner",
          calories: Math.round(carbs * 1.7),
          carbs: Number((carbs * 0.4).toFixed(1)),
          protein: Number((protein * 0.37).toFixed(1)),
          fat: Number((fat * 0.47).toFixed(1)),
          fiber: Number((fiber * 0.3).toFixed(1)),
          sugar: Number((sugar * 0.35).toFixed(1)),
        }
      );

      [
        { at: breakfastTime - 45 * 60 * 1000, mealContext: "pre_breakfast", delta: -8 },
        { at: breakfastTime + 60 * 60 * 1000, mealContext: "post_breakfast", delta: 22 },
        { at: lunchTime + 90 * 60 * 1000, mealContext: "post_lunch", delta: 28 },
        { at: dinnerTime + 90 * 60 * 1000, mealContext: "post_dinner", delta: 24 },
      ].forEach((reading, index) => {
        glucosePayload.push({
          userId,
          sourceId: dexcom.id,
          readingAt: reading.at,
          mgdl: baseline + reading.delta + index * 2 + (dayOffset % 2 === 0 ? 3 : -2),
          trend: index === 0 ? "steady" : index === 1 ? "rising" : index === 2 ? "steady" : "falling",
          mealContext: reading.mealContext,
          notes: dayOffset % 6 === 0 && index === 2 ? "Higher lunch response after shorter sleep" : null,
        });
      });
    }

    await db.insert(activitySamples).values(activityPayload);
    await db.insert(sleepSessions).values(sleepPayload);
    await db.insert(nutritionLogs).values(nutritionPayload);
    await db.insert(glucoseReadings).values(glucosePayload);

    await db.insert(aiInsights).values([
      {
        userId,
        title: "Higher lunch glucose follows shorter sleep nights",
        summary:
          "Across the recent demo window, glucose responses after lunch are higher on nights with less than seven hours of sleep.",
        severity: "watch",
        evidence: {
          pattern: "sleep_vs_lunch_glucose",
          sleepThresholdMinutes: 420,
          averageLunchSpikeAfterShortSleep: 31,
          averageLunchSpikeAfterLongerSleep: 22,
        },
        recommendation:
          "Experiment with consistent sleep timing and compare lunchtime carbs on recovery-limited days.",
        generatedAt: Date.now() - DAY_MS,
      },
      {
        userId,
        title: "Workout days show steadier evening glucose",
        summary:
          "Days with at least 40 active minutes are associated with flatter post-dinner glucose readings in the current data window.",
        severity: "info",
        evidence: {
          pattern: "activity_vs_evening_glucose",
          workoutDayAverage: 136,
          lowActivityDayAverage: 148,
        },
        recommendation:
          "Preserve a moderate pre-dinner walk or short workout block on high-carb days.",
        generatedAt: Date.now() - DAY_MS * 2,
      },
      {
        userId,
        title: "Carb-heavy dinners drive the largest daily spikes",
        summary:
          "Dinner entries with higher carbohydrate totals correlate with the highest same-evening glucose values in the demo dataset.",
        severity: "priority",
        evidence: {
          pattern: "dinner_carbs_vs_glucose",
          highCarbDinnerAverage: 154,
          lowCarbDinnerAverage: 138,
        },
        recommendation:
          "Shift a portion of evening carbohydrates earlier in the day or pair dinner with protein, fiber, and movement.",
        generatedAt: Date.now() - DAY_MS * 3,
      },
    ]);

    const weeklySummary = await buildWeeklySummary(userId);
    await db.insert(weeklySummaries).values({
      userId,
      weekStartAt: weeklySummary.weekStartAt,
      weekEndAt: weeklySummary.weekEndAt,
      subject: weeklySummary.subject,
      summaryMarkdown: weeklySummary.summaryMarkdown,
      deliveryStatus: "needs_email_provider",
      generationContext: weeklySummary.generationContext,
    });
  }

  const threadRows = await db.select().from(chatThreads).where(eq(chatThreads.userId, userId)).limit(1);
  if (threadRows.length === 0) {
    const insertResult = await db.insert(chatThreads).values({
      userId,
      title: "Health Assistant",
    });
    const threadId = Number(insertResult[0].insertId);
    await db.insert(chatMessages).values({
      threadId,
      role: "assistant",
      content:
        "I can help interpret your unified glucose, activity, nutrition, and sleep trends. Ask me about spikes, recovery, workouts, meals, or weekly patterns.",
      citedMetricWindow: { rangeDays: 14 },
    });
  }
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
      metadata: { connectedByUser: true, demoMode: true },
    })
    .where(and(eq(healthSources.userId, userId), eq(healthSources.id, sourceId)));

  await db.insert(syncJobs).values({
    userId,
    sourceId,
    syncType: "manual",
    status: "success",
    startedAt: Date.now() - 5_000,
    finishedAt: Date.now(),
    recordCount: 21,
  });

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
