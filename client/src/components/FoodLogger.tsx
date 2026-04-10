import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOOD_DATABASE, calculateMacros, searchFoods } from "@/../../shared/foodDatabase";
import { toast } from "sonner";
import { Plus, Trash2, Search, Edit2, Check, X } from "lucide-react";

export function FoodLogger() {
  const { data: foodLogs, isLoading, refetch } = trpc.food.getDayLogs.useQuery({
    startOfDay: new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
    endOfDay: new Date(new Date().setHours(23, 59, 59, 999)).getTime(),
  });
  const addFoodLog = trpc.food.addLog.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedFood(null);
      setQuantity("");
      setQuantityUnit("grams");
      setSearchQuery("");
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

  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("grams");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Filter foods based on search
  const filteredFoods = useMemo(() => {
    if (!searchQuery) return FOOD_DATABASE.slice(0, 15);
    return searchFoods(searchQuery).slice(0, 15);
  }, [searchQuery]);

  // Get selected food details
  const selectedFoodItem = selectedFood
    ? FOOD_DATABASE.find(f => f.id === selectedFood)
    : null;

  // Convert quantity to grams
  const getQuantityInGrams = (): number => {
    const qty = parseFloat(quantity);
    if (!qty || isNaN(qty)) return 0;

    switch (quantityUnit) {
      case "oz":
        return qty * 28.35; // 1 oz = 28.35g
      case "lbs":
        return qty * 453.6; // 1 lb = 453.6g
      case "cup":
        return qty * 240; // 1 cup ≈ 240g (approximate)
      case "grams":
      default:
        return qty;
    }
  };

  // Calculate macros for selected food and quantity
  const calculatedMacros = useMemo(() => {
    if (!selectedFoodItem || !quantity) {
      return { protein: 0, carbs: 0, fat: 0, calories: 0 };
    }
    const quantityInGrams = getQuantityInGrams();
    return calculateMacros(selectedFoodItem, quantityInGrams);
  }, [selectedFoodItem, quantity, quantityUnit]);

  // Handle adding food log
  const handleAddFood = () => {
    if (!selectedFoodItem || !quantity) {
      toast.error("Please select a food and enter quantity");
      return;
    }

    const quantityInGrams = getQuantityInGrams();
    addFoodLog.mutate({
      foodName: selectedFoodItem.name,
      calories: calculatedMacros.calories,
      proteinGrams: calculatedMacros.protein,
      carbsGrams: calculatedMacros.carbs,
      fatGrams: calculatedMacros.fat,
      loggedAt: Date.now(),
    });
  };

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

  return (
    <div className="space-y-6">
      {/* Food Input Card */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Log Food</CardTitle>
          <CardDescription>Search and add foods to track your macros</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Food Search */}
          <div className="space-y-2">
            <Label htmlFor="food-search">Food Name</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                id="food-search"
                placeholder="Search foods (e.g., chicken breast, salmon, broccoli)"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="pl-10 border-white/10 bg-white/[0.03]"
              />
              {showDropdown && searchQuery && filteredFoods.length > 0 && (
                <div className="absolute z-10 w-full mt-1 border border-white/10 bg-slate-900 rounded max-h-48 overflow-y-auto shadow-lg">
                  {filteredFoods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => {
                        setSelectedFood(food.id);
                        setSearchQuery(food.name);
                        setShowDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-white/10 border-b border-white/5 last:border-b-0 text-sm transition"
                    >
                      <div className="font-medium text-white">{food.name}</div>
                      <div className="text-xs text-slate-400">
                        {food.macros.protein}g protein, {food.macros.carbs}g carbs, {food.macros.fat}g fat • {food.calories} cal/100g
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quantity Input */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                placeholder="e.g., 3"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="border-white/10 bg-white/[0.03]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                <SelectTrigger className="border-white/10 bg-white/[0.03]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-slate-900">
                  <SelectItem value="grams">g</SelectItem>
                  <SelectItem value="oz">oz</SelectItem>
                  <SelectItem value="lbs">lbs</SelectItem>
                  <SelectItem value="cup">cup</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Auto-calculated Macros Display */}
          {selectedFoodItem && quantity && (
            <div className="bg-cyan-300/10 border border-cyan-300/30 rounded p-4 space-y-3">
              <div className="text-sm font-semibold text-cyan-100">
                {selectedFoodItem.name} - {quantity} {quantityUnit}
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Protein</div>
                  <div className="font-bold text-white">{calculatedMacros.protein}g</div>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Carbs</div>
                  <div className="font-bold text-white">{calculatedMacros.carbs}g</div>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Fat</div>
                  <div className="font-bold text-white">{calculatedMacros.fat}g</div>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-xs text-slate-400">Calories</div>
                  <div className="font-bold text-white">{calculatedMacros.calories}</div>
                </div>
              </div>
            </div>
          )}

          {/* Add Button */}
          <Button
            onClick={handleAddFood}
            disabled={addFoodLog.isPending || !selectedFood || !quantity}
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
              <div className="text-lg font-bold text-white">{dailyTotals.calories}</div>
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
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/10"
                >
                  <div className="flex-1">
                    <div className="font-medium text-white">{log.foodName}</div>
                    <div className="text-xs text-slate-400">
                      P: {log.proteinGrams}g | C: {log.carbsGrams}g | F: {log.fatGrams}g | {log.calories} cal
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteFoodLog.mutate({ foodLogId: log.id })}
                    className="text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="text-center text-slate-400">Loading food logs...</div>
      )}
    </div>
  );
}
