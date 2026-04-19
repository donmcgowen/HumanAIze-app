import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Target, User, Activity, Heart, Dumbbell, Sparkles, CheckCircle2,
  ChevronRight, ChevronLeft, X, Scale, Ruler, Calendar, Flame,
  Apple, Zap, Shield, AlertCircle, SkipForward
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardData {
  // Step 1: Goal
  fitnessGoal: "lose_fat" | "build_muscle" | "maintain" | "";
  // Step 2: Biometrics
  gender: "male" | "female" | "other" | "";
  ageYears: string;
  heightFt: string;
  heightIn: string;
  weightLbs: string;
  goalWeightLbs: string;
  goalDate: string;
  // Step 3: Activity
  activityLevel: "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extremely_active" | "";
  // Step 4: Health Conditions
  healthConditions: string[];
  // Step 5: Macro targets (calculated, editable)
  dailyCalorieTarget: string;
  dailyProteinTarget: string;
  dailyCarbsTarget: string;
  dailyFatTarget: string;
}

interface AIPlan {
  summary: string;
  nutritionPlan: {
    dailyCalories: number;
    protein: number;
    carbs: number;
    fat: number;
    keyPrinciples: string[];
    mealTiming: string;
    foodsToEat: string[];
    foodsToAvoid: string[];
  };
  workoutPlan: {
    type: string;
    daysPerWeek: number;
    sessionDuration: string;
    cardio: string;
    strength: string;
    weeklySchedule: string[];
  };
  healthTips: string[];
  timeline: string;
}

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

// ─── Health Conditions ────────────────────────────────────────────────────────

const HEALTH_CONDITIONS = [
  { id: "type1_diabetes", label: "Type 1 Diabetes", icon: "🩸", desc: "Insulin-dependent diabetes" },
  { id: "type2_diabetes", label: "Type 2 Diabetes", icon: "🩺", desc: "Non-insulin-dependent diabetes" },
  { id: "prediabetes", label: "Prediabetes", icon: "⚠️", desc: "Higher than normal blood sugar" },
  { id: "hypertension", label: "High Blood Pressure", icon: "❤️", desc: "Hypertension" },
  { id: "high_cholesterol", label: "High Cholesterol", icon: "🫀", desc: "Elevated LDL/triglycerides" },
  { id: "hypothyroidism", label: "Thyroid Issues", icon: "🦋", desc: "Hypothyroidism / Hashimoto's" },
  { id: "pcos", label: "PCOS", icon: "🌸", desc: "Polycystic ovary syndrome" },
  { id: "heart_disease", label: "Heart Disease", icon: "💔", desc: "Cardiovascular conditions" },
  { id: "arthritis", label: "Arthritis / Joint Pain", icon: "🦴", desc: "Limits certain exercises" },
  { id: "celiac", label: "Celiac / Gluten-Free", icon: "🌾", desc: "Gluten intolerance" },
  { id: "none", label: "None of the above", icon: "✅", desc: "No significant health conditions" },
];

// ─── Macro Calculator ─────────────────────────────────────────────────────────

function calculateMacros(data: WizardData) {
  const weight = parseFloat(data.weightLbs) || 0;
  const height = (parseInt(data.heightFt) || 0) * 12 + (parseInt(data.heightIn) || 0);
  const age = parseInt(data.ageYears) || 0;
  if (!weight || !height || !age) return null;

  const weightKg = weight * 0.453592;
  const heightCm = height * 2.54;
  const isMale = data.gender === "male";

  // Mifflin-St Jeor BMR
  const bmr = isMale
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extremely_active: 1.9,
  };
  const multiplier = activityMultipliers[data.activityLevel] || 1.55;
  const tdee = bmr * multiplier;

  let calories: number;
  let proteinG: number;
  let carbsG: number;
  let fatG: number;

  if (data.fitnessGoal === "lose_fat") {
    // Calculate deficit based on goal weight and date
    const goalWeight = parseFloat(data.goalWeightLbs) || weight;
    const lbsToLose = Math.max(0, weight - goalWeight);
    const daysToGoal = data.goalDate
      ? Math.max(30, (new Date(data.goalDate).getTime() - Date.now()) / 86400000)
      : 90;
    const dailyDeficit = Math.min(1000, Math.max(250, (lbsToLose * 3500) / daysToGoal));
    calories = Math.max(1200, Math.round(tdee - dailyDeficit));
    proteinG = Math.round(weight * 0.8); // 0.8g per lb for fat loss
    fatG = Math.round((calories * 0.25) / 9);
    carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  } else if (data.fitnessGoal === "build_muscle") {
    calories = Math.round(tdee + 250); // slight surplus
    proteinG = Math.round(weight * 1.0); // 1g per lb for muscle
    fatG = Math.round((calories * 0.25) / 9);
    carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  } else {
    calories = Math.round(tdee);
    proteinG = Math.round(weight * 0.7);
    fatG = Math.round((calories * 0.3) / 9);
    carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  }

  return {
    calories: Math.max(1200, calories),
    protein: Math.max(50, proteinG),
    carbs: Math.max(50, carbsG),
    fat: Math.max(30, fatG),
  };
}

