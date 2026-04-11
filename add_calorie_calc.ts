/**
 * Fitness goal calorie and macro calculations
 */

interface ProfileData {
  heightCm: number;
  weightKg: number;
  ageYears: number;
  fitnessGoal: "lose_fat" | "build_muscle" | "maintain";
  goalWeightKg?: number;
  goalDate?: number;
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure) using Mifflin-St Jeor formula
 * Assumes moderate activity level (1.55 multiplier)
 */
export function calculateTDEE(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  isMale: boolean = true
): number {
  // Mifflin-St Jeor BMR formula
  let bmr: number;
  if (isMale) {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
  }

  // Apply activity multiplier (moderate activity: 1.55)
  const tdee = Math.round(bmr * 1.55);
  return tdee;
}

/**
 * Calculate daily macro targets based on fitness goal
 */
export function calculateMacroTargets(
  tdee: number,
  weightKg: number,
  goal: "lose_fat" | "build_muscle" | "maintain"
): {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
} {
  let dailyCalories: number;
  let proteinMultiplier: number;
  let fatMultiplier: number;

  if (goal === "lose_fat") {
    // 20% calorie deficit for fat loss
    dailyCalories = Math.round(tdee * 0.8);
    // High protein: 1.8-2.2g per kg
    proteinMultiplier = 2.0;
    // Lower fat: 0.8-1.0g per kg
    fatMultiplier = 0.9;
  } else if (goal === "build_muscle") {
    // 10% calorie surplus for muscle building
    dailyCalories = Math.round(tdee * 1.1);
    // High protein: 1.8-2.2g per kg
    proteinMultiplier = 2.0;
    // Moderate fat: 1.0-1.2g per kg
    fatMultiplier = 1.1;
  } else {
    // Maintain: no deficit or surplus
    dailyCalories = tdee;
    // Moderate protein: 1.6-1.8g per kg
    proteinMultiplier = 1.7;
    // Moderate fat: 0.9-1.1g per kg
    fatMultiplier = 1.0;
  }

  const dailyProtein = Math.round(weightKg * proteinMultiplier);
  const dailyFat = Math.round(weightKg * fatMultiplier);
  // Carbs fill the rest: (calories - protein*4 - fat*9) / 4
  const dailyCarbs = Math.round(
    (dailyCalories - dailyProtein * 4 - dailyFat * 9) / 4
  );

  return {
    dailyCalories,
    dailyProtein,
    dailyCarbs,
    dailyFat,
  };
}

/**
 * Calculate weekly weight change needed to reach goal
 */
export function calculateWeeklyWeightChange(
  currentWeightKg: number,
  goalWeightKg: number,
  goalDateMs: number
): {
  totalWeightChange: number;
  weeksToGoal: number;
  weeklyWeightChange: number;
} {
  const totalWeightChange = goalWeightKg - currentWeightKg;
  const now = Date.now();
  const weeksToGoal = Math.max(1, Math.round((goalDateMs - now) / (7 * 24 * 60 * 60 * 1000)));
  const weeklyWeightChange = totalWeightChange / weeksToGoal;

  return {
    totalWeightChange,
    weeksToGoal,
    weeklyWeightChange,
  };
}

// Test
const profile: ProfileData = {
  heightCm: 180,
  weightKg: 85,
  ageYears: 30,
  fitnessGoal: "lose_fat",
};

const tdee = calculateTDEE(profile.weightKg, profile.heightCm, profile.ageYears);
console.log(`TDEE: ${tdee} calories/day`);

const macros = calculateMacroTargets(tdee, profile.weightKg, profile.fitnessGoal);
console.log(`Daily targets for ${profile.fitnessGoal}:`);
console.log(`  Calories: ${macros.dailyCalories}`);
console.log(`  Protein: ${macros.dailyProtein}g`);
console.log(`  Carbs: ${macros.dailyCarbs}g`);
console.log(`  Fat: ${macros.dailyFat}g`);
