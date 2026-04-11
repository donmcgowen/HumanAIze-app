import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  connectSource,
  createChatThread,
  createCustomSource,
  disconnectSource,
  getDashboardBundle,
  getHistoryBundle,
  getSourcesForUser,
  getSummaries,
  getThreadMessages,
  listChatThreads,
  refreshWeeklySummary,
  sendChatMessage,
  triggerSourceSync,
  cleanupDuplicateCustomSources,
  migrateCustomAppToConnectApp,
} from "./healthEngine";
import { storeSourceCredentials } from "./credentials";
import { syncAllSources } from "./dataImport";
import { getUserProfile, upsertUserProfile, addFoodLog, getFoodLogsForDay, deleteFoodLog, updateFoodLog } from "./db";
import { searchUSDAFoods } from "./usda";
import { getSyncStatus } from "./backgroundSync";

const rangeInput = z.object({
  rangeDays: z.number().int().min(7).max(30).default(14),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  health: router({
    dashboard: protectedProcedure.input(rangeInput).query(({ ctx, input }) => {
      return getDashboardBundle(ctx.user.id, input.rangeDays);
    }),
    history: protectedProcedure.input(rangeInput).query(({ ctx, input }) => {
      return getHistoryBundle(ctx.user.id, input.rangeDays);
    }),
  }),
  sources: router({
    list: protectedProcedure.query(({ ctx }) => getSourcesForUser(ctx.user.id)),
    connect: protectedProcedure
      .input(z.object({ sourceId: z.number().int() }))
      .mutation(({ ctx, input }) => connectSource(ctx.user.id, input.sourceId)),
    disconnect: protectedProcedure
      .input(z.object({ sourceId: z.number().int() }))
      .mutation(({ ctx, input }) => disconnectSource(ctx.user.id, input.sourceId)),
    sync: protectedProcedure
      .input(z.object({ sourceId: z.number().int() }))
      .mutation(({ ctx, input }) => triggerSourceSync(ctx.user.id, input.sourceId)),
    syncAll: protectedProcedure.mutation(({ ctx }) => syncAllSources(ctx.user.id)),
    storeCredentials: protectedProcedure
      .input(
        z.object({
          sourceId: z.number().int(),
          credentials: z.record(z.string(), z.string()),
        })
      )
      .mutation(({ ctx, input }) =>
        storeSourceCredentials(
          ctx.user.id,
          input.sourceId,
          input.credentials as Record<string, string>
        )
      ),
    createCustom: protectedProcedure
      .input(
        z.object({
          appName: z.string().trim().min(1).max(120),
          category: z.enum(["glucose", "activity", "nutrition", "sleep", "multi"]),
        })
      )
      .mutation(({ ctx, input }) =>
        createCustomSource(ctx.user.id, input.appName, input.category)
      ),

  }),
  assistant: router({
    threads: protectedProcedure.query(({ ctx }) => listChatThreads(ctx.user.id)),
    messages: protectedProcedure
      .input(z.object({ threadId: z.number().int().optional() }).optional())
      .query(({ ctx, input }) => getThreadMessages(ctx.user.id, input?.threadId)),
    createThread: protectedProcedure
      .input(z.object({ title: z.string().trim().min(1).max(120).optional() }).optional())
      .mutation(({ ctx, input }) => createChatThread(ctx.user.id, input?.title)),
    sendMessage: protectedProcedure
      .input(
        z.object({
          threadId: z.number().int(),
          content: z.string().trim().min(1).max(2000),
        })
      )
      .mutation(({ ctx, input }) => sendChatMessage(ctx.user.id, input.threadId, input.content)),
  }),
  summaries: router({
    list: protectedProcedure.query(({ ctx }) => getSummaries(ctx.user.id)),
    regenerate: protectedProcedure.mutation(({ ctx }) => refreshWeeklySummary(ctx.user.id)),
  }),
  profile: router({
    get: protectedProcedure.query(({ ctx }) => getUserProfile(ctx.user.id)),
    upsert: protectedProcedure
      .input(
        z.object({
          heightCm: z.number().positive().optional(),
          weightKg: z.number().positive().optional(),
          ageYears: z.number().int().min(1).max(150).optional(),
          fitnessGoal: z.enum(["lose_fat", "build_muscle", "maintain"]).optional(),
        })
      )
      .mutation(({ ctx, input }) => upsertUserProfile(ctx.user.id, input)),
  }),
  food: router({
    addLog: protectedProcedure
      .input(
        z.object({
          foodName: z.string().min(1),
          servingSize: z.string().optional(),
          calories: z.number().int().positive(),
          proteinGrams: z.number().min(0),
          carbsGrams: z.number().min(0),
          fatGrams: z.number().min(0),
          loggedAt: z.number(),
          mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).default("other"),
          notes: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) => addFoodLog(ctx.user.id, input)),
    getDayLogs: protectedProcedure
      .input(
        z.object({
          startOfDay: z.number(),
          endOfDay: z.number(),
        })
      )
      .query(({ ctx, input }) => getFoodLogsForDay(ctx.user.id, input.startOfDay, input.endOfDay)),
    deleteLog: protectedProcedure
      .input(
        z.object({
          foodLogId: z.number().int().positive(),
        })
      )
      .mutation(({ ctx, input }) => deleteFoodLog(input.foodLogId, ctx.user.id)),
    updateLog: protectedProcedure
      .input(
        z.object({
          foodLogId: z.number().int().positive(),
          foodName: z.string().min(1).optional(),
          servingSize: z.string().optional(),
          calories: z.number().int().positive().optional(),
          proteinGrams: z.number().min(0).optional(),
          carbsGrams: z.number().min(0).optional(),
          fatGrams: z.number().min(0).optional(),
          mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const { foodLogId, ...updates } = input;
        return updateFoodLog(foodLogId, ctx.user.id, updates);
      }),
    searchUSDA: protectedProcedure
      .input(
        z.object({
          query: z.string().min(1).max(100),
        })
      )
      .query(({ input }) => searchUSDAFoods(input.query)),
  }),
  sync: router({
    status: protectedProcedure.query(() => getSyncStatus()),
  }),
  admin: router({
    cleanupDuplicateSources: protectedProcedure.mutation(async ({ ctx }) => {
      // Only allow owner to run cleanup
      if (ctx.user.id !== 1) {
        throw new Error("Unauthorized");
      }
      return cleanupDuplicateCustomSources();
    }),
    migrateCustomAppToConnectApp: protectedProcedure.mutation(async ({ ctx }) => {
      // Only allow owner to run migration
      if (ctx.user.id !== 1) {
        throw new Error("Unauthorized");
      }
      return migrateCustomAppToConnectApp();
    }),
  }),
});

export type AppRouter = typeof appRouter;
