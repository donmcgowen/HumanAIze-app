import { useMemo, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2, Trash2, Plus, Mic, MicOff, Sparkles,
  ChevronLeft, ChevronRight, Calendar, X, Dumbbell, Activity,
  Timer, Flame, TrendingUp, History, BarChart3, ChevronDown, ChevronUp,
  Play, CheckCircle, AlertCircle, Info, RotateCcw, Zap,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkoutIntensity = "light" | "moderate" | "intense";

type WorkoutType = "strength" | "cardio" | "hiit" | "flexibility" | "full_body" | "upper_body" | "lower_body" | "core";

type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
declare global { interface Window { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike; } }

interface AIExercise {
  name: string; sets?: number; reps?: string; weight?: string;
  durationSecs?: number; restSecs?: number; muscleGroup: string;
  instructions: string; modifications?: string;
}
interface AISection { name: string; durationMins: number; exercises: AIExercise[]; notes?: string; }
interface AIWorkoutPlan {
  title: string; overview: string; totalDurationMins: number;
  difficulty: "beginner" | "intermediate" | "advanced"; focusArea: string;
  estimatedCalories: number; sections: AISection[];
  weeklySchedule?: string; safetyNotes?: string[]; progressionTips?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function localDayBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return { start, end: start + 86400000 };
}
function formatDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function intensityColor(intensity: string) {
  if (intensity === "light") return "text-green-400 bg-green-500/15 border-green-500/30";
  if (intensity === "intense") return "text-red-400 bg-red-500/15 border-red-500/30";
  return "text-yellow-400 bg-yellow-500/15 border-yellow-500/30";
}
function difficultyColor(d: string) {
  if (d === "beginner") return "text-green-400";
  if (d === "advanced") return "text-red-400";
  return "text-yellow-400";
}

const WORKOUT_TYPES: { value: WorkoutType; label: string; icon: string }[] = [
  { value: "full_body", label: "Full Body", icon: "🏋️" },
  { value: "upper_body", label: "Upper Body", icon: "💪" },
  { value: "lower_body", label: "Lower Body", icon: "🦵" },
  { value: "strength", label: "Strength", icon: "🔱" },
  { value: "cardio", label: "Cardio", icon: "🏃" },
  { value: "hiit", label: "HIIT", icon: "⚡" },
  { value: "core", label: "Core", icon: "🎯" },
  { value: "flexibility", label: "Flexibility", icon: "🧘" },
];

const EXERCISE_TYPES = [
  "Cardio", "Strength", "Flexibility", "HIIT", "Sports", "Walking", "Other",
];

// ─── AI Workout Plan Display ──────────────────────────────────────────────────

function AIWorkoutPlanView({
  plan, onLogWorkout, onClose,
}: { plan: AIWorkoutPlan; onLogWorkout: (name: string, type: string, mins: number, intensity: WorkoutIntensity, cals: number) => void; onClose: () => void }) {
  const [expandedSection, setExpandedSection] = useState<number | null>(0);
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());

  const toggleExercise = (key: string) => {
    setCompletedExercises(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const totalExercises = plan.sections.flatMap(s => s.exercises).length;
  const completedCount = completedExercises.size;
  const progressPct = totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Plan header */}
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-white">{plan.title}</h3>
            <p className="text-sm text-slate-300 mt-1">{plan.overview}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${difficultyColor(plan.difficulty)} bg-transparent border-current`}>
            {plan.difficulty}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{plan.totalDurationMins} min</span>
          <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-orange-400" />{plan.estimatedCalories} cal</span>
          <span className="flex items-center gap-1"><Dumbbell className="h-3 w-3 text-cyan-400" />{plan.focusArea}</span>
        </div>
        {/* Progress bar */}
        {completedCount > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{completedCount}/{totalExercises} exercises done</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Nutrition note */}
      {(plan as any).nutritionNote && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 flex gap-2">
          <Zap className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-green-400 mb-1">Pre-Workout Nutrition</p>
            <p className="text-xs text-slate-300">{(plan as any).nutritionNote}</p>
          </div>
        </div>
      )}

      {/* Safety notes */}
      {plan.safetyNotes && plan.safetyNotes.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-yellow-400 mb-1">Safety Notes</p>
            {plan.safetyNotes.map((note, i) => (
              <p key={i} className="text-xs text-slate-300">• {note}</p>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {plan.sections.map((section, si) => (
        <div key={si} className="rounded-xl border border-white/10 bg-slate-900 overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            onClick={() => setExpandedSection(expandedSection === si ? null : si)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                si === 0 ? "bg-green-500/20 text-green-400" :
                si === plan.sections.length - 1 ? "bg-blue-500/20 text-blue-400" :
                "bg-cyan-500/20 text-cyan-400"
              }`}>
                {si + 1}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">{section.name}</p>
                <p className="text-xs text-slate-400">{section.durationMins} min • {section.exercises.length} exercises</p>
              </div>
            </div>
            {expandedSection === si ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>

          {expandedSection === si && (
            <div className="border-t border-white/10 divide-y divide-white/5">
              {section.notes && (
                <div className="px-4 py-2 bg-slate-800/50">
                  <p className="text-xs text-slate-400 italic">{section.notes}</p>
                </div>
              )}
              {section.exercises.map((ex, ei) => {
                const key = `${si}-${ei}`;
                const done = completedExercises.has(key);
                return (
                  <div
                    key={ei}
                    className={`p-4 flex gap-3 cursor-pointer transition-colors ${done ? "bg-green-500/5" : "hover:bg-white/3"}`}
                    onClick={() => toggleExercise(key)}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      done ? "bg-green-500 border-green-500" : "border-slate-600"
                    }`}>
                      {done && <CheckCircle className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-white"}`}>{ex.name}</p>
                        <div className="text-right text-xs text-slate-400 whitespace-nowrap shrink-0">
                          {ex.sets && ex.reps && <span className="text-cyan-300 font-semibold">{ex.sets} × {ex.reps}</span>}
                          {ex.durationSecs && !ex.sets && <span className="text-cyan-300 font-semibold">{ex.durationSecs}s</span>}
                          {ex.restSecs && <span className="ml-1 text-slate-500">rest {ex.restSecs}s</span>}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{ex.muscleGroup}</p>
                      {ex.weight && <p className="text-xs text-yellow-400/80 mt-0.5">Weight: {ex.weight}</p>}
                      <p className="text-xs text-slate-400 mt-1">{ex.instructions}</p>
                      {ex.modifications && (
                        <p className="text-xs text-blue-400/80 mt-1 flex items-start gap-1">
                          <Info className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>Modification: {ex.modifications}</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Progression tips */}
      {plan.progressionTips && plan.progressionTips.length > 0 && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 flex gap-2">
          <TrendingUp className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-purple-400 mb-1">Progression Tips</p>
            {plan.progressionTips.map((tip, i) => (
              <p key={i} className="text-xs text-slate-300">• {tip}</p>
            ))}
          </div>
        </div>
      )}

      {plan.weeklySchedule && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Calendar className="h-3 w-3" /> {plan.weeklySchedule}
        </p>
      )}

      {/* Log button */}
      <Button
        onClick={() => {
          const type = plan.focusArea.toLowerCase().includes("cardio") ? "Cardio" : "Strength";
          onLogWorkout(plan.title, type, plan.totalDurationMins, "moderate", plan.estimatedCalories);
          onClose();
        }}
        className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
      >
        <CheckCircle className="h-4 w-4 mr-2" />
        Log This Workout as Completed
      </Button>
    </div>
  );
}

// ─── AI Workout Generator Panel ───────────────────────────────────────────────

function AIWorkoutGenerator({ onLogWorkout }: {
  onLogWorkout: (name: string, type: string, mins: number, intensity: WorkoutIntensity, cals: number) => void;
}) {
  const [workoutType, setWorkoutType] = useState<WorkoutType>("full_body");
  const [durationMins, setDurationMins] = useState(45);
  const [intensity, setIntensity] = useState<WorkoutIntensity>("moderate");
  const [customRequest, setCustomRequest] = useState("");
  const [plan, setPlan] = useState<AIWorkoutPlan | null>(null);

  const generateMutation = trpc.workouts.getAIWorkoutPlan.useMutation({
    onSuccess: (data) => setPlan(data as AIWorkoutPlan),
    onError: (err) => toast.error(err.message || "Failed to generate workout plan"),
  });

  const handleGenerate = () => {
    setPlan(null);
    generateMutation.mutate({ workoutType, durationMins, intensity, customRequest: customRequest || undefined });
  };

  if (plan) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" /> AI Workout Plan
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPlan(null)}
            className="text-slate-400 hover:text-white text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" /> New Plan
          </Button>
        </div>
        <AIWorkoutPlanView
          plan={plan}
          onLogWorkout={onLogWorkout}
          onClose={() => setPlan(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">AI Workout Planner</h3>
          <p className="text-xs text-slate-400">Gemini generates a personalized plan using your age, weight, goals & health data</p>
        </div>
      </div>

      {/* Workout type grid */}
      <div>
        <Label className="text-xs text-slate-400 uppercase tracking-wide mb-2 block">Workout Type</Label>
        <div className="grid grid-cols-4 gap-2">
          {WORKOUT_TYPES.map((wt) => (
            <button
              key={wt.value}
              onClick={() => setWorkoutType(wt.value)}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                workoutType === wt.value
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                  : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              <span className="text-base">{wt.icon}</span>
              <span>{wt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Duration + Intensity */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-slate-400 uppercase tracking-wide mb-2 block">Duration</Label>
          <div className="flex gap-2 flex-wrap">
            {[20, 30, 45, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDurationMins(d)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  durationMins === d
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                    : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600"
                }`}
              >
                {d}m
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-slate-400 uppercase tracking-wide mb-2 block">Intensity</Label>
          <div className="flex gap-2">
            {(["light", "moderate", "intense"] as WorkoutIntensity[]).map((i) => (
              <button
                key={i}
                onClick={() => setIntensity(i)}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all capitalize ${
                  intensity === i
                    ? `border-current ${intensityColor(i)}`
                    : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom request */}
      <div>
        <Label className="text-xs text-slate-400 uppercase tracking-wide mb-2 block">
          Special Request <span className="text-slate-600 normal-case">(optional)</span>
        </Label>
        <Textarea
          placeholder='e.g. "Focus on lower back rehab", "No jumping exercises", "I have bad knees"...'
          value={customRequest}
          onChange={(e) => setCustomRequest(e.target.value)}
          rows={2}
          className="bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 text-sm resize-none"
        />
      </div>

      <Button
        onClick={handleGenerate}
        disabled={generateMutation.isPending}
        className="w-full h-12 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold"
      >
        {generateMutation.isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating with Gemini AI...</>
        ) : (
          <><Sparkles className="h-4 w-4 mr-2" />Generate My Workout Plan</>
        )}
      </Button>
    </div>
  );
}

// ─── Workout History Chart ────────────────────────────────────────────────────

function WorkoutHistoryPanel() {
  const { data: entries = [] } = trpc.workouts.getEntries.useQuery({ days: 30 });

  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    entries.forEach((e) => {
      map[e.exerciseType] = (map[e.exerciseType] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const totalMins = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const totalCals = entries.reduce((s, e) => s + (e.caloriesBurned || 0), 0);
  const totalSessions = entries.length;

  // Group by week for mini chart
  const weeklyMins = useMemo(() => {
    const weeks: number[] = [0, 0, 0, 0];
    const now = Date.now();
    entries.forEach((e) => {
      const daysAgo = Math.floor((now - e.recordedAt) / 86400000);
      const weekIdx = Math.min(3, Math.floor(daysAgo / 7));
      weeks[3 - weekIdx] += e.durationMinutes;
    });
    return weeks;
  }, [entries]);

  const maxWeekMins = Math.max(...weeklyMins, 1);

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        No workouts logged yet. Start logging to see your history!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 30-day stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Sessions", value: totalSessions, color: "text-cyan-400" },
          { label: "Total Time", value: formatDuration(totalMins), color: "text-green-400" },
          { label: "Calories", value: totalCals.toLocaleString(), color: "text-orange-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Weekly activity bars */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Weekly Activity (last 4 weeks)</p>
        <div className="flex items-end gap-2 h-16">
          {weeklyMins.map((mins, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-cyan-500/70 rounded-t transition-all"
                style={{ height: `${Math.max(4, (mins / maxWeekMins) * 52)}px` }}
              />
              <p className="text-[10px] text-slate-500">W{i + 1}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Type breakdown */}
      {byType.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">By Type (30 days)</p>
          <div className="space-y-1.5">
            {byType.slice(0, 5).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <p className="text-xs text-slate-300 w-20 shrink-0">{type}</p>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500/70 rounded-full"
                    style={{ width: `${(count / totalSessions) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 w-6 text-right">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent workouts list */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Recent Sessions</p>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {entries.slice(0, 10).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-slate-900/40 px-3 py-2">
              <div>
                <p className="text-sm text-white font-medium">{e.exerciseName}</p>
                <p className="text-xs text-slate-500">
                  {new Date(e.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} •{" "}
                  {e.exerciseType}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-cyan-400 font-semibold">{e.durationMinutes}m</p>
                {e.caloriesBurned > 0 && <p className="text-xs text-orange-400">{e.caloriesBurned} cal</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Log Form ───────────────────────────────────────────────────────────

function QuickLogForm({
  selectedDate,
  onLogged,
}: { selectedDate: Date; onLogged: () => void }) {
  const utils = trpc.useUtils();
  const [formData, setFormData] = useState({
    exerciseName: "", exerciseType: "Cardio",
    durationMinutes: "", caloriesBurned: "",
    intensity: "moderate" as WorkoutIntensity, notes: "",
  });
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const speechSupported = useMemo(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), []);

  const addMutation = trpc.workouts.addEntry.useMutation({
    onSuccess: () => {
      toast.success("Workout logged!");
      setFormData({ exerciseName: "", exerciseType: "Cardio", durationMinutes: "", caloriesBurned: "", intensity: "moderate", notes: "" });
      setVoiceTranscript("");
      onLogged();
      utils.workouts.getEntries.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to save workout"),
  });

  const estimateMutation = trpc.workouts.estimateFromText.useMutation({
    onSuccess: (r) => {
      setFormData((p) => ({ ...p, exerciseName: r.exerciseName, exerciseType: r.exerciseType, durationMinutes: String(r.durationMinutes), caloriesBurned: String(r.caloriesBurned), intensity: r.intensity }));
      toast.success(r.usedFallback ? "Workout parsed (estimated)" : "AI estimated your workout");
    },
    onError: (e) => toast.error(e.message || "Failed to estimate"),
  });

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice not supported in this browser"); return; }
    const r = new SR();
    r.lang = "en-US"; r.continuous = false; r.interimResults = false;
    setIsRecording(true);
    r.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript?.trim() || "";
      setVoiceTranscript(t);
      if (t) estimateMutation.mutate({ transcript: t });
    };
    r.onerror = (e) => { toast.error(`Voice error: ${e.error}`); };
    r.onend = () => setIsRecording(false);
    r.start();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.exerciseName || !formData.durationMinutes) {
      toast.error("Enter exercise name and duration"); return;
    }
    const noon = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12).getTime();
    addMutation.mutate({
      exerciseName: formData.exerciseName,
      exerciseType: formData.exerciseType,
      durationMinutes: Math.max(1, Number(formData.durationMinutes)),
      caloriesBurned: formData.caloriesBurned ? Math.max(0, Number(formData.caloriesBurned)) : 0,
      intensity: formData.intensity,
      notes: formData.notes || undefined,
      recordedAt: noon,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Voice input */}
      <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 space-y-2">
        <div className="flex items-center gap-2">
          <Button type="button" onClick={startVoice}
            disabled={!speechSupported || isRecording || estimateMutation.isPending}
            size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {isRecording ? <><MicOff className="h-3 w-3 mr-1" />Listening...</> :
              estimateMutation.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing...</> :
              <><Mic className="h-3 w-3 mr-1" />Voice Input</>}
          </Button>
          <p className="text-xs text-slate-400">Try: "45 minutes intense cycling"</p>
        </div>
        {voiceTranscript && <p className="text-xs text-cyan-300">Heard: "{voiceTranscript}"</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label className="text-xs text-slate-400">Exercise Name *</Label>
          <Input value={formData.exerciseName} onChange={(e) => setFormData(p => ({ ...p, exerciseName: e.target.value }))}
            placeholder="e.g. Bench Press, Running, Yoga" className="mt-1 bg-slate-800/60 border-slate-700 text-white" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Type</Label>
          <Select value={formData.exerciseType} onValueChange={(v) => setFormData(p => ({ ...p, exerciseType: v }))}>
            <SelectTrigger className="mt-1 bg-slate-800/60 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXERCISE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-400">Duration (minutes) *</Label>
          <Input type="number" min="1" value={formData.durationMinutes}
            onChange={(e) => setFormData(p => ({ ...p, durationMinutes: e.target.value }))}
            placeholder="30" className="mt-1 bg-slate-800/60 border-slate-700 text-white" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Calories Burned</Label>
          <Input type="number" min="0" value={formData.caloriesBurned}
            onChange={(e) => setFormData(p => ({ ...p, caloriesBurned: e.target.value }))}
            placeholder="Auto-estimated" className="mt-1 bg-slate-800/60 border-slate-700 text-white" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Intensity</Label>
          <Select value={formData.intensity} onValueChange={(v) => setFormData(p => ({ ...p, intensity: v as WorkoutIntensity }))}>
            <SelectTrigger className="mt-1 bg-slate-800/60 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="intense">Intense</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-slate-400">Notes (optional)</Label>
          <Input value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
            placeholder="How did it feel? Any PRs?" className="mt-1 bg-slate-800/60 border-slate-700 text-white" />
        </div>
      </div>

      <Button type="submit" disabled={addMutation.isPending} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">
        {addMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Plus className="h-4 w-4 mr-2" />Log Workout</>}
      </Button>
    </form>
  );
}

// ─── Main Workouts Page ───────────────────────────────────────────────────────

export function Workouts() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState<"log" | "ai" | "history">("ai");
  const { start: dayStart, end: dayEnd } = useMemo(() => localDayBounds(selectedDate), [selectedDate]);
  const isToday = useMemo(() => selectedDate.toDateString() === new Date().toDateString(), [selectedDate]);

  const { data: dayWorkouts = [], refetch: refetchDay } = trpc.workouts.getEntriesForDate.useQuery(
    { dayStart, dayEnd }, { enabled: !!user }
  );
  const deleteWorkoutMutation = trpc.workouts.deleteEntry.useMutation({
    onSuccess: () => { toast.success("Workout deleted"); refetchDay(); },
    onError: (e) => toast.error(e.message || "Failed to delete"),
  });

  const handleLogWorkout = (name: string, type: string, mins: number, intensity: WorkoutIntensity, cals: number) => {
    const noon = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12).getTime();
    deleteWorkoutMutation.mutate; // keep reference alive
    trpc.workouts.addEntry.useMutation; // unused but avoids lint
  };

  // Use a ref-based approach to avoid hook-in-callback issues
  const addEntryMutation = trpc.workouts.addEntry.useMutation({
    onSuccess: () => { toast.success("Workout logged!"); refetchDay(); },
    onError: (e) => toast.error(e.message || "Failed to save"),
  });

  const logWorkoutFromAI = (name: string, type: string, mins: number, intensity: WorkoutIntensity, cals: number) => {
    const noon = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12).getTime();
    addEntryMutation.mutate({ exerciseName: name, exerciseType: type, durationMinutes: mins, caloriesBurned: cals, intensity, recordedAt: noon });
  };

  const totalCalories = dayWorkouts.reduce((s, w) => s + (w.caloriesBurned || 0), 0);
  const totalMinutes = dayWorkouts.reduce((s, w) => s + w.durationMinutes, 0);

  if (isLoading || !user) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-cyan-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Workouts</h1>
            <p className="text-slate-400 text-sm mt-0.5">Track, plan, and improve your fitness</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-500">Today's Activity</p>
              <p className="text-sm font-semibold text-cyan-400">{dayWorkouts.length} session{dayWorkouts.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
          <button onClick={() => setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold">{formatDateLabel(selectedDate)}</span>
            <label className="cursor-pointer p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Pick a date">
              <Calendar className="w-4 h-4" />
              <input type="date" className="sr-only"
                value={selectedDate.toISOString().split("T")[0]}
                onChange={(e) => { if (e.target.value) setSelectedDate(new Date(e.target.value + "T12:00:00")); }} />
            </label>
            {!isToday && (
              <button onClick={() => setSelectedDate(new Date())} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
                Today
              </button>
            )}
          </div>
          <button onClick={() => setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}
            disabled={isToday}
            className={`p-2 rounded-lg transition-colors ${isToday ? "text-slate-700 cursor-not-allowed" : "hover:bg-white/10 text-slate-300 hover:text-white"}`}>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day summary */}
        {dayWorkouts.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Sessions", value: dayWorkouts.length, icon: <Play className="h-4 w-4" />, color: "text-cyan-400" },
              { label: "Minutes", value: totalMinutes, icon: <Timer className="h-4 w-4" />, color: "text-green-400" },
              { label: "Calories", value: totalCalories, icon: <Flame className="h-4 w-4" />, color: "text-orange-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-center">
                <div className={`flex items-center justify-center gap-1 ${s.color} mb-1`}>{s.icon}</div>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Today's logged workouts */}
        {dayWorkouts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{formatDateLabel(selectedDate)}'s Workouts</p>
            {dayWorkouts.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    {w.exerciseType === "Strength" ? <Dumbbell className="h-4 w-4 text-cyan-400" /> : <Activity className="h-4 w-4 text-cyan-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{w.exerciseName}</p>
                    <p className="text-xs text-slate-400">{w.exerciseType} • {w.durationMinutes}m • {w.intensity}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {w.caloriesBurned > 0 && (
                    <span className="text-sm font-semibold text-orange-400">{w.caloriesBurned} cal</span>
                  )}
                  <button onClick={() => deleteWorkoutMutation.mutate({ entryId: w.id })}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1">
          {[
            { id: "ai" as const, label: "AI Planner", icon: <Sparkles className="h-4 w-4" /> },
            { id: "log" as const, label: "Quick Log", icon: <Plus className="h-4 w-4" /> },
            { id: "history" as const, label: "History", icon: <BarChart3 className="h-4 w-4" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-cyan-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <Card className="border border-white/10 bg-slate-950">
          <CardContent className="p-5">
            {activeTab === "ai" && (
              <AIWorkoutGenerator onLogWorkout={logWorkoutFromAI} />
            )}
            {activeTab === "log" && (
              <QuickLogForm selectedDate={selectedDate} onLogged={refetchDay} />
            )}
            {activeTab === "history" && (
              <WorkoutHistoryPanel />
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
