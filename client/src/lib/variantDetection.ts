// Countable foods (quantity-based)
const COUNTABLE_FOODS = [
  "egg", "eggs",
  "bread", "slice", "slices",
  "chicken", "breast",
  "piece", "pieces",
  "unit", "units",
  "patty", "patties",
];

// Sized fruits
const SIZED_FRUITS = [
  "apple", "apples",
  "banana", "bananas",
  "orange", "oranges",
  "strawberry", "strawberries",
  "peach", "peaches",
  "pear", "pears",
];

// Macro data for countable foods (per unit)
export const COUNTABLE_FOOD_MACROS: Record<string, {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}> = {
  egg: { calories: 70, protein: 6, carbs: 0.4, fat: 5 },
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  "bread slice": { calories: 79, protein: 2.7, carbs: 14, fat: 1 },
};

// Macro data for sized fruits
export const SIZED_FRUIT_MACROS: Record<string, {
  small: { calories: number; protein: number; carbs: number; fat: number };
  medium: { calories: number; protein: number; carbs: number; fat: number };
  large: { calories: number; protein: number; carbs: number; fat: number };
}> = {
  apple: {
    small: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2 },
    medium: { calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
    large: { calories: 116, protein: 0.6, carbs: 31, fat: 0.4 },
  },
  banana: {
    small: { calories: 90, protein: 1.1, carbs: 23, fat: 0.3 },
    medium: { calories: 105, protein: 1.3, carbs: 27, fat: 0.3 },
    large: { calories: 121, protein: 1.5, carbs: 31, fat: 0.4 },
  },
  orange: {
    small: { calories: 47, protein: 0.7, carbs: 12, fat: 0.3 },
    medium: { calories: 62, protein: 1.2, carbs: 16, fat: 0.3 },
    large: { calories: 86, protein: 1.7, carbs: 22, fat: 0.5 },
  },
  strawberry: {
    small: { calories: 4, protein: 0.1, carbs: 1, fat: 0 },
    medium: { calories: 5, protein: 0.1, carbs: 1.2, fat: 0 },
    large: { calories: 6, protein: 0.1, carbs: 1.5, fat: 0 },
  },
};

export function detectFoodVariant(foodName: string): "quantity" | "size" | null {
  const lowerName = foodName.toLowerCase();

  // Check for countable foods
  for (const food of COUNTABLE_FOODS) {
    if (lowerName.includes(food)) {
      return "quantity";
    }
  }

  // Check for sized fruits
  for (const fruit of SIZED_FRUITS) {
    if (lowerName.includes(fruit)) {
      return "size";
    }
  }

  return null;
}

export function getCountableFoodKey(foodName: string): string | null {
  const lowerName = foodName.toLowerCase();

  for (const key of Object.keys(COUNTABLE_FOOD_MACROS)) {
    if (lowerName.includes(key)) {
      return key;
    }
  }

  return null;
}

export function getSizedFruitKey(foodName: string): string | null {
  const lowerName = foodName.toLowerCase();

  for (const key of Object.keys(SIZED_FRUIT_MACROS)) {
    if (lowerName.includes(key)) {
      return key;
    }
  }

  return null;
}
