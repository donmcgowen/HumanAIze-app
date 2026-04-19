import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Check, X, Loader2, Star, ChevronLeft, ChevronRight, Calendar, Sparkles, RefreshCw } from "lucide-react";
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

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return a YYYY-MM-DD string for a Date in local time */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string to a local-midnight Date */
function fromLocalDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Start-of-day timestamp (local midnight) for a given Date */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/** End-of-day timestamp (local 23:59:59.999) for a given Date */
function endOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** Format a Date for display, e.g. "Today", "Yesterday", or "Mon, Apr 14" */
function formatDateLabel(d: Date): string {
  const todayStr = toLocalDateStr(new Date());
  const dStr = toLocalDateStr(d);
  if (dStr === todayStr) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dStr === toLocalDateStr(yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ── MacroCircle ───────────────────────────────────────────────────────────────

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
          isLarge ? "w-32 h-32 border-white/20" : "w-[68px] h-[68px] border-white/15"
        }`}
      >
        <span className={`font-bold leading-none ${isLarge ? "text-4xl" : "text-xl"}`} style={{ color }}>
          {Math.round(value)}
        </span>
        {unit && <span className={`text-slate-400 mt-0.5 ${isLarge ? "text-sm" : "text-xs"}`}>{unit}</span>}
      </div>
      <span className={`font-semibold tracking-widest text-slate-300 ${isLarge ? "text-xs" : "text-[10px]"}`}>
        {label}
      </span>
    </div>
  );
}

// ── FoodLogger ────────────────────────────────────────────────────────────────

export function FoodLogger() {
  // ── Date state (defaults to today) ──
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => toLocalDateStr(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);

  const selectedDate = useMemo(() => fromLocalDateStr(selectedDateStr), [selectedDateStr]);
  const isToday = selectedDateStr === toLocalDateStr(new Date());

  const dayStart = useMemo(() => startOfLocalDay(selectedDate), [selectedDate]);
  const dayEnd = useMemo(() => endOfLocalDay(selectedDate), [selectedDate]);

  // ── Other state ──
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [editValues, setEditValues] = useState<Record<number, any>>({});
  const [showAddFoodModal, setShowAddFoodModal] = useState(false);
  const [activeMealType, setActiveMealType] = useState<MealType>("breakfast");

  // ── Queries ──
  const { data: foodLogs, isLoading, refetch } = trpc.food.getDayLogs.useQuery({
    startOfDay: dayStart,
    endOfDay: dayEnd,
  });

  const { data: userProfile } = trpc.profile.get.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: favorites, refetch: refetchFavorites } = trpc.food.getFavorites.useQuery();

  // ── AI Meal Suggestions ──
  const {
    data: aiSuggestions,
    isLoading: aiLoading,
    refetch: refetchAI,
  } = trpc.food.getAIMealSuggestions.useQuery(
    { startOfDay: dayStart, endOfDay: dayEnd },
    { enabled: showAISuggestions, staleTime: 5 * 60 * 1000 }
  );

  const toPositiveNumberOrNull = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  };

  const targetCalories = toPositiveNumberOrNull(userProfile?.dailyCalorieTarget) ?? 0;

  // ── Mutations ──
  const addFoodLog = trpc.food.addLog.useMutation({
    onSuccess: () => { refetch(); toast.success("Food logged successfully"); },
    onError: () => toast.error("Failed to log food"),
  });

  const deleteFoodLog = trpc.food.deleteLog.useMutation({
    onSuccess: () => { refetch(); toast.success("Food removed"); },
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

  // ── Computed values ──
  const dailyTotals = useMemo(() => {
    if (!foodLogs) return { protein: 0, carbs: 0, fat: 0, calories: 0, sugar: 0 };
    return foodLogs.reduce(
      (acc: any, log: any) => {
        let sugar = 0;
        if (log.notes) {
          const match = log.notes.match(/Sugar:\s*([\d.]+)g/i);
          if (match) sugar = parseFloat(match[1]) || 0;
        }
        return {
          protein: acc.protein + (log.proteinGrams || 0),
          carbs: acc.carbs + (log.carbsGrams || 0),
          fat: acc.fat + (log.fatGrams || 0),
          calories: acc.calories + (log.calories || 0),
          sugar: acc.sugar + sugar,
        };
      },
      { protein: 0, carbs: 0, fat: 0, calories: 0, sugar: 0 }
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

  // ── Date navigation ──
  const goToPrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDateStr(toLocalDateStr(d));
  };

  const goToNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    // Don't allow navigating into the future
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d < tomorrow) setSelectedDateStr(toLocalDateStr(d));
  };

  const goToToday = () => setSelectedDateStr(toLocalDateStr(new Date()));

  // ── Handlers ──
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
    // Use noon of the selected date as the loggedAt timestamp
    const loggedAt = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0, 0).getTime();
    addFoodLog.mutate({
      foodName: food.foodName,
      servingSize: food.servingSize,
      calories: Math.round(food.calories),
      proteinGrams: Math.round(food.proteinGrams * 10) / 10,
      carbsGrams: Math.round(food.carbsGrams * 10) / 10,
      fatGrams: Math.round(food.fatGrams * 10) / 10,
      mealType: activeMealType,
      loggedAt,
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

      {/* ── Date Navigator ── */}
      <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/60 border border-white/10 px-4 py-3">
        {/* Prev button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrevDay}
          className="text-slate-300 hover:text-white hover:bg-white/10 h-9 w-9 p-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        {/* Date display + calendar picker */}
        <div className="flex items-center gap-2 flex-1 justify-center relative">
          <span className="text-white font-semibold text-base">{formatDateLabel(selectedDate)}</span>
          <span className="text-slate-400 text-sm hidden sm:inline">
            {isToday ? "" : `· ${selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
          </span>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="text-slate-400 hover:text-cyan-400 transition-colors ml-1"
            title="Pick a date"
          >
            <Calendar className="h-4 w-4" />
          </button>

          {/* Calendar dropdown */}
          {showCalendar && (
            <div className="absolute top-full mt-2 z-50 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
              <input
                type="date"
                value={selectedDateStr}
                max={toLocalDateStr(new Date())}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDateStr(e.target.value);
                    setShowCalendar(false);
                  }
                }}
                className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>
          )}
        </div>

        {/* Next button (disabled if today) */}
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNextDay}
          disabled={isToday}
          className="text-slate-300 hover:text-white hover:bg-white/10 h-9 w-9 p-0 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* "Jump to Today" pill — only shown when viewing a past date */}
      {!isToday && (
        <button
          onClick={goToToday}
          className="w-full text-center text-xs text-cyan-400 hover:text-cyan-300 py-1 transition-colors"
        >
          ← Back to Today
        </button>
      )}

      {/* ── Macro Summary ── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 p-6">
        {/* Large Calories circle centered */}
        <div className="flex justify-center mb-5">
          <MacroCircle value={dailyTotals.calories} label="CALORIES" color="#4ade80" size="large" />
        </div>

        {/* 4 smaller circles: Protein, Carbs, Fat, Sugar */}
        <div className="flex justify-center gap-4">
          <MacroCircle value={dailyTotals.protein} label="PROTEIN" unit="g" color="#fb923c" size="small" />
          <MacroCircle value={dailyTotals.carbs} label="CARBS" unit="g" color="#94a3b8" size="small" />
          <MacroCircle value={dailyTotals.fat} label="FAT" unit="g" color="#94a3b8" size="small" />
          <MacroCircle value={dailyTotals.sugar} label="SUGAR" unit="g" color="#f472b6" size="small" />
        </div>

        {/* Goal progress bar */}
        {targetCalories > 0 && (
          <div className="mt-5 space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{Math.round(dailyTotals.calories)} cal logged</span>
              <span>{Math.round(targetCalories)} cal goal</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (dailyTotals.calories / targetCalories) * 100)}%`,
                  background: dailyTotals.calories > targetCalories ? "#ef4444" : "#22d3ee",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── AI Meal Suggestions ── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="font-bold text-purple-300 tracking-widest text-sm">AI MEAL SUGGESTIONS</span>
          </div>
          <button
            onClick={() => {
              if (!showAISuggestions) {
                setShowAISuggestions(true);
              } else {
                refetchAI();
              }
            }}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 hover:text-purple-200 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {aiLoading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...</>
            ) : showAISuggestions && aiSuggestions ? (
              <><RefreshCw className="h-3.5 w-3.5" /> Refresh</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Get Suggestions</>
            )}
          </button>
        </div>

        {!showAISuggestions && (
          <div className="px-4 py-5 text-center">
            <p className="text-slate-400 text-sm">Get personalized meal suggestions based on your remaining macros, glucose levels, weight progress, and health goals.</p>
          </div>
        )}

        {showAISuggestions && aiLoading && (
          <div className="px-4 py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            <p className="text-slate-400 text-sm">Analyzing your nutrition data and goals...</p>
          </div>
        )}

        {showAISuggestions && !aiLoading && aiSuggestions && aiSuggestions.length === 0 && (
          <div className="px-4 py-5 text-center">
            <p className="text-slate-400 text-sm">No suggestions available. Try logging some foods first or check your profile targets.</p>
          </div>
        )}

        {showAISuggestions && !aiLoading && aiSuggestions && aiSuggestions.length > 0 && (
          <div className="divide-y divide-white/5">
            {(aiSuggestions as any[]).map((s: any, i: number) => (
              <div key={i} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm">{s.name}</div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{s.description}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-600/30 text-purple-300 border border-purple-500/30">
                    {s.mealType}
                  </span>
                </div>
                <div className="flex gap-3 mt-2">
                  <span className="text-xs text-green-400 font-medium">{Math.round(s.calories)} cal</span>
                  <span className="text-xs text-orange-400">{Math.round(s.protein)}g P</span>
                  <span className="text-xs text-slate-400">{Math.round(s.carbs)}g C</span>
                  <span className="text-xs text-slate-400">{Math.round(s.fat)}g F</span>
                </div>
              </div>
            ))}
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
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditValues({}); }}>
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

            {/* Add Food button */}
            <button
              onClick={() => openAddFood(meal)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-cyan-700/60 hover:bg-cyan-600/70 transition-colors border-t border-white/10"
            >
              <Plus className="h-4 w-4" /> Add Food
            </button>
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
