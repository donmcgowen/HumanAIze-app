import { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Activity, Clock, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { WeightTracker } from "@/components/WeightTracker";
import { StepCounter } from "@/components/StepCounter";

const toPositiveNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string") { const p = Number(value); return Number.isFinite(p) && p > 0 ? p : null; }
  return null;
};

export default function Dashboard() {
  const {
    data: dashboard,
    isLoading,
    isError,
    refetch: refetchDashboard,
  } = trpc.health.dashboard.useQuery({ rangeDays: 14 });
  const { data: syncData } = trpc.sync.status.useQuery(undefined, { refetchInterval: 30000 });
  const { data: cgmInsights } = trpc.cgm.getInsights.useQuery();
  // Always fetch profile directly so macro targets are always in sync with Profile page
  const { data: userProfile } = trpc.profile.get.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Fetch today's food macros
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  const { data: todayFoodLogs } = trpc.food.getDayLogs.useQuery({
    startOfDay,
    endOfDay,
  });

  useEffect(() => {
    if (syncData?.lastSyncTime) {
      const lastSync = new Date(syncData.lastSyncTime);
      const now = new Date();
      const diffMs = now.getTime() - lastSync.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) {
        setLastSyncTime("Just now");
      } else if (diffMins < 60) {
        setLastSyncTime(`${diffMins}m ago`);
      } else {
        const diffHours = Math.floor(diffMins / 60);
        setLastSyncTime(`${diffHours}h ago`);
      }
    }
  }, [syncData]);

  const chart = dashboard?.chart ?? [];
  const sourcesByCategory = dashboard?.sourcesByCategory ?? {
    glucose: [],
    activity: [],
    sleep: [],
    nutrition: [],
  };

  // Calculate macro totals from today's food logs
  const macroTotals = todayFoodLogs?.reduce(
    (acc, log) => ({
      calories: acc.calories + (log.calories || 0),
      protein: acc.protein + (log.proteinGrams || 0),
      carbs: acc.carbs + (log.carbsGrams || 0),
      fat: acc.fat + (log.fatGrams || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  ) || { calories: 0, protein: 0, carbs: 0, fat: 0 };

  // Macro targets: always pull directly from user profile (same source as Profile page)
  // Fall back to defaults only if profile has not been saved yet
  const profileMacroTargets = {
    calories: toPositiveNumberOrNull(userProfile?.dailyCalorieTarget),
    protein: toPositiveNumberOrNull(userProfile?.dailyProteinTarget),
    carbs: toPositiveNumberOrNull(userProfile?.dailyCarbsTarget),
    fat: toPositiveNumberOrNull(userProfile?.dailyFatTarget),
  };
  const macroTargets = {
    calories: profileMacroTargets.calories ?? 2000,
    protein: profileMacroTargets.protein ?? 150,
    carbs: profileMacroTargets.carbs ?? 200,
    fat: profileMacroTargets.fat ?? 65,
  };
  const hasAnyProfileMacroTarget =
    profileMacroTargets.calories !== null ||
    profileMacroTargets.protein !== null ||
    profileMacroTargets.carbs !== null ||
    profileMacroTargets.fat !== null;
  const missingMacroTargets: string[] = [];
  if (profileMacroTargets.calories === null) missingMacroTargets.push("calories");
  if (profileMacroTargets.protein === null) missingMacroTargets.push("protein");
  if (profileMacroTargets.carbs === null) missingMacroTargets.push("carbs");
  if (profileMacroTargets.fat === null) missingMacroTargets.push("fat");

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

      {/* Weight Progress */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Weight Progress</h2>
        <WeightTracker />
      </div>

      {/* AI Dexcom/Clarity Insights */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">AI Dexcom/Clarity Insights</p>
          {cgmInsights && cgmInsights.length > 0 ? (
            <div className="space-y-2">
              {cgmInsights.slice(0, 2).map((insight, idx) => (
                <div key={`${insight.title}-${idx}`} className="rounded bg-slate-800 p-3">
                  <p className="text-sm font-semibold text-cyan-300">{insight.title}</p>
                  <p className="text-xs text-slate-300 mt-1">{insight.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Import Dexcom Clarity CSV/PDF to generate AI glucose insights here.</p>
          )}
      </div>

      {/* Daily Macro Target */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Daily Macro Target</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
        {!hasAnyProfileMacroTarget && (
          <p className="text-xs text-slate-500">Using default targets (2000/150/200/65). Update your profile to personalize.</p>
        )}
        {hasAnyProfileMacroTarget && missingMacroTargets.length > 0 && (
          <p className="text-xs text-slate-500">
            Some profile targets are missing ({missingMacroTargets.join(", ")}), so defaults are used for those only.
          </p>
        )}
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

      {/* Connected Sources */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Glucose Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.glucose.length > 0 ? (
              sourcesByCategory.glucose.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Activity Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.activity.length > 0 ? (
              sourcesByCategory.activity.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Sleep Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.sleep.length > 0 ? (
              sourcesByCategory.sleep.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Nutrition Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.nutrition.length > 0 ? (
              sourcesByCategory.nutrition.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
