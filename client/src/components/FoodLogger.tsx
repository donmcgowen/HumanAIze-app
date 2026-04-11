import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOOD_DATABASE, calculateMacros, searchFoods } from "@/../../shared/foodDatabase";
import { toast } from "sonner";
import { Plus, Trash2, Search, Edit2, Check, X, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";

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

export function FoodLogger() {
  // State declarations first
  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("grams");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, any>>({});
  const [useUSDASearch, setUseUSDASearch] = useState(false);
  const [selectedUSDAFood, setSelectedUSDAFood] = useState<USDAFoodResult | null>(null);

  const { data: foodLogs, isLoading, refetch } = trpc.food.getDayLogs.useQuery({
    startOfDay: new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
    endOfDay: new Date(new Date().setHours(23, 59, 59, 999)).getTime(),
  });

  // USDA search query
  const { data: usdaResults, isLoading: isSearching } = trpc.food.searchUSDA.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 2 && useUSDASearch }
  );

  // Mutations
  const addFoodLog = trpc.food.addLog.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedFood(null);
      setQuantity("");
      setQuantityUnit("grams");
      setSearchQuery("");
      setUseUSDASearch(false);
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

  // Filter foods based on search (local database)
  const filteredFoods = useMemo(() => {
    if (!searchQuery || useUSDASearch) return [];
    return searchFoods(searchQuery).slice(0, 15);
  }, [searchQuery, useUSDASearch]);

  // Get selected food details (local database)
  const selectedFoodItem = selectedFood && !useUSDASearch
    ? FOOD_DATABASE.find(f => f.id === selectedFood)
    : null;

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

  // Calculate macros for selected food and quantity
  const calculatedMacros = useMemo(() => {
    if (useUSDASearch && selectedUSDAFood && quantity) {
      const quantityInGrams = getQuantityInGrams();
      const scale = quantityInGrams / selectedUSDAFood.servingSize;
      return {
        protein: selectedUSDAFood.protein * scale,
        carbs: selectedUSDAFood.carbs * scale,
        fat: selectedUSDAFood.fat * scale,
        calories: selectedUSDAFood.calories * scale,
      };
    }
    if (!selectedFoodItem || !quantity) {
      return { protein: 0, carbs: 0, fat: 0, calories: 0 };
    }
    const quantityInGrams = getQuantityInGrams();
    return calculateMacros(selectedFoodItem, quantityInGrams);
  }, [selectedFoodItem, selectedUSDAFood, quantity, quantityUnit, useUSDASearch]);

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

  const handleAddFood = () => {
    if (useUSDASearch) {
      if (!selectedUSDAFood || !quantity) return;
      addFoodLog.mutate({
        foodName: selectedUSDAFood.description,
        servingSize: `${quantity}${quantityUnit}`,
        calories: Math.round(calculatedMacros.calories),
        proteinGrams: Math.round(calculatedMacros.protein * 10) / 10,
        carbsGrams: Math.round(calculatedMacros.carbs * 10) / 10,
        fatGrams: Math.round(calculatedMacros.fat * 10) / 10,
        mealType: "other",
        loggedAt: Date.now(),
      });
    } else {
      if (!selectedFoodItem || !quantity) return;
      addFoodLog.mutate({
        foodName: selectedFoodItem.name,
        servingSize: `${quantity}${quantityUnit}`,
        calories: Math.round(calculatedMacros.calories),
        proteinGrams: Math.round(calculatedMacros.protein * 10) / 10,
        carbsGrams: Math.round(calculatedMacros.carbs * 10) / 10,
        fatGrams: Math.round(calculatedMacros.fat * 10) / 10,
        mealType: "other",
        loggedAt: Date.now(),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Food Input Card */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Log Food</CardTitle>
          <CardDescription>Search and add foods to track your macros</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={!useUSDASearch ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setUseUSDASearch(false);
                setSelectedUSDAFood(null);
                setSelectedFood(null);
              }}
              className={!useUSDASearch ? "bg-cyan-500 hover:bg-cyan-600" : ""}
            >
              Local Database
            </Button>
            <Button
              variant={useUSDASearch ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setUseUSDASearch(true);
                setSelectedFood(null);
              }}
              className={useUSDASearch ? "bg-cyan-500 hover:bg-cyan-600" : ""}
            >
              USDA FoodData Central
            </Button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Label className="text-xs text-slate-400 mb-2 block">
              {useUSDASearch ? "Search USDA Database" : "Search Food"}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input
                placeholder={useUSDASearch ? "e.g., chicken breast, brown rice..." : "e.g., chicken, rice, egg..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="pl-9 bg-white/10 border-white/20"
              />
              {isSearching && useUSDASearch && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 text-slate-400 animate-spin" />
              )}
            </div>

            {/* Dropdown Results */}
            {showDropdown && searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-white/20 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {useUSDASearch ? (
                  usdaResults && usdaResults.length > 0 ? (
                    usdaResults.map((food) => (
                      <button
                        key={food.fdcId}
                        onClick={() => {
                          setSelectedUSDAFood(food);
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
                  )
                ) : (
                  filteredFoods.length > 0 ? (
                    filteredFoods.map((food) => (
                      <button
                        key={food.id}
                        onClick={() => {
                          setSelectedFood(food.id);
                          setShowDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-white/10 transition text-sm text-slate-300 border-b border-white/5"
                      >
                        <div className="font-medium text-white">{food.name}</div>
                        <div className="text-xs text-slate-500">
                          {(food as any).protein}g protein • {(food as any).carbs}g carbs • {(food as any).fat}g fat • {(food as any).calories} cal per 100g
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-400">No foods found</div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Quantity Input */}
          {(selectedFood || selectedUSDAFood) && (
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

          {/* Auto-calculated Macros Display */}
          {((selectedFoodItem && quantity) || (selectedUSDAFood && quantity)) && (
            <div className="bg-cyan-300/10 border border-cyan-300/30 rounded p-4 space-y-3">
              <div className="text-sm font-semibold text-cyan-100">
                {useUSDASearch ? selectedUSDAFood?.description : selectedFoodItem?.name} - {quantity} {quantityUnit}
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
            disabled={addFoodLog.isPending || (!selectedFood && !selectedUSDAFood) || !quantity}
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
          <CardTitle>Today's Summary</CardTitle>
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

      {/* Food Log List */}
      {foodLogs && foodLogs.length > 0 && (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader>
            <CardTitle>Today's Foods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {foodLogs.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-white/5 rounded">
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
                        <div className="font-medium text-white">{log.foodName}</div>
                        <div className="text-xs text-slate-500">
                          {log.calories} cal • {log.proteinGrams}g protein • {log.carbsGrams}g carbs • {log.fatGrams}g fat
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
