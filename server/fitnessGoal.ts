/**
 * Fitness goal calorie and macro calculations
 * Uses Mifflin-St Jeor formula for TDEE calculation
 * Adjusts macros based on weight loss goal and timeline
 */

export type FitnessGoal = "lose_fat" | "build_muscle" | "maintain";

export interface MacroTargets {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
}

/**
 * Convert lbs to kg
 */
function lbsToKg(lbs: number): number {
  return lbs * 0.453592;
}

/**
 * Convert kg to lbs
 */
function kgToLbs(kg: number): number {
  return kg / 0.453592;
}

/**
 * Convert inches to cm
 */
function inchesToCm(inches: number): number {
  return inches * 2.54;
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
 * Calculate daily calorie deficit needed to reach goal weight by target date
 * Returns the adjusted daily calories for the goal
 */
export function calculateGoalAdjustedCalories(
  currentWeightLbs: number,
  goalWeightLbs: number,
  targetDateMs: number,
  tdee: number
): number {
  const now = Date.now();
  
  // If goal date is in the past, use standard 20% deficit
  if (targetDateMs <= now) {
    return Math.round(tdee * 0.8);
  }

  // Calculate weight to lose (in lbs)
  const weightToLose = currentWeightLbs - goalWeightLbs;
  
  // If already at goal or above, use standard deficit
  if (weightToLose <= 0) {
    return Math.round(tdee * 0.8);
  }

  // Calculate days to goal
  const daysToGoal = Math.max(1, (targetDateMs - now) / (24 * 60 * 60 * 1000));
  
  // Calculate daily calorie deficit needed
  // 1 lb of fat = 3500 calories
  // Daily deficit = (total calories to lose) / days
  const totalCaloriesToLose = weightToLose * 3500;
  const dailyDeficitNeeded = totalCaloriesToLose / daysToGoal;
  
  // Calculate adjusted daily calories
  const adjustedDailyCalories = tdee - dailyDeficitNeeded;
  
  // Cap the deficit at 1000 calories per day (max safe deficit)
  // and minimum of 1200 calories per day
  const minCalories = 1200;
  const maxDailyDeficit = 1000;
  const minDailyCalories = Math.max(minCalories, tdee - maxDailyDeficit);
  
  return Math.round(Math.max(minDailyCalories, adjustedDailyCalories));
}

/**
 * Calculate daily macro targets based on fitness goal
 * For fat loss, adjusts based on goal weight and timeline
 */
export function calculateMacroTargets(
  tdee: number,
  weightKg: number,
  goal: FitnessGoal,
  currentWeightLbs?: number,
  goalWeightLbs?: number,
  targetDateMs?: number
): MacroTargets {
  let dailyCalories: number;
  let proteinMultiplier: number;
  let fatMultiplier: number;

  if (goal === "lose_fat") {
    // If goal weight and date are provided, calculate adjusted calories
    if (currentWeightLbs && goalWeightLbs && targetDateMs) {
      dailyCalories = calculateGoalAdjustedCalories(
        currentWeightLbs,
        goalWeightLbs,
        targetDateMs,
        tdee
      );
    } else {
      // Fallback to standard 20% deficit
      dailyCalories = Math.round(tdee * 0.8);
    }
    
    // High protein: 1.8-2.2g per kg (preserve muscle during fat loss)
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
  const weeksToGoal = Math.max(
    1,
    Math.round((goalDateMs - now) / (7 * 24 * 60 * 60 * 1000))
  );
  const weeklyWeightChange = totalWeightChange / weeksToGoal;

  return {
    totalWeightChange,
    weeksToGoal,
    weeklyWeightChange,
  };
}
