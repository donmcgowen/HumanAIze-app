/**
 * USDA FoodData Central API Integration
 * Provides access to the USDA's comprehensive food database with nutritional data
 * API Docs: https://fdc.nal.usda.gov/api-guide.html
 */

const USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1";
const USDA_API_KEY = process.env.USDA_API_KEY || "DEMO_KEY";

export interface USDAFoodResult {
  fdcId: string;
  foodName: string;
  description?: string;
  dataType: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  sugarGrams: number;
  servingSize: string;
  servingUnit?: string;
  brand?: string;
}

function mapFoodItem(food: any): USDAFoodResult {
  const nutrients = food.foodNutrients || [];

  // Extract key nutrients (IDs from USDA database)
  const getnutrient = (id: number) => {
    const nutrient = nutrients.find((n: any) => n.nutrientId === id);
    return nutrient?.value || 0;
  };

  // USDA nutrient IDs:
  // 1008 = Energy (kcal)
  // 1003 = Protein (g)
  // 1005 = Carbohydrate (g)
  // 1004 = Total lipid (fat) (g)
  // 2000 = Total sugars (g)

  let rawCalories = getnutrient(1008);
  let rawProtein = getnutrient(1003);
  let rawCarbs = getnutrient(1005);
  let rawFat = getnutrient(1004);
  const rawSugar = getnutrient(2000);

  // For branded foods, USDA returns macros per serving (not per 100g).
  // We need to normalize to per-100g so the serving-size calculator works correctly.
  // The serving size in grams is stored in food.servingSize (when unit is g or ml).
  let servingWeightG = 100; // default: already per 100g
  const servingUnit = (food.servingSizeUnit || "g").toLowerCase();
  if (food.servingSize && food.dataType === "Branded") {
    const sz = parseFloat(food.servingSize);
    if (!isNaN(sz) && sz > 0) {
      if (servingUnit === "g" || servingUnit === "ml") {
        servingWeightG = sz;
      } else if (servingUnit === "oz") {
        servingWeightG = sz * 28.35;
      }
    }
  }

  // Normalize to per-100g
  const normFactor = 100 / servingWeightG;
  const calories = Math.round(rawCalories * normFactor);
  const proteinGrams = Math.round(rawProtein * normFactor * 10) / 10;
  const carbsGrams = Math.round(rawCarbs * normFactor * 10) / 10;
  const fatGrams = Math.round(rawFat * normFactor * 10) / 10;
  const sugarGrams = Math.round(rawSugar * normFactor * 10) / 10;

  // Data validation: Check for unrealistic macro values per 100g
  if (calories > 900 || proteinGrams > 100 || carbsGrams > 100 || fatGrams > 100) {
    console.warn(`[USDA] Anomalous nutrition data for "${food.description}": ${calories}cal, ${proteinGrams}g protein, ${carbsGrams}g carbs, ${fatGrams}g fat (servingWeightG=${servingWeightG})`);
  }

  // Build serving size string
  let servingSize = "100g";
  if (food.servingSize && food.servingSizeUnit) {
    servingSize = `${food.servingSize}${food.servingSizeUnit}`;
  } else if (food.householdServingFullText) {
    servingSize = food.householdServingFullText;
  }

  return {
    fdcId: food.fdcId,
    foodName: food.description || "Unknown Food",
    description: food.description || "",
    dataType: food.dataType || "Survey (FNDDS)",
    calories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    sugarGrams,
    servingSize,
    servingUnit: food.servingSizeUnit || "g",
    brand: food.brandOwner || food.brandName || undefined,
  };
}

/**
 * Search USDA FoodData Central for BRANDED foods matching a query.
 * This searches only the "Branded" data type which includes real commercial products.
 */
export async function searchUSDABrandedFoods(query: string, limit = 15): Promise<USDAFoodResult[]> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    const response = await fetch(`${USDA_API_BASE}/foods/search?api_key=${USDA_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        dataType: ["Branded"],
        pageSize: limit,
        pageNumber: 1,
        sortBy: "score",
        sortOrder: "desc",
      }),
    });

    if (!response.ok) {
      console.error(`[USDA Branded] API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.foods || !Array.isArray(data.foods)) return [];

    return data.foods.map(mapFoodItem);
  } catch (error) {
    console.error("[USDA Branded] search failed:", error);
    return [];
  }
}

/**
 * Search USDA FoodData Central for foods matching a query (all data types).
 * Returns top results with nutritional data.
 */
export async function searchUSDAFoods(query: string): Promise<USDAFoodResult[]> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    const response = await fetch(`${USDA_API_BASE}/foods/search?api_key=${USDA_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        pageSize: 10,
        pageNumber: 1,
      }),
    });

    if (!response.ok) {
      console.error(`USDA API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (!data.foods || !Array.isArray(data.foods)) {
      return [];
    }

    return data.foods.map(mapFoodItem);
  } catch (error) {
    console.error("USDA API search failed:", error);
    return [];
  }
}

/**
 * Get detailed nutritional information for a specific USDA food
 */
export async function getUSDAFoodDetails(fdcId: string): Promise<USDAFoodResult | null> {
  try {
    const response = await fetch(`${USDA_API_BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`USDA API error: ${response.status}`);
      return null;
    }

    const food = await response.json();
    return mapFoodItem(food);
  } catch (error) {
    console.error("USDA API details fetch failed:", error);
    return null;
  }
}
