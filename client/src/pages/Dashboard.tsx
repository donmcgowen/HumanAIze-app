import { useEffect, useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Zap, RefreshCw, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { StepCounter } from "@/components/StepCounter";

const toPositiveNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string") { const p = Number(value); return Number.isFinite(p) && p > 0 ? p : null; }
  return null;
};

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

export default function Dashboard() {
  const {
    data: dashboard,
    isLoading,
    isError,
    refetch: refetchDashboard,
  } = trpc.health.dashboard.useQuery({ rangeDays: 14 });
  const { data: syncData } = trpc.sync.status.useQuery(undefined, { refetchInterval: 30000 });
  const { data: userProfile } = trpc.profile.get.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Fetch today's food logs
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  const { data: todayFoodLogs } = trpc.food.getDayLogs.useQuery({ startOfDay, endOfDay });

  useEffect(() => {
    if (syncData?.lastSyncTime) {
      const lastSync = new Date(syncData.lastSyncTime);
      const now = new Date();
      const diffMs = now.getTime() - lastSync.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) setLastSyncTime("Just now");
      else if (diffMins < 60) setLastSyncTime(`${diffMins}m ago`);
      else setLastSyncTime(`${Math.floor(diffMins / 60)}h ago`);
    }
  }, [syncData]);

  const chart = dashboard?.chart ?? [];

  // Calculate macro totals from today's food logs
  const macroTotals = useMemo(() => {
    if (!todayFoodLogs) return { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 };
    return todayFoodLogs.reduce(
      (acc: any, log: any) => {
        let sugar = 0;
        if (log.notes) {
          const match = log.notes.match(/Sugar:\s*([\d.]+)g/i);
          if (match) sugar = parseFloat(match[1]) || 0;
        }
        return {
          calories: acc.calories + (log.calories || 0),
          protein: acc.protein + (log.proteinGrams || 0),
          carbs: acc.carbs + (log.carbsGrams || 0),
          fat: acc.fat + (log.fatGrams || 0),
          sugar: acc.sugar + sugar,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 }
    );
  }, [todayFoodLogs]);

  // Macro targets from profile
  const profileMacroTargets = {
    calories: toPositiveNumberOrNull(userProfile?.dailyCalorieTarget),
    protein: toPositiveNumberOrNull(userProfile?.dailyProteinTarget),
    carbs: toPositiveNumberOrNull(userProfile?.dailyCarbsTarget),
    fat: toPositiveNumberOrNull(userProfile?.dailyFatTarget),
  };
  const macroTargets = {
    calories: profileMacroTargets.calories ?? 0,
    protein: profileMacroTargets.protein ?? 0,
    carbs: profileMacroTargets.carbs ?? 0,
    fat: profileMacroTargets.fat ?? 0,
  };
  const hasAnyProfileMacroTarget =
    profileMacroTargets.calories !== null ||
    profileMacroTargets.protein !== null ||
    profileMacroTargets.carbs !== null ||
    profileMacroTargets.fat !== null;

  const macrosRemaining = {
    calories: Math.max(0, Math.round(macroTargets.calories - macroTotals.calories)),
    protein: Math.max(0, Math.round(macroTargets.protein - macroTotals.protein)),
    carbs: Math.max(0, Math.round(macroTargets.carbs - macroTotals.carbs)),
    fat: Math.max(0, Math.round(macroTargets.fat - macroTotals.fat)),
  };

  return (
    <div className="space-y-8 p-6 w-full max-w-full">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-400">
          Unified glucose, activity, nutrition, and sleep metrics from your connected sources.
        </p>
        {(isLoading || isError || !dashboard) && (
          <div className="flex flex-wrap items-center gap-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <span>
              {isLoading
                ? "Loading dashboard data. Core cards are still shown."
                : "Dashboard data is temporarily unavailable. Core cards are still shown."}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetchDashboard()}
              className="border-amber-300/40 text-amber-100 hover:bg-amber-400/20"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        )}
        {lastSyncTime && (
          <p className="text-sm text-slate-500">Last sync: {lastSyncTime}</p>
        )}
      </div>

      {/* ── TODAY'S FOOD LOG (TOP) ── */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Utensils className="w-5 h-5 text-cyan-400" />
          Today's Food Log
        </h2>

        {/* Macro Summary Circles */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 p-6">
          <div className="flex justify-center mb-5">
            <MacroCircle value={macroTotals.calories} label="CALORIES" color="#4ade80" size="large" />
          </div>
          <div className="flex justify-center gap-4">
            <MacroCircle value={macroTotals.protein} label="PROTEIN" unit="g" color="#fb923c" size="small" />
            <MacroCircle value={macroTotals.carbs} label="CARBS" unit="g" color="#94a3b8" size="small" />
            <MacroCircle value={macroTotals.fat} label="FAT" unit="g" color="#94a3b8" size="small" />
            <MacroCircle value={macroTotals.sugar} label="SUGAR" unit="g" color="#f472b6" size="small" />
          </div>
          {macroTargets.calories > 0 && (
            <div className="mt-5 space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>{Math.round(macroTotals.calories)} cal logged</span>
                <span>{macroTargets.calories} cal goal</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (macroTotals.calories / macroTargets.calories) * 100)}%`,
                    background: macroTotals.calories > macroTargets.calories ? "#ef4444" : "#22d3ee",
                  }}
                />
              </div>
            </div>
          )}
          {!hasAnyProfileMacroTarget && (
            <p className="text-xs text-slate-500 mt-3 text-center">No targets set. Save your profile to personalize your daily macro targets.</p>
          )}
        </div>

        {/* Macro Target Breakdown */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Calories</div>
            <div className="text-2xl font-bold text-orange-400">{Math.round(macroTotals.calories)} / {macroTargets.calories}</div>
            <div className="text-xs text-slate-500 mt-1">{macrosRemaining.calories} kcal remaining</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Protein</div>
            <div className="text-2xl font-bold text-blue-400">{Math.round(macroTotals.protein)}g / {macroTargets.protein}g</div>
            <div className="text-xs text-slate-500 mt-1">{macrosRemaining.protein} g remaining</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Carbs</div>
            <div className="text-2xl font-bold text-green-400">{Math.round(macroTotals.carbs)}g / {macroTargets.carbs}g</div>
            <div className="text-xs text-slate-500 mt-1">{macrosRemaining.carbs} g remaining</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Fat</div>
            <div className="text-2xl font-bold text-yellow-400">{Math.round(macroTotals.fat)}g / {macroTargets.fat}g</div>
            <div className="text-xs text-slate-500 mt-1">{macrosRemaining.fat} g remaining</div>
          </div>
        </div>

      </div>

      {/* Steps */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Step Counter</h2>
        <StepCounter />
      </div>

      {/* Chart */}
      {chart && chart.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">14-Day Glucose Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="glucose"
                stroke="#3b82f6"
                dot={false}
                name="Glucose (mg/dL)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}


    </div>
  );
}
