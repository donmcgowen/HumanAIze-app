// Test BMI calculations
function calculateBMI(weight, height, weightUnit, heightUnit) {
  let calculatedBmi;
  
  if (heightUnit === "in" && weightUnit === "lbs") {
    // Imperial formula: BMI = (weight_lbs / (height_inches²)) × 703
    calculatedBmi = (weight / (height * height)) * 703;
  } else if (heightUnit === "cm" && weightUnit === "kg") {
    // Metric formula: BMI = weight_kg / (height_m²)
    const heightM = height / 100;
    calculatedBmi = weight / (heightM * heightM);
  } else {
    // Mixed units - convert to metric first
    let heightCm = heightUnit === "in" ? height * 2.54 : height;
    let weightKg = weightUnit === "lbs" ? weight / 2.20462 : weight;
    const heightM = heightCm / 100;
    calculatedBmi = weightKg / (heightM * heightM);
  }
  
  return Math.round(calculatedBmi * 10) / 10;
}

// Test cases
console.log("Test 1: 200 lbs, 72 inches (imperial)");
const bmi1 = calculateBMI(200, 72, "lbs", "in");
console.log(`BMI = ${bmi1} (expected ~27.1)`);
console.log(`Category: ${bmi1 < 18.5 ? "Underweight" : bmi1 < 25 ? "Normal" : bmi1 < 30 ? "Overweight" : "Obese"}`);

console.log("\nTest 2: 90 kg, 180 cm (metric)");
const bmi2 = calculateBMI(90, 180, "kg", "cm");
console.log(`BMI = ${bmi2} (expected ~27.8)`);
console.log(`Category: ${bmi2 < 18.5 ? "Underweight" : bmi2 < 25 ? "Normal" : bmi2 < 30 ? "Overweight" : "Obese"}`);

console.log("\nTest 3: 70 kg, 72 inches (mixed)");
const bmi3 = calculateBMI(70, 72, "kg", "in");
console.log(`BMI = ${bmi3} (expected ~9.5)`);

console.log("\nTest 4: 154 lbs, 180 cm (mixed)");
const bmi4 = calculateBMI(154, 180, "lbs", "cm");
console.log(`BMI = ${bmi4} (expected ~23.8)`);
