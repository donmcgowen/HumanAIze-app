import { getDb } from "./db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
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
import { getUserProfile, upsertUserProfile, addFoodLog, getFoodLogsForDay, getRecentFoods, deleteFoodLog, updateFoodLog, addFavoriteFood, getFavoriteFoods, deleteFavoriteFood, createMealTemplate, getMealTemplates, getMealTemplate, updateMealTemplate, deleteMealTemplate, getMacroTrends, getGoalProgress, getCachedFoodSearchResults, cacheFoodSearchResults, addProgressPhoto, getProgressPhotos, deleteProgressPhoto, updateProgressPhoto, addGlucoseReadings, getGlucoseReadingsForDateRange, calculateGlucoseStatistics, logStepsForDay, getTodaySteps, getStepHistory, addWeightEntry, getWeightEntries, deleteWeightEntry, getWeightProgressData, addWorkoutEntry, getWorkoutEntries, deleteWorkoutEntry, getCGMStats, getCGMDailyAverages, getRecentFoodLogsForInsights, addBodyMeasurement, getBodyMeasurements, deleteBodyMeasurement, getBodyMeasurementTrends, addManualGlucoseEntry, getTodayManualGlucoseEntries, deleteManualGlucoseEntry, getOrCreateGlucoseSource } from "./db";
import { searchUSDAFoods, searchUSDABrandedFoods } from "./usda";
import { getSyncStatus } from "./backgroundSync";
import { lookupBarcodeProduct, getFoodVariant } from "./barcode";
import { generateFoodInsights, type DailyMacros } from "./insights";
import { getMealSuggestions, getMealSuggestionsByCategory } from "@shared/mealSuggestions";
import { parseClarityCSV, validateClarityCSV, calculateReadingStats, type GlucoseReading } from "./clarityImport";
import { extractTextFromPDF, parseClarityReportText, validateClarityPDF } from "./pdfExtraction";
import { recognizeFoodFromPhoto, recognizeFoodFromVoice, recognizeFoodFromPhotoAndVoice } from "./foodRecognition";

import { storagePut } from "./storage";
import { analyzeMealWithAI, type MealData, type DailyTargets } from "./mealAnalysis";
import { searchFoodWithGemini, calculateMacrosForServing } from "./geminiFood";
import { getLocalCachedFood, saveLocalCachedFood, clearGenericCacheEntries } from "./localFoodCache";
import { searchOpenFoodFactsByName } from "./openFoodFacts";

const rangeInput = z.object({
  rangeDays: z.number().int().min(7).max(30).default(14),
});

const workoutMetMap: Record<string, number> = {
  cardio: 8,
  running: 9.8,
  cycling: 7.5,
  swimming: 8.3,
  hiit: 9,
  strength: 6,
  yoga: 3,
  pilates: 3.5,
  walking: 3.8,
  sports: 7,
};

function estimateCaloriesWithMet(
  exerciseType: string,
  durationMinutes: number,
  weightLbs: number,
  intensity: "light" | "moderate" | "intense"
) {
  const typeKey = exerciseType.toLowerCase();
  const baseMet = workoutMetMap[typeKey] || 6;
  const intensityFactor = intensity === "light" ? 0.8 : intensity === "intense" ? 1.2 : 1;
  const met = baseMet * intensityFactor;
  const weightKg = weightLbs * 0.453592;

  const calories = (met * 3.5 * weightKg / 200) * durationMinutes;
  return Math.max(1, Math.round(calories));
}

import { z } from "zod";

