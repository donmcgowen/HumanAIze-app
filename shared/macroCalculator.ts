/**
 * Macro Calculator - Calculates optimal protein/carbs/fat ratios
 * based on fitness goal, body composition, and activity level
 */

export type FitnessGoal = "lose_fat" | "build_muscle" | "maintain";
export type ActivityLevel = "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extremely_active";

export interface MacroCalculatorInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  fitnessGoal: FitnessGoal;
  activityLevel: ActivityLevel;
  goalWeightKg?: number;
  targetDateMs?: number;
}

export interface MacroSuggestion {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  proteinPercentage: number;
  carbsPercentage: number;
  fatPercentage: number;
}

/**
 * Get activity multiplier based on activity level
 */
function getActivityMultiplier(activityLevel: ActivityLevel): number {
  const multipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,           // Little or no exercise
    lightly_active: 1.375,    // Light exercise 1-3 days/week
    moderately_active: 1.55,  // Moderate exercise 3-5 days/week
    very_active: 1.725,       // Hard exercise 6-7 days/week
    extremely_active: 1.9,    // Very hard exercise, physical job
  };
  return multipliers[activityLevel];
}

/**
 * Calculate BMR using Mifflin-St Jeor formula
 */
function calculateBMR(weightKg: number, heightCm: number, ageYears: number, isMale: boolean = true): number {
  // Mifflin-St Jeor formula
  // For men: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5
  // For women: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return isMale ? base + 5 : base - 161;
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 */
function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const multiplier = getActivityMultiplier(activityLevel);
  return Math.round(bmr * multiplier);
}

/**
 * Calculate daily calorie deficit needed to reach goal weight by target date
 * Returns the adjusted daily calories for the goal
 */
function calculateGoalAdjustedCalories(
  currentWeightKg: number,
  goalWeightKg: number,
  targetDateMs: number,
  tdee: number
): number {
  const now = Date.now();
  
  // If goal date is in the past, use standard 20% deficit
  if (targetDateMs <= now) {
    return Math.round(tdee * 0.8);
  }

  // Calculate weight to lose (in kg)
  const weightToLose = currentWeightKg - goalWeightKg;
  
  // If already at goal or above, use standard deficit
  if (weightToLose <= 0) {
    return Math.round(tdee * 0.8);
  }

  // Calculate days to goal
  const daysToGoal = Math.max(1, (targetDateMs - now) / (24 * 60 * 60 * 1000));
  
  // Calculate daily calorie deficit needed
  // 1 kg of fat = 7700 calories
  // Daily deficit = (total calories to lose) / days
  const totalCaloriesToLose = weightToLose * 7700;
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
 * Calculate macro recommendations based on fitness goal
 */
export function calculateMacros(input: MacroCalculatorInput): MacroSuggestion {
  const { weightKg, heightCm, ageYears, fitnessGoal, activityLevel, goalWeightKg, targetDateMs } = input;

  // Calculate BMR and TDEE
  const bmr = calculateBMR(weightKg, heightCm, ageYears);
  const tdee = calculateTDEE(bmr, activityLevel);

  // Adjust calories based on fitness goal
  let dailyCalories: number;
  let proteinMultiplier: number;
  let carbsPercentage: number;
  let fatPercentage: number;

  switch (fitnessGoal) {
    case "lose_fat":
      // If goal weight and date are provided, calculate adjusted calories
      if (goalWeightKg && targetDateMs) {
        dailyCalories = calculateGoalAdjustedCalories(weightKg, goalWeightKg, targetDateMs, tdee);
      } else {
        // Fallback to standard 20% deficit
        dailyCalories = Math.round(tdee * 0.8);
      }
      proteinMultiplier = 2.2; // Higher protein to preserve muscle
      carbsPercentage = 0.35;
      fatPercentage = 0.25;
      break;

    case "build_muscle":
      // 10-15% caloric surplus
      dailyCalories = Math.round(tdee * 1.1);
      proteinMultiplier = 2.0; // High protein for muscle synthesis
      carbsPercentage = 0.45;
      fatPercentage = 0.25;
      break;

    case "maintain":
    default:
      // Maintenance calories
      dailyCalories = tdee;
      proteinMultiplier = 1.6; // Moderate protein
      carbsPercentage = 0.45;
      fatPercentage = 0.25;
      break;
  }

  // Calculate protein (in grams)
  // Protein: 4 calories per gram
  const proteinCalories = dailyCalories * 0.25; // Start with 25% for all goals
  let dailyProtein = Math.round((proteinCalories / 4) * (proteinMultiplier / 1.6)); // Scale based on multiplier

  // Ensure protein is within reasonable bounds
  const minProtein = Math.round(weightKg * 1.6);
  const maxProtein = Math.round(weightKg * 2.4);
  dailyProtein = Math.max(minProtein, Math.min(maxProtein, dailyProtein));

  // Calculate fat (in grams)
  // Fat: 9 calories per gram
  const fatCalories = dailyCalories * fatPercentage;
  const dailyFat = Math.round(fatCalories / 9);

  // Calculate carbs (in grams) - fill remaining calories
  // Carbs: 4 calories per gram
  const carbCalories = dailyCalories - dailyProtein * 4 - dailyFat * 9;
  const dailyCarbs = Math.max(0, Math.round(carbCalories / 4));

  // Calculate actual percentages
  const actualProteinPercentage = Math.round((dailyProtein * 4 / dailyCalories) * 100);
  const actualCarbsPercentage = Math.round((dailyCarbs * 4 / dailyCalories) * 100);
  const actualFatPercentage = Math.round((dailyFat * 9 / dailyCalories) * 100);

  return {
    dailyCalories,
    dailyProtein,
    dailyCarbs,
    dailyFat,
    proteinPercentage: actualProteinPercentage,
    carbsPercentage: actualCarbsPercentage,
    fatPercentage: actualFatPercentage,
  };
}

/**
 * Get activity level label for display
 */
export function getActivityLevelLabel(level: ActivityLevel): string {
  const labels: Record<ActivityLevel, string> = {
    sedentary: "Sedentary (little or no exercise)",
    lightly_active: "Lightly Active (1-3 days/week)",
    moderately_active: "Moderately Active (3-5 days/week)",
    very_active: "Very Active (6-7 days/week)",
    extremely_active: "Extremely Active (physical job)",
  };
  return labels[level];
}

/**
 * Get fitness goal label for display
 */
export function getFitnessGoalLabel(goal: FitnessGoal): string {
  const labels: Record<FitnessGoal, string> = {
    lose_fat: "Lose Fat",
    build_muscle: "Build Muscle",
    maintain: "Maintain",
  };
  return labels[goal];
}
