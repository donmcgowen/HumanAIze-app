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
import { lookupBarcodeProduct, getFoodVariant, getDefaultUnit } from "./barcode";
import { generateFoodInsights, type DailyMacros } from "./insights";
import { getMealSuggestions, getMealSuggestionsByCategory } from "@shared/mealSuggestions";
import { parseClarityCSV, validateClarityCSV, calculateReadingStats, type GlucoseReading } from "./clarityImport";
import { extractTextFromPDF, parseClarityReportText, parseClarityPDFBuffer, validateClarityPDF } from "./pdfExtraction";
import { recognizeFoodFromPhoto, recognizeFoodFromVoice, recognizeFoodFromPhotoAndVoice } from "./foodRecognition";
import { analyzeMealPhotoWithGemini, scanProductLabel } from "./geminiMealScan";

import { storagePut } from "./storage";
import { analyzeMealWithAI, type MealData, type DailyTargets } from "./mealAnalysis";
import { searchFoodWithGemini, calculateMacrosForServing } from "./geminiFood";
import { getLocalCachedFood, saveLocalCachedFood, clearGenericCacheEntries, clearLocalCachedFood } from "./localFoodCache";
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

        let extracted;
        try {
          extracted = await parseClarityPDFBuffer(pdfBuffer);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Failed to process PDF. Please ensure this is a Dexcom Clarity PDF export.",
          });
        }

        if (
          extracted.averageGlucose === undefined &&
          extracted.timeInRange === undefined &&
          extracted.estimatedA1C === undefined
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not extract A1C, average glucose, or time in range from the PDF. Please ensure this is a Dexcom Clarity PDF export.",
          });
        }

        await upsertUserProfile(ctx.user.id, {
          cgmAverageGlucose: extracted.averageGlucose,
          cgmTimeInRange: extracted.timeInRange,
          cgmA1cEstimate: extracted.estimatedA1C,
        });
        return {
          success: true,
          extractionMethod: extracted.extractionMethod ?? "regex",
          metrics: {
            averageGlucose: extracted.averageGlucose ?? null,
            timeInRange: extracted.timeInRange ?? null,
            a1cEstimate: extracted.estimatedA1C ?? null,
            timeAboveRange: extracted.timeAboveRange ?? null,
            timeBelowRange: extracted.timeBelowRange ?? null,
            standardDeviation: extracted.standardDeviation ?? null,
            minGlucose: extracted.minGlucose ?? null,
            maxGlucose: extracted.maxGlucose ?? null,
          },
          aiSummary: extracted.aiSummary ?? null,
          aiInsights: extracted.aiInsights ?? [],
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
        const defaultUnit = getDefaultUnit(product.name, product.servingUnit);
        return {
          ...product,
          variant: variant ? { type: variant.type } : null,
          defaultUnit,
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
    // Gemini AI Food Scanner (product label OR meal plate)
    analyzeMealPhoto: protectedProcedure
      .input(
        z.object({
          imageBase64: z.string().min(1),
          mimeType: z.string().default("image/jpeg"),
          scanMode: z.enum(["meal", "product"]).default("meal"),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const result = input.scanMode === "product"
            ? await scanProductLabel(input.imageBase64, input.mimeType)
            : await analyzeMealPhotoWithGemini(input.imageBase64, input.mimeType);
          return { success: true, ...result };
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to analyze photo.",
          });
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
    getAIMealSuggestions: protectedProcedure
      .input(
        z.object({
          startOfDay: z.number(),
          endOfDay: z.number(),
        })
      )
      .query(async ({ ctx, input }) => {
        const userId = ctx.user.id;

        // Gather all backend data in parallel
        const [profile, foodLogs, weightProgress, cgmStats, glucoseEntries] = await Promise.allSettled([
          getUserProfile(userId),
          getFoodLogsForDay(userId, input.startOfDay, input.endOfDay),
          getWeightProgressData(userId, 90),
          getCGMStats(userId, 30),
          getTodayManualGlucoseEntries(userId, input.startOfDay),
        ]);

        const prof = profile.status === "fulfilled" ? profile.value : null;
        const logs = foodLogs.status === "fulfilled" ? foodLogs.value : [];
        const weight = weightProgress.status === "fulfilled" ? weightProgress.value : null;
        const cgm = cgmStats.status === "fulfilled" ? cgmStats.value : null;
        const glucose = glucoseEntries.status === "fulfilled" ? glucoseEntries.value : [];

        // Compute consumed macros so far today
        const consumed = (logs as any[]).reduce(
          (acc: any, log: any) => ({
            calories: acc.calories + (log.calories || 0),
            protein: acc.protein + (log.proteinGrams || 0),
            carbs: acc.carbs + (log.carbsGrams || 0),
            fat: acc.fat + (log.fatGrams || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );

        const targets = {
          calories: (prof as any)?.dailyCalorieTarget || 2000,
          protein: (prof as any)?.dailyProteinTarget || 150,
          carbs: (prof as any)?.dailyCarbsTarget || 200,
          fat: (prof as any)?.dailyFatTarget || 65,
        };

        const remaining = {
          calories: Math.max(0, targets.calories - consumed.calories),
          protein: Math.max(0, targets.protein - consumed.protein),
          carbs: Math.max(0, targets.carbs - consumed.carbs),
          fat: Math.max(0, targets.fat - consumed.fat),
        };

        // Build a rich context string for Gemini
        const mealSummary = (logs as any[]).length > 0
          ? (logs as any[]).map((l: any) => `${l.foodName} (${l.mealType}): ${l.calories}cal, ${l.proteinGrams}g P, ${l.carbsGrams}g C, ${l.fatGrams}g F`).join("; ")
          : "Nothing logged yet today";

        const weightSummary = weight && (weight as any).entries?.length > 0
          ? `Current weight: ${(weight as any).currentWeight} lbs, starting: ${(weight as any).startingWeight} lbs, change: ${(weight as any).weightChange} lbs`
          : "No weight data available";

        const glucoseSummary = (glucose as any[]).length > 0
          ? `Today's glucose readings: ${(glucose as any[]).map((g: any) => `${g.glucoseMgDl} mg/dL at ${new Date(g.readingTime).toLocaleTimeString()}`).join(", ")}`
          : cgm && (cgm as any).avgGlucose
          ? `30-day avg glucose: ${(cgm as any).avgGlucose} mg/dL, A1C estimate: ${(cgm as any).a1cEstimate}%`
          : "No glucose data available";

        const goalSummary = prof
          ? `Goal: ${(prof as any).primaryGoal || "general health"}, height: ${(prof as any).heightFeet}ft ${(prof as any).heightInches}in, age: ${(prof as any).age || "unknown"}`
          : "No profile data";

        const prompt = `You are a personalized nutrition AI. Based on this user's data, suggest 3 specific meals they should eat for the rest of today to hit their macro targets.

User profile: ${goalSummary}
Weight: ${weightSummary}
Glucose: ${glucoseSummary}

Today's macro targets: ${targets.calories} cal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat
Already consumed: ${Math.round(consumed.calories)} cal, ${Math.round(consumed.protein)}g protein, ${Math.round(consumed.carbs)}g carbs, ${Math.round(consumed.fat)}g fat
Remaining: ${Math.round(remaining.calories)} cal, ${Math.round(remaining.protein)}g protein, ${Math.round(remaining.carbs)}g carbs, ${Math.round(remaining.fat)}g fat

Foods logged today: ${mealSummary}

Respond with a JSON array of exactly 3 meal suggestions. Each suggestion must have:
- name: string (specific meal name, e.g. "Grilled Chicken with Brown Rice")
- description: string (1-2 sentences why this fits their goals)
- calories: number
- protein: number (grams)
- carbs: number (grams)
- fat: number (grams)
- mealType: "breakfast" | "lunch" | "dinner" | "snack"

Focus on meals that fill the remaining macro gaps. If glucose is high, suggest lower-carb options. If protein is low, prioritize high-protein meals. Be specific with real food names.`;

        try {
          const { invokeLLM } = await import("./_core/llm");
          const result = await invokeLLM({
            messages: [{ role: "user", content: prompt }],
            model: "gemini-2.5-flash",
            response_format: { type: "json_object" },
          });

          const text = result.content || "";
          // Extract JSON array from response
          const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (match) {
            const suggestions = JSON.parse(match[0]);
            return Array.isArray(suggestions) ? suggestions.slice(0, 3) : [];
          }
          // Try parsing entire response as JSON
          try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.slice(0, 3);
            if (parsed.suggestions) return parsed.suggestions.slice(0, 3);
          } catch {}
          return [];
        } catch (error) {
          console.error("[AI Meal Suggestions] Error:", error);
          return [];
        }
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
          // Quality check: ensure at least one cached result actually matches the query
          // This prevents stale branded cache from returning irrelevant results
          const queryWords = normalizedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
          const hasRelevantResult = localCached.some(r => {
            const nameLower = r.name.toLowerCase();
            return queryWords.some(w => nameLower.includes(w));
          });
          if (hasRelevantResult) {
            return localCached.slice(0, 5);
          }
          // Cache has irrelevant results — clear it and re-search
          console.log(`[Food Search] Cache quality check failed for "${normalizedQuery}" — clearing stale cache`);
          await clearLocalCachedFood(normalizedQuery);
        }

        // 2. Check DB cache if available — apply relevance quality check to prevent stale results
        const dbCached = await getCachedFoodSearchResults(normalizedQuery);
        if (dbCached.length > 0) {
          const dbQueryWords = normalizedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
          const dbHasRelevantResult = dbCached.some(c => {
            const nameLower = (c.foodName || "").toLowerCase();
            return dbQueryWords.some(w => nameLower.includes(w));
          });
          if (dbHasRelevantResult) {
            console.log(`[Food Search] DB cache hit for query: "${normalizedQuery}" (${dbCached.length} results)`);
            const mapped = dbCached.map(c => ({
              name: c.foodName,
              description: c.description || "",
              caloriesPer100g: c.calories,
              proteinPer100g: c.proteinGrams,
              carbsPer100g: c.carbsGrams,
              fatPer100g: c.fatGrams,
              servingSize: c.servingSize || "100g",
            })).slice(0, 5);
            await saveLocalCachedFood(normalizedQuery, mapped, "branded");
            return mapped;
          }
          console.log(`[Food Search] DB cache quality check failed for "${normalizedQuery}" — bypassing stale cache`);
        }

        // 3. Cache miss — search USDA Branded + Open Food Facts IN PARALLEL (best sources for branded products)
        console.log(`[Food Search] Cache miss for query: "${normalizedQuery}" - searching USDA Branded + Open Food Facts in parallel`);

        let results: FoodResult[] = [];
        let resultSource: "branded" | "open_food_facts" | "gemini" | "usda_generic" = "usda_generic";

        // Run USDA Branded and Open Food Facts searches in parallel
        const [usdaBrandedResults, offResults] = await Promise.allSettled([
          searchUSDABrandedFoods(normalizedQuery, 20),
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
        // Apply relevance scoring so exact/close matches appear first
        if (brandedFoods.length > 0 || offFoods.length > 0) {
          const seen = new Set<string>();
          const merged: (FoodResult & { _score: number })[] = [];
          const queryLower = normalizedQuery.toLowerCase();
          const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

          const scoreFood = (name: string): number => {
            const nameLower = name.toLowerCase();
            // Exact match
            if (nameLower === queryLower) return 100;
            // Starts with full query
            if (nameLower.startsWith(queryLower)) return 90;
            // Contains full query as substring
            if (nameLower.includes(queryLower)) return 80;
            // All query words present
            const allWords = queryWords.every(w => nameLower.includes(w));
            if (allWords) return 70;
            // Most query words present
            const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
            return Math.round((matchCount / queryWords.length) * 60);
          };

          // Add USDA branded results first (they have serving size info)
          for (const food of mapUsdaResults(brandedFoods)) {
            const key = food.name.toLowerCase().trim();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push({ ...food, _score: scoreFood(food.name) });
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
                _score: scoreFood(food.name),
              });
            }
          }

          // Sort by relevance score descending, then take top 5
          merged.sort((a, b) => b._score - a._score);
          results = merged.slice(0, 5).map(({ _score, ...food }) => food);
          resultSource = "branded";
          console.log(`[Food Search] Branded search found ${results.length} results for "${normalizedQuery}" (USDA: ${brandedFoods.length}, OFF: ${offFoods.length}, top5 selected)`);
        }

        // 4. If no branded results, try Gemini AI
        if (results.length === 0) {
          try {
            console.log(`[Food Search] No branded results — trying Gemini for "${normalizedQuery}"`);
            results = (await searchFoodWithGemini(normalizedQuery)).slice(0, 5);
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
          results = mapUsdaResults(usdaResults).slice(0, 5);
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
    searchHistory: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const query = input.query.trim().toLowerCase();
        if (!query) return [];
        // Fetch up to 365 days of food logs and search by name
        const allLogs = await getRecentFoodLogsForInsights(ctx.user.id, 365);
        // Filter by query words, deduplicate by food name (keep most recent)
        const queryWords = query.split(/\s+/).filter(w => w.length > 1);
        const matched = allLogs.filter((log: any) => {
          const name = (log.foodName || "").toLowerCase();
          return queryWords.some(w => name.includes(w));
        });
        // Deduplicate by food name (keep most recent)
        const seen = new Set<string>();
        const deduped: typeof matched = [];
        for (const log of matched) {
          const key = (log.foodName || "").toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(log);
          }
        }
        return deduped.slice(0, 8).map((log: any) => ({
          foodName: log.foodName,
          calories: log.calories,
          proteinGrams: log.proteinGrams,
          carbsGrams: log.carbsGrams,
          fatGrams: log.fatGrams,
          servingSize: log.servingSize,
        }));
      }),
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
    getAIInsight: protectedProcedure
      .input(z.object({ dayStart: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const entries = await getTodayManualGlucoseEntries(ctx.user.id, input.dayStart);
        if (!entries || entries.length === 0) return null;

        const { invokeLLM } = await import("./_core/llm");

        const readingsSummary = entries
          .map((e: any) => {
            const time = new Date(e.readingAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
            return `${time}: ${e.mgdl} mg/dL${e.notes ? ` (${e.notes})` : ""}`;
          })
          .join(", ");

        const avgGlucose = Math.round(entries.reduce((s: number, e: any) => s + e.mgdl, 0) / entries.length);

        const prompt = `You are a diabetes health coach. A user has logged the following manual glucose readings today:
${readingsSummary}
Average today: ${avgGlucose} mg/dL

Provide one short, practical, encouraging insight (2-3 sentences) about their glucose pattern today. Focus on what the readings suggest and one actionable tip. Be concise and supportive.`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "You are a supportive diabetes health coach. Be brief and practical." },
              { role: "user", content: prompt },
            ],
          });
          const content = response.choices[0].message.content;
          return typeof content === "string" ? content.trim() : null;
        } catch {
          return null;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

// Note: Image compression is now handled in the uploadPhoto procedure
// The compressImage function from imageCompression.ts is used to resize
// photos to 1MB limit before uploading to S3
