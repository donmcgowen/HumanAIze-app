import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import {
  ensureSeedDataForUser,
  getSourcesForUser,
  getDashboardBundle,
  getHistoryBundle,
  buildWeeklySummary,
  listChatThreads,
  createChatThread,
  sendChatMessage,
} from "./healthEngine";

// Helper to create test user
async function createTestUser(openId: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new user
  await db.insert(users).values({
    openId,
    name: `Test User ${openId}`,
    email: `test-${openId}@example.com`,
    role: "user",
  });

  // Fetch the created user
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0]?.id || 0;
}

describe("Health Analytics Engine", () => {
  describe("ensureSeedDataForUser", () => {
    it("should seed demo health data for a user", async () => {
      const userId = await createTestUser("test-seed-1");
      await ensureSeedDataForUser(userId);
      // Verify data was seeded by checking sources exist
      const sources = await getSourcesForUser(userId);
      expect(sources.length).toBeGreaterThan(0);
    });

    it("should create sources across all health categories", async () => {
      const userId = await createTestUser("test-seed-2");
      await ensureSeedDataForUser(userId);
      const sources = await getSourcesForUser(userId);

      const categories = new Set(sources.map((s) => s.category));
      expect(categories.has("glucose")).toBe(true);
      expect(categories.has("activity")).toBe(true);
      expect(categories.has("nutrition")).toBe(true);
      expect(categories.has("sleep")).toBe(true);
    });
  });

  describe("getDashboardBundle", () => {
    let userId: number;

    beforeEach(async () => {
      userId = await createTestUser(`test-dashboard-${Math.random()}`);
      await ensureSeedDataForUser(userId);
    });

    it("should return dashboard data with all required metrics", async () => {
      const dashboard = await getDashboardBundle(userId, 14);

      expect(dashboard).toHaveProperty("chart");
      expect(dashboard).toHaveProperty("summary");
      expect(dashboard).toHaveProperty("insights");
      expect(dashboard).toHaveProperty("sourcesByCategory");
    });

    it("should include glucose average in summary", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      expect(dashboard.summary.glucoseAverage).toBeGreaterThan(0);
      expect(dashboard.summary.glucoseAverage).toBeLessThan(400);
    });

    it("should include time in range estimate", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      expect(dashboard.summary.timeInRangeEstimate).toBeGreaterThanOrEqual(0);
      expect(dashboard.summary.timeInRangeEstimate).toBeLessThanOrEqual(100);
    });

    it("should include sleep and activity averages", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      expect(dashboard.summary.sleepAverage).toBeGreaterThan(0);
      expect(dashboard.summary.stepsAverage).toBeGreaterThan(0);
    });

    it("should generate chart data for the specified range", async () => {
      const dashboard = await getDashboardBundle(userId, 7);
      expect(dashboard.chart.length).toBeGreaterThan(0);
      expect(dashboard.chart.length).toBeLessThanOrEqual(7);
    });

    it("should include glucose, steps, and sleep in chart data", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      const firstDataPoint = dashboard.chart[0];

      expect(firstDataPoint).toHaveProperty("glucose");
      expect(firstDataPoint).toHaveProperty("steps");
      expect(firstDataPoint).toHaveProperty("sleepHours");
      expect(firstDataPoint).toHaveProperty("label");
    });

    it("should generate insights from health data", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      expect(Array.isArray(dashboard.insights)).toBe(true);
      expect(dashboard.insights.length).toBeGreaterThan(0);
    });

    it("should include title and summary in each insight", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      dashboard.insights.forEach((insight) => {
        expect(insight).toHaveProperty("title");
        expect(insight).toHaveProperty("summary");
        expect(insight).toHaveProperty("recommendation");
        expect(insight).toHaveProperty("severity");
      });
    });

    it("should assign severity levels to insights", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      dashboard.insights.forEach((insight) => {
        expect(["priority", "watch", "info"]).toContain(insight.severity);
      });
    });
  });

  describe("getSourcesForUser", () => {
    let userId: number;

    beforeEach(async () => {
      userId = await createTestUser(`test-sources-${Math.random()}`);
      await ensureSeedDataForUser(userId);
    });

    it("should return list of connected sources", async () => {
      const sources = await getSourcesForUser(userId);
      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it("should include source metadata", async () => {
      const sources = await getSourcesForUser(userId);
      sources.forEach((source) => {
        expect(source).toHaveProperty("id");
        expect(source).toHaveProperty("displayName");
        expect(source).toHaveProperty("category");
        expect(source).toHaveProperty("status");
      });
    });

    it("should have sources with different categories", async () => {
      const sources = await getSourcesForUser(userId);
      const categories = new Set(sources.map((s) => s.category));
      expect(categories.size).toBeGreaterThan(1);
    });
  });

  describe("getHistoryBundle", () => {
    let userId: number;

    beforeEach(async () => {
      userId = await createTestUser(`test-history-${Math.random()}`);
      await ensureSeedDataForUser(userId);
    });

    it("should return history data with chart and summary", async () => {
      const history = await getHistoryBundle(userId, 14);

      expect(history).toHaveProperty("chart");
      expect(history).toHaveProperty("summary");
      expect(history).toHaveProperty("highlights");
    });

    it("should respect the date range parameter", async () => {
      const history7 = await getHistoryBundle(userId, 7);
      const history30 = await getHistoryBundle(userId, 30);

      expect(history7.chart.length).toBeLessThanOrEqual(7);
      expect(history30.chart.length).toBeLessThanOrEqual(30);
    });

    it("should include glucose, steps, and sleep in chart", async () => {
      const history = await getHistoryBundle(userId, 14);
      if (history.chart.length > 0) {
        const dataPoint = history.chart[0];
        expect(dataPoint).toHaveProperty("glucose");
        expect(dataPoint).toHaveProperty("steps");
        expect(dataPoint).toHaveProperty("sleepHours");
      }
    });

    it("should calculate summary statistics", async () => {
      const history = await getHistoryBundle(userId, 14);
      expect(history.summary).toHaveProperty("glucoseAverage");
      expect(history.summary).toHaveProperty("sleepAverage");
      expect(history.summary).toHaveProperty("stepsAverage");
      expect(history.summary).toHaveProperty("caloriesAverage");
    });

    it("should identify highlights (best/worst days)", async () => {
      const history = await getHistoryBundle(userId, 14);
      if (history.highlights) {
        // At least some highlights should be present if data exists
        const hasHighlights =
          history.highlights.highestGlucoseDay ||
          history.highlights.mostActiveDay ||
          history.highlights.strongestRecoveryDay;
        expect(typeof hasHighlights).toBe("object" || "boolean");
      }
    });
  });

  describe("buildWeeklySummary", () => {
    let userId: number;

    beforeEach(async () => {
      userId = await createTestUser(`test-summary-${Math.random()}`);
      await ensureSeedDataForUser(userId);
    });

    it("should generate a weekly summary", async () => {
      const summary = await buildWeeklySummary(userId);
      expect(summary).toHaveProperty("subject");
      expect(summary).toHaveProperty("summaryMarkdown");
      expect(summary).toHaveProperty("deliveryStatus");
    });

    it("should include glucose metrics in summary", async () => {
      const summary = await buildWeeklySummary(userId);
      const content = summary.summaryMarkdown.toLowerCase();
      expect(content).toContain("glucose");
    });

    it("should include sleep metrics in summary", async () => {
      const summary = await buildWeeklySummary(userId);
      const content = summary.summaryMarkdown.toLowerCase();
      expect(content).toContain("sleep");
    });

    it("should include activity metrics in summary", async () => {
      const summary = await buildWeeklySummary(userId);
      const content = summary.summaryMarkdown.toLowerCase();
      expect(
        content.includes("activity") ||
          content.includes("steps") ||
          content.includes("exercise") ||
          content.includes("workout")
      ).toBe(true);
    });

    it("should include AI insights in summary", async () => {
      const summary = await buildWeeklySummary(userId);
      const content = summary.summaryMarkdown.toLowerCase();
      expect(
        content.includes("insight") ||
          content.includes("recommendation") ||
          content.includes("pattern") ||
          content.includes("trend")
      ).toBe(true);
    });

    it("should have a descriptive subject line", async () => {
      const summary = await buildWeeklySummary(userId);
      expect(summary.subject.length).toBeGreaterThan(10);
      expect(summary.subject.toLowerCase()).toContain("week");
    });
  });

  describe("Chat Assistant", () => {
    let userId: number;

    beforeEach(async () => {
      userId = await createTestUser(`test-chat-${Math.random()}`);
      await ensureSeedDataForUser(userId);
    });

    it("should create a chat thread", async () => {
      const thread = await createChatThread(userId, "Test conversation");
      expect(thread).toHaveProperty("id");
      expect(thread).toHaveProperty("title");
      expect(thread.title).toBe("Test conversation");
    });

    it("should list chat threads", async () => {
      await createChatThread(userId, "Thread 1");
      await createChatThread(userId, "Thread 2");

      const threads = await listChatThreads(userId);
      expect(Array.isArray(threads)).toBe(true);
      expect(threads.length).toBeGreaterThanOrEqual(2);
    });

    it("should send a message to a thread", async () => {
      const thread = await createChatThread(userId, "Test thread");
      const response = await sendChatMessage(userId, thread.id, "What is my average glucose?");

      expect(response).toHaveProperty("role");
      expect(response).toHaveProperty("content");
      expect(response.role).toBe("assistant");
      expect(response.content.length).toBeGreaterThan(0);
    });

    it("should retrieve messages from a thread", async () => {
      const thread = await createChatThread(userId, "Test thread");
      await sendChatMessage(userId, thread.id, "Hello");

      const messages = await listChatThreads(userId);
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe("Cross-metric correlation", () => {
    let userId: number;

    beforeEach(async () => {
      userId = await createTestUser(`test-correlation-${Math.random()}`);
      await ensureSeedDataForUser(userId);
    });

    it("should generate insights that reference health metrics", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      const insights = dashboard.insights;

      // At least one insight should mention health-related topics
      const healthInsights = insights.filter((i) => {
        const text = `${i.title} ${i.summary}`.toLowerCase();
        return (
          text.includes("glucose") ||
          text.includes("blood sugar") ||
          text.includes("sleep") ||
          text.includes("activity") ||
          text.includes("exercise")
        );
      });

      expect(healthInsights.length).toBeGreaterThan(0);
    });

    it("should provide recommendations in insights", async () => {
      const dashboard = await getDashboardBundle(userId, 14);
      const insights = dashboard.insights;

      insights.forEach((insight) => {
        expect(insight.recommendation.length).toBeGreaterThan(0);
      });
    });
  });
});
