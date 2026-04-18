import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Check, X, Loader2, Star } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { AddFoodModal } from "./AddFoodModal";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_SECTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "BREAKFAST" },
  { value: "lunch", label: "LUNCH" },
  { value: "dinner", label: "DINNER" },
  { value: "snack", label: "SNACKS" },
];

interface MacroCircleProps {
  value: number;
  label: string;
  unit?: string;
  color: string;
  size?: "large" | "small";
}

function MacroCircle({ value, label, unit = "", color, size = "small" }: MacroCircleProps) {
  const isLarge = size === "large";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`rounded-full border-4 flex flex-col items-center justify-center bg-white/5 ${
          isLarge ? "w-28 h-28 border-white/20" : "w-16 h-16 border-white/15"
        }`}
      >
        <span className={`font-bold leading-none ${isLarge ? "text-3xl" : "text-xl"}`} style={{ color }}>
          {Math.round(value)}
        </span>
        {unit && <span className="text-xs text-slate-400 mt-0.5">{unit}</span>}
      </div>
      <span className={`font-semibold tracking-widest text-slate-300 ${isLarge ? "text-xs" : "text-[10px]"}`}>
        {label}
      </span>
    </div>
  );
}

export function FoodLogger() {
  const utils = trpc.useUtils();

  // State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, any>>({});
  const [showAddFoodModal, setShowAddFoodModal] = useState(false);
  const [activeMealType, setActiveMealType] = useState<MealType>("breakfast");

  // Queries
  const { data: foodLogs, isLoading, refetch } = trpc.food.getDayLogs.useQuery({
    startOfDay: new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
    endOfDay: new Date(new Date().setHours(23, 59, 59, 999)).getTime(),
  });

  const { data: userProfile } = trpc.profile.get.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: favorites, refetch: refetchFavorites } = trpc.food.getFavorites.useQuery();

  const toPositiveNumberOrNull = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  };

  const targetTotals = {
    calories: toPositiveNumberOrNull(userProfile?.dailyCalorieTarget) ?? 0,
    protein: toPositiveNumberOrNull(userProfile?.dailyProteinTarget) ?? 0,
    carbs: toPositiveNumberOrNull(userProfile?.dailyCarbsTarget) ?? 0,
    fat: toPositiveNumberOrNull(userProfile?.dailyFatTarget) ?? 0,
  };

  // Mutations
  const addFoodLog = trpc.food.addLog.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Food logged successfully");
    },
    onError: () => toast.error("Failed to log food"),
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
    onError: () => toast.error("Failed to update food"),
  });

  const addFavoriteMutation = trpc.food.addFavorite.useMutation({
    onSuccess: () => { refetchFavorites(); toast.success("Added to favorites"); },
  });
  const deleteFavoriteMutation = trpc.food.deleteFavorite.useMutation({
    onSuccess: () => { refetchFavorites(); toast.success("Removed from favorites"); },
  });

  // Computed values
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

  const foodsByMeal = useMemo(() => {
    if (!foodLogs) return { breakfast: [], lunch: [], dinner: [], snack: [] };
    const grouped: Record<MealType, any[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    (foodLogs as any[]).forEach((log: any) => {
      const mt = (log.mealType || "breakfast") as MealType;
      if (grouped[mt]) grouped[mt].push(log);
    });
    return grouped;
  }, [foodLogs]);

  const mealCalories = useMemo(() => {
    const cal: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    Object.entries(foodsByMeal).forEach(([mt, foods]) => {
      cal[mt as MealType] = (foods as any[]).reduce((s: number, l: any) => s + (l.calories || 0), 0);
    });
    return cal;
  }, [foodsByMeal]);

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
    updateFoodLog.mutate({ foodLogId: logId, ...values });
  };

  const handleAddFoodFromModal = (food: any) => {
    const sugarGrams = Number(food.sugarGrams || 0);
    addFoodLog.mutate({
      foodName: food.foodName,
      servingSize: food.servingSize,
      calories: Math.round(food.calories),
      proteinGrams: Math.round(food.proteinGrams * 10) / 10,
      carbsGrams: Math.round(food.carbsGrams * 10) / 10,
      fatGrams: Math.round(food.fatGrams * 10) / 10,
      mealType: activeMealType,
      loggedAt: Date.now(),
      notes: sugarGrams > 0 ? `Sugar: ${Math.round(sugarGrams * 10) / 10}g` : undefined,
    });
    toast.success(`Added ${food.foodName} to ${activeMealType}`);
  };

  const openAddFood = (meal: MealType) => {
    setActiveMealType(meal);
    setShowAddFoodModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Macro Summary ── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 p-6">
        {/* Large circles: Calories + Protein */}
        <div className="flex justify-center gap-8 mb-5">
          <MacroCircle value={dailyTotals.calories} label="CALORIES" color="#4ade80" size="large" />
          <MacroCircle value={dailyTotals.protein} label="PROTEIN" unit="g" color="#fb923c" size="large" />
        </div>
        {/* Small circles: Carbs, Fat */}
        <div className="flex justify-center gap-6">
          <MacroCircle value={dailyTotals.carbs} label="CARBS" unit="g" color="#94a3b8" size="small" />
          <MacroCircle value={dailyTotals.fat} label="FAT" unit="g" color="#94a3b8" size="small" />
        </div>
        {/* Goal progress bar (if targets set) */}
        {targetTotals.calories > 0 && (
          <div className="mt-5 space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{Math.round(dailyTotals.calories)} cal logged</span>
              <span>{Math.round(targetTotals.calories)} cal goal</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (dailyTotals.calories / targetTotals.calories) * 100)}%`,
                  background: dailyTotals.calories > targetTotals.calories ? "#ef4444" : "#22d3ee",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Meal Sections ── */}
      {MEAL_SECTIONS.map(({ value: meal, label }) => {
        const foods = foodsByMeal[meal] || [];
        const calories = mealCalories[meal];

        return (
          <div key={meal} className="rounded-xl bg-slate-800/60 border border-white/10 overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="font-bold text-cyan-400 tracking-widest text-sm">{label}</span>
              <span className="text-slate-400 text-sm font-medium">
                {calories > 0 ? `${Math.round(calories)} Cal` : "0 Cal"}
              </span>
            </div>

            {/* Food items */}
            {foods.length > 0 && (
              <div className="divide-y divide-white/5">
                {foods.map((log: any) => (
                  <div key={log.id} className="px-4 py-3">
                    {editingId === log.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editValues[log.id]?.foodName || ""}
                          onChange={(e) =>
                            setEditValues({ ...editValues, [log.id]: { ...editValues[log.id], foodName: e.target.value } })
                          }
                          className="bg-white/10 border-white/20 text-sm"
                        />
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { key: "calories", label: "Cal", parser: parseInt },
                            { key: "proteinGrams", label: "Protein g", parser: parseFloat },
                            { key: "carbsGrams", label: "Carbs g", parser: parseFloat },
                            { key: "fatGrams", label: "Fat g", parser: parseFloat },
                          ].map(({ key, label: lbl, parser }) => (
                            <Input
                              key={key}
                              type="number"
                              placeholder={lbl}
                              value={editValues[log.id]?.[key] || ""}
                              onChange={(e) =>
                                setEditValues({ ...editValues, [log.id]: { ...editValues[log.id], [key]: parser(e.target.value) || 0 } })
                              }
                              className="bg-white/10 border-white/20 text-sm"
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleEditSave(log.id)} className="bg-green-600 hover:bg-green-700">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" onClick={() => { setEditingId(null); setEditValues({}); }} variant="outline">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-sm truncate">{log.foodName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {log.calories} cal &bull; {log.proteinGrams}g P &bull; {log.carbsGrams}g C &bull; {log.fatGrams}g F
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const isFav = favorites?.some(f => f.foodName === log.foodName);
                              if (isFav) {
                                const fav = favorites?.find(f => f.foodName === log.foodName);
                                if (fav) deleteFavoriteMutation.mutate({ favoriteFoodId: fav.id });
                              } else {
                                addFavoriteMutation.mutate({
                                  foodName: log.foodName,
                                  servingSize: log.servingSize || "1 serving",
                                  calories: log.calories,
                                  proteinGrams: log.proteinGrams,
                                  carbsGrams: log.carbsGrams,
                                  fatGrams: log.fatGrams,
                                });
                              }
                            }}
                            className={favorites?.some(f => f.foodName === log.foodName) ? "text-yellow-400 h-8 w-8 p-0" : "text-slate-500 hover:text-yellow-400 h-8 w-8 p-0"}
                          >
                            <Star className="h-3.5 w-3.5" fill={favorites?.some(f => f.foodName === log.foodName) ? "currentColor" : "none"} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditStart(log)}
                            className="text-slate-500 hover:text-white h-8 w-8 p-0"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteFoodLog.mutate({ foodLogId: log.id })}
                            className="text-slate-500 hover:text-red-400 h-8 w-8 p-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action bar */}
            <div className="grid grid-cols-2 border-t border-white/10">
              <button
                onClick={() => openAddFood(meal)}
                className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors border-r border-white/10"
              >
                <span className="text-slate-400">✏</span> Add Food
              </button>
              <button
                onClick={() => openAddFood(meal)}
                className="flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-cyan-700/60 hover:bg-cyan-600/70 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Food
              </button>
            </div>
          </div>
        );
      })}

      {/* Add Food Modal */}
      <AddFoodModal
        isOpen={showAddFoodModal}
        onClose={() => setShowAddFoodModal(false)}
        onFoodAdded={handleAddFoodFromModal}
        mealType={activeMealType}
      />
    </div>
  );
}
