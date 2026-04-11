/**
 * Fitness goal calorie and macro calculations
 */

/**
 * Calculate TDEE (Total Daily Energy Expenditure) using Mifflin-St Jeor formula
 * Assumes moderate activity level (1.55 multiplier)
 */
function calculateTDEE(weightKg, heightCm, ageYears, isMale = true) {
  // Mifflin-St Jeor BMR formula
  let bmr;
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
function calculateMacroTargets(tdee, weightKg, goal) {
  let dailyCalories;
  let proteinMultiplier;
  let fatMultiplier;

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

// Test
const tdee = calculateTDEE(85, 180, 30, true);
console.log(`TDEE: ${tdee} calories/day`);

const macros = calculateMacroTargets(tdee, 85, "lose_fat");
console.log(`Daily targets for lose_fat:`);
console.log(`  Calories: ${macros.dailyCalories}`);
console.log(`  Protein: ${macros.dailyProtein}g`);
console.log(`  Carbs: ${macros.dailyCarbs}g`);
console.log(`  Fat: ${macros.dailyFat}g`);

const macrosBuild = calculateMacroTargets(tdee, 85, "build_muscle");
console.log(`Daily targets for build_muscle:`);
console.log(`  Calories: ${macrosBuild.dailyCalories}`);
console.log(`  Protein: ${macrosBuild.dailyProtein}g`);
console.log(`  Carbs: ${macrosBuild.dailyCarbs}g`);
console.log(`  Fat: ${macrosBuild.dailyFat}g`);
