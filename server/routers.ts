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
import { getUserProfile, upsertUserProfile, addFoodLog, getFoodLogsForDay, getRecentFoods, getFrequentFoods, autoAddToFavorites, deleteFoodLog, updateFoodLog, addFavoriteFood, getFavoriteFoods, deleteFavoriteFood, createMealTemplate, getMealTemplates, getMealTemplate, updateMealTemplate, deleteMealTemplate, getMacroTrends, getGoalProgress, getCachedFoodSearchResults, cacheFoodSearchResults, addProgressPhoto, getProgressPhotos, deleteProgressPhoto, updateProgressPhoto, addGlucoseReadings, getGlucoseReadingsForDateRange, calculateGlucoseStatistics, logStepsForDay, getTodaySteps, getStepHistory, addWeightEntry, getWeightEntries, deleteWeightEntry, getWeightProgressData, addWorkoutEntry, getWorkoutEntries, deleteWorkoutEntry, getCGMStats, getCGMDailyAverages, getRecentFoodLogsForInsights, addBodyMeasurement, getBodyMeasurements, deleteBodyMeasurement, getBodyMeasurementTrends, addManualGlucoseEntry, getTodayManualGlucoseEntries, deleteManualGlucoseEntry, getOrCreateGlucoseSource } from "./db";
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
import { ENV } from "./_core/env";

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
    analyzeBodyPhoto: protectedProcedure
      .input(
        z.object({
          photoBase64: z.string(),
          mimeType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const profile = await getUserProfile(ctx.user.id);
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const { ENV } = await import("./_core/env");
          const genAI = new GoogleGenerativeAI(ENV.geminiApiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const profileContext = profile
            ? `User profile: Age ${profile.ageYears ?? "unknown"}, Height ${profile.heightIn ?? "unknown"}in, Weight ${profile.weightLbs ?? "unknown"}lbs, Goal: ${profile.fitnessGoal ?? "maintain"}, Goal weight: ${profile.goalWeightLbs ?? "unknown"}lbs.`
            : "No profile data available.";
          const prompt = `You are a professional fitness and body composition analyst. Analyze this full-body photo and provide a detailed, honest, and constructive assessment.\n${profileContext}\nProvide your analysis in the following JSON format ONLY (no markdown):\n{\n  "estimatedBodyFatPercent": number,\n  "estimatedMuscleMass": "low" | "moderate" | "high" | "very high",\n  "overallHealthRating": "underweight" | "healthy" | "overweight" | "obese",\n  "bmi": number | null,\n  "positiveAreas": ["string"],\n  "areasForImprovement": ["string"],\n  "primaryRecommendation": "fat_loss" | "muscle_gain" | "maintain" | "recomposition",\n  "recommendationReason": "string",\n  "actionPlan": ["string"],\n  "nutritionTips": ["string"],\n  "disclaimer": "string"\n}\nIMPORTANT: Be specific and honest. Provide 3-5 items in positiveAreas and areasForImprovement. Provide 3-5 actionPlan steps and 2-3 nutritionTips. Focus on health, not appearance criticism.`;
          const result = await model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: input.mimeType, data: input.photoBase64 } },
          ]);
          const text = result.response.text();
          const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON in Gemini response");
          const analysis = JSON.parse(jsonMatch[0]);
          return {
            estimatedBodyFatPercent: Number(analysis.estimatedBodyFatPercent) || null,
            estimatedMuscleMass: String(analysis.estimatedMuscleMass || "moderate"),
            overallHealthRating: String(analysis.overallHealthRating || "healthy"),
            bmi: analysis.bmi ? Number(analysis.bmi) : null,
            positiveAreas: Array.isArray(analysis.positiveAreas) ? analysis.positiveAreas as string[] : [],
            areasForImprovement: Array.isArray(analysis.areasForImprovement) ? analysis.areasForImprovement as string[] : [],
            primaryRecommendation: String(analysis.primaryRecommendation || "maintain"),
            recommendationReason: String(analysis.recommendationReason || ""),
            actionPlan: Array.isArray(analysis.actionPlan) ? analysis.actionPlan as string[] : [],
            nutritionTips: Array.isArray(analysis.nutritionTips) ? analysis.nutritionTips as string[] : [],
            disclaimer: String(analysis.disclaimer || "This is an AI estimate and not medical advice."),
          };
        } catch (error) {
          console.error("[analyzeBodyPhoto] Error:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to analyze photo. Please try again with a clear full-body photo." });
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
          // Also return token in response body so native mobile apps
          // can store it in AsyncStorage and send as Authorization header
          token: sessionToken,
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
        const { sendWelcomeEmail } = await import("./emailService");
        
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

        // Send welcome email — fire-and-forget (don't block signup if email fails)
        sendWelcomeEmail(input.email, input.name || input.username).catch((err) =>
          console.error(`[Email] Failed to send welcome email to ${input.email}:`, err)
        );

        return {
          success: true,
          message: "Account created successfully",
        };
      }),
  }),
  // Mobile-compatible user profile procedures
  // The mobile app uses "user.getProfile" and "user.updateProfile"
  // which map to the server's profile.get / profile.upsert with field name translation
  user: router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      const userId = Number(ctx.user.id);
      if (!Number.isFinite(userId)) throw new TRPCError({ code: "UNAUTHORIZED" });
      const prof = await getUserProfile(userId);
      if (!prof) return null;
      // Translate server field names → mobile field names
      return {
        // Identity
        name: ctx.user.name || ctx.user.username || "",
        email: ctx.user.email || "",
        // Stats (mobile uses age/height/currentWeight/goalWeight)
        age: prof.ageYears ?? null,
        height: prof.heightIn ?? null,
        currentWeight: prof.weightLbs ?? null,
        goalWeight: prof.goalWeightLbs ?? null,
        // Goal (mobile uses "lose_weight"/"gain_muscle" etc., server uses "lose_fat"/"build_muscle")
        goal: prof.fitnessGoal === "lose_fat" ? "lose_weight"
            : prof.fitnessGoal === "build_muscle" ? "gain_muscle"
            : prof.fitnessGoal ?? "maintain",
        // Activity (mobile uses "light"/"moderate"/"active" etc., server uses full names)
        activityLevel: prof.activityLevel === "lightly_active" ? "light"
                     : prof.activityLevel === "moderately_active" ? "moderate"
                     : prof.activityLevel === "very_active" ? "active"
                     : prof.activityLevel === "extremely_active" ? "very_active"
                     : prof.activityLevel ?? "moderate",
        // Health conditions: stored as JSON string in DB, returned as array
        healthConditions: (() => {
          if (!prof.healthConditions) return [];
          try { return JSON.parse(prof.healthConditions); } catch { return [prof.healthConditions]; }
        })(),
        // Target date: stored as Unix ms timestamp, returned as ISO string
        targetDate: prof.goalDate ? new Date(prof.goalDate).toISOString() : null,
        // Daily targets (mobile uses proteinTarget/carbTarget/fatTarget)
        dailyCalorieTarget: prof.dailyCalorieTarget ?? null,
        proteinTarget: prof.dailyProteinTarget ?? null,
        carbTarget: prof.dailyCarbsTarget ?? null,
        fatTarget: prof.dailyFatTarget ?? null,
        // Pass-through fields
        gender: prof.gender ?? null,
        diabetesType: prof.diabetesType ?? null,
        onboardingCompleted: prof.onboardingCompleted ?? false,
        geminiPlan: prof.geminiPlan ?? null,
      };
    }),
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        age: z.number().optional(),
        // height as total inches (from profile edit)
        height: z.number().optional(),
        // height as separate feet + inches (from onboarding)
        heightFt: z.number().optional(),
        heightIn: z.number().optional(),
        currentWeight: z.number().optional(),
        goalWeight: z.number().optional(),
        goal: z.string().optional(),
        activityLevel: z.string().optional(),
        healthConditions: z.array(z.string()).optional(),
        targetDate: z.string().optional(),
        // gender from profile edit
        gender: z.string().optional(),
        // sex from onboarding (maps to gender)
        sex: z.string().optional(),
        dailyCalorieTarget: z.number().optional(),
        proteinTarget: z.number().optional(),
        carbTarget: z.number().optional(),
        fatTarget: z.number().optional(),
        onboardingCompleted: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = Number(ctx.user.id);
        if (!Number.isFinite(userId)) throw new TRPCError({ code: "UNAUTHORIZED" });
        // Translate mobile field names → server DB field names
        const goalMap: Record<string, string> = {
          lose_weight: "lose_fat",
          gain_muscle: "build_muscle",
          maintain: "maintain",
          lose_fat: "lose_fat",
          build_muscle: "build_muscle",
        };
        const activityMap: Record<string, string> = {
          sedentary: "sedentary",
          light: "lightly_active",
          moderate: "moderately_active",
          active: "very_active",
          very_active: "extremely_active",
          lightly_active: "lightly_active",
          moderately_active: "moderately_active",
          very_active_server: "very_active",
        };
        const updates: Record<string, any> = {};
        if (input.age !== undefined)           updates.ageYears = input.age;
        // Height: prefer total inches; fall back to ft+in from onboarding
        if (input.height !== undefined) {
          updates.heightIn = Math.round(input.height);
        } else if (input.heightFt !== undefined || input.heightIn !== undefined) {
          updates.heightIn = Math.round((input.heightFt ?? 0) * 12 + (input.heightIn ?? 0));
        }
        if (input.currentWeight !== undefined) updates.weightLbs = Math.round(input.currentWeight);
        if (input.goalWeight !== undefined)    updates.goalWeightLbs = Math.round(input.goalWeight);
        if (input.goal !== undefined)          updates.fitnessGoal = goalMap[input.goal] ?? input.goal;
        if (input.activityLevel !== undefined) updates.activityLevel = activityMap[input.activityLevel] ?? input.activityLevel;
        if (input.healthConditions !== undefined) updates.healthConditions = JSON.stringify(input.healthConditions);
        if (input.targetDate !== undefined)    updates.goalDate = input.targetDate ? new Date(input.targetDate).getTime() : null;
        // gender from profile edit OR sex from onboarding
        if (input.gender !== undefined)        updates.gender = input.gender;
        else if (input.sex !== undefined)      updates.gender = input.sex;
        if (input.dailyCalorieTarget !== undefined) updates.dailyCalorieTarget = input.dailyCalorieTarget;
        if (input.proteinTarget !== undefined) updates.dailyProteinTarget = input.proteinTarget;
        if (input.carbTarget !== undefined)    updates.dailyCarbsTarget = input.carbTarget;
        if (input.fatTarget !== undefined)     updates.dailyFatTarget = input.fatTarget;
        if (input.onboardingCompleted !== undefined) updates.onboardingCompleted = input.onboardingCompleted;
        await upsertUserProfile(userId, updates as any);
        return { success: true };
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
          gender: z.enum(["male", "female", "other"]).optional(),
          onboardingCompleted: z.boolean().optional(),
          geminiPlan: z.string().optional(),
          healthConditions: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const userId = Number(ctx.user.id);
        if (!Number.isFinite(userId)) throw new TRPCError({ code: "UNAUTHORIZED" });
        return upsertUserProfile(userId, input as any);
      }),
    generateAIPlan: protectedProcedure
      .input(
        z.object({
          gender: z.string(),
          ageYears: z.number(),
          weightLbs: z.number(),
          heightIn: z.number(),
          goalWeightLbs: z.number().optional(),
          goalDate: z.number().optional(),
          fitnessGoal: z.string(),
          activityLevel: z.string(),
          healthConditions: z.string().optional(),
          dailyCalorieTarget: z.number().optional(),
          dailyProteinTarget: z.number().optional(),
          dailyCarbsTarget: z.number().optional(),
          dailyFatTarget: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const heightFt = Math.floor(input.heightIn / 12);
        const heightInRem = input.heightIn % 12;
        const bmi = ((input.weightLbs / (input.heightIn * input.heightIn)) * 703).toFixed(1);
        const goalDateStr = input.goalDate ? new Date(input.goalDate).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "no specific date";
        const weightDiff = input.goalWeightLbs ? input.goalWeightLbs - input.weightLbs : 0;
        const goalDesc = input.fitnessGoal === "lose_fat" ? "lose body fat" : input.fitnessGoal === "build_muscle" ? "build muscle" : "maintain weight";
        const healthNote = input.healthConditions && input.healthConditions !== "none" ? `Health conditions: ${input.healthConditions}` : "No significant health conditions";

        const prompt = `You are a certified personal trainer and registered dietitian. Create a comprehensive, personalized health plan for this user.

User Profile:
- Gender: ${input.gender}
- Age: ${input.ageYears} years old
- Height: ${heightFt}'${heightInRem}"
- Current weight: ${input.weightLbs} lbs
- Goal weight: ${input.goalWeightLbs ? input.goalWeightLbs + " lbs" : "not specified"}
- Goal: ${goalDesc}
- Target date: ${goalDateStr}
- Weight change needed: ${weightDiff > 0 ? "+" : ""}${weightDiff} lbs
- Activity level: ${input.activityLevel.replace(/_/g, " ")}
- BMI: ${bmi}
- ${healthNote}
- Daily targets: ${input.dailyCalorieTarget || "auto"} cal, ${input.dailyProteinTarget || "auto"}g protein, ${input.dailyCarbsTarget || "auto"}g carbs, ${input.dailyFatTarget || "auto"}g fat

Provide a detailed, personalized plan in this EXACT JSON format:
{
  "summary": "2-3 sentence overview of their situation and approach",
  "nutritionPlan": {
    "dailyCalories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "keyPrinciples": ["principle 1", "principle 2", "principle 3"],
    "mealTiming": "advice on meal timing",
    "foodsToEat": ["food 1", "food 2", "food 3", "food 4", "food 5"],
    "foodsToAvoid": ["food 1", "food 2", "food 3"]
  },
  "workoutPlan": {
    "type": "e.g. Upper/Lower Split, Full Body, Cardio-focused",
    "daysPerWeek": number,
    "sessionDuration": "e.g. 45-60 minutes",
    "cardio": "specific cardio recommendation",
    "strength": "specific strength recommendation appropriate for age/health",
    "weeklySchedule": ["Day 1: ...", "Day 2: ...", "Day 3: ...", "Day 4: ...", "Day 5: ...", "Day 6: ...", "Day 7: ..."]
  },
  "healthTips": ["tip 1", "tip 2", "tip 3"],
  "timeline": "realistic timeline and milestones"
}

IMPORTANT: Be specific to their age, health conditions, and goals. Do NOT suggest heavy weight training for elderly users. For diabetics, emphasize blood sugar management. For muscle building in young males, suggest progressive overload. Always be safe and realistic.`;

        try {
          const geminiKey = ENV.geminiApiKey;
          if (!geminiKey) throw new Error("Gemini API key not configured");

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 8192,
                  responseMimeType: "application/json",
                },
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errText}`);
          }

          const data = await response.json();
          const parts = data?.candidates?.[0]?.content?.parts ?? [];
          const text = parts.map((p: any) => p.text ?? "").join("");

          // Parse the JSON plan
          let plan: any;
          try {
            plan = JSON.parse(text);
          } catch {
            const match = text.match(/\{[\s\S]*\}/);
            if (match) plan = JSON.parse(match[0]);
            else throw new Error("Could not parse Gemini plan as JSON");
          }

          return { success: true, plan };
        } catch (error: any) {
          console.error("[generateAIPlan] Error:", error?.message);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "Failed to generate plan" });
        }
      }),
    askAssistant: protectedProcedure
      .input(
        z.object({
          message: z.string().min(1).max(2000),
          context: z.string().optional(), // page context (food-logging, workouts, etc.)
          profileSummary: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const geminiKey = ENV.geminiApiKey;
          if (!geminiKey) throw new Error("Gemini API key not configured");

          const systemContext = `You are HumanAIze AI, a personal health and fitness assistant embedded in the HumanAIze health tracking app. You are knowledgeable about nutrition, fitness, weight management, and general wellness. You have access to the user's profile and health data.

${input.profileSummary ? `User Profile:\n${input.profileSummary}` : ""}
${input.context ? `Current page: ${input.context}` : ""}

Be concise, friendly, and actionable. Format responses with bullet points or short paragraphs. Always personalize advice based on the user's profile data when available.`;

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  { role: "user", parts: [{ text: systemContext + "\n\nUser question: " + input.message }] },
                ],
                generationConfig: {
                  temperature: 0.8,
                  maxOutputTokens: 2048,
                },
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errText}`);
          }

          const data = await response.json();
          const parts = data?.candidates?.[0]?.content?.parts ?? [];
          const text = parts.map((p: any) => p.text ?? "").join("");

          return { success: true, reply: text };
        } catch (error: any) {
          console.error("[askAssistant] Error:", error?.message);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "Failed to get AI response" });
        }
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
      .mutation(async ({ ctx, input }) => {
        const result = await addFoodLog(ctx.user.id, input);
        // Auto-add to favorites if logged 5+ times
        autoAddToFavorites(ctx.user.id, input.foodName).catch(() => {});
        return result;
      }),
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
    // ── Mobile-compatible aliases ─────────────────────────────────────────────
    // The React Native mobile app uses these procedure names and payload shapes.
    // They translate to the same underlying DB functions as the web app.
    addFoodEntry: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          calories: z.number().min(0),
          protein: z.number().min(0),
          carbs: z.number().min(0),
          fat: z.number().min(0),
          meal: z.string().optional(),       // "Breakfast" | "Lunch" | "Dinner" | "Snacks"
          amount: z.number().positive().optional(),
          unit: z.string().optional(),
          date: z.string().optional(),        // "yyyy-MM-dd"
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Map mobile payload → web payload
        const mealType = (input.meal?.toLowerCase() ?? "other") as any;
        const validMeal = ["breakfast", "lunch", "dinner", "snack", "other"].includes(mealType)
          ? mealType
          : mealType === "snacks" ? "snack" : "other";
        const loggedAt = input.date
          ? new Date(input.date + "T12:00:00").getTime()
          : Date.now();
        const servingSize = input.amount && input.unit
          ? `${input.amount} ${input.unit}`
          : "1 serving";
        const result = await addFoodLog(ctx.user.id, {
          foodName: input.name,
          servingSize,
          calories: Math.max(1, Math.round(input.calories)),
          proteinGrams: Math.max(0, input.protein),
          carbsGrams: Math.max(0, input.carbs),
          fatGrams: Math.max(0, input.fat),
          loggedAt,
          mealType: validMeal,
        });
        autoAddToFavorites(ctx.user.id, input.name).catch(() => {});
        return result;
      }),
    getFoodLog: protectedProcedure
      .input(
        z.object({
          date: z.string(), // "yyyy-MM-dd"
        })
      )
      .query(async ({ ctx, input }) => {
        const d = new Date(input.date + "T00:00:00");
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
        const endOfDay   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
        const logs = await getFoodLogsForDay(ctx.user.id, startOfDay, endOfDay);
        // Map to mobile-friendly shape: { entries: FoodEntry[] }
        const entries = (logs as any[]).map((log: any) => ({
          id: log.id,
          name: log.foodName,
          calories: log.calories,
          protein: log.proteinGrams,
          carbs: log.carbsGrams,
          fat: log.fatGrams,
          meal: log.mealType,
          amount: parseFloat((log.servingSize || "1").match(/^([\d.]+)/)?.[1] || "1") || 1,
          unit: (log.servingSize || "1 serving").match(/^[\d.]+\s*(.+)$/)?.[1]?.trim() || "serving",
        }));
        return { entries };
      }),
    deleteFoodEntry: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
        })
      )
      .mutation(({ ctx, input }) => deleteFoodLog(input.id, ctx.user.id)),
    // ── End mobile-compatible aliases ─────────────────────────────────────────
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
          // Call Gemini directly — avoids forge API IP restrictions
          const { ENV } = await import("./_core/env");

          // Helper: validate and normalise a suggestion array (defined first to avoid hoisting issues)
          const normaliseSuggestions = (arr: any[]): any[] =>
            arr
              .filter((s: any) => s && typeof s === "object" && s.name)
              .slice(0, 3)
              .map((s: any) => ({
                name: s.name,
                description: s.description || "",
                calories: Number(s.calories) || 0,
                protein: Number(s.protein) || 0,
                carbs: Number(s.carbs) || 0,
                fat: Number(s.fat) || 0,
                mealType: s.mealType || "snack",
              }));

          // Helper: parse a raw text response into suggestions array
          const parseTextToSuggestions = (rawText: string): any[] | null => {
            const arrayMatch = rawText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
            if (arrayMatch) {
              try {
                const arr = JSON.parse(arrayMatch[0]);
                if (Array.isArray(arr) && arr.length > 0) return normaliseSuggestions(arr);
              } catch {}
            }
            try {
              const parsed = JSON.parse(rawText);
              if (Array.isArray(parsed) && parsed.length > 0) return normaliseSuggestions(parsed);
              for (const key of ["suggestions", "meals", "meal_suggestions", "data", "results"]) {
                if (Array.isArray(parsed[key]) && parsed[key].length > 0) return normaliseSuggestions(parsed[key]);
              }
              const firstArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
              if (firstArrayKey && parsed[firstArrayKey].length > 0) return normaliseSuggestions(parsed[firstArrayKey]);
            } catch {}
            return null;
          };

          if (!ENV.geminiApiKey && !ENV.forgeApiKey) {
            console.warn("[AI Meal Suggestions] No AI API keys configured");
            return [];
          }
          const GEMINI_MODEL = "gemini-2.5-flash";
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ENV.geminiApiKey}`;
          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
              },
            }),
          });
          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error("[AI Meal Suggestions] Gemini API error:", geminiRes.status, errText.slice(0, 300));

            // Gemini quota exhausted — fall back to forge/OpenAI API
            if (geminiRes.status === 429 && ENV.forgeApiKey) {
              console.log("[AI Meal Suggestions] Gemini quota exhausted, falling back to forge/OpenAI API");
              const forgeBase = (ENV.forgeApiUrl || "https://api.openai.com").replace(/\/$/, "");
              const forgeUrl = forgeBase.includes("openai.azure.com") ? forgeBase : `${forgeBase}/v1/chat/completions`;
              const forgeRes = await fetch(forgeUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${ENV.forgeApiKey}`,
                },
                body: JSON.stringify({
                  model: ENV.llmModel || "gpt-4o-mini",
                  messages: [{ role: "user", content: prompt }],
                  response_format: { type: "json_object" },
                  max_tokens: 2048,
                }),
              });
              if (!forgeRes.ok) {
                const forgeErr = await forgeRes.text();
                console.error("[AI Meal Suggestions] Forge fallback error:", forgeRes.status, forgeErr.slice(0, 200));
                return [];
              }
              const forgeData = await forgeRes.json() as any;
              const forgeText = forgeData?.choices?.[0]?.message?.content ?? "";
              console.log("[AI Meal Suggestions] Forge fallback raw response (first 300):", forgeText.slice(0, 300));
              const forgeResult = parseTextToSuggestions(forgeText);
              if (forgeResult && forgeResult.length > 0) return forgeResult;
              console.warn("[AI Meal Suggestions] Could not parse forge fallback response");
            }
            return [];
          }
          const geminiData = await geminiRes.json() as any;
          const parts: any[] = geminiData?.candidates?.[0]?.content?.parts ?? [];
          const rawContent = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
          const text = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          console.log("[AI Meal Suggestions] Raw response (first 500 chars):", text.slice(0, 500));

          const result = parseTextToSuggestions(text);
          if (result && result.length > 0) return result;

          console.warn("[AI Meal Suggestions] Could not parse suggestions from response");
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
          /** Gram weight of ONE unit (1 scoop, 1 serving, etc.) — used by client to calculate macros correctly */
          servingWeightPerUnit?: number;
        };

        /** Parse per-unit gram weight from a serving size string like "106g (2 scoops)" → 53 */
        const parseServingWeightPerUnit = (servingSize?: string): number | undefined => {
          if (!servingSize) return undefined;
          const multiMatch = servingSize.match(/^(\d+(?:\.\d+)?)\s*g\s*\((\d+(?:\.\d+)?)\s+\w/i);
          if (multiMatch) {
            const totalG = parseFloat(multiMatch[1]);
            const count = parseFloat(multiMatch[2]);
            return (count > 1 && count <= 10) ? totalG / count : totalG;
          }
          const gMatch = servingSize.match(/^(\d+(?:\.\d+)?)\s*g/i);
          if (gMatch) return parseFloat(gMatch[1]);
          return undefined;
        };

        /** Map Gemini FoodVariation results to FoodResult with servingWeightPerUnit */
        const mapGeminiResults = (geminiResults: Awaited<ReturnType<typeof searchFoodWithGemini>>): FoodResult[] =>
          geminiResults.map(g => ({
            name: g.name,
            description: g.description,
            caloriesPer100g: g.caloriesPer100g,
            proteinPer100g: g.proteinPer100g,
            carbsPer100g: g.carbsPer100g,
            fatPer100g: g.fatPer100g,
            servingSize: g.servingSize,
            servingWeightPerUnit: parseServingWeightPerUnit(g.servingSize),
          }));

        const mapUsdaResults = (usdaResults: Awaited<ReturnType<typeof searchUSDAFoods>>): FoodResult[] =>
          usdaResults.map((food) => ({
            name: food.foodName,
            description: food.brand ? `${food.brand} - ${food.dataType}` : food.dataType,
            caloriesPer100g: food.calories,
            proteinPer100g: food.proteinGrams,
            carbsPer100g: food.carbsGrams,
            fatPer100g: food.fatGrams,
            servingSize: food.servingSize || "100g",
            servingWeightPerUnit: food.servingWeightPerUnit,
          }));

        // 1. Check local file cache first (fast, always available)
        // Note: generic USDA cache entries are bypassed for branded-looking queries (handled in getLocalCachedFood)
        // For branded queries (first word is a brand name), ALL cached results must contain the brand word.
        const genericFoodTerms = new Set(["chicken","beef","pork","fish","rice","pasta","bread","milk","egg","eggs","cheese","butter","oil","sugar","flour","oats","banana","apple","orange","broccoli","spinach","carrot","potato","tomato","onion","garlic","salmon","tuna","turkey","shrimp","yogurt","cream","coffee","tea","juice","water","soda","beer","wine","nuts","almonds","peanuts","walnuts","chocolate","vanilla","strawberry","blueberry","mango"]);
        const cacheQueryWords = normalizedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        const cacheFirstWord = cacheQueryWords[0] ?? "";
        const isBrandedSearch = cacheQueryWords.length >= 2 && !genericFoodTerms.has(cacheFirstWord);

        const cacheIsValid = (names: string[]): boolean => {
          if (isBrandedSearch) {
            // For branded queries: ALL results must contain the brand word (first query word)
            // If even one result is from a different brand, the cache is stale
            const allHaveBrand = names.every(n => n.toLowerCase().includes(cacheFirstWord));
            if (!allHaveBrand) return false;
          }
          // General check: at least one result matches any query word
          return names.some(n => cacheQueryWords.some(w => n.toLowerCase().includes(w)));
        };

        const localCached = await getLocalCachedFood(normalizedQuery);
        if (localCached && localCached.length > 0) {
          if (cacheIsValid(localCached.map(r => r.name))) {
            return localCached.slice(0, 5);
          }
          // Cache has irrelevant/wrong-brand results — clear it and re-search
          console.log(`[Food Search] Cache quality check failed for "${normalizedQuery}" (branded: ${isBrandedSearch}) — clearing stale cache`);
          await clearLocalCachedFood(normalizedQuery);
        }

        // 2. Check DB cache if available — apply relevance quality check to prevent stale results
        const dbCached = await getCachedFoodSearchResults(normalizedQuery);
        if (dbCached.length > 0) {
          if (cacheIsValid(dbCached.map(c => c.foodName || ""))) {
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
          // Cache has stale/wrong-brand results — delete from DB too by overwriting with empty
          console.log(`[Food Search] DB cache quality check failed for "${normalizedQuery}" (branded: ${isBrandedSearch}) — clearing stale DB + local cache`);
          await clearLocalCachedFood(normalizedQuery);
          // Proceed to Gemini to get fresh correct results (they will overwrite the DB cache at the end)
        }

        // 3. Cache miss — Gemini AI is the PRIMARY source for ALL searches.
        // Gemini with Google Search grounding can find any brand's real product page and nutrition label.
        // USDA/OFF are only used as fallback if Gemini returns nothing.
        console.log(`[Food Search] Cache miss for query: "${normalizedQuery}" - searching with Gemini AI first`);

        let results: FoodResult[] = [];
        let resultSource: "branded" | "open_food_facts" | "gemini" | "usda_generic" = "usda_generic";

        // Step 1: Try Gemini AI first (Google Search grounded — finds any brand accurately)
        try {
          const geminiResults = await searchFoodWithGemini(normalizedQuery);
          if (geminiResults.length > 0) {
            let mapped = mapGeminiResults(geminiResults);
            // For branded queries: filter out any results that don't contain the brand word
            if (isBrandedSearch) {
              const brandFiltered = mapped.filter(r =>
                r.name.toLowerCase().includes(cacheFirstWord) ||
                r.description.toLowerCase().includes(cacheFirstWord)
              );
              // Only apply brand filter if it leaves at least 1 result
              if (brandFiltered.length > 0) mapped = brandFiltered;
            }
            results = mapped.slice(0, 8);
            resultSource = "gemini";
            console.log(`[Food Search] Gemini returned ${results.length} results for "${normalizedQuery}" (branded filter: ${isBrandedSearch})`);
          }
        } catch (error) {
          console.warn(`[Food Search] Gemini search failed for "${normalizedQuery}"`, error);
        }

        // Step 2: If Gemini returned nothing, try USDA Branded + Open Food Facts in parallel
        if (results.length === 0) {
          console.log(`[Food Search] Gemini returned no results — falling back to USDA + OFF for "${normalizedQuery}"`);
          const [usdaBrandedResults, offResults] = await Promise.allSettled([
            searchUSDABrandedFoods(normalizedQuery, 20),
            searchOpenFoodFactsByName(normalizedQuery, 15),
          ]);

          const brandedFoods = usdaBrandedResults.status === "fulfilled" ? usdaBrandedResults.value : [];
          const offFoods     = offResults.status === "fulfilled"          ? offResults.value          : [];

          if (brandedFoods.length > 0 || offFoods.length > 0) {
            const seen = new Set<string>();
            const merged: (FoodResult & { _score: number })[] = [];
            const queryLower = normalizedQuery.toLowerCase();
            const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

            const scoreFood = (name: string, description: string, bonus = 0): number => {
              const nameLower = name.toLowerCase();
              const descLower = description.toLowerCase();
              const combined = `${nameLower} ${descLower}`;
              if (nameLower === queryLower) return 100;
              if (nameLower.startsWith(queryLower)) return 90 + bonus;
              if (nameLower.includes(queryLower)) return 80 + bonus;
              const allWords = queryWords.every(w => combined.includes(w));
              if (allWords) return 70 + bonus;
              const matchCount = queryWords.filter(w => combined.includes(w)).length;
              return Math.round((matchCount / queryWords.length) * 60) + bonus;
            };

            for (const food of mapUsdaResults(brandedFoods)) {
              const key = food.name.toLowerCase().trim();
              if (!seen.has(key)) {
                seen.add(key);
                merged.push({ ...food, _score: scoreFood(food.name, food.description) });
              }
            }

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
                  _score: scoreFood(food.name, food.description),
                });
              }
            }

            merged.sort((a, b) => b._score - a._score);
            results = merged.slice(0, 8).map(({ _score, ...food }) => food);
            resultSource = "branded";
            console.log(`[Food Search] USDA/OFF fallback: ${results.length} results for "${normalizedQuery}"`);
          }
        }

        // Step 3: Last resort — generic USDA search
        if (results.length === 0) {
          console.log(`[Food Search] All sources failed — falling back to generic USDA for "${normalizedQuery}"`);
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

    // Fast Gemini-powered autocomplete — triggers after first word, returns quick suggestions
    autocomplete: publicProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => {
        const q = input.query.trim();
        if (!q || q.split(/\s+/).length < 1) return [];

        // Check local file cache first for instant response
        const localCached = await getLocalCachedFood(q);
        if (localCached && localCached.length > 0) {
          return localCached.slice(0, 5).map(r => ({ name: r.name, description: r.description, calories: r.caloriesPer100g }));
        }

        // Use Gemini with a fast, minimal prompt for autocomplete suggestions
        try {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          const words = q.toLowerCase().split(/\s+/);
          const firstWord = words[0];
          const genericTerms = new Set(["chicken","beef","pork","fish","rice","pasta","bread","milk","egg","eggs","cheese","butter","oil","sugar","flour","oats","banana","apple","orange","broccoli","spinach","carrot","potato","tomato","onion","garlic","salmon","tuna","turkey","shrimp","yogurt","cream","coffee","tea","juice","water","soda","beer","wine","nuts","almonds","peanuts","walnuts","chocolate","vanilla","strawberry","blueberry","mango"]);
          const isBrand = words.length >= 1 && !genericTerms.has(firstWord);

          const brandInstruction = isBrand
            ? `CRITICAL: The user is searching for the brand "${firstWord}". Return ONLY products from the ${firstWord} brand. Do NOT suggest products from any other brand.`
            : "";

          const prompt = `You are a food nutrition autocomplete assistant. The user has typed: "${q}"
${brandInstruction}
Return 5 food product name suggestions that match this query. For each, provide the product name and approximate calories per 100g.
Respond ONLY with a JSON array, no markdown:
[{"name": "Product Name", "description": "Brand or brief description", "calories": 150}]`;

          const result = await model.generateContent(prompt);
          const text = result.response.text().trim().replace(/^```json\n?|^```\n?|\n?```$/g, "");
          const suggestions = JSON.parse(text);
          if (Array.isArray(suggestions)) {
            return suggestions.slice(0, 5);
          }
        } catch (e) {
          // Autocomplete failure is silent
        }
        return [];
      }),

    calculateServingMacros: publicProcedure
      .input(
        z.object({
          foodName: z.string(),
          caloriesPer100g: z.number().nonnegative(),
          proteinPer100g: z.number().nonnegative(),
          carbsPer100g: z.number().nonnegative(),
          fatPer100g: z.number().nonnegative(),
          amount: z.number().positive(),
          unit: z.string().min(1),  // g, oz, ml, cup, tbsp, tsp, scoop, slice, piece, egg, serving, fl oz
          servingWeightG: z.number().positive().optional(), // actual gram weight of 1 scoop/serving
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
        return calculateMacrosForServing(food, input.amount, input.unit, input.servingWeightG);
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
        // Use getFrequentFoods for frequency-ranked results (most logged foods first)
        const frequentFoods = await getFrequentFoods(ctx.user.id, query, 8);
        return frequentFoods.map((f: any) => ({
          foodName: f.foodName,
          calories: f.calories,
          proteinGrams: f.proteinGrams,
          carbsGrams: f.carbsGrams,
          fatGrams: f.fatGrams,
          servingSize: f.servingSize,
          logCount: f.logCount,
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
    getDetailedPlan: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          exerciseType: z.string().min(1),
          durationMinutes: z.number().int().positive(),
          intensity: z.enum(["light", "moderate", "intense"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const profile = await getUserProfile(ctx.user.id);
        const fitnessGoal = profile?.fitnessGoal || "maintain";
        const weightLbs = profile?.weightLbs || 170;

        const isStrength = /strength|weight|lift|resistance|muscle/i.test(input.exerciseType + " " + input.title);
        const planType = isStrength ? "weight training" : "cardio";

        const prompt = `You are an expert fitness coach. Generate a detailed ${planType} workout plan for: "${input.title}".

User profile:
- Fitness goal: ${fitnessGoal}
- Weight: ${weightLbs} lbs
- Duration: ${input.durationMinutes} minutes
- Intensity: ${input.intensity}

For ${isStrength ? "weight training: include warm-up, 4-6 exercises with sets/reps/rest, and cool-down. For each exercise include muscle group targeted." : "cardio: include warm-up, main intervals or steady-state breakdown with pace/effort levels, and cool-down. Include heart rate zones if relevant."}

Be specific and practical. Return JSON only.`;

        try {
          const { invokeLLM } = await import("./_core/llm");
          const response = await invokeLLM({
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          });

          const rawContent = response.choices?.[0]?.message?.content ?? "";
          const text = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return { plan: JSON.parse(jsonMatch[0]), planType, raw: text };
          }
          return { plan: null, planType, raw: text };
        } catch (error) {
          return { plan: null, planType, raw: `Failed to generate plan: ${String(error)}` };
        }
      }),
    getEntriesForDate: protectedProcedure
      .input(
        z.object({
          dayStart: z.number().int(),
          dayEnd: z.number().int(),
        })
      )
      .query(async ({ ctx, input }) => {
        const db = await import("./db");
        const entries = await db.getWorkoutEntries(ctx.user.id, 365);
        return entries.filter(
          (e) => e.recordedAt >= input.dayStart && e.recordedAt < input.dayEnd
        );
      }),

    // ── Gemini Natural Language Workout Parser ───────────────────────────────
    parseFromText: protectedProcedure
      .input(
        z.object({
          text: z.string().min(5).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const profile = await getUserProfile(ctx.user.id);
        const userWeight = profile?.weightLbs || 170;

        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const { ENV } = await import("./_core/env");
        const genAI = new GoogleGenerativeAI(ENV.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `You are a fitness data parser. The user has described their workout in natural language. Parse it into structured exercise entries.

User's workout description:
"${input.text}"

User weight: ${userWeight} lbs (for calorie estimation)

Rules:
1. Extract EVERY distinct exercise mentioned
2. If sets/reps/weight are mentioned, include them in the notes field (e.g. "3 sets × 10 reps @ 200 lbs")
3. Estimate calories burned based on exercise type, intensity, and user weight
4. Estimate duration per exercise if not explicitly stated
5. Classify exerciseType as one of: Strength, Cardio, HIIT, Flexibility, Sports, Core, Other
6. Determine intensity: light, moderate, or intense
7. For the workout summary, describe the overall session in 1-2 sentences
8. If a location/context is mentioned (e.g. "gym"), include it in the summary

Return ONLY valid JSON with no markdown:
{
  "summary": "string (1-2 sentence summary of the full workout session)",
  "workoutLocation": "string (e.g. 'Gym', 'Home', 'Outdoors', or empty string)",
  "totalDurationMins": number,
  "totalCaloriesBurned": number,
  "exercises": [
    {
      "name": "string (exercise name, e.g. 'Bench Press')",
      "exerciseType": "string (Strength|Cardio|HIIT|Flexibility|Sports|Core|Other)",
      "muscleGroup": "string (e.g. 'Chest, Triceps')",
      "sets": number or null,
      "reps": number or null,
      "weightLbs": number or null,
      "durationMins": number,
      "caloriesBurned": number,
      "intensity": "light" | "moderate" | "intense",
      "notes": "string (formatted details, e.g. '3 sets × 10 reps @ 200 lbs' or 'bodyweight')"
    }
  ]
}`;

        try {
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON in Gemini response");

          const parsed = JSON.parse(jsonMatch[0]) as {
            summary: string;
            workoutLocation: string;
            totalDurationMins: number;
            totalCaloriesBurned: number;
            exercises: Array<{
              name: string;
              exerciseType: string;
              muscleGroup: string;
              sets: number | null;
              reps: number | null;
              weightLbs: number | null;
              durationMins: number;
              caloriesBurned: number;
              intensity: "light" | "moderate" | "intense";
              notes: string;
            }>;
          };

          if (!parsed.exercises || !Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
            throw new Error("No exercises parsed");
          }

          return {
            summary: parsed.summary || "",
            workoutLocation: parsed.workoutLocation || "",
            totalDurationMins: Math.max(1, Math.round(parsed.totalDurationMins || 0)),
            totalCaloriesBurned: Math.max(0, Math.round(parsed.totalCaloriesBurned || 0)),
            exercises: parsed.exercises.map((ex) => ({
              name: ex.name || "Exercise",
              exerciseType: ex.exerciseType || "Strength",
              muscleGroup: ex.muscleGroup || "",
              sets: ex.sets ?? null,
              reps: ex.reps ?? null,
              weightLbs: ex.weightLbs ?? null,
              durationMins: Math.max(1, Math.round(ex.durationMins || 5)),
              caloriesBurned: Math.max(0, Math.round(ex.caloriesBurned || 0)),
              intensity: ex.intensity || "moderate",
              notes: ex.notes || "",
            })),
          };
        } catch (error) {
          console.error("[parseFromText] Gemini parse failed:", error);
          // Simple fallback: treat the whole text as one workout entry
          const normalized = input.text.toLowerCase();
          const exerciseType = /cardio|run|bike|swim|walk/.test(normalized) ? "Cardio" :
            /yoga|stretch|flex/.test(normalized) ? "Flexibility" :
            /hiit|circuit|interval/.test(normalized) ? "HIIT" : "Strength";
          const intensity: "light" | "moderate" | "intense" = /hard|heavy|intense/.test(normalized) ? "intense" :
            /easy|light/.test(normalized) ? "light" : "moderate";
          return {
            summary: input.text.slice(0, 120),
            workoutLocation: "",
            totalDurationMins: 45,
            totalCaloriesBurned: 250,
            exercises: [{
              name: "Workout Session",
              exerciseType,
              muscleGroup: "",
              sets: null,
              reps: null,
              weightLbs: null,
              durationMins: 45,
              caloriesBurned: 250,
              intensity,
              notes: input.text.slice(0, 500),
            }],
          };
        }
      }),

    // ── Voice-to-Workout Parser (Gemini audio transcription + parse) ───────────
    parseFromVoice: protectedProcedure
      .input(
        z.object({
          audioBase64: z.string(),
          mimeType: z.string().default("audio/m4a"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const profile = await getUserProfile(ctx.user.id);
          const userWeight = profile?.weightLbs || 170;
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const { ENV } = await import("./_core/env");
          const genAI = new GoogleGenerativeAI(ENV.geminiApiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const prompt = `You are a fitness data parser. The user has described their workout by voice. First transcribe the audio, then parse it into structured exercise entries.
User weight: ${userWeight} lbs (for calorie estimation)
Rules:
1. Extract EVERY distinct exercise mentioned
2. If sets/reps/weight are mentioned, include them in the notes field (e.g. "3 sets x 10 reps @ 200 lbs")
3. Estimate calories burned based on exercise type, intensity, and user weight
4. Estimate duration per exercise if not explicitly stated
5. Classify exerciseType as one of: Strength, Cardio, HIIT, Flexibility, Sports, Core, Other
6. Determine intensity: light, moderate, or intense
Return ONLY valid JSON with no markdown:
{
  "transcript": "string (what the user said)",
  "summary": "string (1-2 sentence summary of the full workout session)",
  "workoutLocation": "string (e.g. 'Gym', 'Home', 'Outdoors', or empty string)",
  "totalDurationMins": number,
  "totalCaloriesBurned": number,
  "exercises": [
    {
      "name": "string",
      "exerciseType": "string",
      "muscleGroup": "string",
      "sets": number | null,
      "reps": number | null,
      "weightLbs": number | null,
      "durationMins": number,
      "caloriesBurned": number,
      "intensity": "light" | "moderate" | "intense",
      "notes": "string"
    }
  ]
}`;
          const result = await model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: input.mimeType, data: input.audioBase64 } },
          ]);
          const text = result.response.text();
          const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON in Gemini response");
          const parsed = JSON.parse(jsonMatch[0]) as {
            transcript: string;
            summary: string;
            workoutLocation: string;
            totalDurationMins: number;
            totalCaloriesBurned: number;
            exercises: Array<{
              name: string;
              exerciseType: string;
              muscleGroup: string;
              sets: number | null;
              reps: number | null;
              weightLbs: number | null;
              durationMins: number;
              caloriesBurned: number;
              intensity: "light" | "moderate" | "intense";
              notes: string;
            }>;
          };
          if (!parsed.exercises || !Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
            throw new Error("No exercises parsed from voice");
          }
          return {
            transcript: parsed.transcript || "",
            summary: parsed.summary || "",
            workoutLocation: parsed.workoutLocation || "",
            totalDurationMins: Math.max(1, Math.round(parsed.totalDurationMins || 0)),
            totalCaloriesBurned: Math.max(0, Math.round(parsed.totalCaloriesBurned || 0)),
            exercises: parsed.exercises.map((ex) => ({
              name: ex.name || "Exercise",
              exerciseType: ex.exerciseType || "Strength",
              muscleGroup: ex.muscleGroup || "",
              sets: ex.sets ?? null,
              reps: ex.reps ?? null,
              weightLbs: ex.weightLbs ?? null,
              durationMins: Math.max(1, Math.round(ex.durationMins || 5)),
              caloriesBurned: Math.max(0, Math.round(ex.caloriesBurned || 0)),
              intensity: ex.intensity || "moderate",
              notes: ex.notes || "",
            })),
          };
        } catch (error) {
          console.error("[parseFromVoice] Gemini parse failed:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse voice workout. Please try again or use the text input." });
        }
      }),

    // ── Gemini AI Workout Plan Generator ──────────────────────────────────────
    getAIWorkoutPlan: protectedProcedure
      .input(
        z.object({
          workoutType: z.enum(["strength", "cardio", "hiit", "flexibility", "full_body", "upper_body", "lower_body", "core"]).default("full_body"),
          durationMins: z.number().int().min(10).max(120).default(45),
          intensity: z.enum(["light", "moderate", "intense"]).default("moderate"),
          customRequest: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Get today's date range (local midnight to midnight)
        const now = Date.now();
        const todayStart = now - (now % 86400000); // approximate UTC day start
        const todayEnd = todayStart + 86400000;

        const [profile, recentWorkouts, todayFoodLogs] = await Promise.all([
          getUserProfile(ctx.user.id),
          getWorkoutEntries(ctx.user.id, 14),
          getFoodLogsForDay(ctx.user.id, todayStart, todayEnd),
        ]);

        // Sum today's macros
        const todayCalories = todayFoodLogs.reduce((sum, f) => sum + (f.calories || 0), 0);
        const todayProtein = todayFoodLogs.reduce((sum, f) => sum + (f.proteinGrams || 0), 0);
        const todayCarbs = todayFoodLogs.reduce((sum, f) => sum + (f.carbsGrams || 0), 0);
        const todayFat = todayFoodLogs.reduce((sum, f) => sum + (f.fatGrams || 0), 0);
        const hasFoodData = todayFoodLogs.length > 0;

        const { generateAIWorkoutPlan } = await import("./geminiWorkout");
        const plan = await generateAIWorkoutPlan({
          ageYears: profile?.ageYears ?? undefined,
          heightIn: profile?.heightIn ?? undefined,
          weightLbs: profile?.weightLbs ?? undefined,
          fitnessGoal: (profile?.fitnessGoal as any) ?? "maintain",
          activityLevel: (profile?.activityLevel as any) ?? "moderately_active",
          diabetesType: (profile?.diabetesType as any) ?? null,
          workoutType: input.workoutType,
          durationMins: input.durationMins,
          intensity: input.intensity,
          recentWorkouts: recentWorkouts.slice(0, 10).map((w) => ({
            exerciseName: w.exerciseName,
            exerciseType: w.exerciseType,
            durationMinutes: w.durationMinutes,
            recordedAt: w.recordedAt,
          })),
          customRequest: input.customRequest,
          // Today's food log for pre-workout nutrition advice
          todayCalories: hasFoodData ? todayCalories : undefined,
          todayProtein: hasFoodData ? todayProtein : undefined,
          todayCarbs: hasFoodData ? todayCarbs : undefined,
          todayFat: hasFoodData ? todayFat : undefined,
          dailyCalorieTarget: profile?.dailyCalorieTarget ?? undefined,
          dailyProteinTarget: profile?.dailyProteinTarget ?? undefined,
        });

        return plan;
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
