import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchUSDAFoods, getUSDAFoodDetails } from "./usda";

// Mock fetch
global.fetch = vi.fn();

describe("USDA FoodData Central Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchUSDAFoods", () => {
    it("should return empty array for empty query", async () => {
      const result = await searchUSDAFoods("");
      expect(result).toEqual([]);
    });

    it("should return empty array for query shorter than 2 characters", async () => {
      const result = await searchUSDAFoods("a");
      expect(result).toEqual([]);
    });

    it("should search USDA API and return formatted results", async () => {
      const mockResponse = {
        foods: [
          {
            fdcId: "123456",
            description: "Chicken breast, raw",
            dataType: "Survey (FNDDS)",
            foodNutrients: [
              { nutrientId: 1008, value: 165 }, // Energy (kcal)
              { nutrientId: 1003, value: 31.0 }, // Protein (g)
              { nutrientId: 1005, value: 0.0 }, // Carbohydrate (g)
              { nutrientId: 1004, value: 3.6 }, // Total lipid (fat) (g)
            ],
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchUSDAFoods("chicken");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        fdcId: "123456",
        description: "Chicken breast, raw",
        dataType: "Survey (FNDDS)",
        calories: 165,
        protein: 31.0,
        carbs: 0.0,
        fat: 3.6,
        servingSize: 100,
        servingUnit: "g",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("https://api.nal.usda.gov/fdc/v1/foods/search"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "chicken",
            pageSize: 10,
            pageNumber: 1,
          }),
        })
      );
    });

    it("should handle API errors gracefully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await searchUSDAFoods("chicken");

      expect(result).toEqual([]);
    });

    it("should handle network errors gracefully", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await searchUSDAFoods("chicken");

      expect(result).toEqual([]);
    });

    it("should handle missing foodNutrients array", async () => {
      const mockResponse = {
        foods: [
          {
            fdcId: "123456",
            description: "Unknown food",
            dataType: "Survey (FNDDS)",
            // No foodNutrients
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchUSDAFoods("unknown");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        fdcId: "123456",
        description: "Unknown food",
        dataType: "Survey (FNDDS)",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        servingSize: 100,
        servingUnit: "g",
      });
    });

    it("should return multiple results", async () => {
      const mockResponse = {
        foods: [
          {
            fdcId: "111",
            description: "Brown rice",
            dataType: "Survey (FNDDS)",
            foodNutrients: [
              { nutrientId: 1008, value: 112 },
              { nutrientId: 1003, value: 2.6 },
              { nutrientId: 1005, value: 24.9 },
              { nutrientId: 1004, value: 0.9 },
            ],
          },
          {
            fdcId: "222",
            description: "White rice",
            dataType: "Survey (FNDDS)",
            foodNutrients: [
              { nutrientId: 1008, value: 130 },
              { nutrientId: 1003, value: 2.7 },
              { nutrientId: 1005, value: 28.0 },
              { nutrientId: 1004, value: 0.3 },
            ],
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchUSDAFoods("rice");

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe("Brown rice");
      expect(result[1].description).toBe("White rice");
    });

    it("should round nutrients correctly", async () => {
      const mockResponse = {
        foods: [
          {
            fdcId: "123",
            description: "Egg",
            dataType: "Survey (FNDDS)",
            foodNutrients: [
              { nutrientId: 1008, value: 155.5 }, // Should round to 156
              { nutrientId: 1003, value: 13.123 }, // Should round to 13.1
              { nutrientId: 1005, value: 1.234 }, // Should round to 1.2
              { nutrientId: 1004, value: 11.567 }, // Should round to 11.6
            ],
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchUSDAFoods("egg");

      expect(result[0].calories).toBe(156);
      expect(result[0].protein).toBe(13.1);
      expect(result[0].carbs).toBe(1.2);
      expect(result[0].fat).toBe(11.6);
    });
  });

  describe("getUSDAFoodDetails", () => {
    it("should fetch detailed food information", async () => {
      const mockResponse = {
        fdcId: "123456",
        description: "Chicken breast, raw",
        dataType: "Survey (FNDDS)",
        foodNutrients: [
          { nutrientId: 1008, value: 165 },
          { nutrientId: 1003, value: 31.0 },
          { nutrientId: 1005, value: 0.0 },
          { nutrientId: 1004, value: 3.6 },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getUSDAFoodDetails("123456");

      expect(result).toEqual({
        fdcId: "123456",
        description: "Chicken breast, raw",
        dataType: "Survey (FNDDS)",
        calories: 165,
        protein: 31.0,
        carbs: 0.0,
        fat: 3.6,
        servingSize: 100,
        servingUnit: "g",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("https://api.nal.usda.gov/fdc/v1/food/123456"),
        expect.any(Object)
      );
    });

    it("should return null on API error", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getUSDAFoodDetails("invalid");

      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await getUSDAFoodDetails("123456");

      expect(result).toBeNull();
    });
  });
});
