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
  /** Raw household serving text from USDA, e.g. "2 SCOOPS", "1 CUP" */
  householdServingText?: string;
  /** Gram weight of ONE unit (scoop/serving/piece) from the product label */
  servingWeightPerUnit?: number;
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
  //
  // IMPORTANT: Some USDA entries have a mismatch between servingSize and householdServingFullText.
  // Example: Muscle Milk Pro has servingSize=53g but householdServingFullText="2 SCOOPS"
  // and the macros are stored per 2 scoops (82g total), not per 1 scoop (53g).
  // We detect this by checking if householdServingFullText starts with a number > 1.
  let servingWeightG = 100; // default: already per 100g
  const servingUnit = (food.servingSizeUnit || "g").toLowerCase();
  if (food.servingSize && food.dataType === "Branded") {
    const sz = parseFloat(food.servingSize);
    if (!isNaN(sz) && sz > 0) {
      let weightG = 0;
      if (servingUnit === "g" || servingUnit === "ml") {
        weightG = sz;
      } else if (servingUnit === "oz") {
        weightG = sz * 28.35;
      } else if (servingUnit === "grm" || servingUnit === "gram" || servingUnit === "grams") {
        weightG = sz;
      }
      if (weightG > 0) {
        // Check if householdServingFullText indicates a multiplier
        // e.g., "2 SCOOPS", "3 TBSP", "2 CUPS" — means macros are per N × servingSize
        const householdText = (food.householdServingFullText || "").trim();
        const multiplierMatch = householdText.match(/^(\d+(?:\.\d+)?)\s+/i);
        const multiplier = multiplierMatch ? parseFloat(multiplierMatch[1]) : 1;
        if (multiplier > 1 && multiplier <= 10) {
          // Macros are per (multiplier × weightG) grams total
          servingWeightG = weightG * multiplier;
          console.log(`[USDA] Household multiplier detected: "${householdText}" → ${multiplier}x ${weightG}g = ${servingWeightG}g actual serving`);
        } else {
          servingWeightG = weightG;
        }
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

  // Build serving size string — use actual serving weight (accounting for multiplier)
  // e.g., Muscle Milk Pro: servingSize=53g, householdText="2 SCOOPS" → "82g (2 scoops)"
  let servingSize = `${Math.round(servingWeightG)}g`;
  const householdText = (food.householdServingFullText || "").trim();
  if (householdText) {
    servingSize = `${Math.round(servingWeightG)}g (${householdText.toLowerCase()})`;
  } else if (food.servingSize && food.servingSizeUnit && servingWeightG === parseFloat(food.servingSize)) {
    servingSize = `${food.servingSize}${food.servingSizeUnit}`;
  }

  // Calculate per-unit weight for scoop/serving-based products
  // e.g. Muscle Milk Pro: 2 scoops = 106g total → 1 scoop = 53g
  let servingWeightPerUnit: number | undefined;
  if (householdText) {
    const unitMultiplierMatch = householdText.match(/^(\d+(?:\.\d+)?)\s+/i);
    const unitMultiplier = unitMultiplierMatch ? parseFloat(unitMultiplierMatch[1]) : 1;
    if (unitMultiplier > 1 && unitMultiplier <= 10) {
      // servingWeightG is the TOTAL weight for unitMultiplier units
      servingWeightPerUnit = servingWeightG / unitMultiplier;
    } else {
      servingWeightPerUnit = servingWeightG;
    }
  } else if (servingWeightG !== 100) {
    servingWeightPerUnit = servingWeightG;
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
    householdServingText: householdText || undefined,
    servingWeightPerUnit,
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

/**
 * Search USDA FoodData Central for GENERIC / FOUNDATION foods only.
 * Uses "Foundation", "SR Legacy", and "Survey (FNDDS)" data types which contain
 * authoritative USDA nutrition data for plain, unprocessed whole foods.
 * Does NOT include branded products.
 *
 * Use this for queries like "strawberries", "chicken breast", "brown rice".
 */
export async function searchUSDAFoundationFoods(query: string, limit = 10): Promise<USDAFoodResult[]> {
  if (!query || query.length < 2) return [];
  try {
    const response = await fetch(`${USDA_API_BASE}/foods/search?api_key=${USDA_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
        pageSize: limit,
        pageNumber: 1,
        sortBy: "score",
        sortOrder: "desc",
      }),
    });
    if (!response.ok) {
      console.error(`[USDA Foundation] API error: ${response.status}`);
      return [];
    }
    const data = await response.json() as any;
    if (!data.foods || !Array.isArray(data.foods)) return [];
    // Filter out any branded items that slipped through, and items with no calories
    return (data.foods as any[])
      .map(mapFoodItem)
      .filter((f: USDAFoodResult) => f.dataType !== "Branded" && f.calories > 0);
  } catch (error) {
    console.error("[USDA Foundation] search failed:", error);
    return [];
  }
}