// ─── Step Components ──────────────────────────────────────────────────────────

function StepGoal({ data, setData }: { data: WizardData; setData: (d: Partial<WizardData>) => void }) {
  const goals = [
    { id: "lose_fat", label: "Lose Weight", desc: "Burn fat, reduce body weight", icon: "🔥", color: "from-orange-500/20 to-red-500/10 border-orange-500/40" },
    { id: "build_muscle", label: "Build Muscle", desc: "Gain strength and muscle mass", icon: "💪", color: "from-cyan-500/20 to-blue-500/10 border-cyan-500/40" },
    { id: "maintain", label: "Maintain Weight", desc: "Stay healthy, maintain current weight", icon: "⚖️", color: "from-green-500/20 to-emerald-500/10 border-green-500/40" },
  ];

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-500/30 mb-4">
          <Target className="h-8 w-8 text-cyan-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">What's your primary goal?</h2>
        <p className="text-slate-400 mt-1">This helps us personalize your plan</p>
      </div>
      <div className="space-y-3">
        {goals.map((g) => (
          <button
            key={g.id}
            onClick={() => setData({ fitnessGoal: g.id as any })}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border bg-gradient-to-r transition-all ${
              data.fitnessGoal === g.id
                ? g.color + " ring-2 ring-cyan-400/50 scale-[1.02]"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            <span className="text-3xl">{g.icon}</span>
            <div className="text-left">
              <p className="font-semibold text-white">{g.label}</p>
              <p className="text-sm text-slate-400">{g.desc}</p>
            </div>
            {data.fitnessGoal === g.id && (
              <CheckCircle2 className="h-5 w-5 text-cyan-400 ml-auto" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepBiometrics({ data, setData }: { data: WizardData; setData: (d: Partial<WizardData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 border border-purple-500/30 mb-4">
          <User className="h-8 w-8 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Tell us about yourself</h2>
        <p className="text-slate-400 mt-1">Used to calculate your personalized targets</p>
      </div>

      {/* Gender */}
      <div>
        <Label className="text-slate-300 text-sm mb-2 block">Biological Sex</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["male", "female", "other"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setData({ gender: g })}
              className={`py-3 rounded-xl border text-sm font-medium capitalize transition-all ${
                data.gender === g
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
              }`}
            >
              {g === "male" ? "♂ Male" : g === "female" ? "♀ Female" : "⚧ Other"}
            </button>
          ))}
        </div>
      </div>

      {/* Age */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300 text-sm mb-1 block">Age</Label>
          <div className="relative">
            <Input
              type="number" min="10" max="120"
              value={data.ageYears}
              onChange={(e) => setData({ ageYears: e.target.value })}
              placeholder="30"
              className="rounded-xl border-white/10 bg-slate-900 text-white pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">yrs</span>
          </div>
        </div>
        <div>
          <Label className="text-slate-300 text-sm mb-1 block">Current Weight</Label>
          <div className="relative">
            <Input
              type="number" min="50" max="700"
              value={data.weightLbs}
              onChange={(e) => setData({ weightLbs: e.target.value })}
              placeholder="170"
              className="rounded-xl border-white/10 bg-slate-900 text-white pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">lbs</span>
          </div>
        </div>
      </div>

      {/* Height */}
      <div>
        <Label className="text-slate-300 text-sm mb-1 block">Height</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Input
              type="number" min="1" max="8"
              value={data.heightFt}
              onChange={(e) => setData({ heightFt: e.target.value })}
              placeholder="5"
              className="rounded-xl border-white/10 bg-slate-900 text-white pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">ft</span>
          </div>
          <div className="relative">
            <Input
              type="number" min="0" max="11"
              value={data.heightIn}
              onChange={(e) => setData({ heightIn: e.target.value })}
              placeholder="10"
              className="rounded-xl border-white/10 bg-slate-900 text-white pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">in</span>
          </div>
        </div>
      </div>

      {/* Goal weight & date (only for lose_fat / build_muscle) */}
      {data.fitnessGoal !== "maintain" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-slate-300 text-sm mb-1 block">Goal Weight</Label>
            <div className="relative">
              <Input
                type="number" min="50" max="700"
                value={data.goalWeightLbs}
                onChange={(e) => setData({ goalWeightLbs: e.target.value })}
                placeholder={data.fitnessGoal === "lose_fat" ? "150" : "185"}
                className="rounded-xl border-white/10 bg-slate-900 text-white pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">lbs</span>
            </div>
          </div>
          <div>
            <Label className="text-slate-300 text-sm mb-1 block">Target Date</Label>
            <Input
              type="date"
              value={data.goalDate}
              min={new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]}
              onChange={(e) => setData({ goalDate: e.target.value })}
              className="rounded-xl border-white/10 bg-slate-900 text-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StepActivity({ data, setData }: { data: WizardData; setData: (d: Partial<WizardData>) => void }) {
  const levels = [
    { id: "sedentary", label: "Sedentary", desc: "Little or no exercise, desk job", icon: "🪑", cal: "+20%" },
    { id: "lightly_active", label: "Lightly Active", desc: "Light exercise 1-3 days/week", icon: "🚶", cal: "+37.5%" },
    { id: "moderately_active", label: "Moderately Active", desc: "Moderate exercise 3-5 days/week", icon: "🏃", cal: "+55%" },
    { id: "very_active", label: "Very Active", desc: "Hard exercise 6-7 days/week", icon: "🏋️", cal: "+72.5%" },
    { id: "extremely_active", label: "Extremely Active", desc: "Very hard exercise, physical job", icon: "⚡", cal: "+90%" },
  ];

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
          <Activity className="h-8 w-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Activity Level</h2>
        <p className="text-slate-400 mt-1">How active are you on a typical week?</p>
      </div>
      <div className="space-y-2">
        {levels.map((l) => (
          <button
            key={l.id}
            onClick={() => setData({ activityLevel: l.id as any })}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
              data.activityLevel === l.id
                ? "border-green-500/50 bg-green-500/10 ring-1 ring-green-400/30"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            <span className="text-2xl w-8">{l.icon}</span>
            <div className="text-left flex-1">
              <p className="font-medium text-white text-sm">{l.label}</p>
              <p className="text-xs text-slate-400">{l.desc}</p>
            </div>
            <span className="text-xs text-slate-500 font-mono">{l.cal}</span>
            {data.activityLevel === l.id && (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepHealth({ data, setData }: { data: WizardData; setData: (d: Partial<WizardData>) => void }) {
  const toggle = (id: string) => {
    if (id === "none") {
      setData({ healthConditions: ["none"] });
      return;
    }
    const current = data.healthConditions.filter((c) => c !== "none");
    if (current.includes(id)) {
      setData({ healthConditions: current.filter((c) => c !== id) });
    } else {
      setData({ healthConditions: [...current, id] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 mb-4">
          <Heart className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Health Conditions</h2>
        <p className="text-slate-400 mt-1">Select all that apply — Gemini will tailor your plan</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {HEALTH_CONDITIONS.map((c) => {
          const selected = data.healthConditions.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                selected
                  ? c.id === "none"
                    ? "border-green-500/50 bg-green-500/10"
                    : "border-red-500/40 bg-red-500/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <span className="text-xl w-7">{c.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{c.label}</p>
                <p className="text-xs text-slate-400">{c.desc}</p>
              </div>
              {selected && <CheckCircle2 className={`h-4 w-4 ${c.id === "none" ? "text-green-400" : "text-red-400"}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepMacros({ data, setData, macros }: { data: WizardData; setData: (d: Partial<WizardData>) => void; macros: ReturnType<typeof calculateMacros> }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-500/20 border border-orange-500/30 mb-4">
          <Flame className="h-8 w-8 text-orange-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Your Daily Targets</h2>
        <p className="text-slate-400 mt-1">Calculated for your goal — edit if you prefer different targets</p>
      </div>

      {macros && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { key: "dailyCalorieTarget", label: "Calories", value: data.dailyCalorieTarget || String(macros.calories), unit: "kcal", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
            { key: "dailyProteinTarget", label: "Protein", value: data.dailyProteinTarget || String(macros.protein), unit: "g", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
            { key: "dailyCarbsTarget", label: "Carbs", value: data.dailyCarbsTarget || String(macros.carbs), unit: "g", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
            { key: "dailyFatTarget", label: "Fat", value: data.dailyFatTarget || String(macros.fat), unit: "g", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/30" },
          ].map((m) => (
            <div key={m.key} className={`rounded-xl border p-3 ${m.bg}`}>
              <Label className={`text-xs font-semibold uppercase tracking-wider ${m.color} mb-1 block`}>{m.label}</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number" min="0"
                  value={m.value}
                  onChange={(e) => setData({ [m.key]: e.target.value } as any)}
                  className="border-0 bg-transparent text-white text-lg font-bold p-0 h-auto focus-visible:ring-0 w-20"
                />
                <span className="text-slate-400 text-sm">{m.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-300">
            These targets are calculated using the <strong className="text-white">Mifflin-St Jeor equation</strong> based on your age, height, weight, and activity level. You can edit them now or anytime in your profile.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepAIPlan({ plan, isLoading, onGenerate, onSkip }: {
  plan: AIPlan | null;
  isLoading: boolean;
  onGenerate: () => void;
  onSkip: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
          <Sparkles className="absolute inset-0 m-auto h-8 w-8 text-cyan-400" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-lg">Gemini is analyzing your profile...</p>
          <p className="text-slate-400 text-sm mt-1">Creating your personalized food & workout plan</p>
        </div>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 border border-purple-500/30 mb-4">
            <Sparkles className="h-8 w-8 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Your AI Health Plan</h2>
          <p className="text-slate-400 mt-1">Gemini will create a personalized food & workout plan based on your profile</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {[
            { icon: Apple, label: "Personalized Nutrition Plan", desc: "Daily macros, meal timing, foods to eat & avoid", color: "text-green-400" },
            { icon: Dumbbell, label: "Custom Workout Program", desc: "Exercise type, frequency, and weekly schedule", color: "text-cyan-400" },
            { icon: Shield, label: "Health-Aware Recommendations", desc: "Tailored for your age, conditions, and goals", color: "text-purple-400" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
              <item.icon className={`h-5 w-5 ${item.color} flex-shrink-0`} />
              <div>
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-slate-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={onGenerate}
          className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-semibold py-3 rounded-xl"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Generate My AI Plan
        </Button>
        <button onClick={onSkip} className="w-full text-slate-500 text-sm hover:text-slate-300 transition-colors py-2">
          <SkipForward className="h-3 w-3 inline mr-1" />
          Skip and use calculated targets only
        </button>
      </div>
    );
  }

  // Plan is ready — show it
  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 mb-3">
          <CheckCircle2 className="h-6 w-6 text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Your Plan is Ready!</h2>
        <p className="text-slate-400 text-sm mt-1">{plan.summary}</p>
      </div>

      {/* Nutrition */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
        <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Apple className="h-4 w-4" /> Nutrition Plan
        </h3>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Calories", value: plan.nutritionPlan.dailyCalories, unit: "kcal" },
            { label: "Protein", value: plan.nutritionPlan.protein, unit: "g" },
            { label: "Carbs", value: plan.nutritionPlan.carbs, unit: "g" },
            { label: "Fat", value: plan.nutritionPlan.fat, unit: "g" },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-lg font-bold text-white">{m.value}</p>
              <p className="text-xs text-slate-400">{m.unit}</p>
              <p className="text-xs text-slate-500">{m.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-300 mb-2"><span className="text-slate-400">Meal timing:</span> {plan.nutritionPlan.mealTiming}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-green-400 font-medium mb-1">✓ Eat more of:</p>
            {plan.nutritionPlan.foodsToEat.slice(0, 4).map((f) => <p key={f} className="text-slate-300">• {f}</p>)}
          </div>
          <div>
            <p className="text-red-400 font-medium mb-1">✗ Limit:</p>
            {plan.nutritionPlan.foodsToAvoid.slice(0, 3).map((f) => <p key={f} className="text-slate-300">• {f}</p>)}
          </div>
        </div>
      </div>

      {/* Workout */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Dumbbell className="h-4 w-4" /> Workout Plan — {plan.workoutPlan.type}
        </h3>
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div><p className="text-lg font-bold text-white">{plan.workoutPlan.daysPerWeek}</p><p className="text-xs text-slate-400">days/week</p></div>
          <div><p className="text-sm font-bold text-white">{plan.workoutPlan.sessionDuration}</p><p className="text-xs text-slate-400">per session</p></div>
          <div><p className="text-sm font-bold text-white">{plan.workoutPlan.cardio.split(" ").slice(0, 3).join(" ")}</p><p className="text-xs text-slate-400">cardio</p></div>
        </div>
        <p className="text-xs text-slate-300 mb-2">{plan.workoutPlan.strength}</p>
        <div className="space-y-1">
          {plan.workoutPlan.weeklySchedule.map((day, i) => (
            <p key={i} className="text-xs text-slate-300">• {day}</p>
          ))}
        </div>
      </div>

      {/* Health tips */}
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4" /> Health Tips
        </h3>
        {plan.healthTips.map((tip, i) => (
          <p key={i} className="text-xs text-slate-300 mb-1">• {tip}</p>
        ))}
        <p className="text-xs text-slate-400 mt-2 italic">{plan.timeline}</p>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Goal", icon: Target },
  { id: 2, label: "Profile", icon: User },
  { id: 3, label: "Activity", icon: Activity },
  { id: 4, label: "Health", icon: Heart },
  { id: 5, label: "Targets", icon: Flame },
  { id: 6, label: "AI Plan", icon: Sparkles },
];

export function OnboardingWizard({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(1);
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [data, setDataState] = useState<WizardData>({
    fitnessGoal: "",
    gender: "",
    ageYears: "",
    heightFt: "",
    heightIn: "",
    weightLbs: "",
    goalWeightLbs: "",
    goalDate: "",
    activityLevel: "",
    healthConditions: [],
    dailyCalorieTarget: "",
    dailyProteinTarget: "",
    dailyCarbsTarget: "",
    dailyFatTarget: "",
  });

  const setData = useCallback((updates: Partial<WizardData>) => {
    setDataState((prev) => ({ ...prev, ...updates }));
  }, []);

  const upsertProfile = trpc.profile.upsert.useMutation();
  const generatePlanMutation = trpc.profile.generateAIPlan.useMutation();

  const macros = calculateMacros(data);

  // Auto-fill macro targets when entering step 5
  const handleNext = async () => {
    if (step === 4 && macros && !data.dailyCalorieTarget) {
      setData({
        dailyCalorieTarget: String(macros.calories),
        dailyProteinTarget: String(macros.protein),
        dailyCarbsTarget: String(macros.carbs),
        dailyFatTarget: String(macros.fat),
      });
    }
    setStep((s) => Math.min(s + 1, 6));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    try {
      const totalHeightIn = (parseInt(data.heightFt) || 0) * 12 + (parseInt(data.heightIn) || 0);
      const result = await generatePlanMutation.mutateAsync({
        gender: data.gender || "other",
        ageYears: parseInt(data.ageYears) || 30,
        weightLbs: parseFloat(data.weightLbs) || 170,
        heightIn: totalHeightIn || 66,
        goalWeightLbs: data.goalWeightLbs ? parseFloat(data.goalWeightLbs) : undefined,
        goalDate: data.goalDate ? new Date(data.goalDate).getTime() : undefined,
        fitnessGoal: data.fitnessGoal || "maintain",
        activityLevel: data.activityLevel || "moderately_active",
        healthConditions: data.healthConditions.filter((c) => c !== "none").join(", ") || undefined,
        dailyCalorieTarget: data.dailyCalorieTarget ? parseInt(data.dailyCalorieTarget) : undefined,
        dailyProteinTarget: data.dailyProteinTarget ? parseInt(data.dailyProteinTarget) : undefined,
        dailyCarbsTarget: data.dailyCarbsTarget ? parseInt(data.dailyCarbsTarget) : undefined,
        dailyFatTarget: data.dailyFatTarget ? parseInt(data.dailyFatTarget) : undefined,
      });
      setAiPlan(result.plan);
    } catch (err: any) {
      toast.error("Could not generate AI plan: " + (err?.message ?? "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleComplete = async (skipAI = false) => {
    try {
      const totalHeightIn = (parseInt(data.heightFt) || 0) * 12 + (parseInt(data.heightIn) || 0);
      const healthStr = data.healthConditions.filter((c) => c !== "none").join(", ") || "none";

      // Use AI plan macros if available, otherwise use calculated targets
      const finalCalories = aiPlan
        ? aiPlan.nutritionPlan.dailyCalories
        : parseInt(data.dailyCalorieTarget) || macros?.calories;
      const finalProtein = aiPlan
        ? aiPlan.nutritionPlan.protein
        : parseInt(data.dailyProteinTarget) || macros?.protein;
      const finalCarbs = aiPlan
        ? aiPlan.nutritionPlan.carbs
        : parseInt(data.dailyCarbsTarget) || macros?.carbs;
      const finalFat = aiPlan
        ? aiPlan.nutritionPlan.fat
        : parseInt(data.dailyFatTarget) || macros?.fat;

      await upsertProfile.mutateAsync({
        gender: (data.gender || "other") as any,
        ageYears: parseInt(data.ageYears) || undefined,
        heightIn: totalHeightIn || undefined,
        weightLbs: parseFloat(data.weightLbs) ? Math.round(parseFloat(data.weightLbs)) : undefined,
        goalWeightLbs: data.goalWeightLbs ? Math.round(parseFloat(data.goalWeightLbs)) : undefined,
        goalDate: data.goalDate ? new Date(data.goalDate).getTime() : undefined,
        fitnessGoal: (data.fitnessGoal || "maintain") as any,
        activityLevel: (data.activityLevel || "moderately_active") as any,
        healthConditions: healthStr,
        dailyCalorieTarget: finalCalories || undefined,
        dailyProteinTarget: finalProtein || undefined,
        dailyCarbsTarget: finalCarbs || undefined,
        dailyFatTarget: finalFat || undefined,
        geminiPlan: aiPlan ? JSON.stringify(aiPlan) : undefined,
        onboardingCompleted: true,
      });

      toast.success("Profile saved! Welcome to HumanAIze 🎉");
      onComplete();
    } catch (err: any) {
      toast.error("Failed to save profile: " + (err?.message ?? "Unknown error"));
    }
  };

  // Validation per step
  const canProceed = () => {
    if (step === 1) return Boolean(data.fitnessGoal);
    if (step === 2) return Boolean(data.gender && data.ageYears && data.weightLbs && data.heightFt);
    if (step === 3) return Boolean(data.activityLevel);
    if (step === 4) return data.healthConditions.length > 0;
    if (step === 5) return Boolean(data.dailyCalorieTarget || macros);
    return true;
  };

  const isLastStep = step === 6;
  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Zap className="h-4 w-4 text-cyan-400" />
              </div>
              <span className="font-bold text-white text-sm">HumanAIze Setup</span>
            </div>
            <button
              onClick={onSkip}
              className="text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 text-xs"
            >
              <SkipForward className="h-3 w-3" />
              Skip setup
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex justify-between">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isDone = s.id < step;
              return (
                <div key={s.id} className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                    isDone ? "bg-cyan-500/30 border-cyan-500/50" :
                    isActive ? "bg-cyan-500/20 border-cyan-400 ring-2 ring-cyan-400/30" :
                    "bg-slate-800 border-slate-700"
                  }`}>
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                    ) : (
                      <Icon className={`h-3.5 w-3.5 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                    )}
                  </div>
                  <span className={`text-[10px] font-medium ${isActive ? "text-cyan-400" : isDone ? "text-slate-400" : "text-slate-600"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-2 max-h-[55vh] overflow-y-auto">
          {step === 1 && <StepGoal data={data} setData={setData} />}
          {step === 2 && <StepBiometrics data={data} setData={setData} />}
          {step === 3 && <StepActivity data={data} setData={setData} />}
          {step === 4 && <StepHealth data={data} setData={setData} />}
          {step === 5 && <StepMacros data={data} setData={setData} macros={macros} />}
          {step === 6 && (
            <StepAIPlan
              plan={aiPlan}
              isLoading={isGenerating}
              onGenerate={handleGeneratePlan}
              onSkip={() => handleComplete(true)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={isGenerating}
              className="border-white/10 bg-transparent text-white hover:bg-white/10 rounded-xl"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}

          {isLastStep ? (
            aiPlan && (
              <Button
                onClick={() => handleComplete(false)}
                disabled={upsertProfile.isPending}
                className="flex-1 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-semibold rounded-xl"
              >
                {upsertProfile.isPending ? "Saving..." : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Start Using HumanAIze
                  </>
                )}
              </Button>
            )
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl disabled:opacity-40"
            >
              {step === 5 ? "Continue to AI Plan" : "Continue"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
