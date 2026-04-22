import { useState, useEffect, useId, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, FileText, Barcode, Loader2, AlertCircle, Clock, Camera, Trash2, CheckCircle, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { skipToken } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFoodAdded: (food: {
    foodName: string;
    servingSize: string;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    sugarGrams?: number;
  }) => void;
  mealType: "breakfast" | "lunch" | "dinner" | "snack" | "other";
}

export function AddFoodModal({ isOpen, onClose, onFoodAdded, mealType }: AddFoodModalProps) {
  const [activeTab, setActiveTab] = useState<"search" | "manual" | "scan" | "favorites">("search");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Food to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}</DialogTitle>
          <DialogDescription>Choose how you want to add food to your meal</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Manual</span>
            </TabsTrigger>
            <TabsTrigger value="scan" className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">AI Scan</span>
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Favorites</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4 mt-4">
            <SearchFoodTab onFoodAdded={onFoodAdded} onClose={onClose} />
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <ManualEntryTab onFoodAdded={onFoodAdded} onClose={onClose} />
          </TabsContent>

          <TabsContent value="scan" className="space-y-4 mt-4">
            <GeminiScanTab onFoodAdded={onFoodAdded} onClose={onClose} mealType={mealType} />
          </TabsContent>

          <TabsContent value="favorites" className="space-y-4 mt-4">
            <FavoritesTab onFoodAdded={onFoodAdded} onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface SearchFoodTabProps {
  onFoodAdded: (food: any) => void;
  onClose: () => void;
  mealType?: string;
}

function parseServingSizeForInput(servingSize?: string): { amount: string; unit: string } | null {
  if (!servingSize) return null;
  const match = servingSize.trim().match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|oz|ounce|ounces|ml|scoop|scoops|cup|cups|tbsp|tsp|slice|slices|piece|pieces|egg|eggs|serving|servings|fl\s*oz)\b/i);
  if (!match) return null;

  const amount = match[1];
  const rawUnit = match[2].toLowerCase().replace(/s$/, "").replace(/fl\s*oz/, "fl oz");
  const unitMap: Record<string, string> = {
    gram: "g", grams: "g", ounce: "oz", ounces: "oz",
    scoop: "scoop", scoops: "scoop", cup: "cup", cups: "cup",
    slice: "slice", slices: "slice", piece: "piece", pieces: "piece",
    egg: "egg", eggs: "egg", serving: "serving", servings: "serving",
  };
  const unit = unitMap[rawUnit] ?? rawUnit;
  return { amount, unit };
}

// Returns context-aware unit options based on food name/description
function getSmartUnits(foodName: string, description?: string): { value: string; label: string }[] {
  const text = `${foodName} ${description ?? ""}`.toLowerCase();

  // Powder / supplement category — catches "Muscle Milk Pro Series Protein Powder", "Whey Protein", etc.
  const isPowder = /powder|whey|creatine|pre.?workout|bcaa|amino|mass\s*gainer|meal\s*replacement|shake\s*mix|protein\s*(powder|supplement|shake|blend|isolate|concentrate)|supplement\s*facts/.test(text);
  if (isPowder) return [
    { value: "scoop", label: "Scoop" },
    { value: "g", label: "Grams (g)" },
    { value: "oz", label: "Ounces (oz)" },
  ];

  // Liquid / beverage category
  const isLiquid = /milk|juice|water|soda|coffee|tea|smoothie|shake|drink|beverage|broth|soup|oil|sauce|syrup|cream|yogurt\s*drink|kefir|almond\s*milk|oat\s*milk|coconut\s*milk/.test(text);
  if (isLiquid) return [
    { value: "cup", label: "Cup" },
    { value: "fl oz", label: "Fl oz" },
    { value: "ml", label: "Milliliters (ml)" },
    { value: "tbsp", label: "Tablespoon (tbsp)" },
    { value: "tsp", label: "Teaspoon (tsp)" },
    { value: "g", label: "Grams (g)" },
  ];

  // Eggs
  const isEgg = /\begg\b/.test(text);
  if (isEgg) return [
    { value: "egg", label: "Egg (whole)" },
    { value: "g", label: "Grams (g)" },
    { value: "oz", label: "Ounces (oz)" },
  ];

  // Bread / baked goods
  const isBread = /bread|toast|tortilla|wrap|bagel|muffin|bun|roll|pita|naan|croissant/.test(text);
  if (isBread) return [
    { value: "slice", label: "Slice" },
    { value: "piece", label: "Piece" },
    { value: "g", label: "Grams (g)" },
    { value: "oz", label: "Ounces (oz)" },
  ];

  // Meat / fish / poultry — no scoops
  const isMeat = /chicken|beef|steak|pork|turkey|salmon|tuna|tilapia|shrimp|fish|lamb|bison|venison|ground\s*(beef|turkey|chicken)|breast|thigh|fillet/.test(text);
  if (isMeat) return [
    { value: "oz", label: "Ounces (oz)" },
    { value: "g", label: "Grams (g)" },
  ];

  // Condiments / spreads
  const isCondiment = /butter|peanut\s*butter|almond\s*butter|mayo|mustard|ketchup|dressing|hummus|guacamole|jam|jelly|honey|nutella|cream\s*cheese|spread/.test(text);
  if (isCondiment) return [
    { value: "tbsp", label: "Tablespoon (tbsp)" },
    { value: "tsp", label: "Teaspoon (tsp)" },
    { value: "g", label: "Grams (g)" },
    { value: "oz", label: "Ounces (oz)" },
  ];

  // Default: grams + oz
  return [
    { value: "g", label: "Grams (g)" },
    { value: "oz", label: "Ounces (oz)" },
    { value: "serving", label: "Serving" },
  ];
}

