import { describe, it, expect } from "vitest";
import {
  detectFoodVariant,
  getCountableFoodKey,
  getSizedFruitKey,
  COUNTABLE_FOOD_MACROS,
  SIZED_FRUIT_MACROS,
} from "../client/src/lib/variantDetection";

describe("Variant Detection", () => {
  describe("detectFoodVariant", () => {
    it("should detect countable foods", () => {
      expect(detectFoodVariant("2 eggs")).toBe("quantity");
      expect(detectFoodVariant("chicken breast")).toBe("quantity");
      expect(detectFoodVariant("bread slice")).toBe("quantity");
    });

    it("should detect sized fruits", () => {
      expect(detectFoodVariant("medium apple")).toBe("size");
      expect(detectFoodVariant("banana")).toBe("size");
      expect(detectFoodVariant("large orange")).toBe("size");
      expect(detectFoodVariant("strawberries")).toBe("size");
    });

    it("should return null for unknown foods", () => {
      expect(detectFoodVariant("pizza")).toBeNull();
      expect(detectFoodVariant("pasta")).toBeNull();
      expect(detectFoodVariant("rice")).toBeNull();
    });

    it("should be case-insensitive", () => {
      expect(detectFoodVariant("EGGS")).toBe("quantity");
      expect(detectFoodVariant("Apple")).toBe("size");
      expect(detectFoodVariant("CHICKEN BREAST")).toBe("quantity");
    });
  });

  describe("getCountableFoodKey", () => {
    it("should return correct key for countable foods", () => {
      expect(getCountableFoodKey("egg")).toBe("egg");
      expect(getCountableFoodKey("2 eggs")).toBe("egg");
      expect(getCountableFoodKey("chicken breast")).toBe("chicken breast");
      expect(getCountableFoodKey("bread slice")).toBe("bread slice");
    });

    it("should return null for non-countable foods", () => {
      expect(getCountableFoodKey("apple")).toBeNull();
      expect(getCountableFoodKey("pizza")).toBeNull();
    });
  });

  describe("getSizedFruitKey", () => {
    it("should return correct key for sized fruits", () => {
      expect(getSizedFruitKey("apple")).toBe("apple");
      expect(getSizedFruitKey("medium apple")).toBe("apple");
      expect(getSizedFruitKey("banana")).toBe("banana");
      expect(getSizedFruitKey("orange")).toBe("orange");
      expect(getSizedFruitKey("strawberry")).toBe("strawberry");
    });

    it("should return null for non-fruit foods", () => {
      expect(getSizedFruitKey("egg")).toBeNull();
      expect(getSizedFruitKey("pizza")).toBeNull();
    });
  });

  describe("Countable food macros", () => {
    it("should have macros for all countable foods", () => {
      expect(COUNTABLE_FOOD_MACROS.egg).toBeDefined();
      expect(COUNTABLE_FOOD_MACROS["chicken breast"]).toBeDefined();
      expect(COUNTABLE_FOOD_MACROS["bread slice"]).toBeDefined();
    });

    it("should have valid macro values for eggs", () => {
      const eggMacros = COUNTABLE_FOOD_MACROS.egg;
      expect(eggMacros.calories).toBe(70);
      expect(eggMacros.protein).toBe(6);
      expect(eggMacros.carbs).toBe(0.4);
      expect(eggMacros.fat).toBe(5);
    });

    it("should calculate total macros correctly for multiple units", () => {
      const eggMacros = COUNTABLE_FOOD_MACROS.egg;
      const quantity = 3;
      expect(eggMacros.calories * quantity).toBe(210);
      expect(eggMacros.protein * quantity).toBe(18);
    });
  });

  describe("Sized fruit macros", () => {
    it("should have macros for all sized fruits", () => {
      expect(SIZED_FRUIT_MACROS.apple).toBeDefined();
      expect(SIZED_FRUIT_MACROS.banana).toBeDefined();
      expect(SIZED_FRUIT_MACROS.orange).toBeDefined();
      expect(SIZED_FRUIT_MACROS.strawberry).toBeDefined();
    });

    it("should have all three sizes for each fruit", () => {
      for (const fruit of Object.values(SIZED_FRUIT_MACROS)) {
        expect(fruit.small).toBeDefined();
        expect(fruit.medium).toBeDefined();
        expect(fruit.large).toBeDefined();
      }
    });

    it("should have increasing calories from small to large", () => {
      const appleMacros = SIZED_FRUIT_MACROS.apple;
      expect(appleMacros.small.calories).toBeLessThan(appleMacros.medium.calories);
      expect(appleMacros.medium.calories).toBeLessThan(appleMacros.large.calories);
    });

    it("should have valid macro values for apple sizes", () => {
      const appleMacros = SIZED_FRUIT_MACROS.apple;
      expect(appleMacros.small.calories).toBe(52);
      expect(appleMacros.medium.calories).toBe(95);
      expect(appleMacros.large.calories).toBe(116);
    });

    it("should have valid macro values for banana sizes", () => {
      const bananaMacros = SIZED_FRUIT_MACROS.banana;
      expect(bananaMacros.small.calories).toBe(90);
      expect(bananaMacros.medium.calories).toBe(105);
      expect(bananaMacros.large.calories).toBe(121);
    });
  });

  describe("Macro calculations", () => {
    it("should calculate correct macros for 2 eggs", () => {
      const eggMacros = COUNTABLE_FOOD_MACROS.egg;
      const totalCalories = eggMacros.calories * 2;
      const totalProtein = eggMacros.protein * 2;
      expect(totalCalories).toBe(140);
      expect(totalProtein).toBe(12);
    });

    it("should calculate correct macros for medium apple", () => {
      const appleMacros = SIZED_FRUIT_MACROS.apple.medium;
      expect(appleMacros.calories).toBe(95);
      expect(appleMacros.protein).toBe(0.5);
      expect(appleMacros.carbs).toBe(25);
    });

    it("should calculate correct macros for large banana", () => {
      const bananaMacros = SIZED_FRUIT_MACROS.banana.large;
      expect(bananaMacros.calories).toBe(121);
      expect(bananaMacros.protein).toBe(1.5);
      expect(bananaMacros.carbs).toBe(31);
    });
  });
});
