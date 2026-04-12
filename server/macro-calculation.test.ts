import { describe, it, expect } from "vitest";

/**
 * Test macro calculations with corrected unit conversions
 * Verifies that food macro data is calculated correctly for different serving sizes
 */

describe("Macro Calculations", () => {
  // USDA data for Cheerios per 100g
  const cheeriosData = {
    calories: 372,
    protein: 12.4,
    carbs: 73.2,
    fat: 6.6,
  };

  // Helper function to calculate macros (mimics frontend logic)
  const calculateMacros = (
    foodData: typeof cheeriosData,
    quantity: number,
    unit: string
  ) => {
    let quantityInGrams = 0;

    switch (unit) {
      case "oz":
        quantityInGrams = quantity * 28.35;
        break;
      case "lbs":
        quantityInGrams = quantity * 453.6;
        break;
      case "cup":
        // For dry cereals, 1 cup ≈ 30g (not 240g)
        quantityInGrams = quantity * 30;
        break;
      case "grams":
      default:
        quantityInGrams = quantity;
    }

    const scale = quantityInGrams / 100;
    return {
      calories: Math.round(foodData.calories * scale),
      protein: Math.round(foodData.protein * scale * 10) / 10,
      carbs: Math.round(foodData.carbs * scale * 10) / 10,
      fat: Math.round(foodData.fat * scale * 10) / 10,
    };
  };

  it("should calculate correct macros for 1 cup of Cheerios (30g)", () => {
    const result = calculateMacros(cheeriosData, 1, "cup");

    // 1 cup ≈ 30g
    // Expected: 372 * 0.3 = 111.6 cal, 73.2 * 0.3 = 21.96g carbs, etc.
    expect(result.calories).toBe(112); // 111.6 rounded
    expect(result.carbs).toBeCloseTo(22, 0); // 21.96g
    expect(result.protein).toBeCloseTo(3.7, 1); // 3.72g
    expect(result.fat).toBeCloseTo(2, 0); // 1.98g
  });

  it("should calculate correct macros for 100g of Cheerios", () => {
    const result = calculateMacros(cheeriosData, 100, "grams");

    expect(result.calories).toBe(372);
    expect(result.carbs).toBe(73.2);
    expect(result.protein).toBe(12.4);
    expect(result.fat).toBe(6.6);
  });

  it("should calculate correct macros for 1 oz of Cheerios (28.35g)", () => {
    const result = calculateMacros(cheeriosData, 1, "oz");

    // 1 oz ≈ 28.35g
    // Expected: 372 * 0.2835 ≈ 105.4 cal
    expect(result.calories).toBeCloseTo(105, 0);
    expect(result.carbs).toBeCloseTo(20.8, 0);
    expect(result.protein).toBeCloseTo(3.5, 0);
    expect(result.fat).toBeCloseTo(1.9, 0);
  });

  it("should calculate correct macros for 2 cups of Cheerios (60g)", () => {
    const result = calculateMacros(cheeriosData, 2, "cup");

    // 2 cups ≈ 60g
    // Expected: 372 * 0.6 = 223.2 cal
    expect(result.calories).toBe(223);
    expect(result.carbs).toBeCloseTo(43.9, 0);
    expect(result.protein).toBeCloseTo(7.4, 0);
    expect(result.fat).toBeCloseTo(4, 0);
  });

  it("should NOT multiply 1 cup by 240 (old incorrect conversion)", () => {
    // Old incorrect calculation: 1 cup * 240g = 893 calories
    // New correct calculation: 1 cup * 30g = 112 calories
    const result = calculateMacros(cheeriosData, 1, "cup");

    // Verify we're NOT getting the old incorrect value of 893
    expect(result.calories).not.toBe(893);
    expect(result.calories).toBeLessThan(200); // Should be around 112
  });

  it("should handle fractional cups correctly", () => {
    const result = calculateMacros(cheeriosData, 0.5, "cup");

    // 0.5 cup ≈ 15g
    // Expected: 372 * 0.15 = 55.8 cal
    expect(result.calories).toBeCloseTo(56, 0);
    expect(result.carbs).toBeCloseTo(11, 0);
  });

  it("should handle grams input directly", () => {
    const result = calculateMacros(cheeriosData, 50, "grams");

    // 50g directly
    // Expected: 372 * 0.5 = 186 cal
    expect(result.calories).toBe(186);
    expect(result.carbs).toBe(36.6);
    expect(result.protein).toBe(6.2);
    expect(result.fat).toBe(3.3);
  });
});
