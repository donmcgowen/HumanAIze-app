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
import { getUserProfile, upsertUserProfile, addFoodLog, getFoodLogsForDay, getRecentFoods, deleteFoodLog, updateFoodLog, addFavoriteFood, getFavoriteFoods, deleteFavoriteFood, createMealTemplate, getMealTemplates, getMealTemplate, updateMealTemplate, deleteMealTemplate, getMacroTrends, getGoalProgress, getCachedFoodSearchResults, cacheFoodSearchResults, addProgressPhoto, getProgressPhotos, deleteProgressPhoto, updateProgressPhoto, addGlucoseReadings, getGlucoseReadingsForDateRange, calculateGlucoseStatistics, logStepsForDay, getTodaySteps, getStepHistory, addWeightEntry, getWeightEntries, deleteWeightEntry, getWeightProgressData } from "./db";
import { searchUSDAFoods } from "./usda";
import { getSyncStatus } from "./backgroundSync";
import { lookupBarcodeProduct, getFoodVariant } from "./barcode";
import { generateFoodInsights, type DailyMacros } from "./insights";
import { getMealSuggestions, getMealSuggestionsByCategory } from "@shared/mealSuggestions";
import { parseClarityCSV, validateClarityCSV, calculateReadingStats, type GlucoseReading } from "./clarityImport";
import { recognizeFoodFromPhoto, recognizeFoodFromVoice, recognizeFoodFromPhotoAndVoice } from "./foodRecognition";

import { storagePut } from "./storage";
import { analyzeMealWithAI, type MealData, type DailyTargets } from "./mealAnalysis";
import { searchFoodWithGemini, calculateMacrosForServing } from "./geminiFood";

const rangeInput = z.object({
  rangeDays: z.number().int().min(7).max(30).default(14),
});

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
          const photo = await updateProgressPhoto(ctx.user.id, input.photoId, {
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
            const sources = await getSourcesForUser(ctx.user.id);
            let source = sources.find(s => s.displayName === "Dexcom Clarity");
            if (!source) {
              source = await createCustomSource(ctx.user.id, "Dexcom Clarity", "glucose");
            }

            if (!source) {
              throw new Error("Failed to create or find Dexcom Clarity source");
            }

            const dbReadings = result.readings.map(r => ({
              readingAt: r.timestamp,
              mgdl: r.value,
              trend: r.trend,
            }));

            await addGlucoseReadings(ctx.user.id, source.id, dbReadings);

            const glucoseReadings = await getGlucoseReadingsForDateRange(
              ctx.user.id,
              Math.min(...result.readings.map(r => r.timestamp)),
              Math.max(...result.readings.map(r => r.timestamp))
            );
            const enhancedStats = await calculateGlucoseStatistics(glucoseReadings);

            return {
              success: true,
              importedCount: result.importedCount,
              skippedCount: result.skippedCount,
              errors: result.errors,
              statistics: enhancedStats,
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

        return {
          success: true,
          importedCount: result.importedCount,
          skippedCount: result.skippedCount,
          errors: result.errors,
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
          heightIn: z.number().int().positive().optional(),
          weightLbs: z.number().int().positive().optional(),
          ageYears: z.number().int().min(1).max(150).optional(),
          fitnessGoal: z.enum(["lose_fat", "build_muscle", "maintain"]).optional(),
          activityLevel: z.enum(["sedentary", "lightly_active", "moderately_active", "very_active", "extremely_active"]).optional(),
          goalWeightLbs: z.number().int().positive().optional(),
          goalDate: z.number().optional(),
          dailyCalorieTarget: z.number().int().positive().optional(),
          dailyProteinTarget: z.number().int().positive().optional(),
          dailyCarbsTarget: z.number().int().positive().optional(),
          dailyFatTarget: z.number().int().positive().optional(),
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
        // Check cache first
        const cached = await getCachedFoodSearchResults(input.query);
        if (cached.length > 0) {
          console.log(`[Food Search] Cache hit for query: "${input.query}" (${cached.length} results)`);
          return cached.map(c => ({
            name: c.foodName,
            description: c.description || "",
            caloriesPer100g: c.calories,
            proteinPer100g: c.proteinGrams,
            carbsPer100g: c.carbsGrams,
            fatPer100g: c.fatGrams,
          }));
        }
        
        // Cache miss - call Gemini API
        console.log(`[Food Search] Cache miss for query: "${input.query}" - calling Gemini API`);
        const results = await searchFoodWithGemini(input.query);
        
        // Cache the results for future searches
        if (results.length > 0) {
          const cacheData = results.map(r => ({
            foodName: r.name,
            description: r.description,
            calories: r.caloriesPer100g,
            proteinGrams: r.proteinPer100g,
            carbsGrams: r.carbsPer100g,
            fatGrams: r.fatPer100g,
            servingSize: "100g",
            source: "gemini" as const,
          }));
          await cacheFoodSearchResults(input.query, cacheData);
          console.log(`[Food Search] Cached ${results.length} results for query: "${input.query}"`);
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
});

export type AppRouter = typeof appRouter;

// Note: Image compression is now handled in the uploadPhoto procedure
// The compressImage function from imageCompression.ts is used to resize
// photos to 1MB limit before uploading to S3
