import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, Trash2, Plus, Mic, MicOff, Sparkles,
  ChevronLeft, ChevronRight, Calendar, X, Dumbbell, Activity,
} from "lucide-react";

type WorkoutIntensity = "light" | "moderate" | "intense";

type Recommendation = {
  title: string;
  durationMinutes: number;
  intensity: WorkoutIntensity;
  reason: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const EXERCISE_TYPES = [
  { name: "Cardio", examples: "Running, Cycling, Swimming, HIIT" },
  { name: "Strength", examples: "Weight lifting, Resistance training" },
  { name: "Flexibility", examples: "Yoga, Stretching, Pilates" },
  { name: "Sports", examples: "Basketball, Tennis, Soccer" },
  { name: "Other", examples: "Walking, Hiking, etc." },
];

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function localDayBounds(date: Date): { start: number; end: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
}

// ─── Detailed Plan Modal ─────────────────────────────────────────────────────

type PlanSection = {
  name?: string;
  duration?: string;
  description?: string;
  exercises?: Array<{
    name?: string;
    sets?: number | string;
    reps?: number | string;
    rest?: string;
    muscle?: string;
    effort?: string;
    duration?: string;
    notes?: string;
  }>;
  intervals?: Array<{ phase?: string; duration?: string; effort?: string; heartRate?: string }>;
  notes?: string;
};

type DetailedPlan = {
  title?: string;
  overview?: string;
  warmUp?: PlanSection;
  warm_up?: PlanSection;
  mainWorkout?: PlanSection;
  main_workout?: PlanSection;
  coolDown?: PlanSection;
  cool_down?: PlanSection;
  sections?: PlanSection[];
  estimatedCalories?: number;
  tips?: string[];
};

function WorkoutPlanModal({
  rec,
  onClose,
  onLogWorkout,
}: {
  rec: Recommendation;
  onClose: () => void;
  onLogWorkout: (rec: Recommendation) => void;
}) {
  const isStrength = /strength|weight|lift|resistance|muscle/i.test(rec.title);
  const exerciseType = isStrength ? "Strength" : "Cardio";

  const planMutation = trpc.workouts.getDetailedPlan.useMutation();

  const [plan, setPlan] = useState<DetailedPlan | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchPlan = () => {
    planMutation.mutate(
      {
        title: rec.title,
        exerciseType,
        durationMinutes: rec.durationMinutes,
        intensity: rec.intensity,
      },
      {
        onSuccess: (result) => {
          setPlan(result.plan as DetailedPlan | null);
          setFetched(true);
        },
        onError: () => {
          setFetched(true);
          toast.error("Failed to generate workout plan");
        },
      }
    );
  };

  const warmUp = plan?.warmUp ?? plan?.warm_up;
  const main = plan?.mainWorkout ?? plan?.main_workout;
  const coolDown = plan?.coolDown ?? plan?.cool_down;
  const sections = plan?.sections ?? (warmUp || main || coolDown
    ? [warmUp, main, coolDown].filter(Boolean) as PlanSection[]
    : []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          {isStrength ? (
            <Dumbbell className="w-6 h-6 text-cyan-400" />
          ) : (
            <Activity className="w-6 h-6 text-cyan-400" />
          )}
          <div>
            <h2 className="text-xl font-bold text-white">{rec.title}</h2>
            <p className="text-sm text-slate-400">
              {rec.durationMinutes} min • {rec.intensity} • {exerciseType}
            </p>
          </div>
        </div>

        <p className="text-slate-300 text-sm mb-4">{rec.reason}</p>

        {!fetched && (
          <Button
            onClick={fetchPlan}
            disabled={planMutation.isPending}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white mb-4"
          >
            {planMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating plan with AI...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />Generate Detailed Workout Plan</>
            )}
          </Button>
        )}

        {fetched && plan && (
          <div className="space-y-4">
            {plan.overview && (
              <p className="text-slate-300 text-sm bg-slate-800 rounded-lg p-3">{plan.overview}</p>
            )}

            {sections.length > 0 ? sections.map((section, idx) => (
              <div key={idx} className="rounded-lg border border-white/10 bg-slate-800 p-4">
                <h3 className="font-semibold text-cyan-300 mb-2">
                  {section.name ?? (idx === 0 ? "Warm-Up" : idx === sections.length - 1 ? "Cool-Down" : "Main Workout")}
                  {section.duration && <span className="text-slate-400 text-sm font-normal ml-2">({section.duration})</span>}
                </h3>
                {section.description && <p className="text-slate-300 text-sm mb-2">{section.description}</p>}
                {section.exercises && section.exercises.length > 0 && (
                  <div className="space-y-2">
                    {section.exercises.map((ex, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-sm">
                        <div>
                          <span className="text-white font-medium">{ex.name}</span>
                          {ex.muscle && <span className="text-slate-400 ml-2">({ex.muscle})</span>}
                          {ex.notes && <p className="text-slate-400 text-xs mt-0.5">{ex.notes}</p>}
                        </div>
                        <div className="text-right text-slate-300 whitespace-nowrap">
                          {ex.sets && ex.reps && <span>{ex.sets} × {ex.reps}</span>}
                          {ex.duration && <span>{ex.duration}</span>}
                          {ex.rest && <span className="text-slate-500 ml-1">rest {ex.rest}</span>}
                          {ex.effort && <span className="text-slate-400 ml-1">{ex.effort}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {section.intervals && section.intervals.length > 0 && (
                  <div className="space-y-1">
                    {section.intervals.map((iv, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-white">{iv.phase}</span>
                        <span className="text-slate-300">{iv.duration} {iv.effort && `• ${iv.effort}`} {iv.heartRate && `• ${iv.heartRate}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )) : (
              <div className="rounded-lg border border-white/10 bg-slate-800 p-4">
                <pre className="text-slate-300 text-xs whitespace-pre-wrap">{JSON.stringify(plan, null, 2)}</pre>
              </div>
            )}

            {plan.estimatedCalories && (
              <p className="text-sm text-slate-400">Estimated calories: <span className="text-cyan-300 font-semibold">{plan.estimatedCalories} kcal</span></p>
            )}

            {plan.tips && plan.tips.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-slate-800 p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1">TIPS</p>
                {plan.tips.map((tip, i) => <p key={i} className="text-sm text-slate-300">• {tip}</p>)}
              </div>
            )}
          </div>
        )}

        {fetched && !plan && (
          <p className="text-slate-400 text-sm">Could not generate a structured plan. Try again.</p>
        )}

        <div className="flex gap-3 mt-6">
          <Button
            onClick={() => { onLogWorkout(rec); onClose(); }}
            className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Log This Workout
          </Button>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300 hover:text-white">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Workouts Component ─────────────────────────────────────────────────

export function Workouts() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  // Date navigator state
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const { start: dayStart, end: dayEnd } = useMemo(() => localDayBounds(selectedDate), [selectedDate]);
  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  const goBack = () => setSelectedDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const goForward = () => setSelectedDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  const goToday = () => setSelectedDate(new Date());

  const [formData, setFormData] = useState({
    exerciseName: "",
    exerciseType: "Cardio",
    durationMinutes: "",
    caloriesBurned: "",
    intensity: "moderate" as WorkoutIntensity,
    notes: "",
  });
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);

  const speechSupported = useMemo(
    () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  // Fetch workouts for the selected date
  const { data: dayWorkouts = [], refetch: refetchDay } = trpc.workouts.getEntriesForDate.useQuery(
    { dayStart, dayEnd },
    { enabled: !!user }
  );

  const { data: recommendations = [] } = trpc.workouts.getDailyRecommendations.useQuery(
    undefined,
    { enabled: !!user }
  );

  const addWorkoutMutation = trpc.workouts.addEntry.useMutation({
    onSuccess: () => {
      toast.success("Workout logged successfully!");
      setFormData({
        exerciseName: "",
        exerciseType: "Cardio",
        durationMinutes: "",
        caloriesBurned: "",
        intensity: "moderate",
        notes: "",
      });
      setVoiceTranscript("");
      refetchDay();
      utils.workouts.getEntries.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save workout");
    },
  });

  const deleteWorkoutMutation = trpc.workouts.deleteEntry.useMutation({
    onSuccess: () => {
      toast.success("Workout deleted");
      refetchDay();
      utils.workouts.getEntries.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete workout");
    },
  });

  const estimateFromTextMutation = trpc.workouts.estimateFromText.useMutation({
    onSuccess: (result) => {
      setFormData((prev) => ({
        ...prev,
        exerciseName: result.exerciseName,
        exerciseType: result.exerciseType,
        durationMinutes: String(result.durationMinutes),
        caloriesBurned: String(result.caloriesBurned),
        intensity: result.intensity,
      }));
      toast.success(result.usedFallback ? "Workout parsed with fallback estimate" : "AI estimated workout calories");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to estimate calories");
    },
  });

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const startVoiceCapture = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    setIsRecording(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
      setVoiceTranscript(transcript);
      if (transcript.length > 0) estimateFromTextMutation.mutate({ transcript });
    };
    recognition.onerror = (event) => { toast.error(`Voice capture failed: ${event.error}`); };
    recognition.onend = () => { setIsRecording(false); };
    recognition.start();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.exerciseName || !formData.durationMinutes) {
      toast.error("Please fill in exercise name and duration");
      return;
    }
    // Use noon of selected date as recordedAt
    const noon = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0).getTime();
    addWorkoutMutation.mutate({
      exerciseName: formData.exerciseName,
      exerciseType: formData.exerciseType,
      durationMinutes: Math.max(1, Number(formData.durationMinutes)),
      caloriesBurned: formData.caloriesBurned ? Math.max(0, Number(formData.caloriesBurned)) : 0,
      intensity: formData.intensity,
      notes: formData.notes || undefined,
      recordedAt: noon,
    });
  };

  const handleLogFromRec = (rec: Recommendation) => {
    const isStrength = /strength|weight|lift|resistance|muscle/i.test(rec.title);
    const noon = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0).getTime();
    addWorkoutMutation.mutate({
      exerciseName: rec.title,
      exerciseType: isStrength ? "Strength" : "Cardio",
      durationMinutes: rec.durationMinutes,
      caloriesBurned: 0,
      intensity: rec.intensity,
      recordedAt: noon,
    });
  };

  const totalCalories = dayWorkouts.reduce((sum, w) => sum + (w.caloriesBurned || 0), 0);
  const totalMinutes = dayWorkouts.reduce((sum, w) => sum + w.durationMinutes, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      {selectedRec && (
        <WorkoutPlanModal
          rec={selectedRec}
          onClose={() => setSelectedRec(null)}
          onLogWorkout={handleLogFromRec}
        />
      )}

      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-white mb-1">Workout Tracking</h1>
          <p className="text-slate-400">Log your exercises and track your fitness progress</p>
        </div>

        {/* ── Date Navigator ── */}
        <div className="flex items-center justify-between mb-6 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
          <button onClick={goBack} className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-lg">{formatDateLabel(selectedDate)}</span>
            <label className="cursor-pointer p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Pick a date">
              <Calendar className="w-4 h-4" />
              <input
                type="date"
                className="sr-only"
                value={selectedDate.toISOString().split("T")[0]}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(new Date(e.target.value + "T12:00:00"));
                }}
              />
            </label>
            {!isToday && (
              <button onClick={goToday} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
                ← Back to Today
              </button>
            )}
          </div>
          <button
            onClick={goForward}
            disabled={isToday}
            className={`p-2 rounded-lg transition-colors ${isToday ? "text-slate-600 cursor-not-allowed" : "hover:bg-white/10 text-slate-300 hover:text-white"}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* ── Day Summary ── */}
        {dayWorkouts.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center">
              <p className="text-2xl font-bold text-cyan-400">{dayWorkouts.length}</p>
              <p className="text-xs text-slate-400 mt-1">Workouts</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center">
              <p className="text-2xl font-bold text-cyan-400">{totalMinutes}</p>
              <p className="text-xs text-slate-400 mt-1">Minutes</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center">
              <p className="text-2xl font-bold text-cyan-400">{totalCalories}</p>
              <p className="text-xs text-slate-400 mt-1">Calories Burned</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Log Workout Card ── */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white">Log Workout</CardTitle>
              <CardDescription>
                Record your exercise session for {formatDateLabel(selectedDate)}, or use voice input like "I did 35 minutes of cycling"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Voice Input */}
              <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={startVoiceCapture}
                    disabled={!speechSupported || isRecording || estimateFromTextMutation.isPending}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  >
                    {isRecording ? (
                      <><MicOff className="w-4 h-4 mr-2" />Listening...</>
                    ) : estimateFromTextMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                    ) : (
                      <><Mic className="w-4 h-4 mr-2" />Use Voice Input</>
                    )}
                  </Button>
                  {!speechSupported && (
                    <span className="text-xs text-slate-300">Browser does not support speech recognition.</span>
                  )}
                </div>
                {voiceTranscript && (
                  <p className="text-sm text-slate-200">
                    Heard: <span className="text-cyan-300">{voiceTranscript}</span>
                  </p>
                )}
                <p className="text-xs text-slate-300">
                  Hint: try saying "45 minutes intense cycling" or "30 minutes light yoga".
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="exerciseName" className="text-slate-300">Exercise Name</Label>
                  <Input
                    id="exerciseName" name="exerciseName"
                    placeholder="e.g., Morning Run"
                    value={formData.exerciseName} onChange={handleInputChange}
                    className="mt-2 bg-slate-900 border-white/10 text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <Label htmlFor="exerciseType" className="text-slate-300">Exercise Type</Label>
                  <Select value={formData.exerciseType} onValueChange={(v) => handleSelectChange("exerciseType", v)}>
                    <SelectTrigger className="mt-2 bg-slate-900 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10">
                      {EXERCISE_TYPES.map((type) => (
                        <SelectItem key={type.name} value={type.name}>
                          <span className="text-white">{type.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="durationMinutes" className="text-slate-300">Duration (minutes)</Label>
                  <Input
                    id="durationMinutes" name="durationMinutes" type="number" placeholder="30"
                    value={formData.durationMinutes} onChange={handleInputChange}
                    className="mt-2 bg-slate-900 border-white/10 text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <Label htmlFor="caloriesBurned" className="text-slate-300">Calories Burned (optional)</Label>
                  <Input
                    id="caloriesBurned" name="caloriesBurned" type="number" placeholder="250"
                    value={formData.caloriesBurned} onChange={handleInputChange}
                    className="mt-2 bg-slate-900 border-white/10 text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <Label htmlFor="intensity" className="text-slate-300">Intensity</Label>
                  <Select value={formData.intensity} onValueChange={(v) => handleSelectChange("intensity", v)}>
                    <SelectTrigger className="mt-2 bg-slate-900 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10">
                      <SelectItem value="light"><span className="text-white">Light</span></SelectItem>
                      <SelectItem value="moderate"><span className="text-white">Moderate</span></SelectItem>
                      <SelectItem value="intense"><span className="text-white">Intense</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="notes" className="text-slate-300">Notes (optional)</Label>
                  <Input
                    id="notes" name="notes"
                    placeholder="How did you feel?"
                    value={formData.notes} onChange={handleInputChange}
                    className="mt-2 bg-slate-900 border-white/10 text-white placeholder-slate-500"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-semibold" disabled={addWorkoutMutation.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                {addWorkoutMutation.isPending ? "Saving..." : `Log Workout for ${formatDateLabel(selectedDate)}`}
              </Button>
            </CardContent>
          </Card>

          {/* ── AI Workout Recommendations ── */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                AI Workout Recommendations
              </CardTitle>
              <CardDescription>Click any recommendation to get a full Gemini-powered workout plan</CardDescription>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-slate-400">No recommendations yet. Update your profile goals to get better suggestions.</p>
              ) : (
                <div className="space-y-3">
                  {(recommendations as Recommendation[]).map((item, idx) => {
                    const isStrength = /strength|weight|lift|resistance|muscle/i.test(item.title);
                    return (
                      <button
                        key={`${item.title}-${idx}`}
                        type="button"
                        onClick={() => setSelectedRec(item)}
                        className="w-full text-left p-4 rounded-lg bg-slate-900 border border-white/10 hover:border-cyan-500/50 hover:bg-slate-800 transition-all group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            {isStrength ? (
                              <Dumbbell className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            ) : (
                              <Activity className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            )}
                            <p className="font-semibold text-cyan-300 group-hover:text-cyan-200">{item.title}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <p className="text-xs text-slate-400">{item.durationMinutes} min • {item.intensity}</p>
                            <span className="text-xs text-cyan-500 group-hover:text-cyan-400">View Plan →</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-300 mt-1 ml-6">{item.reason}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Workouts for Selected Date ── */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white">
                {formatDateLabel(selectedDate) === "Today" ? "Today's Workouts" : `Workouts — ${formatDateLabel(selectedDate)}`}
              </CardTitle>
              <CardDescription>Logged exercise sessions for this day</CardDescription>
            </CardHeader>
            <CardContent>
              {dayWorkouts.length === 0 ? (
                <p className="text-slate-400 text-center py-8">
                  No workouts logged for {formatDateLabel(selectedDate)}.
                  {isToday && " Start by logging your first workout above!"}
                </p>
              ) : (
                <div className="space-y-2">
                  {dayWorkouts.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900 p-3">
                      <div>
                        <p className="font-semibold text-white">{entry.exerciseName}</p>
                        <p className="text-xs text-slate-400">
                          {entry.exerciseType} • {entry.durationMinutes} min • {entry.caloriesBurned} kcal • {entry.intensity}
                        </p>
                        {entry.notes && <p className="text-xs text-slate-300 mt-1">{entry.notes}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deleteWorkoutMutation.isPending}
                        onClick={() => deleteWorkoutMutation.mutate({ entryId: entry.id })}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
