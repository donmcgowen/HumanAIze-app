import { useState, useEffect, useId, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, FileText, Barcode, Loader2, AlertCircle, Clock } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"search" | "manual" | "ai">("search");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Food to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}</DialogTitle>
          <DialogDescription>Choose how you want to add food to your meal</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Manual</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Barcode className="h-4 w-4" />
              <span className="hidden sm:inline">AI Scan</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4 mt-4">
            <SearchFoodTab onFoodAdded={onFoodAdded} onClose={onClose} />
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <ManualEntryTab onFoodAdded={onFoodAdded} onClose={onClose} />
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <AIScannerTab onFoodAdded={onFoodAdded} onClose={onClose} />
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

function parseServingSizeForInput(servingSize?: string): { amount: string; unit: "g" | "oz" } | null {
  if (!servingSize) return null;
  const match = servingSize.trim().match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|oz|ounce|ounces)\b/i);
  if (!match) return null;

  const amount = match[1];
  const unit = /^oz|ounce/i.test(match[2]) ? "oz" : "g";
  return { amount, unit };
}

function SearchFoodTab({ onFoodAdded, onClose, mealType = "meal" }: SearchFoodTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<any>(null);
  const [servingAmount, setServingAmount] = useState("100");
  const [servingUnit, setServingUnit] = useState<"g" | "oz">("g");

  // Debounce: wait 500ms after user stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500);
    return () => clearTimeout(timer);
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

  const { data: foodVariations, isLoading, error } = trpc.food.searchWithAI.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.trim().length > 2, retry: 1 }
  );

  // When searching, mark which results match recent foods
  const recentFoodNames = new Set(recentFoods.map((f: any) => f.foodName.toLowerCase()));

  const { data: calculatedMacros } = trpc.food.calculateServingMacros.useQuery(
    selectedFood && !selectedFood.isRecentLog && servingAmount
      ? {
          foodName: selectedFood.name,
          caloriesPer100g: selectedFood.caloriesPer100g,
          proteinPer100g: selectedFood.proteinPer100g,
          carbsPer100g: selectedFood.carbsPer100g,
          fatPer100g: selectedFood.fatPer100g,
          amount: parseFloat(servingAmount) || 0,
          unit: servingUnit,
        }
      : skipToken,
    { enabled: !!selectedFood && !selectedFood.isRecentLog && !!servingAmount }
  );

  const handleSelectFood = (food: any) => {
    setSelectedFood(food);
    const parsedServing = parseServingSizeForInput(food?.servingSize);
    if (parsedServing) {
      setServingAmount(parsedServing.amount);
      setServingUnit(parsedServing.unit);
      return;
    }
    setServingAmount("100");
    setServingUnit("g");
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
      onFoodAdded({
        foodName: selectedFood.name,
        servingSize: `${servingAmount}${servingUnit}`,
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
      {/* Search input */}
      <div className="space-y-2">
        <Label htmlFor="search-food">Search Foods</Label>
        <Input
          id="search-food"
          placeholder="e.g., Premier Protein Cereal, greek yogurt..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSelectedFood(null); }}
          className="w-full"
          autoFocus
        />
        <p className="text-xs text-gray-500">
          {debouncedQuery.trim().length <= 2
            ? "Type to search branded products, or pick a recent food below"
            : "Searching branded products database..."}
        </p>
      </div>

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

      {/* Search results list */}
      {foodVariations && foodVariations.length > 0 && !selectedFood && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
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
                    onChange={(e) => setServingUnit(e.target.value as "g" | "oz")}
                    className="w-full px-2 py-1 text-sm border border-gray-600 rounded bg-gray-800 text-white"
                  >
                    <option value="g">Grams (g)</option>
                    <option value="oz">Ounces (oz)</option>
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

interface AIScannerTabProps {
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
}

/** Per-100g nutrition data for a scanned product */
interface ScannedProduct {
  name: string;
  brand?: string;
  barcode: string;
  sourceLabel: string;
  /** Macros per 100g */
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sugarPer100g: number;
  /** Original serving from label */
  labelServingSize: string;
  labelServingUnit: string;
  /** Smart default unit */
  defaultUnit: "g" | "oz" | "scoops" | "servings";
  /** Scoop size in grams (if applicable) */
  scoopSizeG?: number;
}

type WeightUnit = "g" | "oz" | "scoops" | "servings";

function calcMacros(
  product: ScannedProduct,
  amount: number,
  unit: WeightUnit
): { calories: number; protein: number; carbs: number; fat: number; sugar: number; servingLabel: string } {
  let grams = 0;
  let servingLabel = "";

  if (unit === "g") {
    grams = amount;
    servingLabel = `${amount}g`;
  } else if (unit === "oz") {
    grams = amount * 28.3495;
    servingLabel = `${amount}oz`;
  } else if (unit === "scoops") {
    const scoopG = product.scoopSizeG || 30;
    grams = amount * scoopG;
    servingLabel = `${amount} scoop${amount !== 1 ? "s" : ""}`;
  } else {
    // servings — use label serving size
    const labelG = parseFloat(product.labelServingSize) || 100;
    const labelUnit = product.labelServingUnit.toLowerCase();
    grams = labelUnit === "oz" ? amount * labelG * 28.3495 : amount * labelG;
    servingLabel = `${amount} serving${amount !== 1 ? "s" : ""}`;
  }

  const factor = grams / 100;
  return {
    calories: Math.round(product.caloriesPer100g * factor),
    protein: Math.round(product.proteinPer100g * factor),
    carbs: Math.round(product.carbsPer100g * factor),
    fat: Math.round(product.fatPer100g * factor),
    sugar: Math.round(product.sugarPer100g * factor),
    servingLabel,
  };
}

function AIScannerTab({ onFoodAdded, onClose }: AIScannerTabProps) {
  const utils = trpc.useUtils();
  const scannerId = useId();
  const readerElementId = useMemo(() => `food-barcode-reader-${scannerId.replace(/:/g, "")}`, [scannerId]);

  const [scanResult, setScanResult] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<WeightUnit>("servings");

  // Derived macros based on current amount/unit
  const computed = useMemo(() => {
    if (!scannedProduct) return null;
    const num = parseFloat(amount);
    if (!num || num <= 0) return null;
    return calcMacros(scannedProduct, num, unit);
  }, [scannedProduct, amount, unit]);

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let isMounted = true;

    const normalizeBarcode = (raw: string): string | null => {
      const matches = raw.match(/\d{8,14}/g);
      if (!matches || matches.length === 0) return null;
      return matches.sort((a, b) => b.length - a.length)[0];
    };

    const onScanSuccess = async (decodedText: string) => {
      if (!isMounted) return;
      const normalizedBarcode = normalizeBarcode(decodedText);
      if (!normalizedBarcode) {
        setScannerError("Scan detected, but no valid 8-14 digit barcode was found.");
        return;
      }

      setScanResult(normalizedBarcode);
      setLookupLoading(true);
      setScannerError(null);

      // Stop scanner once we have a barcode
      if (scanner) { scanner.stop().catch(() => {}); scanner = null; }

      try {
        const product = await utils.food.lookupBarcode.fetch({ barcode: normalizedBarcode });
        if (!isMounted) return;

        if (product) {
          // Calculate per-100g values
          const servingSizeNum = parseFloat(product.servingSize) || 100;
          const servingUnitStr = (product.servingUnit || "g").toLowerCase();
          const servingInGrams = servingUnitStr === "oz" ? servingSizeNum * 28.3495 : servingSizeNum;
          const factor = servingInGrams / 100;

          const cal100 = product.caloriesPer100g ?? (factor > 0 ? Math.round(product.calories / factor) : product.calories);
          const prot100 = product.proteinPer100g ?? (factor > 0 ? product.protein / factor : product.protein);
          const carb100 = product.carbsPer100g ?? (factor > 0 ? product.carbs / factor : product.carbs);
          const fat100 = product.fatPer100g ?? (factor > 0 ? product.fat / factor : product.fat);
          const sug100 = factor > 0 ? (product.sugar || 0) / factor : (product.sugar || 0);

          const defaultUnit = (product.defaultUnit as WeightUnit) || "servings";

          setScannedProduct({
            name: product.name,
            brand: product.brand || undefined,
            barcode: normalizedBarcode,
            sourceLabel: product.brand ? `${product.brand} (barcode: ${normalizedBarcode})` : `Barcode: ${normalizedBarcode}`,
            caloriesPer100g: cal100,
            proteinPer100g: prot100,
            carbsPer100g: carb100,
            fatPer100g: fat100,
            sugarPer100g: sug100,
            labelServingSize: product.servingSize,
            labelServingUnit: product.servingUnit,
            defaultUnit,
            scoopSizeG: defaultUnit === "scoops" ? servingInGrams : undefined,
          });
          setUnit(defaultUnit);
          setAmount("1");
          toast.success(`Found: ${product.name}`);
        } else {
          setScannerError("Product not found. Try scanning again or enter manually.");
          toast.error("Product not found");
        }
      } catch (_error) {
        if (isMounted) {
          setScannerError("Barcode lookup failed. Please try again.");
          toast.error("Barcode lookup failed");
        }
      } finally {
        if (isMounted) setLookupLoading(false);
      }
    };

    if (!scannedProduct) {
      const startScanner = async () => {
        try {
          scanner = new Html5Qrcode(readerElementId);
          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            onScanSuccess,
            () => {}
          );
        } catch (err: any) {
          if (isMounted) {
            setScannerError(err?.message || "Camera access denied or not available.");
          }
        }
      };
      startScanner();
    }

    return () => {
      isMounted = false;
      if (scanner) { scanner.stop().catch(() => {}); }
    };
  }, [readerElementId, scannedProduct]);

  // ── Product found: show macros + serving size input ──
  if (scannedProduct) {
    // Build a human-readable serving label from the label data
    // e.g. "0.5 cup", "3 oz", "1 scoop", "100 g"
    const labelSizeNum = parseFloat(scannedProduct.labelServingSize) || 1;
    const labelUnit = scannedProduct.labelServingUnit?.toLowerCase() || "g";
    const servingDisplayUnit = labelUnit === "g" || labelUnit === "gram" || labelUnit === "grams"
      ? "g"
      : labelUnit === "oz" || labelUnit === "ounce" || labelUnit === "ounces"
      ? "oz"
      : labelUnit === "cup" || labelUnit === "cups"
      ? "cup"
      : labelUnit === "ml" || labelUnit === "milliliter"
      ? "ml"
      : labelUnit === "tbsp" || labelUnit === "tablespoon"
      ? "tbsp"
      : labelUnit === "tsp" || labelUnit === "teaspoon"
      ? "tsp"
      : labelUnit;

    // One serving = labelSizeNum servingDisplayUnit
    const oneServingLabel = `${labelSizeNum} ${servingDisplayUnit}`;

    const unitOptions: { value: WeightUnit; label: string }[] = [
      { value: "servings", label: `Serving (${oneServingLabel})` },
      { value: "g", label: "Grams (g)" },
      { value: "oz", label: "Ounces (oz)" },
      ...(scannedProduct.defaultUnit === "scoops" ? [{ value: "scoops" as WeightUnit, label: "Scoops" }] : []),
    ];

    return (
      <div className="space-y-4">
        {/* Product header */}
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm truncate">{scannedProduct.name}</h4>
              {scannedProduct.brand && (
                <p className="text-xs text-gray-400">{scannedProduct.brand}</p>
              )}
              <p className="text-xs text-cyan-400/80 mt-0.5 font-medium">
                1 serving = {oneServingLabel}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-400 hover:text-white ml-2 shrink-0"
              onClick={() => { setScannedProduct(null); setScanResult(null); setScannerError(null); }}
            >
              Rescan
            </Button>
          </div>
        </div>

        {/* Amount + unit input */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">How much did you eat?</Label>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min="0.1"
              step="0.1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 text-center text-lg font-semibold"
              placeholder="1"
            />
            <div className="flex gap-1 flex-wrap">
              {unitOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setUnit(opt.value)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    unit === opt.value
                      ? "bg-cyan-500 text-black"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {unit === "scoops" && scannedProduct.scoopSizeG && (
            <p className="text-xs text-gray-500">1 scoop ≈ {Math.round(scannedProduct.scoopSizeG)}g</p>
          )}
        </div>

        {/* Calculated macros — always shown since amount defaults to 1 */}
        {computed ? (
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="p-2 bg-gray-800 rounded text-center">
              <p className="text-gray-400">Calories</p>
              <p className="font-bold text-base text-white">{computed.calories}</p>
            </div>
            <div className="p-2 bg-gray-800 rounded text-center">
              <p className="text-gray-400">Protein</p>
              <p className="font-bold text-base text-cyan-400">{computed.protein}g</p>
            </div>
            <div className="p-2 bg-gray-800 rounded text-center">
              <p className="text-gray-400">Carbs</p>
              <p className="font-bold text-base text-yellow-400">{computed.carbs}g</p>
            </div>
            <div className="p-2 bg-gray-800 rounded text-center">
              <p className="text-gray-400">Fat</p>
              <p className="font-bold text-base text-orange-400">{computed.fat}g</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center">Enter an amount above to see macros</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setScannedProduct(null); setScanResult(null); setScannerError(null); }}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            disabled={!computed}
            onClick={() => {
              if (!computed) return;
              onFoodAdded({
                foodName: scannedProduct.name,
                servingSize: computed.servingLabel,
                calories: computed.calories,
                proteinGrams: computed.protein,
                carbsGrams: computed.carbs,
                fatGrams: computed.fat,
                sugarGrams: computed.sugar,
              });
              onClose();
            }}
            className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            Add to Meal
          </Button>
        </div>
      </div>
    );
  }

  // ── Scanner view ──
  return (
    <div className="space-y-4">
      {scannerError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{scannerError}</span>
        </div>
      )}

      {lookupLoading ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm text-gray-400">Looking up product...</p>
          {scanResult && <p className="text-xs text-gray-500">Barcode: {scanResult}</p>}
        </div>
      ) : (
        <div id={readerElementId} className="w-full rounded-lg overflow-hidden" />
      )}

      <p className="text-xs text-gray-400 text-center">
        Point camera at the barcode on the product label
      </p>
    </div>
  );
}
