/**
 * Barcode lookup and nutrition data retrieval
 * Uses Open Food Facts API for barcode scanning with USDA fallback
 */

import { lookupOpenFoodFactsByBarcode } from "./openFoodFacts";
import { searchUSDABrandedFoods } from "./usda";

interface BarcodeProduct {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  servingSize: string;
  servingUnit: string;
  barcode: string;
  brand?: string;
  /** Macros per 100g for scaling calculations */
  caloriesPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  /** Weight in grams of 1 serving unit (for live macro preview scaling) */
  servingWeightPerUnit?: number;
}

/**
 * Extract numeric barcode from URL-based barcode
 * Handles SmartLabel URLs and other redirect formats
 */
function extractNumericBarcode(barcode: string): string | null {
  if (barcode.includes("http") || barcode.includes(".")) {
    const codeMatch = barcode.match(/cname=([0-9]+)/i);
    if (codeMatch && codeMatch[1]) {
      const code = codeMatch[1];
      if (code.length > 14) return code.substring(code.length - 13);
      if (code.length >= 8) return code;
    }
    const matches = barcode.match(/\d{8,14}/g);
    if (matches && matches.length > 0) {
      return matches.reduce((a, b) => (a.length > b.length ? a : b));
    }
  }
  return null;
}

/**
 * Determine smart default unit based on product name/category
 * - Protein powder, supplements → scoops
 * - Drinks, beverages, milk → oz
 * - Everything else → g
 */
export function getDefaultUnit(productName: string, servingUnit?: string): "g" | "oz" | "scoops" | "servings" {
  const name = (productName || "").toLowerCase();
  const unit = (servingUnit || "").toLowerCase();

  // Protein powders and supplements
  if (
    name.includes("protein powder") ||
    name.includes("whey") ||
    name.includes("casein") ||
    name.includes("mass gainer") ||
    name.includes("pre-workout") ||
    name.includes("pre workout") ||
    unit === "scoop"
  ) {
    return "scoops";
  }

  // Drinks and beverages
  if (
    name.includes("milk") ||
    name.includes("juice") ||
    name.includes("drink") ||
    name.includes("beverage") ||
    name.includes("water") ||
    name.includes("shake") ||
    name.includes("smoothie") ||
    name.includes("coffee") ||
    name.includes("tea") ||
    unit === "ml" ||
    unit === "fl oz" ||
    unit === "oz"
  ) {
    return "oz";
  }

  return "g";
}

/**
 * Look up product information by barcode using multiple data sources.
 * Tries Open Food Facts first, then falls back to USDA Branded search.
 */
export async function lookupBarcodeProduct(barcode: string): Promise<BarcodeProduct | null> {
  if (!barcode) return null;

  let numericBarcode = barcode;
  if (barcode.includes("http") || barcode.includes(".")) {
    const extracted = extractNumericBarcode(barcode);
    if (extracted) {
      numericBarcode = extracted;
    }
  }

  if (!/^\d{8,14}$/.test(numericBarcode)) {
    console.error(`Invalid barcode format: ${numericBarcode}`);
    return null;
  }

  console.log(`Looking up barcode: ${numericBarcode}`);

  // Try Open Food Facts first
  try {
    const offProduct = await lookupOpenFoodFactsByBarcode(numericBarcode);
    if (offProduct) {
      console.log(`Found product in Open Food Facts: ${offProduct.name}`);
      const servingSizeNum = parseFloat(offProduct.servingSize) || 100;
      const servingUnitStr = offProduct.servingUnit || "g";

      // Calculate per-100g values for scaling
      const scaleFactor = servingUnitStr.toLowerCase() === "oz"
        ? (servingSizeNum * 28.3495) / 100
        : servingSizeNum / 100;

      // servingWeightPerUnit: weight in grams of 1 serving (for live preview scaling)
      const offServingInGrams = servingUnitStr.toLowerCase() === "oz"
        ? servingSizeNum * 28.3495
        : servingSizeNum; // ml treated as g for nutrition purposes

      return {
        name: offProduct.name,
        calories: Math.round(offProduct.calories),
        protein: Math.round(offProduct.protein * 10) / 10,
        carbs: Math.round(offProduct.carbs * 10) / 10,
        fat: Math.round(offProduct.fat * 10) / 10,
        sugar: Math.round(offProduct.sugar * 10) / 10,
        servingSize: offProduct.servingSize,
        servingUnit: offProduct.servingUnit,
        barcode: offProduct.barcode,
        brand: offProduct.brand,
        caloriesPer100g: scaleFactor > 0 ? Math.round(offProduct.calories / scaleFactor) : offProduct.calories,
        proteinPer100g:  scaleFactor > 0 ? Math.round((offProduct.protein  / scaleFactor) * 10) / 10 : offProduct.protein,
        carbsPer100g:    scaleFactor > 0 ? Math.round((offProduct.carbs    / scaleFactor) * 10) / 10 : offProduct.carbs,
        fatPer100g:      scaleFactor > 0 ? Math.round((offProduct.fat      / scaleFactor) * 10) / 10 : offProduct.fat,
        servingWeightPerUnit: offServingInGrams > 0 ? offServingInGrams : undefined,
      };
    }
  } catch (error) {
    console.warn("Open Food Facts barcode lookup failed:", error);
  }

  // Fallback: search USDA Branded by barcode (GTIN)
  try {
    console.log(`Trying USDA GTIN lookup for barcode: ${numericBarcode}`);
    const usdaResults = await searchUSDABrandedFoods(numericBarcode, 1);
    if (usdaResults && usdaResults.length > 0) {
      const food = usdaResults[0];
      console.log(`Found product in USDA: ${food.foodName}`);
      // USDA returns macros per serving; we need per-100g
      // Parse serving size to get grams
      const servingSizeStr = food.servingSize || "100g";
      const servingSizeMatch = servingSizeStr.match(/(\d+(?:\.\d+)?)/);
      const servingSizeNum = servingSizeMatch ? parseFloat(servingSizeMatch[1]) : 100;
      const servingUnitStr = (food.servingUnit || "g").toLowerCase();
      const servingInGrams = servingUnitStr === "oz" ? servingSizeNum * 28.3495 : servingSizeNum;
      const factor = servingInGrams > 0 ? servingInGrams / 100 : 1;

      return {
        name: food.foodName,
        calories: food.calories,
        protein: food.proteinGrams,
        carbs: food.carbsGrams,
        fat: food.fatGrams,
        sugar: food.sugarGrams,
        servingSize: String(servingSizeNum),
        servingUnit: servingUnitStr,
        barcode: numericBarcode,
        brand: food.brand || undefined,
        caloriesPer100g: factor > 0 ? Math.round(food.calories / factor) : food.calories,
        proteinPer100g:  factor > 0 ? food.proteinGrams / factor : food.proteinGrams,
        carbsPer100g:    factor > 0 ? food.carbsGrams / factor : food.carbsGrams,
        fatPer100g:      factor > 0 ? food.fatGrams / factor : food.fatGrams,
        servingWeightPerUnit: servingInGrams > 0 ? servingInGrams : undefined,
      };
    }
  } catch (error) {
    console.warn("USDA barcode lookup failed:", error);
  }

  console.warn(`Product not found for barcode: ${numericBarcode}`);
  return null;
}