// Parse gram weight of ONE UNIT from a serving size string.
// Handles multi-unit strings like "106g (2 scoops)" → 53g per scoop.
function parseServingWeightG(servingSize?: string): number | undefined {
  if (!servingSize) return undefined;

  // Check for "Xg (N scoops/servings/cups/etc)" pattern — divide by N to get per-unit weight
  // e.g. "106g (2 scoops)" → 106 / 2 = 53g per scoop
  const multiUnitMatch = servingSize.match(/^(\d+(?:\.\d+)?)\s*g\s*\((\d+(?:\.\d+)?)\s+\w/i);
  if (multiUnitMatch) {
    const totalG = parseFloat(multiUnitMatch[1]);
    const count = parseFloat(multiUnitMatch[2]);
    if (count > 1 && count <= 10 && totalG > 0) {
      return totalG / count;
    }
    return totalG;
  }

  // Try to find explicit gram value in parentheses: "2 scoops (82g)" → 82
  const parenMatch = servingSize.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (parenMatch) return parseFloat(parenMatch[1]);

  // Direct gram value: "53g" → 53
  const gMatch = servingSize.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (gMatch) return parseFloat(gMatch[1]);

  // Oz value: "1.87oz" → convert to grams
  const ozMatch = servingSize.match(/^(\d+(?:\.\d+)?)\s*oz$/i);
  if (ozMatch) return parseFloat(ozMatch[1]) * 28.35;

  return undefined;
}

// Generic food terms that are NOT brand names
const GENERIC_FOOD_TERMS = new Set(["chicken","beef","pork","fish","rice","pasta","bread","milk","egg","eggs","cheese","butter","oil","sugar","flour","oats","banana","apple","orange","broccoli","spinach","carrot","potato","tomato","onion","garlic","salmon","tuna","turkey","shrimp","yogurt","cream","coffee","tea","juice","water","soda","beer","wine","nuts","almonds","peanuts","walnuts","chocolate","vanilla","strawberry","blueberry","mango","granola","cereal","soup","salad","sandwich","pizza","burger","fries","steak","bacon","sausage","ham","tofu","tempeh","lentils","beans","avocado","hummus","protein","whey","creatine"]);

function isGenericQuery(query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/);
  // A query is generic if ALL words are generic food terms (no brand word)
  return words.every(w => GENERIC_FOOD_TERMS.has(w));
}