const aiRouter = router({
  analyzeMeal: protectedProcedure
    .input(
      z.object({
        meals: z.array(
          z.object({
            foodName: z.string(),
            calories: z.number().int().positive(),
            protein: z.number().int().nonnegative(),
            carbs: z.number().int().nonnegative(),
            fat: z.number().int().nonnegative(),
            quantity: z.number().optional(),
            unit: z.string().optional(),
          })
        ),
        dailyTargets: z.object({
          dailyCalories: z.number().int().positive(),
          dailyProtein: z.number().int().positive(),
          dailyCarbs: z.number().int().positive(),
          dailyFat: z.number().int().positive(),
        }),
        consumedSoFar: z.object({
          calories: z.number().int().nonnegative(),
          protein: z.number().int().nonnegative(),
          carbs: z.number().int().nonnegative(),
          fat: z.number().int().nonnegative(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      return analyzeMealWithAI(
        input.meals,
        input.dailyTargets,
        input.consumedSoFar
      );
    }),
});

export const appRouter = router({
  system: systemRouter,
  ai: aiRouter,
  progressPhotos: router({
    getPhotos: protectedProcedure.query(async ({ ctx }) => {
      const photos = await getProgressPhotos(ctx.user.id);
      return photos;
    }),
    uploadPhoto: protectedProcedure
      .input(
        z.object({
          photoBase64: z.string(),
          photoName: z.string().min(1),
          photoDate: z.number(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const { compressImage } = await import("./imageCompression");
          let buffer = Buffer.from(input.photoBase64, "base64");
          const compressedBuffer = await compressImage(buffer, "image/jpeg");
          buffer = compressedBuffer as any;
          const photoKey = `progress-photos/${ctx.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
          const { url } = await storagePut(photoKey, buffer as any, "image/jpeg");
          const photo = await addProgressPhoto(ctx.user.id, {
            photoUrl: url,
            photoKey,
            photoName: input.photoName,
            photoDate: input.photoDate,
            description: input.description,
          });
          return photo;
        } catch (error) {
          console.error("[Progress Photos] Error uploading photo:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to upload photo" });
        }
      }),
    deletePhoto: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const success = await deleteProgressPhoto(input.photoId, ctx.user.id);
          return { success };
        } catch (error) {
          console.error("[Progress Photos] Error deleting photo:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete photo" });
        }
      }),
    updatePhoto: protectedProcedure
      .input(
        z.object({
          photoId: z.number(),
          photoName: z.string().optional(),
          photoDate: z.number().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const photo = await updateProgressPhoto(input.photoId, ctx.user.id, {
            photoName: input.photoName,
            photoDate: input.photoDate,
            description: input.description,
          });
          return photo;
        } catch (error) {
          console.error("[Progress Photos] Error updating photo:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update photo" });
        }
      }),
  }),
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    updateEmail: protectedProcedure
      .input(
        z.object({
          email: z.string().email(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { updateUserEmail } = await import("./auth");
        const userId = Number(ctx.user.id);
        if (!Number.isFinite(userId)) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const result = await updateUserEmail(userId, input.email);
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.message,
          });
        }

        return {
          success: true,
          user: result.user,
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    login: publicProcedure
      .input(
        z.object({
          username: z.string().min(3).max(64),
          password: z.string().min(6).max(128),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { authenticateUser } = await import("./auth");
        const { sdk } = await import("./_core/sdk");
        
        const result = await authenticateUser(input.username, input.password);
        if (!result.success) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: result.message,
          });
        }

        const sessionToken = await sdk.createSessionToken((result.userId || 0).toString(), {
          name: result.user?.name || result.user?.username || "",
          expiresInMs: 365 * 24 * 60 * 60 * 1000,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });

        return {
          success: true,
          user: result.user,
        };
      }),
    signup: publicProcedure
      .input(
        z.object({
          username: z.string().min(3).max(64),
          email: z.string().email(),
          password: z.string().min(6).max(128),
          name: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { createUser } = await import("./auth");
        const { sdk } = await import("./_core/sdk");
        
        const result = await createUser(input.username, input.email, input.password, input.name);
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.message,
          });
        }

        const sessionToken = await sdk.createSessionToken((result.userId || 0).toString(), {
          name: input.name || input.username,
          expiresInMs: 365 * 24 * 60 * 60 * 1000,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });

        return {
          success: true,
          message: "Account created successfully",
        };
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
      .mutation(async ({ ctx, input }) => {
        const validation = validateClarityCSV(input.csvContent);
        if (!validation.valid) {
          throw new Error(validation.error || "Invalid CSV format");
        }
        const result = parseClarityCSV(input.csvContent);
        const stats = calculateReadingStats(result.readings);

        if (result.readings.length > 0) {
          try {
            const sourceId = await getOrCreateGlucoseSource(ctx.user.id, "Dexcom Clarity");

            const dbReadings = result.readings.map(r => ({
              readingAt: r.timestamp,
              mgdl: r.value,
              trend: r.trend,
            }));

            await addGlucoseReadings(ctx.user.id, sourceId, dbReadings);

            const glucoseReadings = await getGlucoseReadingsForDateRange(
              ctx.user.id,
              Math.min(...result.readings.map(r => r.timestamp)),
              Math.max(...result.readings.map(r => r.timestamp))
            );
            const enhancedStats = await calculateGlucoseStatistics(glucoseReadings);

            const first = result.readings[0];
            const last = result.readings[result.readings.length - 1];
            const glucoseDelta = last.value - first.value;
            const trendDirection = glucoseDelta > 12 ? "rising" : glucoseDelta < -12 ? "falling" : "stable";

            return {
              success: true,
              importedCount: result.importedCount,
              skippedCount: result.skippedCount,
              errors: result.errors,
              statistics: enhancedStats,
              trends: {
                direction: trendDirection,
                changeMgdl: Math.round(glucoseDelta * 10) / 10,
              },
            };
          } catch (error) {
            console.error("Error saving glucose readings:", error);
            return {
              success: true,
              importedCount: result.importedCount,
              skippedCount: result.skippedCount,
              errors: [...result.errors, `Database save error: ${error instanceof Error ? error.message : "Unknown error"}`],
              statistics: stats,
            };
          }
        }

        const first = result.readings[0];
        const last = result.readings[result.readings.length - 1];
        const glucoseDelta = first && last ? last.value - first.value : 0;
        const trendDirection = glucoseDelta > 12 ? "rising" : glucoseDelta < -12 ? "falling" : "stable";

        return {
          success: true,
          importedCount: result.importedCount,
          skippedCount: result.skippedCount,
          errors: result.errors,
          statistics: stats,
          trends: {
            direction: trendDirection,
            changeMgdl: Math.round(glucoseDelta * 10) / 10,
          },
        };
      }),
    importClarityPDF: protectedProcedure
      .input(
        z.object({
          pdfBase64: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
        const text = await extractTextFromPDF(pdfBuffer);
        const validation = validateClarityPDF(text);

        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: validation.error || "Invalid Dexcom Clarity PDF",
          });
        }

        const extracted = parseClarityReportText(text);

        if (
          extracted.averageGlucose === undefined &&
          extracted.timeInRange === undefined &&
          extracted.estimatedA1C === undefined
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not extract A1C, average glucose, or time in range from the PDF",
          });
        }

        await upsertUserProfile(ctx.user.id, {
          cgmAverageGlucose: extracted.averageGlucose,
          cgmTimeInRange: extracted.timeInRange,
          cgmA1cEstimate: extracted.estimatedA1C,
        });

        return {
          success: true,
          metrics: {
            averageGlucose: extracted.averageGlucose ?? null,
            timeInRange: extracted.timeInRange ?? null,
            a1cEstimate: extracted.estimatedA1C ?? null,
          },
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
    get: protectedProcedure.query(({ ctx }) => {
      const userId = Number(ctx.user.id);
      if (!Number.isFinite(userId)) throw new TRPCError({ code: "UNAUTHORIZED" });
      return getUserProfile(userId);
    }),
    upsert: protectedProcedure
      .input(
        z.object({
          heightIn: z.number().int().positive().optional(),
          weightLbs: z.number().int().positive().optional(),
          ageYears: z.number().int().min(1).max(150).optional(),
          fitnessGoal: z.enum(["lose_fat", "build_muscle", "maintain"]).optional(),
          activityLevel: z.enum(["sedentary", "lightly_active", "moderately_active", "very_active", "extremely_active"]).optional(),
          diabetesType: z.enum(["type1", "type2", "prediabetes", "gestational", "other"]).optional(),
          goalWeightLbs: z.number().int().positive().optional(),
          goalDate: z.number().optional(),
          dailyCalorieTarget: z.number().int().positive().optional(),
          dailyProteinTarget: z.number().int().positive().optional(),
          dailyCarbsTarget: z.number().int().positive().optional(),
          dailyFatTarget: z.number().int().positive().optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const userId = Number(ctx.user.id);
        if (!Number.isFinite(userId)) throw new TRPCError({ code: "UNAUTHORIZED" });
        return upsertUserProfile(userId, input);
      }),
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
          sugarGrams: z.number().min(0).optional(),
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
      .query(async ({ ctx, input }) => {
        const totalCalories = input.foodLogs.reduce((sum, log) => sum + log.calories, 0);
        const totalProtein = input.foodLogs.reduce((sum, log) => sum + log.proteinGrams, 0);
        const totalCarbs = input.foodLogs.reduce((sum, log) => sum + log.carbsGrams, 0);
        const totalFat = input.foodLogs.reduce((sum, log) => sum + log.fatGrams, 0);
        const glucoseContext = await getCGMStats(ctx.user.id, 30);

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
          macros,
          glucoseContext
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
    getSuggestions: protectedProcedure
      .input(
        z.object({
          caloriesRemaining: z.number().min(0),
          proteinRemaining: z.number().min(0),
          carbsRemaining: z.number().min(0),
          fatRemaining: z.number().min(0),
          limit: z.number().int().min(1).max(10).default(5),
        })
      )
      .query(({ input }) => {
        return getMealSuggestions(
          {
            calories: input.caloriesRemaining,
            protein: input.proteinRemaining,
            carbs: input.carbsRemaining,
            fat: input.fatRemaining,
          },
          input.limit
        );
      }),
    getSuggestionsByCategory: protectedProcedure
      .input(
        z.object({
          caloriesRemaining: z.number().min(0),
          proteinRemaining: z.number().min(0),
          carbsRemaining: z.number().min(0),
          fatRemaining: z.number().min(0),
          category: z.enum(["protein", "carb", "fat", "balanced", "snack"]),
          limit: z.number().int().min(1).max(10).default(3),
        })
      )
      .query(({ input }) => {
        return getMealSuggestionsByCategory(
          {
            calories: input.caloriesRemaining,
            protein: input.proteinRemaining,
            carbs: input.carbsRemaining,
            fat: input.fatRemaining,
          },
          input.category,
          input.limit
        );
      }),
    searchWithAI: publicProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => {
        const normalizedQuery = input.query.trim();
        if (!normalizedQuery) {
          return [];
        }

        type FoodResult = {
          name: string;
          description: string;
          caloriesPer100g: number;
          proteinPer100g: number;
          carbsPer100g: number;
          fatPer100g: number;
          servingSize?: string;
        };

        const mapUsdaResults = (usdaResults: Awaited<ReturnType<typeof searchUSDAFoods>>): FoodResult[] =>
          usdaResults.map((food) => ({
            name: food.foodName,
            description: food.brand ? `${food.brand} - ${food.dataType}` : food.dataType,
            caloriesPer100g: food.calories,
            proteinPer100g: food.proteinGrams,
            carbsPer100g: food.carbsGrams,
            fatPer100g: food.fatGrams,
            servingSize: food.servingSize || "100g",
          }));

        // 1. Check local file cache first (fast, always available)
        // Note: generic USDA cache entries are bypassed for branded-looking queries (handled in getLocalCachedFood)
        const localCached = await getLocalCachedFood(normalizedQuery);
        if (localCached && localCached.length > 0) {
          return localCached.slice(0, 10);
        }

        // 2. Check DB cache if available (skip for branded queries since DB may have stale generic results)
        const dbCached = await getCachedFoodSearchResults(normalizedQuery);
        if (dbCached.length > 0) {
          // Only use DB cache if results look like branded products (have real brand names)
          const hasBrandedResults = dbCached.some(c => 
            c.description && !c.description.includes("SR Legacy") && !c.description.includes("Survey (FNDDS)")
          );
          if (hasBrandedResults || dbCached.length >= 5) {
            console.log(`[Food Search] DB cache hit for query: "${normalizedQuery}" (${dbCached.length} results)`);
            const mapped = dbCached.map(c => ({
              name: c.foodName,
              description: c.description || "",
              caloriesPer100g: c.calories,
              proteinPer100g: c.proteinGrams,
              carbsPer100g: c.carbsGrams,
              fatPer100g: c.fatGrams,
              servingSize: c.servingSize || "100g",
            })).slice(0, 10);
            await saveLocalCachedFood(normalizedQuery, mapped, "branded");
            return mapped;
          }
        }

        // 3. Cache miss — search USDA Branded + Open Food Facts IN PARALLEL (best sources for branded products)
        console.log(`[Food Search] Cache miss for query: "${normalizedQuery}" - searching USDA Branded + Open Food Facts in parallel`);

        let results: FoodResult[] = [];
        let resultSource: "branded" | "open_food_facts" | "gemini" | "usda_generic" = "usda_generic";

        // Run USDA Branded and Open Food Facts searches in parallel
        const [usdaBrandedResults, offResults] = await Promise.allSettled([
          searchUSDABrandedFoods(normalizedQuery, 15),
          searchOpenFoodFactsByName(normalizedQuery, 15),
        ]);

        const brandedFoods = usdaBrandedResults.status === "fulfilled" ? usdaBrandedResults.value : [];
        const offFoods = offResults.status === "fulfilled" ? offResults.value : [];

        if (usdaBrandedResults.status === "rejected") {
          console.warn(`[Food Search] USDA Branded failed for "${normalizedQuery}"`, usdaBrandedResults.reason);
        }
        if (offResults.status === "rejected") {
          console.warn(`[Food Search] Open Food Facts failed for "${normalizedQuery}"`, offResults.reason);
        }

        // Merge results: interleave USDA Branded and OFF results, deduplicating by name
        if (brandedFoods.length > 0 || offFoods.length > 0) {
          const seen = new Set<string>();
          const merged: FoodResult[] = [];

          // Add USDA branded results first (they have serving size info)
          for (const food of mapUsdaResults(brandedFoods)) {
            const key = food.name.toLowerCase().trim();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(food);
            }
          }

          // Add OFF results (good for international/consumer brands)
          for (const food of offFoods) {
            const key = food.name.toLowerCase().trim();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push({
                name: food.name,
                description: food.description,
                caloriesPer100g: food.caloriesPer100g,
                proteinPer100g: food.proteinPer100g,
                carbsPer100g: food.carbsPer100g,
                fatPer100g: food.fatPer100g,
                servingSize: food.servingSize || "100g",
              });
            }
          }

          results = merged.slice(0, 10);
          resultSource = "branded";
          console.log(`[Food Search] Branded search found ${results.length} results for "${normalizedQuery}" (USDA: ${brandedFoods.length}, OFF: ${offFoods.length})`);
        }

        // 4. If no branded results, try Gemini AI
        if (results.length === 0) {
          try {
            console.log(`[Food Search] No branded results — trying Gemini for "${normalizedQuery}"`);
            results = (await searchFoodWithGemini(normalizedQuery)).slice(0, 10);
            if (results.length > 0) {
              resultSource = "gemini";
            }
          } catch (error) {
            console.warn(`[Food Search] Gemini failed for query: "${normalizedQuery}"`, error);
          }
        }

        // 5. Last resort: generic USDA search (all data types)
        if (results.length === 0) {
          console.log(`[Food Search] Falling back to generic USDA for query: "${normalizedQuery}"`);
          const usdaResults = await searchUSDAFoods(normalizedQuery);
          results = mapUsdaResults(usdaResults).slice(0, 10);
          if (results.length > 0) {
            resultSource = "usda_generic";
          }
        }

        if (results.length > 0) {
          // Save to local file cache (always works)
          await saveLocalCachedFood(normalizedQuery, results, resultSource);

          // Save to DB cache if available
          const cacheData = results.map(r => ({
            foodName: r.name,
            description: r.description,
            calories: r.caloriesPer100g,
            proteinGrams: r.proteinPer100g,
            carbsGrams: r.carbsPer100g,
            fatGrams: r.fatPer100g,
            servingSize: r.servingSize || "100g",
            source: resultSource,
          }));
          await cacheFoodSearchResults(normalizedQuery, cacheData);
        }

        return results;
      }),
    calculateServingMacros: publicProcedure
      .input(
        z.object({
          foodName: z.string(),
          caloriesPer100g: z.number().positive(),
          proteinPer100g: z.number().nonnegative(),
          carbsPer100g: z.number().nonnegative(),
          fatPer100g: z.number().nonnegative(),
          amount: z.number().positive(),
          unit: z.enum(["g", "oz"]),
        })
      )
      .query(({ input }) => {
        const food = {
          name: input.foodName,
          description: "",
          caloriesPer100g: input.caloriesPer100g,
          proteinPer100g: input.proteinPer100g,
          carbsPer100g: input.carbsPer100g,
          fatPer100g: input.fatPer100g,
        };
        return calculateMacrosForServing(food, input.amount, input.unit);
      }),
    getRecent: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(20).default(5),
        })
      )
      .query(({ ctx, input }) => getRecentFoods(ctx.user.id, input.limit)),
  }),
  steps: router({
    logToday: protectedProcedure
      .input(
        z.object({
          steps: z.number().int().min(0),
          dayStart: z.number().int(),
        })
      )
      .mutation(({ ctx, input }) => logStepsForDay(ctx.user.id, input.steps, input.dayStart)),
    getToday: protectedProcedure
      .input(z.object({ dayStart: z.number().int() }))
      .query(({ ctx, input }) => getTodaySteps(ctx.user.id, input.dayStart)),
    getHistory: protectedProcedure
      .input(z.object({ startDate: z.number().int(), endDate: z.number().int() }))
      .query(({ ctx, input }) => getStepHistory(ctx.user.id, input.startDate, input.endDate)),
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
    runDatabaseMigration: protectedProcedure.mutation(async ({ ctx }) => {
      // Only allow owner to run migrations
      if (ctx.user.id !== 1) {
        throw new Error("Unauthorized");
      }
      
      const fs = await import('fs');
      const path = await import('path');
      const { getDb } = await import('./db');
      
      try {
        // Get database connection
        const database = await getDb();
        if (!database) {
          throw new Error('Database connection not available');
        }
        
        // Read the migration SQL file
        const migrationPath = path.join(process.cwd(), 'drizzle', 'migrations', '0002_create_all_tables.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8');
        
        // Split SQL by semicolon and execute each statement
        const statements = sql.split(';').filter((s: string) => s.trim());
        let executedCount = 0;
        
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              await database.execute(statement);
              executedCount++;
              console.log(`[Migration] Executed statement ${executedCount}/${statements.length}`);
            } catch (error: any) {
              // Table already exists - continue
              if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message?.includes('already exists')) {
                console.log(`[Migration] Table already exists, skipping`);
                executedCount++;
              } else {
                throw error;
              }
            }
          }
        }
        
        return {
          success: true,
          message: `Migration completed: ${executedCount} statements executed`,
          statementsExecuted: executedCount,
        };
      } catch (error: any) {
        console.error('[Migration] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Migration failed: ${error.message}`,
        });
      }
    }),
  }),
  progress: router({
    getTrends: protectedProcedure
      .input(
        z.object({
          startDate: z.number(),
          endDate: z.number(),
        })
      )
      .query(({ ctx, input }) => getMacroTrends(ctx.user.id, input.startDate, input.endDate)),
    getGoal: protectedProcedure
      .query(({ ctx }) => getGoalProgress(ctx.user.id)),
  }),
  weight: router({
    addEntry: protectedProcedure
      .input(
        z.object({
          weightLbs: z.number().int().positive(),
          recordedAt: z.number().int(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) => addWeightEntry(ctx.user.id, input.weightLbs, input.recordedAt, input.notes)),
    getEntries: protectedProcedure
      .input(
        z.object({
          days: z.number().int().min(7).max(365).default(90),
        })
      )
      .query(({ ctx, input }) => getWeightEntries(ctx.user.id, input.days)),
    deleteEntry: protectedProcedure
      .input(z.object({ entryId: z.number().int() }))
      .mutation(({ ctx, input }) => deleteWeightEntry(input.entryId, ctx.user.id)),
    getProgressData: protectedProcedure
      .input(
        z.object({
          days: z.number().int().min(7).max(365).default(90),
        })
      )
      .query(({ ctx, input }) => getWeightProgressData(ctx.user.id, input.days)),
    getWeeklyRate: protectedProcedure
      .query(async ({ ctx }) => {
        const goalProgress = await getGoalProgress(ctx.user.id);
        if (!goalProgress) {
          return {
            weeklyRate: 0,
            estimatedCompletionDate: null,
            daysUntilCompletion: null,
            isOnTrack: false,
          };
        }
        return {
          weeklyRate: Math.round(goalProgress.weeklyWeightChangeRate * 10) / 10,
          estimatedCompletionDate: goalProgress.estimatedCompletionDate,
          daysUntilCompletion: goalProgress.daysUntilCompletion,
          isOnTrack: goalProgress.isOnTrack,
        };
      }),
  }),
  workouts: router({
    addEntry: protectedProcedure
      .input(
        z.object({
          exerciseName: z.string().min(1),
          exerciseType: z.string().min(1),
          durationMinutes: z.number().int().positive(),
          caloriesBurned: z.number().int().nonnegative().optional(),
          intensity: z.enum(["light", "moderate", "intense"]).default("moderate"),
          notes: z.string().optional(),
          recordedAt: z.number().int().optional(),
        })
      )
      .mutation(({ ctx, input }) => addWorkoutEntry(ctx.user.id, input)),
    getEntries: protectedProcedure
      .input(
        z.object({
          days: z.number().int().min(7).max(365).default(30),
        })
      )
      .query(({ ctx, input }) => getWorkoutEntries(ctx.user.id, input.days)),
    deleteEntry: protectedProcedure
      .input(z.object({ entryId: z.number().int() }))
      .mutation(({ ctx, input }) => deleteWorkoutEntry(input.entryId, ctx.user.id)),
    estimateFromText: protectedProcedure
      .input(
        z.object({
          transcript: z.string().min(3),
          fallbackWeightLbs: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const profile = await getUserProfile(ctx.user.id);
        const userWeight = profile?.weightLbs || input.fallbackWeightLbs || 170;

        try {
          const { invokeLLM } = await import("./_core/llm");
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "Extract workout details from text and estimate calories burned. Return strict JSON only.",
              },
              {
                role: "user",
                content: `User text: "${input.transcript}". User weight: ${userWeight} lbs.`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "workout_estimate",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    exerciseName: { type: "string" },
                    exerciseType: { type: "string" },
                    durationMinutes: { type: "number" },
                    intensity: { type: "string", enum: ["light", "moderate", "intense"] },
                    caloriesBurned: { type: "number" },
                    reasoning: { type: "string" },
                  },
                  required: ["exerciseName", "exerciseType", "durationMinutes", "intensity", "caloriesBurned", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = response.choices[0]?.message?.content;
          const contentStr = typeof content === "string" ? content : "";
          const parsed = JSON.parse(contentStr) as {
            exerciseName: string;
            exerciseType: string;
            durationMinutes: number;
            intensity: "light" | "moderate" | "intense";
            caloriesBurned: number;
            reasoning: string;
          };

          return {
            exerciseName: parsed.exerciseName,
            exerciseType: parsed.exerciseType,
            durationMinutes: Math.max(1, Math.round(parsed.durationMinutes)),
            intensity: parsed.intensity,
            caloriesBurned: Math.max(1, Math.round(parsed.caloriesBurned)),
            reasoning: parsed.reasoning,
            usedFallback: false,
          };
        } catch (error) {
          const durationMatch = input.transcript.match(/(\d{1,3})\s*(min|mins|minute|minutes)/i);
          const durationMinutes = durationMatch ? Math.max(1, Number(durationMatch[1])) : 30;

          const normalized = input.transcript.toLowerCase();
          let exerciseType = "Cardio";
          if (/strength|lift|weights|resistance/.test(normalized)) exerciseType = "Strength";
          if (/yoga|pilates|stretch/.test(normalized)) exerciseType = "Flexibility";
          if (/basketball|tennis|soccer|sport/.test(normalized)) exerciseType = "Sports";

          const intensity: "light" | "moderate" | "intense" = /hard|intense|sprint|hiit/.test(normalized)
            ? "intense"
            : /easy|light|walk/.test(normalized)
              ? "light"
              : "moderate";

          const caloriesBurned = estimateCaloriesWithMet(exerciseType, durationMinutes, userWeight, intensity);

          return {
            exerciseName: input.transcript,
            exerciseType,
            durationMinutes,
            intensity,
            caloriesBurned,
            reasoning: "Estimated using MET fallback from workout type, duration, and your weight.",
            usedFallback: true,
          };
        }
      }),
    getDailyRecommendations: protectedProcedure
      .query(async ({ ctx }) => {
        const [profile, recentWorkouts] = await Promise.all([
          getUserProfile(ctx.user.id),
          getWorkoutEntries(ctx.user.id, 14),
        ]);

        const fitnessGoal = profile?.fitnessGoal || "maintain";
        const weeklyMinutes = recentWorkouts.reduce((sum, w) => {
          const withinWeek = w.recordedAt >= (Date.now() - 7 * 24 * 60 * 60 * 1000);
          return withinWeek ? sum + w.durationMinutes : sum;
        }, 0);

        try {
          const { invokeLLM } = await import("./_core/llm");
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "You are a fitness coach. Recommend safe, practical workouts for today. Return strict JSON only.",
              },
              {
                role: "user",
                content: `Fitness goal: ${fitnessGoal}. Recent weekly workout minutes: ${weeklyMinutes}. Provide exactly 3 workouts for today with rationale.`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "daily_workout_recommendations",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    recommendations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          durationMinutes: { type: "number" },
                          intensity: { type: "string", enum: ["light", "moderate", "intense"] },
                          reason: { type: "string" },
                        },
                        required: ["title", "durationMinutes", "intensity", "reason"],
                        additionalProperties: false,
                      },
                      minItems: 3,
                      maxItems: 3,
                    },
                  },
                  required: ["recommendations"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = response.choices[0]?.message?.content;
          const contentStr = typeof content === "string" ? content : "";
          const parsed = JSON.parse(contentStr) as {
            recommendations: Array<{
              title: string;
              durationMinutes: number;
              intensity: "light" | "moderate" | "intense";
              reason: string;
            }>;
          };

          return parsed.recommendations.map((r) => ({
            title: r.title,
            durationMinutes: Math.max(5, Math.round(r.durationMinutes)),
            intensity: r.intensity,
            reason: r.reason,
          }));
        } catch {
          if (fitnessGoal === "lose_fat") {
            return [
              { title: "Brisk Walk + Intervals", durationMinutes: 35, intensity: "moderate", reason: "Supports calorie deficit with low joint stress." },
              { title: "Full-Body Strength", durationMinutes: 30, intensity: "moderate", reason: "Preserves lean mass while cutting fat." },
              { title: "Mobility and Core", durationMinutes: 20, intensity: "light", reason: "Improves recovery and consistency." },
            ];
          }

          if (fitnessGoal === "build_muscle") {
            return [
              { title: "Upper Body Strength", durationMinutes: 45, intensity: "intense", reason: "Progressive overload for hypertrophy." },
              { title: "Lower Body Strength", durationMinutes: 45, intensity: "intense", reason: "Builds foundational strength and muscle." },
              { title: "Easy Cardio Recovery", durationMinutes: 20, intensity: "light", reason: "Supports conditioning without hurting lifting quality." },
            ];
          }

          return [
            { title: "Steady Cardio", durationMinutes: 30, intensity: "moderate", reason: "Improves cardiovascular fitness and consistency." },
            { title: "Functional Strength", durationMinutes: 30, intensity: "moderate", reason: "Maintains muscle and metabolic health." },
            { title: "Stretch + Mobility", durationMinutes: 15, intensity: "light", reason: "Helps recovery and reduces stiffness." },
          ];
        }
      }),
  }),
  bodyMeasurements: router({
    addEntry: protectedProcedure
      .input(
        z.object({
          chestInches: z.number().positive().optional(),
          waistInches: z.number().positive().optional(),
          hipsInches: z.number().positive().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        addBodyMeasurement(
          ctx.user.id,
          input.chestInches,
          input.waistInches,
          input.hipsInches,
          input.notes
        )
      ),
    getEntries: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(200).default(100),
        })
      )
      .query(({ ctx, input }) => getBodyMeasurements(ctx.user.id, input.limit)),
    deleteEntry: protectedProcedure
      .input(z.object({ entryId: z.number().int() }))
      .mutation(({ ctx, input }) => deleteBodyMeasurement(input.entryId, ctx.user.id)),
    getTrends: protectedProcedure
      .input(
        z.object({
          days: z.number().int().min(7).max(365).default(30),
        })
      )
      .query(({ ctx, input }) => getBodyMeasurementTrends(ctx.user.id, input.days)),
  }),
  cgm: router({
    getStats: protectedProcedure
      .input(z.object({ days: z.number().int().min(7).max(90).default(30) }))
      .query(({ ctx, input }) => getCGMStats(ctx.user.id, input.days)),
    getDailyAverages: protectedProcedure
      .input(z.object({ days: z.number().int().min(7).max(30).default(7) }))
      .query(({ ctx, input }) => getCGMDailyAverages(ctx.user.id, input.days)),
    getInsights: protectedProcedure
      .query(async ({ ctx }) => {
        const [stats, dailyAvgs, foodLogs, goalProgress] = await Promise.all([
          getCGMStats(ctx.user.id, 30),
          getCGMDailyAverages(ctx.user.id, 7),
          getRecentFoodLogsForInsights(ctx.user.id, 7),
          getGoalProgress(ctx.user.id),
        ]);

        if (!stats) return null;

        const { invokeLLM } = await import("./_core/llm");

        const foodSummary = foodLogs.slice(0, 20).map(f =>
          `${f.foodName}: ${f.calories}cal, ${f.proteinGrams}g protein, ${f.carbsGrams}g carbs, ${f.fatGrams}g fat`
        ).join("\n");

        const goalSummary = goalProgress
          ? `Goal: ${goalProgress.goalWeight} lbs by ${new Date(goalProgress.daysRemaining * 86400000 + Date.now()).toLocaleDateString()}. Currently ${goalProgress.progressPercentage}% complete.`
          : "No weight goal set.";

        const prompt = `You are a health coach analyzing a user's metabolic data. Provide 3-4 concise, actionable insights.

Glucose Data (last 30 days):
- Average: ${stats.average} mg/dL
- A1C Estimate: ${stats.a1cEstimate}%
- Time in Range (70-180): ${stats.timeInRange}%
- Time Above Range: ${stats.timeAboveRange}%
- Time Below Range: ${stats.timeBelowRange}%

Recent Food Log (last 7 days, up to 20 items):
${foodSummary || "No food logs available."}

${goalSummary}

Return a JSON object with an "insights" array of exactly 3 items. Each item has:
- "title": short title (5 words max)
- "message": actionable advice (1-2 sentences)
- "type": one of "success", "warning", "info"`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a health coach. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "cgm_insights",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        message: { type: "string" },
                        type: { type: "string" },
                      },
                      required: ["title", "message", "type"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["insights"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        const contentStr = typeof content === "string" ? content : "";
        try {
          const parsed = JSON.parse(contentStr);
          return parsed.insights as { title: string; message: string; type: string }[];
        } catch {
          return null;
        }
      }),
  }),
  manualGlucose: router({
    addEntry: protectedProcedure
      .input(
        z.object({
          mgdl: z.number().positive().max(1000),
          readingAt: z.number().int().positive(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        addManualGlucoseEntry(ctx.user.id, input.mgdl, input.readingAt, input.notes)
      ),
    getTodayEntries: protectedProcedure
      .input(z.object({ dayStart: z.number().int() }))
      .query(({ ctx, input }) => getTodayManualGlucoseEntries(ctx.user.id, input.dayStart)),
    deleteEntry: protectedProcedure
      .input(z.object({ entryId: z.number().int() }))
      .mutation(({ ctx, input }) => deleteManualGlucoseEntry(input.entryId, ctx.user.id)),
  }),
});

export type AppRouter = typeof appRouter;

// Note: Image compression is now handled in the uploadPhoto procedure
// The compressImage function from imageCompression.ts is used to resize
// photos to 1MB limit before uploading to S3