/**
 * Food variant data for countable items and sized fruits
 */
export const FOOD_VARIANTS = {
  eggs: {
    type: "countable",
    unit: "egg",
    macrosPerUnit: { calories: 70, protein: 6, carbs: 0.4, fat: 5 },
  },
  "chicken breast": {
    type: "countable",
    unit: "piece",
    macrosPerUnit: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  },
  apple: {
    type: "sized",
    sizes: {
      small: { weight: 149, calories: 77, protein: 0.4, carbs: 21, fat: 0.2 },
      medium: { weight: 182, calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
      large: { weight: 223, calories: 116, protein: 0.6, carbs: 31, fat: 0.4 },
    },
  },
  banana: {
    type: "sized",
    sizes: {
      small: { weight: 101, calories: 90, protein: 1.1, carbs: 23, fat: 0.3 },
      medium: { weight: 118, calories: 105, protein: 1.3, carbs: 27, fat: 0.3 },
      large: { weight: 136, calories: 121, protein: 1.5, carbs: 31, fat: 0.4 },
    },
  },
  orange: {
    type: "sized",
    sizes: {
      small: { weight: 131, calories: 53, protein: 0.9, carbs: 13, fat: 0.3 },
      medium: { weight: 154, calories: 62, protein: 1.2, carbs: 16, fat: 0.3 },
      large: { weight: 184, calories: 74, protein: 1.5, carbs: 19, fat: 0.4 },
    },
  },
  strawberry: {
    type: "sized",
    sizes: {
      small: { weight: 100, calories: 32, protein: 0.7, carbs: 8, fat: 0.3 },
      medium: { weight: 150, calories: 48, protein: 1, carbs: 12, fat: 0.4 },
      large: { weight: 200, calories: 64, protein: 1.3, carbs: 15, fat: 0.5 },
    },
  },
  "greek yogurt": {
    type: "countable",
    unit: "cup (227g)",
    macrosPerUnit: { calories: 220, protein: 20, carbs: 9, fat: 5 },
  },
  bread: {
    type: "countable",
    unit: "slice",
    macrosPerUnit: { calories: 79, protein: 2.7, carbs: 14, fat: 1 },
  },
} as const;

export type FoodVariantKey = keyof typeof FOOD_VARIANTS;

export function getFoodVariant(foodName: string): (typeof FOOD_VARIANTS)[FoodVariantKey] | null {
  const normalized = foodName.toLowerCase().trim();
  for (const [key, variant] of Object.entries(FOOD_VARIANTS)) {
    if (normalized.includes(key)) return variant;
  }
  return null;
}