function SearchFoodTab({ onFoodAdded, onClose, mealType = "meal" }: SearchFoodTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState<any>(null);
  const [servingAmount, setServingAmount] = useState("100");
  const [servingUnit, setServingUnit] = useState<string>("g");
  const [servingWeightG, setServingWeightG] = useState<number | undefined>(undefined);

  // Debounce for main search: 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setBrandFilter(null); // reset brand filter on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Debounce for autocomplete: 250ms, triggers after first word
  useEffect(() => {
    const words = searchQuery.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 1 && searchQuery.trim().length >= 2) {
      const timer = setTimeout(() => setAutocompleteQuery(searchQuery.trim()), 250);
      return () => clearTimeout(timer);
    } else {
      setAutocompleteQuery("");
      setShowAutocomplete(false);
    }
  }, [searchQuery]);

  // Fetch recently logged foods for quick re-use
  const { data: recentFoodLogs } = trpc.food.getRecent.useQuery({ limit: 10 });

  // Deduplicate recent foods by name (keep most recent entry per food name)
  const recentFoods = recentFoodLogs
    ? Array.from(
        new Map(
          recentFoodLogs.map((f: any) => [f.foodName.toLowerCase(), f])
        ).values()
      ).slice(0, 8)
    : [];

  // Effective query: if brand filter applied, prepend brand to query
  const effectiveQuery = brandFilter ? `${brandFilter} ${debouncedQuery}` : debouncedQuery;

  const { data: foodVariations, isLoading, error } = trpc.food.searchWithAI.useQuery(
    { query: effectiveQuery },
    { enabled: effectiveQuery.trim().length > 2, retry: 1 }
  );

  // Autocomplete suggestions (fast, lightweight)
  const { data: autocompleteSuggestions } = trpc.food.autocomplete.useQuery(
    { query: autocompleteQuery },
    { enabled: autocompleteQuery.length >= 2 && showAutocomplete }
  );

  // Search through all previously logged foods by query
  const { data: historyMatches } = trpc.food.searchHistory.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.trim().length > 2 }
  );

  // Auto-resolve: if history has an exact match for the query, auto-select it
  useEffect(() => {
    if (!historyMatches || historyMatches.length === 0 || selectedFood) return;
    const queryLower = debouncedQuery.trim().toLowerCase();
    const exactMatch = historyMatches.find((h: any) => h.foodName.toLowerCase() === queryLower);
    if (exactMatch) {
      handleSelectRecentFood(exactMatch);
    }
  }, [historyMatches, debouncedQuery]);

  // Determine if this is a generic query (needs brand clarification)
  const showBrandClarification = !brandFilter && !isLoading && foodVariations && foodVariations.length > 0 && isGenericQuery(debouncedQuery);

  // Extract unique brands from results for the clarification chips
  const brandChips: string[] = showBrandClarification
    ? Array.from(new Set(
        (foodVariations || []).map((f: any) => {
          const desc = f.description || "";
          // Brand is usually the first part of description before " - "
          return desc.split(" - ")[0].trim() || f.name.split(" ")[0];
        }).filter((b: string) => b.length > 1)
      )).slice(0, 6) as string[]
    : [];

  // When searching, mark which results match recent foods
  const recentFoodNames = new Set(recentFoods.map((f: any) => f.foodName.toLowerCase()));

  const parsedAmount = parseFloat(servingAmount);
  const { data: calculatedMacros } = trpc.food.calculateServingMacros.useQuery(
    selectedFood && !selectedFood.isRecentLog && servingAmount && parsedAmount > 0
      ? {
          foodName: selectedFood.name,
          caloriesPer100g: selectedFood.caloriesPer100g ?? 0,
          proteinPer100g: selectedFood.proteinPer100g ?? 0,
          carbsPer100g: selectedFood.carbsPer100g ?? 0,
          fatPer100g: selectedFood.fatPer100g ?? 0,
          amount: parsedAmount,
          unit: servingUnit,
          servingWeightG: servingWeightG,
        }
      : skipToken,
    { enabled: !!selectedFood && !selectedFood.isRecentLog && !!servingAmount && parsedAmount > 0 }
  );

  const handleSelectFood = (food: any) => {
    setSelectedFood(food);

    // Determine smart unit list based on food name/description
    const smartUnits = getSmartUnits(food?.name ?? "", food?.description ?? "");
    const defaultUnit = smartUnits[0]?.value ?? "g";

    // Prefer the server-provided servingWeightPerUnit (already per-unit, e.g. 53g per scoop).
    // Fall back to parsing the servingSize string ourselves.
    let weightG: number | undefined = food?.servingWeightPerUnit;
    if (!weightG) {
      weightG = parseServingWeightG(food?.servingSize);
    }
    setServingWeightG(weightG);

    // Try to parse the serving size string to get a human-friendly default amount/unit
    const parsedServing = parseServingSizeForInput(food?.servingSize);
    if (parsedServing) {
      // If the food is a powder/supplement and the parsed unit is grams,
      // override to scoops (using the per-unit gram weight)
      if (defaultUnit === "scoop" && parsedServing.unit === "g") {
        setServingAmount("1");
        setServingUnit("scoop");
        // servingWeightG is already set to the per-scoop weight above
        return;
      }
      setServingAmount(parsedServing.amount);
      setServingUnit(parsedServing.unit);
      return;
    }

    // Fall back to smart unit detection based on food name/description
    const defaultAmounts: Record<string, string> = {
      scoop: "1", cup: "1", egg: "1", slice: "1", piece: "1",
      tbsp: "1", tsp: "1", serving: "1", "fl oz": "8", ml: "240",
      oz: "3", g: "100",
    };
    setServingAmount(defaultAmounts[defaultUnit] ?? "100");
    setServingUnit(defaultUnit);
  };

  const handleSelectRecentFood = (log: any) => {
    setSelectedFood({
      name: log.foodName,
      description: `Recently logged • ${log.servingSize || "1 serving"}`,
      caloriesPer100g: log.calories,
      proteinPer100g: log.proteinGrams,
      carbsPer100g: log.carbsGrams,
      fatPer100g: log.fatGrams,
      servingSize: log.servingSize || "100g",
      isRecentLog: true,
      originalCalories: log.calories,
      originalProtein: log.proteinGrams,
      originalCarbs: log.carbsGrams,
      originalFat: log.fatGrams,
      originalServingSize: log.servingSize,
    });
  };

  const handleAddFood = () => {
    if (!selectedFood) return;
    // For recently logged foods, use the original macros directly (same serving as last time)
    if (selectedFood.isRecentLog) {
      onFoodAdded({
        foodName: selectedFood.name,
        servingSize: selectedFood.originalServingSize || "1 serving",
        calories: Math.round(selectedFood.originalCalories),
        proteinGrams: Math.round(selectedFood.originalProtein * 10) / 10,
        carbsGrams: Math.round(selectedFood.originalCarbs * 10) / 10,
        fatGrams: Math.round(selectedFood.originalFat * 10) / 10,
      });
      onClose();
      return;
    }
    if (calculatedMacros) {
      // Build a human-readable serving size label
      let servingSizeLabel = `${servingAmount} ${servingUnit}`;
      if ((servingUnit === "scoop" || servingUnit === "serving") && servingWeightG) {
        servingSizeLabel = `${servingAmount} ${servingUnit} (${Math.round(parseFloat(servingAmount) * servingWeightG)}g)`;
      }
      onFoodAdded({
        foodName: selectedFood.name,
        servingSize: servingSizeLabel,
        calories: calculatedMacros.calories,
        proteinGrams: calculatedMacros.protein,
        carbsGrams: calculatedMacros.carbs,
        fatGrams: calculatedMacros.fat,
      });
      onClose();
    }
  };

  return (
    <div className="space-y-4">
      {/* Search input with autocomplete */}
      <div className="space-y-2">
        <Label htmlFor="search-food">Search Foods</Label>
        <div className="relative">
          <Input
            id="search-food"
            placeholder="e.g., Oberweis chocolate milk, Premier Protein..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedFood(null);
              setShowAutocomplete(true);
            }}
            onFocus={() => setShowAutocomplete(true)}
            onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
            className="w-full"
            autoFocus
          />
          {/* Autocomplete dropdown */}
          {showAutocomplete && autocompleteSuggestions && autocompleteSuggestions.length > 0 && !selectedFood && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-lg overflow-hidden">
              {autocompleteSuggestions.map((s: any, i: number) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 flex justify-between items-center border-b border-gray-800 last:border-0"
                  onMouseDown={() => {
                    setSearchQuery(s.name);
                    setShowAutocomplete(false);
                  }}
                >
                  <span className="font-medium truncate">{s.name}</span>
                  {s.calories > 0 && (
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{Math.round(s.calories)} cal/100g</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {debouncedQuery.trim().length <= 2
            ? "Type a food or brand name — results update as you type"
            : isLoading
              ? "Searching with Gemini AI..."
              : brandFilter
                ? `Showing ${brandFilter} results`
                : "Search any food, brand, or supplement"}
        </p>
      </div>

      {/* Brand clarification prompt for generic queries */}
      {showBrandClarification && brandChips.length > 0 && !selectedFood && (
        <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg space-y-2">
          <p className="text-xs text-cyan-300 font-medium">Which brand are you looking for?</p>
          <div className="flex flex-wrap gap-1.5">
            {brandChips.map((brand, i) => (
              <button
                key={i}
                onClick={() => setBrandFilter(brand)}
                className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-cyan-600 border border-gray-600 hover:border-cyan-500 rounded-full transition-colors"
              >
                {brand}
              </button>
            ))}
            <button
              onClick={() => setBrandFilter("skip")}
              className="px-2.5 py-1 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-full transition-colors"
            >
              Show all
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin mr-2 text-cyan-400" />
          <span className="text-sm text-gray-400">Finding foods...</span>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">Search failed. Try a different query or use Manual entry.</span>
        </div>
      )}

      {/* No results */}
      {!isLoading && !error && debouncedQuery.trim().length > 2 && foodVariations && foodVariations.length === 0 && !selectedFood && (
        <div className="text-center py-6 text-slate-400 text-sm">
          No results found for "{debouncedQuery}". Try a different term or use Manual entry.
        </div>
      )}

      {/* Recently used foods — shown when search box is empty and no food selected */}
      {!selectedFood && debouncedQuery.trim().length <= 2 && recentFoods.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
            <Clock className="h-3.5 w-3.5" />
            <span>Recently Used</span>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {recentFoods.map((log: any, idx: number) => (
              <Card
                key={idx}
                className="p-2.5 cursor-pointer transition-colors hover:bg-cyan-50/10 border-gray-700 hover:border-cyan-500/50"
                onClick={() => handleSelectRecentFood(log)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Clock className="h-3 w-3 text-cyan-400 flex-shrink-0" />
                    <p className="font-medium text-sm truncate">{log.foodName}</p>
                  </div>
                  <div className="text-right text-xs ml-2 flex-shrink-0">
                    <p className="font-semibold text-cyan-400">{Math.round(log.calories)} cal</p>
                    <p className="text-gray-400">{log.proteinGrams}g P</p>
                  </div>
                </div>
                {log.servingSize && log.servingSize !== "custom" && (
                  <p className="text-xs text-gray-500 ml-5 mt-0.5">{log.servingSize}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Previously logged foods matching the search query — sorted by frequency */}
      {historyMatches && historyMatches.length > 0 && !selectedFood && debouncedQuery.trim().length > 2 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-medium">
            <Clock className="h-3.5 w-3.5" />
            <span>Your Foods</span>
            <span className="text-gray-500">— tap to add instantly</span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {historyMatches.map((log: any, idx: number) => (
              <Card
                key={`hist-${idx}`}
                className="p-2.5 cursor-pointer transition-colors hover:bg-cyan-50/10 border-cyan-800/40 hover:border-cyan-500/50"
                onClick={() => handleSelectRecentFood(log)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Clock className="h-3 w-3 text-cyan-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{log.foodName}</p>
                      {log.logCount && (
                        <p className="text-xs text-gray-500">
                          {log.logCount >= 5 ? "⭐ " : ""}
                          Logged {log.logCount}x{log.servingSize && log.servingSize !== "custom" ? ` · ${log.servingSize}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs ml-2 flex-shrink-0">
                    <p className="font-semibold text-cyan-400">{Math.round(log.calories)} cal</p>
                    <p className="text-gray-400">{log.proteinGrams}g P</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Search results list */}
      {foodVariations && foodVariations.length > 0 && !selectedFood && (
        <div className="space-y-2">
          {(historyMatches && historyMatches.length > 0) && (
            <div className="text-xs text-gray-400 font-medium">From Database</div>
          )}
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {foodVariations.map((food: any, idx: number) => {
              const isRecent = recentFoodNames.has(food.name.toLowerCase());
              return (
                <Card
                  key={idx}
                  className={`p-3 cursor-pointer transition-colors border-gray-700 ${
                    isRecent
                      ? "hover:bg-cyan-50/10 hover:border-cyan-500/50 border-cyan-800/40"
                      : "hover:bg-blue-50/50 hover:border-blue-400"
                  }`}
                  onClick={() => handleSelectFood(food)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        {isRecent && <Clock className="h-3 w-3 text-cyan-400 flex-shrink-0" />}
                        <p className="font-medium text-sm">{food.name}</p>
                      </div>
                      <p className="text-xs text-gray-400">{food.description}</p>
                    </div>
                    <div className="text-right text-xs ml-2">
                      <p className="font-semibold">{Math.round(food.caloriesPer100g)} cal/100g</p>
                      <p className="text-gray-400">{food.proteinPer100g}g P</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected food detail / confirmation */}
      {selectedFood && (
        <div className="space-y-4 p-4 bg-blue-50/10 border border-blue-500/20 rounded-lg">
          <div>
            <div className="flex items-center gap-1.5">
              {selectedFood.isRecentLog && <Clock className="h-3.5 w-3.5 text-cyan-400" />}
              <h4 className="font-semibold text-sm">{selectedFood.name}</h4>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{selectedFood.description}</p>
          </div>

          {selectedFood.isRecentLog ? (
            /* Recently logged food: show exact macros from last log, no adjustment */
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="p-2 bg-gray-800 rounded text-center">
                <p className="text-gray-400">Calories</p>
                <p className="font-semibold text-white">{Math.round(selectedFood.originalCalories)}</p>
              </div>
              <div className="p-2 bg-gray-800 rounded text-center">
                <p className="text-gray-400">Protein</p>
                <p className="font-semibold text-cyan-400">{selectedFood.originalProtein}g</p>
              </div>
              <div className="p-2 bg-gray-800 rounded text-center">
                <p className="text-gray-400">Carbs</p>
                <p className="font-semibold">{selectedFood.originalCarbs}g</p>
              </div>
              <div className="p-2 bg-gray-800 rounded text-center">
                <p className="text-gray-400">Fat</p>
                <p className="font-semibold">{selectedFood.originalFat}g</p>
              </div>
            </div>
          ) : (
            /* Search result: allow serving size adjustment */
            <>
              {selectedFood.servingSize && (
                <p className="text-xs text-gray-400">Default serving: {selectedFood.servingSize}</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="serving-amount" className="text-xs">Amount</Label>
                  <Input
                    id="serving-amount"
                    type="number"
                    placeholder="100"
                    value={servingAmount}
                    onChange={(e) => setServingAmount(e.target.value)}
                    min="1"
                    step="0.1"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="serving-unit" className="text-xs">Unit</Label>
                  <select
                    id="serving-unit"
                    value={servingUnit}
                    onChange={(e) => setServingUnit(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-600 rounded bg-gray-800 text-white"
                  >
                    {getSmartUnits(selectedFood.name ?? "", selectedFood.description ?? "").map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Calories</Label>
                  <div className="px-2 py-1 text-sm font-semibold bg-gray-800 rounded">
                    {calculatedMacros?.calories || 0}
                  </div>
                </div>
              </div>

              {calculatedMacros && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 bg-gray-800 rounded">
                    <p className="text-gray-400">Protein</p>
                    <p className="font-semibold">{calculatedMacros.protein}g</p>
                  </div>
                  <div className="p-2 bg-gray-800 rounded">
                    <p className="text-gray-400">Carbs</p>
                    <p className="font-semibold">{calculatedMacros.carbs}g</p>
                  </div>
                  <div className="p-2 bg-gray-800 rounded">
                    <p className="text-gray-400">Fat</p>
                    <p className="font-semibold">{calculatedMacros.fat}g</p>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setSelectedFood(null)}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleAddFood}
              disabled={!selectedFood.isRecentLog && !calculatedMacros}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Add Food
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


interface ManualEntryTabProps {
  onFoodAdded: (food: any) => void;
  onClose: () => void;
  mealType?: string;
}

function ManualEntryTab({ onFoodAdded, onClose, mealType = "meal" }: ManualEntryTabProps) {
  const [foodName, setFoodName] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const handleAddFood = () => {
    if (foodName && calories && protein !== "" && carbs !== "" && fat !== "") {
      onFoodAdded({
        foodName,
        servingSize: servingSize || "1 serving",
        calories: Number(calories),
        proteinGrams: Number(protein),
        carbsGrams: Number(carbs),
        fatGrams: Number(fat),
      });
      onClose();
    }
  };

  const isValid = foodName && calories && protein !== "" && carbs !== "" && fat !== "";

  const mealTypeLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="food-name">Food Name *</Label>
        <Input
          id="food-name"
          placeholder="e.g., Grilled Chicken Breast"
          value={foodName}
          onChange={(e) => setFoodName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="serving-size-manual">Serving Size</Label>
        <Input
          id="serving-size-manual"
          placeholder="e.g., 100g, 1 cup, 1 breast"
          value={servingSize}
          onChange={(e) => setServingSize(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="calories">Calories *</Label>
          <Input
            id="calories"
            type="number"
            placeholder="0"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            min="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="protein">Protein (g) *</Label>
          <Input
            id="protein"
            type="number"
            placeholder="0"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            min="0"
            step="0.1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="carbs">Carbs (g) *</Label>
          <Input
            id="carbs"
            type="number"
            placeholder="0"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            min="0"
            step="0.1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fat">Fat (g) *</Label>
          <Input
            id="fat"
            type="number"
            placeholder="0"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            min="0"
            step="0.1"
          />
        </div>
      </div>

      <Button
        onClick={handleAddFood}
        disabled={!isValid}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        Add Food
      </Button>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Unified Gemini AI Scanner Tab
// Handles: auto-barcode detection → instant lookup, then Gemini for labels/plates
// ─────────────────────────────────────────────────────────────────────────────

interface GeminiScanTabProps {
  onFoodAdded: (food: {
    foodName: string;
    servingSize: string;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    sugarGrams?: number;
  }) => void;
  onClose: () => void;
  mealType: string;
}

interface ScannedFoodItem {
  id: string;
  name: string;
  portionSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  included: boolean;
}

function GeminiScanTab({ onFoodAdded, onClose, mealType }: GeminiScanTabProps) {
  // phase: capture → (barcode auto-detected OR user taps Capture) → analyzing → results
  // barcodePhase: "scanning" | "found" | "loading" | "done"
  const [phase, setPhase] = useState<"capture" | "analyzing" | "results">("capture");
  const [barcodeStatus, setBarcodeStatus] = useState<"scanning" | "found" | "loading" | "none">("scanning");
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedFoodItem[]>([]);
  const [mealName, setMealName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCaptureButton, setShowCaptureButton] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const barcodeDetectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);
  const barcodeLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBarcodeRef = useRef<string | null>(null);
  const captureButtonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const analyzeMutation = trpc.food.analyzeMealPhoto.useMutation();

  // Barcode lookup query — enabled only when a barcode has been detected
  const barcodeLookup = trpc.food.lookupBarcode.useQuery(
    { barcode: detectedBarcode ?? "" },
    { enabled: !!detectedBarcode && barcodeStatus === "loading" }
  );

  // When barcode lookup resolves, populate the product card
  useEffect(() => {
    if (!barcodeLookup.data) return;
    setBarcodeProduct(barcodeLookup.data);
    setBarcodeStatus("found");
  }, [barcodeLookup.data]);

  // If barcode lookup errors, fall back to Gemini capture
  useEffect(() => {
    if (barcodeLookup.error && barcodeStatus === "loading") {
      setBarcodeStatus("none");
      setDetectedBarcode(null);
    }
  }, [barcodeLookup.error, barcodeStatus]);

  // Start live camera when component mounts (capture phase only)
  useEffect(() => {
    let mounted = true;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraActive(true);
      } catch {
        if (mounted) setCameraError("Camera not available. Use the upload button instead.");
      }
    };
    if (phase === "capture") startCamera();
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [phase]);

  // Barcode detection loop — runs every 500ms while camera is active and no barcode found yet
  useEffect(() => {
    if (phase !== "capture" || !cameraActive || barcodeStatus === "found" || barcodeStatus === "loading") return;
    if (!("BarcodeDetector" in window)) {
      // Browser doesn't support BarcodeDetector — skip straight to capture button
      setBarcodeStatus("none");
      return;
    }
    try {
      barcodeDetectorRef.current = new (window as any).BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
      });
    } catch {
      setBarcodeStatus("none");
      return;
    }
    const detect = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = barcodeDetectorRef.current;
      if (!video || !canvas || !detector || video.readyState < 2) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      try {
        const barcodes = await detector.detect(canvas);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code && code !== lastBarcodeRef.current) {
            lastBarcodeRef.current = code;
            setDetectedBarcode(code);
            setBarcodeStatus("loading");
            // Stop the loop
            if (barcodeLoopRef.current) clearInterval(barcodeLoopRef.current);
            // Stop the capture-button timer
            if (captureButtonTimerRef.current) clearTimeout(captureButtonTimerRef.current);
          }
        }
      } catch { /* ignore detection errors */ }
    };
    barcodeLoopRef.current = setInterval(detect, 500);
    return () => {
      if (barcodeLoopRef.current) clearInterval(barcodeLoopRef.current);
    };
  }, [phase, cameraActive, barcodeStatus]);

  // 3-second timer: if no barcode detected, show the Capture button
  useEffect(() => {
    if (phase !== "capture" || !cameraActive || barcodeStatus !== "scanning") return;
    captureButtonTimerRef.current = setTimeout(() => {
      setBarcodeStatus(prev => prev === "scanning" ? "none" : prev);
      setShowCaptureButton(true);
    }, 3000);
    return () => {
      if (captureButtonTimerRef.current) clearTimeout(captureButtonTimerRef.current);
    };
  }, [phase, cameraActive, barcodeStatus]);

  const captureAndAnalyze = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPreviewUrl(dataUrl);
    const base64 = dataUrl.split(",")[1];

    // Stop camera and barcode loop
    if (barcodeLoopRef.current) clearInterval(barcodeLoopRef.current);
    if (captureButtonTimerRef.current) clearTimeout(captureButtonTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setPhase("analyzing");
    setError(null);

    try {
      const result = await analyzeMutation.mutateAsync({
        imageBase64: base64,
        mimeType: "image/jpeg",
        scanMode: "meal",
      });
      setMealName(result.mealName);
      setItems(
        result.items.map((item: any, idx: number) => ({
          id: `item-${idx}`,
          name: item.name,
          portionSize: item.portionSize,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          sugar: item.sugar ?? 0,
          included: true,
        }))
      );
      setPhase("results");
    } catch (err: any) {
      const rawMsg: string = err?.message ?? "";
      let friendlyMsg = "Failed to analyze. Please try again.";
      if (rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota") || rawMsg.includes("Quota")) {
        friendlyMsg = "AI scanning is temporarily unavailable (rate limit reached). Please try again in a minute, or use the search tab to find your food.";
      } else if (rawMsg.includes("INVALID_ARGUMENT") || rawMsg.includes("image")) {
        friendlyMsg = "Could not read the image. Try taking a clearer photo of the nutrition label or food.";
      } else if (rawMsg.includes("network") || rawMsg.includes("fetch")) {
        friendlyMsg = "Network error. Check your connection and try again.";
      }
      setError(friendlyMsg);
      setPhase("capture");
    }
  }, [analyzeMutation]);

  const analyzeFile = useCallback(async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    const previewReader = new FileReader();
    previewReader.onload = (e) => setPreviewUrl(e.target?.result as string);
    previewReader.readAsDataURL(file);

    if (barcodeLoopRef.current) clearInterval(barcodeLoopRef.current);
    if (captureButtonTimerRef.current) clearTimeout(captureButtonTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setPhase("analyzing");
    setError(null);

    try {
      const result = await analyzeMutation.mutateAsync({
        imageBase64: base64,
        mimeType: file.type || "image/jpeg",
        scanMode: "meal",
      });
      setMealName(result.mealName);
      setItems(
        result.items.map((item: any, idx: number) => ({
          id: `item-${idx}`,
          name: item.name,
          portionSize: item.portionSize,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          sugar: item.sugar ?? 0,
          included: true,
        }))
      );
      setPhase("results");
    } catch (err: any) {
      const rawMsg: string = err?.message ?? "";
      let friendlyMsg = "Failed to analyze. Please try again.";
      if (rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota") || rawMsg.includes("Quota")) {
        friendlyMsg = "AI scanning is temporarily unavailable (rate limit reached). Please try again in a minute, or use the search tab to find your food.";
      } else if (rawMsg.includes("INVALID_ARGUMENT") || rawMsg.includes("image")) {
        friendlyMsg = "Could not read the image. Try taking a clearer photo of the nutrition label or food.";
      } else if (rawMsg.includes("network") || rawMsg.includes("fetch")) {
        friendlyMsg = "Network error. Check your connection and try again.";
      }
      setError(friendlyMsg);
      setPhase("capture");
    }
  }, [analyzeMutation]);

  const resetScanner = useCallback(() => {
    setPhase("capture");
    setItems([]);
    setPreviewUrl(null);
    setError(null);
    setMealName("");
    setBarcodeStatus("scanning");
    setDetectedBarcode(null);
    setBarcodeProduct(null);
    setShowCaptureButton(false);
    lastBarcodeRef.current = null;
    if (barcodeLoopRef.current) clearInterval(barcodeLoopRef.current);
    if (captureButtonTimerRef.current) clearTimeout(captureButtonTimerRef.current);
  }, []);

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, included: !item.included } : item));
  };

  const updateItemField = (id: string, field: keyof ScannedFoodItem, value: string | number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: typeof value === "string" ? value : Number(value) } : item));
  };

  const includedItems = items.filter(i => i.included);
  const totals = includedItems.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      sugar: acc.sugar + item.sugar,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 }
  );

  const handleLog = () => {
    if (includedItems.length === 0) return;
    for (const item of includedItems) {
      onFoodAdded({
        foodName: item.name,
        servingSize: item.portionSize,
        calories: item.calories,
        proteinGrams: item.protein,
        carbsGrams: item.carbs,
        fatGrams: item.fat,
        sugarGrams: item.sugar,
      });
    }
    toast.success(`Logged ${includedItems.length} item${includedItems.length !== 1 ? "s" : ""} to ${mealType}`);
    onClose();
  };

  // ── Barcode product add handler ──
  const handleAddBarcodeProduct = () => {
    if (!barcodeProduct) return;
    const p = barcodeProduct;
    // Server returns protein/carbs/fat (not proteinGrams/carbsGrams/fatGrams)
    onFoodAdded({
      foodName: p.name,
      servingSize: `${p.servingSize ?? 1} ${p.servingUnit ?? p.defaultUnit ?? "serving"}`,
      calories: Number(p.calories) || 0,
      proteinGrams: Number(p.protein ?? p.proteinGrams) || 0,
      carbsGrams: Number(p.carbs ?? p.carbsGrams) || 0,
      fatGrams: Number(p.fat ?? p.fatGrams) || 0,
    });
    toast.success(`Added ${p.name} to ${mealType}`);
    onClose();
  };

  // ── Phase: capture ──
  if (phase === "capture") {
    // ── Barcode found: show product card ──
    if (barcodeStatus === "found" && barcodeProduct) {
      const p = barcodeProduct;
      return (
        <div className="space-y-3">
          {/* Green success banner */}
          <div className="flex items-center gap-2 p-3 bg-green-500/15 border border-green-500/40 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium text-green-400">Barcode detected!</span>
            <span className="text-xs text-gray-400 ml-auto">{detectedBarcode}</span>
          </div>

          {/* Product card */}
          <div className="p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-white text-base">{p.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">Serving: {p.servingSize} {p.servingUnit ?? p.defaultUnit ?? "g"}</p>
              </div>
              <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded-full shrink-0">Product Found</span>
            </div>

            {/* Macro grid */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Calories", value: p.calories, color: "text-white", unit: "" },
                { label: "Protein", value: p.protein ?? p.proteinGrams, color: "text-cyan-400", unit: "g" },
                { label: "Carbs", value: p.carbs ?? p.carbsGrams, color: "text-yellow-400", unit: "g" },
                { label: "Fat", value: p.fat ?? p.fatGrams, color: "text-orange-400", unit: "g" },
              ].map(m => (
                <div key={m.label} className="bg-gray-900 rounded-lg p-2 text-center">
                  <p className="text-gray-500 text-[10px] mb-0.5">{m.label}</p>
                  <p className={`font-bold text-sm ${m.color}`}>{Math.round(Number(m.value) || 0)}{m.unit}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <Button
            onClick={handleAddBarcodeProduct}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Add to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
          </Button>
          <Button variant="outline" onClick={resetScanner} className="w-full text-sm">
            Scan Another Item
          </Button>
        </div>
      );
    }

    // ── Barcode loading: looking up product ──
    if (barcodeStatus === "loading") {
      return (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Looking up barcode...</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">{detectedBarcode}</p>
          </div>
        </div>
      );
    }

    // ── Default: camera viewfinder with smart status overlay ──
    return (
      <div className="space-y-3">
        {(error || cameraError) && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error || cameraError}</span>
          </div>
        )}

        {/* Live camera viewfinder */}
        <div className="relative w-full rounded-xl overflow-hidden bg-gray-900 border border-gray-700" style={{ aspectRatio: "4/3" }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

          {/* Camera loading spinner */}
          {!cameraActive && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            </div>
          )}

          {/* Corner guides */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-cyan-400 rounded-tl" />
            <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-cyan-400 rounded-tr" />
            <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-cyan-400 rounded-bl" />
            <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-cyan-400 rounded-br" />
          </div>

          {/* Barcode scanning status badge */}
          {cameraActive && barcodeStatus === "scanning" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-300 font-medium">Scanning for barcode...</span>
            </div>
          )}

          {/* Gemini ready badge (after 3s, no barcode) */}
          {cameraActive && barcodeStatus === "none" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-purple-900/70 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-xs text-purple-300 font-medium">Gemini ready</span>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Smart status message */}
        <p className="text-xs text-gray-400 text-center">
          {barcodeStatus === "scanning"
            ? "Auto-detecting barcode — or point at a nutrition label / food plate"
            : "No barcode found — capture for Gemini AI analysis"}
        </p>

        {/* Capture button — always shown but more prominent after 3s */}
        <Button
          onClick={captureAndAnalyze}
          disabled={!cameraActive}
          className={`w-full text-white h-12 text-base font-semibold transition-all ${
            showCaptureButton || barcodeStatus === "none"
              ? "bg-purple-600 hover:bg-purple-700 scale-100"
              : "bg-cyan-800/60 hover:bg-cyan-700 scale-95 opacity-70"
          }`}
        >
          <Camera className="h-5 w-5 mr-2" />
          {showCaptureButton || barcodeStatus === "none" ? "Capture & Analyze with Gemini" : "Capture & Analyze"}
        </Button>

        {/* Upload fallback */}
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          Upload Photo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) analyzeFile(file);
            e.target.value = "";
          }}
        />

        <p className="text-xs text-gray-500 text-center">Powered by Gemini 2.0 Flash · Results are AI estimates</p>
      </div>
    );
  }

  // ── Phase: analyzing ──
  if (phase === "analyzing") {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        {previewUrl && (
          <img src={previewUrl} alt="Captured" className="w-40 h-40 object-cover rounded-xl border border-gray-700" />
        )}
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-white">Analyzing with Gemini AI...</p>
          <p className="text-xs text-gray-400 mt-1">Identifying food items and estimating macros</p>
        </div>
      </div>
    );
  }

  // ── Phase: results ──
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        {previewUrl && (
          <img src={previewUrl} alt="Scan" className="w-14 h-14 object-cover rounded-lg border border-gray-700 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white text-sm">{mealName}</h4>
          <p className="text-xs text-gray-400 mt-0.5">Tap items to include/exclude · Tap values to edit</p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-white shrink-0" onClick={resetScanner}>
          Rescan
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: "Calories", value: totals.calories, color: "text-white", unit: "" },
          { label: "Protein", value: totals.protein, color: "text-cyan-400", unit: "g" },
          { label: "Carbs", value: totals.carbs, color: "text-yellow-400", unit: "g" },
          { label: "Fat", value: totals.fat, color: "text-orange-400", unit: "g" },
        ].map(m => (
          <div key={m.label} className="p-2 bg-gray-800 rounded text-center">
            <p className="text-gray-400 text-[10px]">{m.label}</p>
            <p className={`font-bold text-sm ${m.color}`}>{m.value}{m.unit}</p>
          </div>
        ))}
      </div>

      {/* Items list — editable */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {items.map(item => (
          <div
            key={item.id}
            className={`p-2.5 rounded-lg border transition-colors ${
              item.included ? "bg-gray-800 border-gray-700" : "bg-gray-900 border-gray-800 opacity-50"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => toggleItem(item.id)}
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  item.included ? "bg-cyan-500" : "bg-gray-700"
                }`}
              >
                {item.included && <CheckCircle className="h-3.5 w-3.5 text-black" />}
              </button>
              <input
                className="flex-1 bg-transparent text-sm font-medium text-white focus:outline-none focus:border-b focus:border-cyan-500 min-w-0"
                value={item.name}
                onChange={e => updateItemField(item.id, "name", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-5 gap-1 text-xs ml-7">
              <div className="text-center">
                <p className="text-gray-500 text-[10px]">Serving</p>
                <input
                  className="w-full bg-gray-700 rounded px-1 py-0.5 text-center text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 text-[11px]"
                  value={item.portionSize}
                  onChange={e => updateItemField(item.id, "portionSize", e.target.value)}
                />
              </div>
              {[
                { key: "calories", label: "Cal", color: "text-white" },
                { key: "protein", label: "Pro", color: "text-cyan-400" },
                { key: "carbs", label: "Carb", color: "text-yellow-400" },
                { key: "fat", label: "Fat", color: "text-orange-400" },
              ].map(f => (
                <div key={f.key} className="text-center">
                  <p className={`text-[10px] ${f.color}`}>{f.label}</p>
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-gray-700 rounded px-1 py-0.5 text-center text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 text-[11px]"
                    value={(item as any)[f.key]}
                    onChange={e => updateItemField(item.id, f.key as keyof ScannedFoodItem, parseInt(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {includedItems.length === 0 && (
        <p className="text-xs text-gray-400 text-center">Select at least one item to log</p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={resetScanner} className="flex-1">Back</Button>
        <Button
          disabled={includedItems.length === 0}
          onClick={handleLog}
          className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          Log {includedItems.length} Item{includedItems.length !== 1 ? "s" : ""} to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
        </Button>
      </div>
    </div>
  );
}

// ── FavoritesTab ──────────────────────────────────────────────────────────────

interface FavoritesTabProps {
  onFoodAdded: (food: any) => void;
  onClose: () => void;
}

function FavoritesTab({ onFoodAdded, onClose }: FavoritesTabProps) {
  const { data: favorites, isLoading, refetch } = trpc.food.getFavorites.useQuery();
  const deleteFavoriteMutation = trpc.food.deleteFavorite.useMutation({
    onSuccess: () => { refetch(); toast.success("Removed from favorites"); },
  });

  const handleAddFavorite = (food: any) => {
    onFoodAdded({
      foodName: food.foodName,
      servingSize: food.servingSize || "1 serving",
      calories: food.calories,
      proteinGrams: food.proteinGrams,
      carbsGrams: food.carbsGrams,
      fatGrams: food.fatGrams,
      sugarGrams: food.sugarGrams || 0,
    });
    onClose();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!favorites || favorites.length === 0) {
    return (
      <div className="text-center py-10">
        <Star className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm font-medium">No favorites yet</p>
        <p className="text-slate-500 text-xs mt-1">Star foods in your food log to add them here for quick access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {(favorites as any[]).map((food: any) => (
        <div
          key={food.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors group"
        >
          <button
            className="flex-1 min-w-0 text-left"
            onClick={() => handleAddFavorite(food)}
          >
            <div className="font-medium text-white text-sm truncate">{food.foodName}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {food.calories} cal &bull; {food.proteinGrams}g P &bull; {food.carbsGrams}g C &bull; {food.fatGrams}g F
            </div>
            {food.servingSize && food.servingSize !== "1 serving" && (
              <div className="text-xs text-slate-500 mt-0.5">Per {food.servingSize}</div>
            )}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              onClick={() => handleAddFavorite(food)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white h-8 px-3 text-xs"
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                deleteFavoriteMutation.mutate({ favoriteFoodId: food.id });
              }}
              className="text-slate-500 hover:text-red-400 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
