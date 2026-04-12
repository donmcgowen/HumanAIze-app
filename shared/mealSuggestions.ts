/**
 * Meal Suggestion Engine
 * Suggests specific foods and meals based on remaining daily macro targets
 */

export interface FoodItem {
  id: string;
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: "protein" | "carb" | "fat" | "balanced" | "snack";
}

export interface MacroDeficit {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealSuggestion {
  food: FoodItem;
  matchScore: number; // 0-100, higher is better match
  macroAlignment: {
    caloriesMatch: number;
    proteinMatch: number;
    carbsMatch: number;
    fatMatch: number;
  };
  reason: string;
}

// Common food database with macro information
const FOOD_DATABASE: FoodItem[] = [
  // Protein sources
  {
    id: "chicken_breast",
    name: "Grilled Chicken Breast",
    servingSize: "100g",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    category: "protein",
  },
  {
    id: "greek_yogurt",
    name: "Greek Yogurt",
    servingSize: "100g",
    calories: 59,
    protein: 10,
    carbs: 3.3,
    fat: 0.4,
    category: "protein",
  },
  {
    id: "salmon",
    name: "Grilled Salmon",
    servingSize: "100g",
    calories: 208,
    protein: 22,
    carbs: 0,
    fat: 13,
    category: "protein",
  },
  {
    id: "eggs",
    name: "Eggs (2 large)",
    servingSize: "100g",
    calories: 155,
    protein: 13,
    carbs: 1.1,
    fat: 11,
    category: "protein",
  },
  {
    id: "tuna",
    name: "Canned Tuna",
    servingSize: "100g",
    calories: 132,
    protein: 29,
    carbs: 0,
    fat: 0.9,
    category: "protein",
  },
  {
    id: "tofu",
    name: "Tofu",
    servingSize: "100g",
    calories: 76,
    protein: 8,
    carbs: 1.9,
    fat: 4.8,
    category: "protein",
  },

  // Carb sources
  {
    id: "brown_rice",
    name: "Brown Rice",
    servingSize: "100g cooked",
    calories: 111,
    protein: 2.6,
    carbs: 23,
    fat: 0.9,
    category: "carb",
  },
  {
    id: "sweet_potato",
    name: "Sweet Potato",
    servingSize: "100g",
    calories: 86,
    protein: 1.6,
    carbs: 20,
    fat: 0.1,
    category: "carb",
  },
  {
    id: "oats",
    name: "Oatmeal",
    servingSize: "50g dry",
    calories: 190,
    protein: 5,
    carbs: 34,
    fat: 3,
    category: "carb",
  },
  {
    id: "banana",
    name: "Banana",
    servingSize: "1 medium",
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fat: 0.3,
    category: "carb",
  },
  {
    id: "whole_wheat_bread",
    name: "Whole Wheat Bread",
    servingSize: "1 slice",
    calories: 80,
    protein: 4,
    carbs: 14,
    fat: 1,
    category: "carb",
  },
  {
    id: "quinoa",
    name: "Quinoa",
    servingSize: "100g cooked",
    calories: 120,
    protein: 4.4,
    carbs: 21,
    fat: 1.9,
    category: "carb",
  },

  // Fat sources
  {
    id: "avocado",
    name: "Avocado",
    servingSize: "1/2 fruit",
    calories: 120,
    protein: 1.5,
    carbs: 6,
    fat: 11,
    category: "fat",
  },
  {
    id: "almonds",
    name: "Almonds",
    servingSize: "28g (23 nuts)",
    calories: 164,
    protein: 6,
    carbs: 6,
    fat: 14,
    category: "fat",
  },
  {
    id: "olive_oil",
    name: "Olive Oil",
    servingSize: "1 tbsp",
    calories: 120,
    protein: 0,
    carbs: 0,
    fat: 14,
    category: "fat",
  },
  {
    id: "peanut_butter",
    name: "Peanut Butter",
    servingSize: "2 tbsp",
    calories: 188,
    protein: 8,
    carbs: 7,
    fat: 16,
    category: "fat",
  },

  // Balanced meals
  {
    id: "chicken_rice_broccoli",
    name: "Chicken, Rice & Broccoli",
    servingSize: "1 meal",
    calories: 450,
    protein: 40,
    carbs: 45,
    fat: 8,
    category: "balanced",
  },
  {
    id: "salmon_sweet_potato",
    name: "Salmon & Sweet Potato",
    servingSize: "1 meal",
    calories: 400,
    protein: 35,
    carbs: 35,
    fat: 12,
    category: "balanced",
  },
  {
    id: "turkey_pasta",
    name: "Turkey & Whole Wheat Pasta",
    servingSize: "1 meal",
    calories: 420,
    protein: 38,
    carbs: 42,
    fat: 10,
    category: "balanced",
  },

  // Snacks
  {
    id: "protein_shake",
    name: "Protein Shake",
    servingSize: "1 shake",
    calories: 150,
    protein: 25,
    carbs: 8,
    fat: 2,
    category: "snack",
  },
  {
    id: "apple_peanut_butter",
    name: "Apple with Peanut Butter",
    servingSize: "1 apple + 1 tbsp PB",
    calories: 195,
    protein: 4,
    carbs: 25,
    fat: 8,
    category: "snack",
  },
  {
    id: "cheese_crackers",
    name: "Cheese & Whole Grain Crackers",
    servingSize: "1 oz cheese + 6 crackers",
    calories: 180,
    protein: 7,
    carbs: 18,
    fat: 9,
    category: "snack",
  },
];

/**
 * Calculate how well a food matches the remaining macro targets
 * Returns a score from 0-100 where 100 is a perfect match
 */
function calculateMatchScore(food: FoodItem, deficit: MacroDeficit): number {
  // Normalize macros to percentages of deficit
  const calorieRatio = Math.min(food.calories / Math.max(deficit.calories, 1), 1);
  const proteinRatio = Math.min(food.protein / Math.max(deficit.protein, 1), 1);
  const carbsRatio = Math.min(food.carbs / Math.max(deficit.carbs, 1), 1);
  const fatRatio = Math.min(food.fat / Math.max(deficit.fat, 1), 1);

  // Calculate deviation from ideal ratios
  const calorieDeviation = Math.abs(calorieRatio - 1);
  const proteinDeviation = Math.abs(proteinRatio - 1);
  const carbsDeviation = Math.abs(carbsRatio - 1);
  const fatDeviation = Math.abs(fatRatio - 1);

  // Weight by importance (calories most important, then macros)
  const totalDeviation =
    calorieDeviation * 0.4 +
    proteinDeviation * 0.2 +
    carbsDeviation * 0.2 +
    fatDeviation * 0.2;

  // Convert to 0-100 score
  const score = Math.max(0, 100 - totalDeviation * 100);
  return Math.round(score);
}

/**
 * Get meal suggestions based on remaining daily macros
 */
export function getMealSuggestions(
  deficit: MacroDeficit,
  limit: number = 5
): MealSuggestion[] {
  // Filter foods that don't exceed any macro
  const validFoods = FOOD_DATABASE.filter(
    (food) =>
      food.calories <= deficit.calories * 1.2 && // Allow 20% overage
      food.protein <= deficit.protein * 1.5 &&
      food.carbs <= deficit.carbs * 1.5 &&
      food.fat <= deficit.fat * 1.5
  );

  // Calculate match scores for all valid foods
  const suggestions: MealSuggestion[] = validFoods
    .map((food) => {
      const matchScore = calculateMatchScore(food, deficit);
      return {
        food,
        matchScore,
        macroAlignment: {
          caloriesMatch: Math.round((food.calories / deficit.calories) * 100),
          proteinMatch: Math.round((food.protein / deficit.protein) * 100),
          carbsMatch: Math.round((food.carbs / deficit.carbs) * 100),
          fatMatch: Math.round((food.fat / deficit.fat) * 100),
        },
        reason: generateReason(food, deficit),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return suggestions;
}

/**
 * Generate a human-readable reason for why a food is suggested
 */
function generateReason(food: FoodItem, deficit: MacroDeficit): string {
  const reasons: string[] = [];

  // Check which macros this food helps with
  if (food.protein > deficit.protein * 0.3) {
    reasons.push("high protein");
  }
  if (food.carbs > deficit.carbs * 0.3) {
    reasons.push("good carbs");
  }
  if (food.fat > deficit.fat * 0.3) {
    reasons.push("healthy fats");
  }
  if (food.calories <= deficit.calories * 0.5) {
    reasons.push("light option");
  }

  if (reasons.length === 0) {
    reasons.push("balanced nutrition");
  }

  return `Perfect for: ${reasons.join(", ")}`;
}

/**
 * Get suggestions for a specific macro category
 */
export function getMealSuggestionsByCategory(
  deficit: MacroDeficit,
  category: FoodItem["category"],
  limit: number = 3
): MealSuggestion[] {
  const categoryFoods = FOOD_DATABASE.filter((f) => f.category === category);

  return categoryFoods
    .map((food) => ({
      food,
      matchScore: calculateMatchScore(food, deficit),
      macroAlignment: {
        caloriesMatch: Math.round((food.calories / deficit.calories) * 100),
        proteinMatch: Math.round((food.protein / deficit.protein) * 100),
        carbsMatch: Math.round((food.carbs / deficit.carbs) * 100),
        fatMatch: Math.round((food.fat / deficit.fat) * 100),
      },
      reason: generateReason(food, deficit),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}
