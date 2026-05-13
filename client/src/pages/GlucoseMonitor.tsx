import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Droplets, Trash2, Loader2, Brain, TrendingUp, TrendingDown, Minus,
  Utensils, Plus,
} from "lucide-react";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function todayEnd(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function glucoseColor(mgdl: number): string {
  if (mgdl < 70) return "text-red-400";
  if (mgdl <= 180) return "text-green-400";
  return "text-orange-400";
}
function glucoseBgColor(mgdl: number): string {
  if (mgdl < 70) return "bg-red-500/10 border-red-500/30";
  if (mgdl <= 180) return "bg-green-500/10 border-green-500/30";
  return "bg-orange-500/10 border-orange-500/30";
}
function glucoseLabel(mgdl: number): string {
  if (mgdl < 70) return "Low";
  if (mgdl <= 140) return "Normal";
  if (mgdl <= 180) return "Elevated";
  return "High";
}

const MEAL_SECTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

export function GlucoseMonitor() {
  const utils = trpc.useUtils();
  const dayStart = useMemo(() => todayStart(), []);
  const dayEnd = useMemo(() => todayEnd(), []);

  const { data: entries, isLoading: entriesLoading } = trpc.manualGlucose.getTodayEntries.useQuery({ dayStart });
  const { data: aiInsight, isLoading: aiLoading, refetch: refetchAI } =
    trpc.manualGlucose.analyzeMealPatterns.useQuery(
      { dayStart, dayEnd },
      { enabled: !!entries && entries.length > 0, staleTime: 60_000, retry: false }
    );

  const [mgdl, setMgdl] = useState("");
  const [mealContext, setMealContext] = useState<MealType | "">("");
  const [notes, setNotes] = useState("");

  const addMutation = trpc.manualGlucose.addEntry.useMutation({
    onSuccess: () => {
      setMgdl("");
      setNotes("");
      toast.success("Glucose reading saved");
      utils.manualGlucose.getTodayEntries.invalidate();
      utils.manualGlucose.analyzeMealPatterns.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to save reading"),
  });

  const deleteMutation = trpc.manualGlucose.deleteEntry.useMutation({
    onSuccess: () => {
      toast.success("Reading deleted");
      utils.manualGlucose.getTodayEntries.invalidate();
      utils.manualGlucose.analyzeMealPatterns.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete reading"),
  });

  const handleAdd = () => {
    const val = parseInt(mgdl, 10);
    if (!val || val < 40 || val > 600) { toast.error("Enter a valid glucose reading (40–600 mg/dL)"); return; }
    addMutation.mutate({
      mgdl: val,
      readingAt: Date.now(),
      notes: notes.trim() || undefined,
      mealContext: mealContext || undefined,
    });
  };

  const stats = useMemo(() => {
    if (!entries || entries.length === 0) return null;
    const values = entries.map((e: any) => e.mgdl as number);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const inRange = values.filter(v => v >= 70 && v <= 180).length;
    const pctInRange = Math.round((inRange / values.length) * 100);
    return { avg, min, max, pctInRange, count: values.length };
  }, [entries]);

  const entriesByMeal = useMemo(() => {
    if (!entries) return {} as Record<string, any[]>;
    const grouped: Record<string, any[]> = {};
    for (const e of entries as any[]) {
      const key = e.mealContext || "other";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }
    return grouped;
  }, [entries]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Droplets className="h-8 w-8 text-cyan-400" />
            Glucose Monitor
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Track and analyze your blood glucose in relation to meals</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold ${glucoseColor(stats.avg)}`}>{stats.avg}</div>
              <div className="text-xs text-slate-400 mt-0.5">Avg mg/dL</div>
            </div>
            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold ${glucoseColor(stats.min)}`}>{stats.min}</div>
              <div className="text-xs text-slate-400 mt-0.5">Low</div>
            </div>
            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold ${glucoseColor(stats.max)}`}>{stats.max}</div>
              <div className="text-xs text-slate-400 mt-0.5">High</div>
            </div>
            <div className={`rounded-xl p-3 text-center border ${stats.pctInRange >= 70 ? "bg-green-500/10 border-green-500/30" : "bg-orange-500/10 border-orange-500/30"}`}>
              <div className={`text-2xl font-bold ${stats.pctInRange >= 70 ? "text-green-400" : "text-orange-400"}`}>{stats.pctInRange}%</div>
              <div className="text-xs text-slate-400 mt-0.5">In Range</div>
            </div>
          </div>
        )}

        {/* Add Reading */}
        <Card className="border border-white/10 bg-slate-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-cyan-400" />
              Log a Reading
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs text-slate-400 mb-1 block">mg/dL *</label>
                <Input
                  type="number"
                  placeholder="e.g. 120"
                  value={mgdl}
                  onChange={(e) => setMgdl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  className="h-9 bg-slate-800/60 border-white/15 text-white placeholder:text-slate-600 text-sm"
                  min={40}
                  max={600}
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-xs text-slate-400 mb-1 block">Meal</label>
                <select
                  value={mealContext}
                  onChange={(e) => setMealContext(e.target.value as MealType | "")}
                  className="w-full h-9 rounded-md bg-slate-800/60 border border-white/15 text-sm text-white px-2 focus:outline-none"
                >
                  <option value="">— none —</option>
                  {MEAL_SECTIONS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-[2] min-w-[140px]">
                <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
                <Input
                  placeholder="e.g. fasting, post-meal..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-9 bg-slate-800/60 border-white/15 text-white placeholder:text-slate-600 text-sm"
                />
              </div>
              <Button
                onClick={handleAdd}
                disabled={!mgdl || addMutation.isPending}
                className="h-9 bg-cyan-600 hover:bg-cyan-500 text-white text-sm px-4"
              >
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Today's Readings */}
        <Card className="border border-white/10 bg-slate-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Droplets className="h-4 w-4 text-cyan-400" />
              Today's Readings
              {stats && <span className="text-slate-400 font-normal text-sm ml-1">({stats.count} total)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entriesLoading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
              </div>
            )}
            {!entriesLoading && (!entries || entries.length === 0) && (
              <p className="text-slate-500 text-sm text-center py-4">No readings logged today. Use the form above or the pre-meal glucose input in Food Logging.</p>
            )}

            {/* Meal-grouped readings */}
            {MEAL_SECTIONS.map(({ value, label }) => {
              const mealEntries = entriesByMeal[value];
              if (!mealEntries || mealEntries.length === 0) return null;
              return (
                <div key={value} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Utensils className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                  </div>
                  <div className="space-y-2">
                    {mealEntries.map((e: any) => (
                      <div key={e.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${glucoseBgColor(e.mgdl)}`}>
                        <div className="flex items-center gap-3">
                          <div className={`text-lg font-bold ${glucoseColor(e.mgdl)}`}>{e.mgdl}</div>
                          <div>
                            <span className={`text-xs font-semibold ${glucoseColor(e.mgdl)}`}>{glucoseLabel(e.mgdl)}</span>
                            {e.notes && <span className="text-xs text-slate-400 ml-2">{e.notes}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{formatTime(e.readingAt)}</span>
                          <button
                            onClick={() => deleteMutation.mutate({ entryId: e.id })}
                            disabled={deleteMutation.isPending}
                            className="text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Ungrouped readings (no meal context) */}
            {entriesByMeal["other"] && entriesByMeal["other"].length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Other</span>
                </div>
                <div className="space-y-2">
                  {entriesByMeal["other"].map((e: any) => (
                    <div key={e.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${glucoseBgColor(e.mgdl)}`}>
                      <div className="flex items-center gap-3">
                        <div className={`text-lg font-bold ${glucoseColor(e.mgdl)}`}>{e.mgdl}</div>
                        <div>
                          <span className={`text-xs font-semibold ${glucoseColor(e.mgdl)}`}>{glucoseLabel(e.mgdl)}</span>
                          {e.notes && <span className="text-xs text-slate-400 ml-2">{e.notes}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{formatTime(e.readingAt)}</span>
                        <button
                          onClick={() => deleteMutation.mutate({ entryId: e.id })}
                          disabled={deleteMutation.isPending}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Analysis */}
        {entries && entries.length > 0 && (
          <Card className="border border-cyan-500/30 bg-cyan-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-cyan-400" />
                  AI Food + Glucose Analysis
                </div>
                <button
                  onClick={() => { utils.manualGlucose.analyzeMealPatterns.invalidate(); refetchAI(); }}
                  className="text-xs text-cyan-400 hover:text-cyan-200 transition-colors"
                >
                  Refresh
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiLoading && (
                <div className="flex items-center gap-3 text-slate-400 text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  Analyzing your food and glucose patterns...
                </div>
              )}
              {!aiLoading && aiInsight && (
                <p className="text-slate-300 text-sm leading-relaxed">{aiInsight}</p>
              )}
              {!aiLoading && !aiInsight && (
                <div className="text-slate-500 text-sm py-2 space-y-1">
                  <p>Log food in <strong className="text-slate-400">Food Logging</strong> and tag your pre-meal glucose readings to enable AI correlation analysis.</p>
                  <p className="text-xs text-slate-600">The AI compares what you eat with your glucose readings to identify patterns and suggest improvements.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Target range legend */}
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 pb-4">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Below 70 — Low</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />70–180 — In Range</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Above 180 — High</div>
        </div>
      </div>
    </div>
  );
}
