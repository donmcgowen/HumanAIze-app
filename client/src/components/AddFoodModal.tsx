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

  // Search through all previously logged foods by query
  const { data: historyMatches } = trpc.food.searchHistory.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.trim().length > 2 }
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

      {/* Previously logged foods matching the search query */}
      {historyMatches && historyMatches.length > 0 && !selectedFood && debouncedQuery.trim().length > 2 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-medium">
            <Clock className="h-3.5 w-3.5" />
            <span>Previously Logged</span>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {historyMatches.map((log: any, idx: number) => (
              <Card
                key={`hist-${idx}`}
                className="p-2.5 cursor-pointer transition-colors hover:bg-cyan-50/10 border-cyan-800/40 hover:border-cyan-500/50"
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


// ─────────────────────────────────────────────────────────────────────────────
// Unified Gemini AI Scanner Tab
// Handles: barcode, product label / nutrition facts, or meal plate photo
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
  const [phase, setPhase] = useState<"capture" | "analyzing" | "results">("capture");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedFoodItem[]>([]);
  const [mealName, setMealName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const analyzeMutation = trpc.food.analyzeMealPhoto.useMutation();

  // Start live camera when component mounts
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

    // Stop camera
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
      setError(err?.message ?? "Failed to analyze. Please try again.");
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
      setError(err?.message ?? "Failed to analyze. Please try again.");
      setPhase("capture");
    }
  }, [analyzeMutation]);

  const resetScanner = useCallback(() => {
    setPhase("capture");
    setItems([]);
    setPreviewUrl(null);
    setError(null);
    setMealName("");
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

  // ── Phase: capture ──
  if (phase === "capture") {
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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
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
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <p className="text-xs text-gray-400 text-center">
          Point at a barcode, nutrition label, or plate of food
        </p>

        {/* Capture button */}
        <Button
          onClick={captureAndAnalyze}
          disabled={!cameraActive}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-12 text-base font-semibold"
        >
          <Camera className="h-5 w-5 mr-2" />
          Capture &amp; Analyze
        </Button>

        {/* Upload fallback */}
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          Upload Photo Instead
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

        <p className="text-xs text-gray-500 text-center">Powered by Gemini 2.5 Flash · Results are AI estimates</p>
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
