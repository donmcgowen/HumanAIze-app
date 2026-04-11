/**
 * Meal analysis and AI recommendations using Gemini
 */

import { invokeLLM } from "./_core/llm";

export interface MealData {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantity?: number;
  unit?: string;
}

export interface DailyTargets {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
}

export interface MealAnalysisResult {
  isWithinLimits: boolean;
  calorieStatus: "under" | "at" | "over";
  proteinStatus: "under" | "at" | "over";
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
  recommendation: string;
  alternatives?: string[];
}

/**
 * Analyze a meal against daily targets and provide AI recommendations
 */
export async function analyzeMealWithAI(
  meals: MealData[],
  dailyTargets: DailyTargets,
  consumedSoFar: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }
): Promise<MealAnalysisResult> {
  // Calculate totals for the new meal(s)
  const mealTotals = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.calories,
      protein: acc.protein + meal.protein,
      carbs: acc.carbs + meal.carbs,
      fat: acc.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Calculate remaining after this meal
  const remaining = {
    calories: dailyTargets.dailyCalories - (consumedSoFar.calories + mealTotals.calories),
    protein: dailyTargets.dailyProtein - (consumedSoFar.protein + mealTotals.protein),
    carbs: dailyTargets.dailyCarbs - (consumedSoFar.carbs + mealTotals.carbs),
    fat: dailyTargets.dailyFat - (consumedSoFar.fat + mealTotals.fat),
  };

  // Determine status
  const calorieStatus =
    remaining.calories > 0 ? "under" : remaining.calories === 0 ? "at" : "over";
  const proteinStatus =
    remaining.protein > 0 ? "under" : remaining.protein === 0 ? "at" : "over";

  const isWithinLimits =
    remaining.calories >= 0 &&
    remaining.protein >= 0 &&
    remaining.carbs >= 0 &&
    remaining.fat >= 0;

  // Build prompt for Gemini
  const mealDescription = meals
    .map((m) => `${m.quantity || 1} ${m.unit || "serving"} of ${m.foodName}`)
    .join(", ");

  const prompt = `You are a nutrition assistant. Analyze this meal and provide a brief recommendation.

Meal: ${mealDescription}
Meal Macros: ${mealTotals.calories} cal, ${mealTotals.protein}g protein, ${mealTotals.carbs}g carbs, ${mealTotals.fat}g fat

Daily Targets: ${dailyTargets.dailyCalories} cal, ${dailyTargets.dailyProtein}g protein, ${dailyTargets.dailyCarbs}g carbs, ${dailyTargets.dailyFat}g fat
Already Consumed: ${consumedSoFar.calories} cal, ${consumedSoFar.protein}g protein, ${consumedSoFar.carbs}g carbs, ${consumedSoFar.fat}g fat
Remaining After Meal: ${remaining.calories} cal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat

Provide a brief 1-2 sentence recommendation on whether this meal fits their daily goals. If it doesn't fit, suggest ONE specific modification to make it work (e.g., "reduce portion size by 30%", "replace with lower-calorie alternative", etc.).

Format your response as JSON:
{
  "recommendation": "Your recommendation here",
  "alternative": "Optional: specific food alternative or modification"
}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a helpful nutrition assistant. Provide practical, concise meal recommendations.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0].message.content;
    const contentStr = typeof content === 'string' ? content : '';
    const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return {
      isWithinLimits,
      calorieStatus,
      proteinStatus,
      remainingCalories: remaining.calories,
      remainingProtein: remaining.protein,
      remainingCarbs: remaining.carbs,
      remainingFat: remaining.fat,
      recommendation:
        parsed.recommendation ||
        `This meal ${isWithinLimits ? "fits" : "exceeds"} your daily targets. ${remaining.calories > 0 ? `You have ${remaining.calories} calories remaining.` : "You've exceeded your calorie limit."}`,
      alternatives: parsed.alternative ? [parsed.alternative] : []
    };
  } catch (error) {
    console.error("Error analyzing meal with AI:", error);
    // Fallback response if AI fails
    return {
      isWithinLimits,
      calorieStatus,
      proteinStatus,
      remainingCalories: remaining.calories,
      remainingProtein: remaining.protein,
      remainingCarbs: remaining.carbs,
      remainingFat: remaining.fat,
      recommendation: `This meal ${isWithinLimits ? "fits within" : "exceeds"} your daily targets. ${remaining.calories > 0 ? `You have ${remaining.calories} calories remaining.` : "You've exceeded your calorie limit."}`,
      alternatives: [],
    };
  }
}
