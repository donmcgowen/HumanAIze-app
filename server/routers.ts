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
import { getUserProfile, upsertUserProfile, addFoodLog, getFoodLogsForDay, deleteFoodLog, updateFoodLog, addFavoriteFood, getFavoriteFoods, deleteFavoriteFood, createMealTemplate, getMealTemplates, getMealTemplate, updateMealTemplate, deleteMealTemplate } from "./db";
import { searchUSDAFoods } from "./usda";
import { getSyncStatus } from "./backgroundSync";
import { lookupBarcodeProduct, getFoodVariant } from "./barcode";
import { generateFoodInsights, type DailyMacros } from "./insights";
import { parseClarityCSV, validateClarityCSV, calculateReadingStats, type GlucoseReading } from "./clarityImport";
import { recognizeFoodFromPhoto, recognizeFoodFromVoice, recognizeFoodFromPhotoAndVoice } from "./foodRecognition";
import { storagePut } from "./storage";

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
    importClarityCSV: protectedProcedure
      .input(
        z.object({
          csvContent: z.string().min(1),
        })
      )
      .mutation(({ input }) => {
        const validation = validateClarityCSV(input.csvContent);
        if (!validation.valid) {
          throw new Error(validation.error || "Invalid CSV format");
        }
        const result = parseClarityCSV(input.csvContent);
        const stats = calculateReadingStats(result.readings);
        return {
          success: true,
          importedCount: result.importedCount,
          skippedCount: result.skippedCount,
          errors: result.errors,
          readings: result.readings,
          statistics: stats,
        };
      }),

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
    lookupBarcode: protectedProcedure
      .input(
        z.object({
          barcode: z.string().regex(/^\d{8,14}$/),
        })
      )
      .query(async ({ input }) => {
        const product = await lookupBarcodeProduct(input.barcode);
        if (!product) return null;
        const variant = getFoodVariant(product.name);
        return {
          ...product,
          variant: variant ? { type: variant.type } : null,
        };
      }),
    generateInsights: protectedProcedure
      .input(
        z.object({
          foodLogs: z.array(
            z.object({
              foodName: z.string(),
              calories: z.number(),
              proteinGrams: z.number(),
              carbsGrams: z.number(),
              fatGrams: z.number(),
              mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
            })
          ),
          dailyCalorieGoal: z.number().positive(),
          dailyProteinGoal: z.number().positive(),
          dailyCarbGoal: z.number().positive(),
          dailyFatGoal: z.number().positive(),
          healthObjectives: z.array(z.string()).optional(),
        })
      )
      .query(async ({ input }) => {
        const totalCalories = input.foodLogs.reduce((sum, log) => sum + log.calories, 0);
        const totalProtein = input.foodLogs.reduce((sum, log) => sum + log.proteinGrams, 0);
        const totalCarbs = input.foodLogs.reduce((sum, log) => sum + log.carbsGrams, 0);
        const totalFat = input.foodLogs.reduce((sum, log) => sum + log.fatGrams, 0);

        const macros: DailyMacros = {
          totalCalories,
          totalProtein,
          totalCarbs,
          totalFat,
          caloriesRemaining: input.dailyCalorieGoal - totalCalories,
          proteinRemaining: input.dailyProteinGoal - totalProtein,
          carbsRemaining: input.dailyCarbGoal - totalCarbs,
          fatRemaining: input.dailyFatGoal - totalFat,
        };

        return generateFoodInsights(
          input.foodLogs,
          {
            dailyCalorieGoal: input.dailyCalorieGoal,
            dailyProteinGoal: input.dailyProteinGoal,
            dailyCarbGoal: input.dailyCarbGoal,
            dailyFatGoal: input.dailyFatGoal,
            healthObjectives: input.healthObjectives || [],
          },
          macros
        );
      }),
    recognizeWithAI: protectedProcedure
      .input(
        z.object({
          photoUrl: z.string().url().optional(),
          audioUrl: z.string().url().optional(),
          textDescription: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          if (input.photoUrl && input.audioUrl) {
            return await recognizeFoodFromPhotoAndVoice(input.photoUrl, input.audioUrl);
          } else if (input.photoUrl) {
            return await recognizeFoodFromPhoto(input.photoUrl);
          } else if (input.audioUrl) {
            return await recognizeFoodFromVoice(input.audioUrl);
          } else {
            throw new Error("Please provide a photo or voice description");
          }
        } catch (error) {
          console.error("[Food Recognition] Error:", error);
          throw error;
        }
      }),
    // Favorite Foods
    getFavorites: protectedProcedure.query(({ ctx }) => getFavoriteFoods(ctx.user.id)),
    addFavorite: protectedProcedure
      .input(
        z.object({
          foodName: z.string().min(1),
          servingSize: z.string().min(1),
          calories: z.number().int().positive(),
          proteinGrams: z.number().min(0),
          carbsGrams: z.number().min(0),
          fatGrams: z.number().min(0),
          source: z.enum(["manual", "ai_recognized", "usda", "open_food_facts"]).default("manual"),
        })
      )
      .mutation(({ ctx, input }) => addFavoriteFood(ctx.user.id, input)),
    deleteFavorite: protectedProcedure
      .input(z.object({ favoriteFoodId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteFavoriteFood(input.favoriteFoodId, ctx.user.id)),
    // Meal Templates
    getMeals: protectedProcedure.query(({ ctx }) => getMealTemplates(ctx.user.id)),
    getMeal: protectedProcedure
      .input(z.object({ mealTemplateId: z.number().int().positive() }))
      .query(({ ctx, input }) => getMealTemplate(input.mealTemplateId, ctx.user.id)),
    createMeal: protectedProcedure
      .input(
        z.object({
          mealName: z.string().min(1),
          mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).default("other"),
          foods: z.array(
            z.object({
              foodName: z.string(),
              servingSize: z.string(),
              calories: z.number(),
              proteinGrams: z.number(),
              carbsGrams: z.number(),
              fatGrams: z.number(),
            })
          ),
          totalCalories: z.number().int().positive(),
          totalProteinGrams: z.number().min(0),
          totalCarbsGrams: z.number().min(0),
          totalFatGrams: z.number().min(0),
          notes: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) => createMealTemplate(ctx.user.id, input)),
    updateMeal: protectedProcedure
      .input(
        z.object({
          mealTemplateId: z.number().int().positive(),
          mealName: z.string().min(1).optional(),
          mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).optional(),
          foods: z
            .array(
              z.object({
                foodName: z.string(),
                servingSize: z.string(),
                calories: z.number(),
                proteinGrams: z.number(),
                carbsGrams: z.number(),
                fatGrams: z.number(),
              })
            )
            .optional(),
          totalCalories: z.number().int().positive().optional(),
          totalProteinGrams: z.number().min(0).optional(),
          totalCarbsGrams: z.number().min(0).optional(),
          totalFatGrams: z.number().min(0).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const { mealTemplateId, ...updates } = input;
        return updateMealTemplate(mealTemplateId, ctx.user.id, updates);
      }),
    deleteMeal: protectedProcedure
      .input(z.object({ mealTemplateId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteMealTemplate(input.mealTemplateId, ctx.user.id)),
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
