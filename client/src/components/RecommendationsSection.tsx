import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Utensils, Dumbbell, RefreshCw, CheckCircle, XCircle, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface NutritionPlan {
  dailyCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  keyPrinciples: string[];
  mealTiming: string;
  foodsToEat: string[];
  foodsToAvoid: string[];
}

interface WorkoutPlan {
  type: string;
  daysPerWeek: number;
  sessionDuration: string;
  cardio: string;
  strength: string;
  weeklySchedule: string[];
}

interface AIPlan {
  summary?: string;
  nutritionPlan: NutritionPlan;
  workoutPlan: WorkoutPlan;
  timeline?: string;
}

export function RecommendationsSection() {
  const utils = trpc.useUtils();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery();

  const generateMutation = trpc.profile.generateAIPlan.useMutation({
    onSuccess: async (result) => {
      if (result.success && result.plan) {
        await savePlanMutation.mutateAsync({ geminiPlan: JSON.stringify(result.plan) });
        utils.profile.get.invalidate();
      }
      setIsGenerating(false);
    },
    onError: (error) => {
      setIsGenerating(false);
      toast.error(error.message || "Failed to generate recommendations");
    },
  });

  const savePlanMutation = trpc.profile.upsert.useMutation();

  const handleGenerate = () => {
    if (!profile) {
      toast.error("Complete your profile first to get personalized recommendations");
      return;
    }
    if (!profile.ageYears || !profile.weightLbs || !profile.heightIn) {
      toast.error("Add your age, weight, and height in your profile to get recommendations");
      return;
    }
    setIsGenerating(true);
    generateMutation.mutate({
      gender: profile.gender ?? "other",
      ageYears: profile.ageYears,
      weightLbs: profile.weightLbs,
      heightIn: profile.heightIn,
      goalWeightLbs: profile.goalWeightLbs ?? undefined,
      goalDate: profile.goalDate ?? undefined,
      fitnessGoal: (profile.fitnessGoal as any) ?? "maintain",
      activityLevel: (profile.activityLevel as any) ?? "moderately_active",
      healthConditions: profile.healthConditions ?? undefined,
      dailyCalorieTarget: profile.dailyCalorieTarget ?? undefined,
      dailyProteinTarget: profile.dailyProteinTarget ?? undefined,
      dailyCarbsTarget: profile.dailyCarbsTarget ?? undefined,
      dailyFatTarget: profile.dailyFatTarget ?? undefined,
    });
  };

  const plan: AIPlan | null = (() => {
    if (!profile?.geminiPlan) return null;
    try { return JSON.parse(profile.geminiPlan); } catch { return null; }
  })();

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400 mr-2" />
        <span className="text-slate-400 text-sm">Loading profile...</span>
      </div>
    );
  }

  const hasProfile = profile?.ageYears && profile?.weightLbs && profile?.heightIn;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Recommendations</h2>
          <p className="text-slate-400 text-sm">Personalized food and workout plans based on your stats and targets</p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !hasProfile}
          className="bg-cyan-500 hover:bg-cyan-600 shrink-0"
          title={!hasProfile ? "Complete your profile to generate recommendations" : undefined}
        >
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
          ) : plan ? (
            <><RefreshCw className="h-4 w-4 mr-2" /> Refresh</>
          ) : (
            "Generate Plan"
          )}
        </Button>
      </div>

      {!hasProfile && (
        <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-900/10 text-yellow-400 text-sm">
          Add your age, weight, and height in your profile to unlock AI recommendations.
        </div>
      )}

      {isGenerating && (
        <div className="p-6 rounded-lg border border-white/10 bg-slate-950 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
          <span className="text-slate-400 text-sm">Generating your personalized plan with AI...</span>
        </div>
      )}

      {plan && !isGenerating && (
        <>
          {/* Food Recommendations */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Utensils className="h-5 w-5 text-green-400" />
                Food Recommendations
              </CardTitle>
              <CardDescription>
                {plan.nutritionPlan.dailyCalories} cal · {plan.nutritionPlan.protein}g protein · {plan.nutritionPlan.carbs}g carbs · {plan.nutritionPlan.fat}g fat
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Key principles */}
              {plan.nutritionPlan.keyPrinciples?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Key Principles</p>
                  <ul className="space-y-1">
                    {plan.nutritionPlan.keyPrinciples.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <CheckCircle className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Meal timing */}
              {plan.nutritionPlan.mealTiming && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-900/50 border border-white/10">
                  <Clock className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Meal Timing</p>
                    <p className="text-sm text-slate-300">{plan.nutritionPlan.mealTiming}</p>
                  </div>
                </div>
              )}

              {/* Foods to eat / avoid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">Eat More</p>
                  <ul className="space-y-1">
                    {plan.nutritionPlan.foodsToEat?.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Limit / Avoid</p>
                  <ul className="space-y-1">
                    {plan.nutritionPlan.foodsToAvoid?.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workout Recommendations */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-purple-400" />
                Workout Recommendations
              </CardTitle>
              <CardDescription>
                {plan.workoutPlan.type} · {plan.workoutPlan.daysPerWeek} days/week · {plan.workoutPlan.sessionDuration}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Cardio + Strength */}
              <div className="grid grid-cols-1 gap-3">
                {plan.workoutPlan.cardio && (
                  <div className="p-3 rounded-lg bg-cyan-900/20 border border-cyan-500/30">
                    <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-1">Cardio</p>
                    <p className="text-sm text-slate-300">{plan.workoutPlan.cardio}</p>
                  </div>
                )}
                {plan.workoutPlan.strength && (
                  <div className="p-3 rounded-lg bg-purple-900/20 border border-purple-500/30">
                    <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1">Strength</p>
                    <p className="text-sm text-slate-300">{plan.workoutPlan.strength}</p>
                  </div>
                )}
              </div>

              {/* Weekly schedule */}
              {plan.workoutPlan.weeklySchedule?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Weekly Schedule
                  </p>
                  <ul className="space-y-1.5">
                    {plan.workoutPlan.weeklySchedule.map((day, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300 p-2 rounded bg-slate-900/40">
                        <span className="text-slate-500 shrink-0 font-mono text-xs mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                        {day}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Timeline */}
              {plan.timeline && (
                <div className="p-3 rounded-lg bg-slate-900/50 border border-white/10 text-sm text-slate-300">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Timeline</p>
                  {plan.timeline}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!plan && !isGenerating && hasProfile && (
        <div className="p-8 rounded-lg border border-white/10 bg-slate-950 text-center">
          <Dumbbell className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-1">No recommendations yet</p>
          <p className="text-slate-500 text-sm">Hit "Generate Plan" to get AI-powered food and workout recommendations</p>
        </div>
      )}
    </div>
  );
}
