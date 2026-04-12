import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Search, Edit2, Check, X, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { BarcodeScanner } from "./BarcodeScanner";
import { QuantitySelector } from "./QuantitySelector";
import { SizeSelector } from "./SizeSelector";
import { FoodInsights } from "./FoodInsights";
import { AIFoodScanner } from "./AIFoodScanner";
import { FavoriteFoods } from "./FavoriteFoods";
import { MealTemplates } from "./MealTemplates";

interface USDAFoodResult {
  fdcId: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: number;
  servingUnit: string;
}

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

export function FoodLogger() {
  // State declarations first
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedFood, setSelectedFood] = useState<USDAFoodResult | null>(null);
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("grams");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, any>>({});
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [manualFoodName, setManualFoodName] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  // Variant detection state
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [variantType, setVariantType] = useState<"quantity" | "size" | null>(null);
  const [showAIScanner, setShowAIScanner] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showMeals, setShowMeals] = useState(false);

  // Queries
  const { data: foodLogs, isLoading, refetch } = trpc.food.getDayLogs.useQuery({
    startOfDay: new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
    endOfDay: new Date(new Date().setHours(23, 59, 59, 999)).getTime(),
  });

  // USDA search query
  const { data: usdaResults, isLoading: isSearching } = trpc.food.searchUSDA.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 2 && !useManualEntry }
  );

  // Fetch user profile for daily goals
  const { data: userProfile } = trpc.profile.get.useQuery();

  // Insights query - enable even without profile to show recommendations with default targets
  const { data: insights, isLoading: insightsLoading } = trpc.food.generateInsights.useQuery(
    {
      foodLogs: (foodLogs || []).map(log => ({
        foodName: log.foodName,
        calories: log.calories,
        proteinGrams: log.proteinGrams,
        carbsGrams: log.carbsGrams,
        fatGrams: log.fatGrams,
        mealType: log.mealType as "breakfast" | "lunch" | "dinner" | "snack",
      })),
      dailyCalorieGoal: userProfile?.dailyCalorieTarget || 2000,
      dailyProteinGoal: userProfile?.dailyProteinTarget || 150,
      dailyCarbGoal: userProfile?.dailyCarbsTarget || 200,
      dailyFatGoal: userProfile?.dailyFatTarget || 65,
      healthObjectives: ["balanced nutrition"],
    },
    { enabled: (foodLogs?.length || 0) > 0 }
  );

  // Mutations
  const addFoodLog = trpc.food.addLog.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedFood(null);
      setQuantity("");
      setQuantityUnit("grams");
      setSearchQuery("");
      setUseManualEntry(false);
      setManualFoodName("");
      setManualCalories("");
      setManualProtein("");
      setManualCarbs("");
      setManualFat("");
      setMealType("breakfast");
      toast.success("Food logged successfully");
    },
    onError: () => {
      toast.error("Failed to log food");
    },
  });

  const deleteFoodLog = trpc.food.deleteLog.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Food removed");
    },
  });

  const updateFoodLog = trpc.food.updateLog.useMutation({
    onSuccess: () => {
      refetch();
      setEditingId(null);
      setEditValues({});
      toast.success("Food updated");
    },
    onError: () => {
      toast.error("Failed to update food");
    },
  });

  // Handlers
  const handleEditStart = (log: any) => {
    setEditingId(log.id);
    setEditValues({
      [log.id]: {
        foodName: log.foodName,
        calories: log.calories,
        proteinGrams: log.proteinGrams,
        carbsGrams: log.carbsGrams,
        fatGrams: log.fatGrams,
        mealType: log.mealType,
      },
    });
  };

  const handleEditSave = (logId: number) => {
    const values = editValues[logId];
    if (!values) return;
    updateFoodLog.mutate({
      foodLogId: logId,
      ...values,
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleAIFoodsRecognized = (foods: Array<{
    name: string;
    portionSize: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>) => {
    if (foods.length === 0) return;
    
    // Use the first recognized food
    const food = foods[0];
    setSelectedFood({
      fdcId: `ai-${Date.now()}`,
      description: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      servingSize: 100,
      servingUnit: "g",
    });
    setQuantity(food.portionSize);
    setQuantityUnit("g");
    setUseManualEntry(false);
    setShowAIScanner(false);
    toast.success(`Recognized: ${food.name}`);
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setBarcodeLoading(true);
    try {
      const product = await trpc.useUtils().food.lookupBarcode.fetch({ barcode });
      if (product) {
        setSelectedFood({
          fdcId: barcode,
          description: product.name,
          calories: product.calories,
          protein: product.protein,
          carbs: product.carbs,
          fat: product.fat,
          servingSize: parseInt(product.servingSize),
          servingUnit: product.servingUnit,
        });
        setQuantity(product.servingSize);
        setQuantityUnit(product.servingUnit);
        setUseManualEntry(false);
        toast.success(`Found: ${product.name}`);
      } else {
        toast.error("Product not found in database");
      }
    } catch (err) {
      toast.error("Failed to lookup barcode");
    } finally {
      setBarcodeLoading(false);
    }
  };

  // Convert quantity to grams
  const getQuantityInGrams = (): number => {
    const qty = parseFloat(quantity);
    if (!qty || isNaN(qty)) return 0;

    switch (quantityUnit) {
      case "oz":
        return qty * 28.35;
      case "lbs":
        return qty * 453.6;
      case "cup":
        return qty * 240;
      case "grams":
      default:
        return qty;
    }
  };

  // Calculate macros for USDA food
  const calculatedMacros = useMemo(() => {
    if (useManualEntry) {
      return {
        protein: parseFloat(manualProtein) || 0,
        carbs: parseFloat(manualCarbs) || 0,
        fat: parseFloat(manualFat) || 0,
        calories: parseInt(manualCalories) || 0,
      };
    }

    if (selectedFood && quantity) {
      const quantityInGrams = getQuantityInGrams();
      const scale = quantityInGrams / selectedFood.servingSize;
      return {
        protein: selectedFood.protein * scale,
        carbs: selectedFood.carbs * scale,
        fat: selectedFood.fat * scale,
        calories: selectedFood.calories * scale,
      };
    }

    return { protein: 0, carbs: 0, fat: 0, calories: 0 };
  }, [selectedFood, quantity, quantityUnit, useManualEntry, manualProtein, manualCarbs, manualFat, manualCalories]);

  // Calculate daily totals
  const dailyTotals = useMemo(() => {
    if (!foodLogs) return { protein: 0, carbs: 0, fat: 0, calories: 0 };
    return foodLogs.reduce(
      (acc: any, log: any) => ({
        protein: acc.protein + (log.proteinGrams || 0),
        carbs: acc.carbs + (log.carbsGrams || 0),
        fat: acc.fat + (log.fatGrams || 0),
        calories: acc.calories + (log.calories || 0),
      }),
      { protein: 0, carbs: 0, fat: 0, calories: 0 }
    );
  }, [foodLogs]);

  // Group foods by meal type
  const foodsByMeal = useMemo(() => {
    if (!foodLogs) return { breakfast: [], lunch: [], dinner: [], snack: [] };
    const grouped: Record<MealType, any[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };

    (foodLogs as any[]).forEach((log: any) => {
      const mealType = (log.mealType || "breakfast") as MealType;
      if (grouped[mealType]) {
        grouped[mealType].push(log);
      }
    });

    return grouped;
  }, [foodLogs]);

  // Calculate macros per meal
  const mealMacros = useMemo(() => {
    const macros: Record<MealType, any> = {
      breakfast: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      lunch: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      dinner: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      snack: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    };

    Object.entries(foodsByMeal).forEach(([mealType, foods]: [string, any]) => {
      (foods as any[]).forEach((log: any) => {
        const mt = mealType as MealType;
        macros[mt].protein += log.proteinGrams || 0;
        macros[mt].carbs += log.carbsGrams || 0;
        macros[mt].fat += log.fatGrams || 0;
        macros[mt].calories += log.calories || 0;
      });
    });

    return macros;
  }, [foodsByMeal]);

  const handleAddFood = () => {
    if (useManualEntry) {
      if (!manualFoodName || !manualCalories) {
        toast.error("Please enter food name and calories");
        return;
      }
      addFoodLog.mutate({
        foodName: manualFoodName,
        servingSize: "custom",
        calories: parseInt(manualCalories),
        proteinGrams: parseFloat(manualProtein) || 0,
        carbsGrams: parseFloat(manualCarbs) || 0,
        fatGrams: parseFloat(manualFat) || 0,
        mealType,
        loggedAt: Date.now(),
      });
    } else {
      if (!selectedFood || !quantity) {
        toast.error("Please select a food and enter quantity");
        return;
      }
      addFoodLog.mutate({
        foodName: selectedFood.description,
        servingSize: `${quantity}${quantityUnit}`,
        calories: Math.round(calculatedMacros.calories),
        proteinGrams: Math.round(calculatedMacros.protein * 10) / 10,
        carbsGrams: Math.round(calculatedMacros.carbs * 10) / 10,
        fatGrams: Math.round(calculatedMacros.fat * 10) / 10,
        mealType,
        loggedAt: Date.now(),
      });
    }
  };

  const renderMealSection = (mealType: MealType, mealLabel: string) => {
    const meals = foodsByMeal[mealType] || [];
    const macros = mealMacros[mealType];

    return (
      <div key={mealType} className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-white capitalize">{mealLabel}</h4>
          <div className="text-xs text-slate-400">
            {macros.calories.toFixed(0)} cal • {macros.protein.toFixed(1)}g P • {macros.carbs.toFixed(1)}g C • {macros.fat.toFixed(1)}g F
          </div>
        </div>

        {meals.length > 0 ? (
          <div className="space-y-2">
            {meals.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/10">
                {editingId === log.id ? (
                  <div className="flex-1 space-y-2">
                    <Input
                      value={editValues[log.id]?.foodName || ""}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          [log.id]: { ...editValues[log.id], foodName: e.target.value },
                        })
                      }
                      className="bg-white/10 border-white/20 text-sm"
                    />
                    <div className="grid grid-cols-4 gap-2">
                      <Input
                        type="number"
                        placeholder="Calories"
                        value={editValues[log.id]?.calories || ""}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [log.id]: { ...editValues[log.id], calories: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="bg-white/10 border-white/20 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder="Protein"
                        value={editValues[log.id]?.proteinGrams || ""}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [log.id]: { ...editValues[log.id], proteinGrams: parseFloat(e.target.value) || 0 },
                          })
                        }
                        className="bg-white/10 border-white/20 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder="Carbs"
                        value={editValues[log.id]?.carbsGrams || ""}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [log.id]: { ...editValues[log.id], carbsGrams: parseFloat(e.target.value) || 0 },
                          })
                        }
                        className="bg-white/10 border-white/20 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder="Fat"
                        value={editValues[log.id]?.fatGrams || ""}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [log.id]: { ...editValues[log.id], fatGrams: parseFloat(e.target.value) || 0 },
                          })
                        }
                        className="bg-white/10 border-white/20 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleEditSave(log.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={handleEditCancel} variant="outline">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="font-medium text-white text-sm">{log.foodName}</div>
                      <div className="text-xs text-slate-500">
                        {log.calories} cal • {log.proteinGrams}g P • {log.carbsGrams}g C • {log.fatGrams}g F
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditStart(log)}
                        className="text-slate-400 hover:text-white"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteFoodLog.mutate({ foodLogId: log.id })}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic">No foods logged</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Food Input Card */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Log Food</CardTitle>
          <CardDescription>Search USDA database or manually enter food and macros</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Entry Mode Toggle */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={!useManualEntry ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setUseManualEntry(false);
                setSelectedFood(null);
                setSearchQuery("");
              }}
              className={!useManualEntry ? "bg-cyan-500 hover:bg-cyan-600" : ""}
            >
              Search USDA Database
            </Button>
            <Button
              variant={useManualEntry ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setUseManualEntry(true);
                setSelectedFood(null);
                setSearchQuery("");
              }}
              className={useManualEntry ? "bg-cyan-500 hover:bg-cyan-600" : ""}
            >
              Manual Entry
            </Button>
            <BarcodeScanner onBarcodeScanned={handleBarcodeScanned} isLoading={barcodeLoading} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAIScanner(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white border-purple-500"
            >
              AI Scanner
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFavorites(!showFavorites)}
              className={showFavorites ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-500" : ""}
            >
              Favorites
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMeals(!showMeals)}
              className={showMeals ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500" : ""}
            >
              Meals
            </Button>
          </div>

          {/* AI Food Scanner Modal */}
          <AIFoodScanner
            isOpen={showAIScanner}
            onClose={() => setShowAIScanner(false)}
            onFoodsRecognized={handleAIFoodsRecognized}
          />


          {/* Favorite Foods Section */}
          {showFavorites && (
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
              <FavoriteFoods
                onSelectFood={(food) => {
                  setSelectedFood({
                    fdcId: food.id,
                    description: food.foodName,
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fat: food.fat,
                    servingSize: 1,
                    servingUnit: "serving",
                  });
                  setQuantity("1");
                  setQuantityUnit("serving");
                  setShowFavorites(false);
                }}
              />
            </div>
          )}

          {/* Meal Templates Section */}
          {showMeals && (
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
              <MealTemplates
                currentMeals={(foodLogs || []).map(log => ({
                  foodName: log.foodName,
                  calories: log.calories,
                  protein: log.proteinGrams,
                  carbs: log.carbsGrams,
                  fat: log.fatGrams,
                }))}
                onSelectMeal={(meal) => {
                  setShowMeals(false);
                }}
              />
            </div>
          )}

          {/* Meal Type Selection */}
          <div>
            <Label className="text-xs text-slate-400 mb-2 block">Meal Type</Label>
            <Select value={mealType} onValueChange={(value) => setMealType(value as MealType)}>
              <SelectTrigger className="bg-white/10 border-white/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map((meal) => (
                  <SelectItem key={meal.value} value={meal.value}>
                    {meal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {useManualEntry ? (
            // Manual Entry Form
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-slate-400 mb-2 block">Food Name</Label>
                <Input
                  placeholder="e.g., Chicken Breast"
                  value={manualFoodName}
                  onChange={(e) => setManualFoodName(e.target.value)}
                  className="bg-white/10 border-white/20"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs text-slate-400 mb-2 block">Calories</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={manualCalories}
                    onChange={(e) => setManualCalories(e.target.value)}
                    className="bg-white/10 border-white/20"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400 mb-2 block">Protein (g)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={manualProtein}
                    onChange={(e) => setManualProtein(e.target.value)}
                    className="bg-white/10 border-white/20"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400 mb-2 block">Carbs (g)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={manualCarbs}
                    onChange={(e) => setManualCarbs(e.target.value)}
                    className="bg-white/10 border-white/20"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400 mb-2 block">Fat (g)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={manualFat}
                    onChange={(e) => setManualFat(e.target.value)}
                    className="bg-white/10 border-white/20"
                  />
                </div>
              </div>
            </div>
          ) : (
            // USDA Search Form
            <div className="space-y-4">
              <div className="relative">
                <Label className="text-xs text-slate-400 mb-2 block">Search Food</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="e.g., chicken breast, brown rice..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="pl-9 bg-white/10 border-white/20"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 text-slate-400 animate-spin" />
                  )}
                </div>

                {/* Dropdown Results */}
                {showDropdown && searchQuery && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-white/20 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {usdaResults && usdaResults.length > 0 ? (
                      usdaResults.map((food) => (
                        <button
                          key={food.fdcId}
                          onClick={() => {
                            setSelectedFood(food);
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-white/10 transition text-sm text-slate-300 border-b border-white/5"
                        >
                          <div className="font-medium text-white">{food.description}</div>
                          <div className="text-xs text-slate-500">
                            {food.protein.toFixed(1)}g protein • {food.carbs.toFixed(1)}g carbs • {food.fat.toFixed(1)}g fat • {food.calories} cal per {food.servingSize}{food.servingUnit}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-400">
                        {isSearching ? "Searching USDA database..." : "No results found"}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quantity Input */}
              {selectedFood && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">Quantity</Label>
                    <Input
                      type="number"
                      placeholder="100"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="bg-white/10 border-white/20"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">Unit</Label>
                    <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                      <SelectTrigger className="bg-white/10 border-white/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grams">g</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="lbs">lbs</SelectItem>
                        <SelectItem value="cup">cup</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Auto-calculated Macros Display */}
          {((selectedFood && quantity) || (useManualEntry && manualFoodName && manualCalories)) && (
            <div className="bg-cyan-300/10 border border-cyan-300/30 rounded p-4 space-y-3">
              <div className="text-sm font-semibold text-cyan-100">
                {useManualEntry ? manualFoodName : selectedFood?.description}
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Protein</div>
                  <div className="font-bold text-white">{calculatedMacros.protein.toFixed(1)}g</div>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Carbs</div>
                  <div className="font-bold text-white">{calculatedMacros.carbs.toFixed(1)}g</div>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Fat</div>
                  <div className="font-bold text-white">{calculatedMacros.fat.toFixed(1)}g</div>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Calories</div>
                  <div className="font-bold text-white">{calculatedMacros.calories.toFixed(0)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Add Button */}
          <Button
            onClick={handleAddFood}
            disabled={addFoodLog.isPending || (useManualEntry ? !manualFoodName || !manualCalories : !selectedFood || !quantity)}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            {addFoodLog.isPending ? "Adding..." : "Add to Log"}
          </Button>
        </CardContent>
      </Card>

      {/* Daily Summary */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Daily Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white/5 p-3 rounded">
              <div className="text-xs text-slate-400">Protein</div>
              <div className="text-lg font-bold text-white">{dailyTotals.protein.toFixed(1)}g</div>
            </div>
            <div className="bg-white/5 p-3 rounded">
              <div className="text-xs text-slate-400">Carbs</div>
              <div className="text-lg font-bold text-white">{dailyTotals.carbs.toFixed(1)}g</div>
            </div>
            <div className="bg-white/5 p-3 rounded">
              <div className="text-xs text-slate-400">Fat</div>
              <div className="text-lg font-bold text-white">{dailyTotals.fat.toFixed(1)}g</div>
            </div>
            <div className="bg-white/5 p-3 rounded">
              <div className="text-xs text-slate-400">Calories</div>
              <div className="text-lg font-bold text-white">{dailyTotals.calories.toFixed(0)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Food Log by Meal Type */}
      {foodLogs && foodLogs.length > 0 && (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader>
            <CardTitle>Today's Foods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {MEAL_TYPES.map((meal) => renderMealSection(meal.value, meal.label))}
          </CardContent>
        </Card>
      )}
      {/* Real-Time Insights */}
      <FoodInsights
        insights={insights || null}
        isLoading={insightsLoading}
        dailyCalorieGoal={userProfile?.dailyCalorieTarget || 2000}
        currentCalories={dailyTotals.calories}
        currentProtein={dailyTotals.protein}
        dailyProteinGoal={userProfile?.dailyProteinTarget || 150}
        currentCarbs={dailyTotals.carbs}
        dailyCarbGoal={userProfile?.dailyCarbsTarget || 200}
        currentFat={dailyTotals.fat}
        dailyFatGoal={userProfile?.dailyFatTarget || 65}
      />
    </div>
  );
}
