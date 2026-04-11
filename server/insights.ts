import { invokeLLM } from "./_core/llm";

export interface FoodLog {
  foodName: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
}

export interface UserProfile {
  dailyCalorieGoal: number;
  dailyProteinGoal: number;
  dailyCarbGoal: number;
  dailyFatGoal: number;
  healthObjectives: string[]; // e.g., ["weight loss", "muscle gain", "energy management"]
}

export interface DailyMacros {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  caloriesRemaining: number;
  proteinRemaining: number;
  carbsRemaining: number;
  fatRemaining: number;
}

export interface InsightRecommendation {
  category: "food_choice" | "portion_size" | "macro_balance" | "meal_timing";
  title: string;
  advice: string;
  priority: "high" | "medium" | "low";
  actionable: boolean;
}

export async function generateFoodInsights(
  foodLogs: FoodLog[],
  userProfile: UserProfile,
  currentMacros: DailyMacros
): Promise<InsightRecommendation[]> {
  const mealSummary = summarizeMeals(foodLogs);
  const macroStatus = analyzeMacroStatus(currentMacros, userProfile);

  const prompt = `You are a nutrition coach analyzing a user's food intake for the day.

User Profile:
- Daily Calorie Goal: ${userProfile.dailyCalorieGoal} cal
- Daily Protein Goal: ${userProfile.dailyProteinGoal}g
- Daily Carbs Goal: ${userProfile.dailyCarbGoal}g
- Daily Fat Goal: ${userProfile.dailyFatGoal}g
- Health Objectives: ${userProfile.healthObjectives.join(", ")}

Today's Food Intake:
${mealSummary}

Current Macro Status:
- Calories: ${currentMacros.totalCalories}/${userProfile.dailyCalorieGoal} (${currentMacros.caloriesRemaining} remaining)
- Protein: ${currentMacros.totalProtein}/${userProfile.dailyProteinGoal}g (${currentMacros.proteinRemaining}g remaining)
- Carbs: ${currentMacros.totalCarbs}/${userProfile.dailyCarbGoal}g (${currentMacros.carbsRemaining}g remaining)
- Fat: ${currentMacros.totalFat}/${userProfile.dailyFatGoal}g (${currentMacros.fatRemaining}g remaining)

Macro Analysis: ${macroStatus}

Based on this data, provide 2-4 actionable nutrition recommendations in JSON format. Focus on:
1. Food choices that would better align with their goals
2. Portion size adjustments if needed
3. Macro balance improvements
4. Meal timing or distribution suggestions

Return ONLY valid JSON array with this structure:
[
  {
    "category": "food_choice|portion_size|macro_balance|meal_timing",
    "title": "Brief title",
    "advice": "Specific, actionable advice",
    "priority": "high|medium|low",
    "actionable": true
  }
]`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a nutrition coach. Provide practical, evidence-based nutrition advice. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "nutrition_insights",
          strict: true,
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: ["food_choice", "portion_size", "macro_balance", "meal_timing"],
                },
                title: { type: "string" },
                advice: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                actionable: { type: "boolean" },
              },
              required: ["category", "title", "advice", "priority", "actionable"],
            },
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    if (typeof content === "string") {
      return JSON.parse(content);
    }
    return [];
  } catch (err) {
    console.error("Error generating insights:", err);
    return getDefaultInsights(currentMacros, userProfile);
  }
}

function summarizeMeals(foodLogs: FoodLog[]): string {
  const mealsByType: Record<string, FoodLog[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  foodLogs.forEach((log) => {
    mealsByType[log.mealType].push(log);
  });

  let summary = "";
  Object.entries(mealsByType).forEach(([mealType, meals]) => {
    if (meals.length > 0) {
      const totalCal = meals.reduce((sum, m) => sum + m.calories, 0);
      const totalPro = meals.reduce((sum, m) => sum + m.proteinGrams, 0);
      const totalCarb = meals.reduce((sum, m) => sum + m.carbsGrams, 0);
      const totalFat = meals.reduce((sum, m) => sum + m.fatGrams, 0);

      summary += `\n${mealType.toUpperCase()}:\n`;
      meals.forEach((m) => {
        summary += `  - ${m.foodName}: ${m.calories} cal, ${m.proteinGrams}g protein, ${m.carbsGrams}g carbs, ${m.fatGrams}g fat\n`;
      });
      summary += `  Subtotal: ${totalCal} cal, ${totalPro}g protein, ${totalCarb}g carbs, ${totalFat}g fat\n`;
    }
  });

  return summary || "No meals logged yet";
}

function analyzeMacroStatus(macros: DailyMacros, profile: UserProfile): string {
  const caloriePercent = Math.round((macros.totalCalories / profile.dailyCalorieGoal) * 100);
  const proteinPercent = Math.round((macros.totalProtein / profile.dailyProteinGoal) * 100);
  const carbPercent = Math.round((macros.totalCarbs / profile.dailyCarbGoal) * 100);
  const fatPercent = Math.round((macros.totalFat / profile.dailyFatGoal) * 100);

  const status: string[] = [];

  if (caloriePercent > 90) {
    status.push(`Calories are ${caloriePercent}% of goal (nearly at limit)`);
  } else if (caloriePercent < 50) {
    status.push(`Calories are only ${caloriePercent}% of goal (significantly under)`);
  } else {
    status.push(`Calories are ${caloriePercent}% of goal (on track)`);
  }

  if (proteinPercent < 60) {
    status.push(`Protein is low at ${proteinPercent}% of goal`);
  } else if (proteinPercent > 100) {
    status.push(`Protein exceeds goal by ${proteinPercent - 100}%`);
  }

  if (carbPercent > 100) {
    status.push(`Carbs exceed goal by ${carbPercent - 100}%`);
  }

  if (fatPercent > 100) {
    status.push(`Fat exceeds goal by ${fatPercent - 100}%`);
  }

  return status.join(". ");
}

function getDefaultInsights(macros: DailyMacros, profile: UserProfile): InsightRecommendation[] {
  const insights: InsightRecommendation[] = [];

  // Protein check
  if (macros.totalProtein < profile.dailyProteinGoal * 0.7) {
    insights.push({
      category: "food_choice",
      title: "Increase Protein Intake",
      advice: `You're at ${Math.round((macros.totalProtein / profile.dailyProteinGoal) * 100)}% of your protein goal. Consider adding protein-rich foods like chicken, fish, eggs, or Greek yogurt to your next meal.`,
      priority: "high",
      actionable: true,
    });
  }

  // Calorie check
  if (macros.caloriesRemaining > profile.dailyCalorieGoal * 0.3) {
    insights.push({
      category: "portion_size",
      title: "Room for More Nutrients",
      advice: `You have ${Math.round(macros.caloriesRemaining)} calories remaining. Consider adding nutrient-dense foods to meet your daily goals.`,
      priority: "medium",
      actionable: true,
    });
  }

  // Macro balance
  const proteinPercent = (macros.totalProtein / macros.totalCalories) * 4;
  const carbPercent = (macros.totalCarbs / macros.totalCalories) * 4;
  const fatPercent = (macros.totalFat / macros.totalCalories) * 9;

  if (proteinPercent < 20 && macros.totalCalories > 500) {
    insights.push({
      category: "macro_balance",
      title: "Boost Protein Ratio",
      advice: `Your meals are ${Math.round(proteinPercent)}% protein. Increasing protein to 25-30% of calories can improve satiety and muscle recovery.`,
      priority: "medium",
      actionable: true,
    });
  }

  return insights;
}
