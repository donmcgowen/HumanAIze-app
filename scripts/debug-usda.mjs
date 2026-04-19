// Debug script: fetch Muscle Milk Pro from USDA and print raw serving size fields
const USDA_API_KEY = process.env.USDA_API_KEY || "DEMO_KEY";
const USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1";

const res = await fetch(`${USDA_API_BASE}/foods/search?api_key=${USDA_API_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "Muscle Milk Pro Series Protein Powder",
    dataType: ["Branded"],
    pageSize: 3,
    pageNumber: 1,
    sortBy: "score",
    sortOrder: "desc",
  }),
});

const data = await res.json();
if (!data.foods) {
  console.log("No foods returned:", JSON.stringify(data, null, 2));
  process.exit(1);
}

for (const food of data.foods.slice(0, 3)) {
  console.log("\n=== FOOD ===");
  console.log("description:", food.description);
  console.log("dataType:", food.dataType);
  console.log("servingSize:", food.servingSize);
  console.log("servingSizeUnit:", food.servingSizeUnit);
  console.log("householdServingFullText:", food.householdServingFullText);
  console.log("brandOwner:", food.brandOwner);
  
  const nutrients = food.foodNutrients || [];
  const cal = nutrients.find(n => n.nutrientId === 1008);
  const prot = nutrients.find(n => n.nutrientId === 1003);
  const carb = nutrients.find(n => n.nutrientId === 1005);
  const fat = nutrients.find(n => n.nutrientId === 1004);
  
  console.log("RAW calories:", cal?.value, "per", food.servingSize, food.servingSizeUnit);
  console.log("RAW protein:", prot?.value);
  console.log("RAW carbs:", carb?.value);
  console.log("RAW fat:", fat?.value);
  
  // Simulate normalization
  const sz = parseFloat(food.servingSize);
  const unit = (food.servingSizeUnit || "g").toLowerCase();
  let servingWeightG = 100;
  if (!isNaN(sz) && sz > 0 && (unit === "g" || unit === "ml")) {
    servingWeightG = sz;
  }
  const normFactor = 100 / servingWeightG;
  console.log("servingWeightG:", servingWeightG, "normFactor:", normFactor);
  console.log("NORMALIZED calories/100g:", Math.round((cal?.value || 0) * normFactor));
  console.log("NORMALIZED protein/100g:", Math.round((prot?.value || 0) * normFactor * 10) / 10);
}
