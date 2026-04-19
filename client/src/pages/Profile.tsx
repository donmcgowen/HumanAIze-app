import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ProgressPhotos } from "@/components/ProgressPhotos";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { calculateMacros, getActivityLevelLabel, type ActivityLevel, type MacroSuggestion } from "../../../shared/macroCalculator";

export function Profile() {
  const [showWizard, setShowWizard] = useState(false);
  const utils = trpc.useUtils();
  const { data: profile, isLoading: isLoadingProfile, refetch } = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.upsert.useMutation();

  const [formData, setFormData] = useState({
    heightIn: "0",
    weightLbs: "0",
    ageYears: "0",
    fitnessGoal: "",
    goalWeightLbs: "0",
    goalDate: "",
  });

  const [bmi, setBmi] = useState<number | null>(null);
  const [bmiCategory, setBmiCategory] = useState<string>("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [diabetesType, setDiabetesType] = useState<string>("");

  // Maintenance calories state
  const [maintenanceCalories, setMaintenanceCalories] = useState<MacroSuggestion | null>(null);
  const [customMaintenanceCalories, setCustomMaintenanceCalories] = useState<string>("");
  
  // Goal-based targets state
  const [goalWeightLbs, setGoalWeightLbs] = useState<string>("");
  const [goalDate, setGoalDate] = useState<string>("");
  const [goalTargets, setGoalTargets] = useState<MacroSuggestion | null>(null);
  
  // Customizable daily targets
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState<string>("");
  const [dailyProteinTarget, setDailyProteinTarget] = useState<string>("");
  const [dailyCarbsTarget, setDailyCarbsTarget] = useState<string>("");
  const [dailyFatTarget, setDailyFatTarget] = useState<string>("");

  const parsePositiveIntOrUndefined = (value: string): number | undefined => {
    if (!value) return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const toDateInputValue = (value: unknown): string => {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    let normalizedValue: string | number | Date = value as string | number | Date;
    if (typeof value === "bigint") {
      normalizedValue = Number(value);
    } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      normalizedValue = Number(value);
    }

    const date = new Date(normalizedValue);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }

    return date.toISOString().split("T")[0];
  };

  const toUtcMidnightTimestampOrUndefined = (value: string): number | undefined => {
    if (!value) return undefined;
    const [year, month, day] = value.split("-").map((x) => parseInt(x, 10));
    if (!year || !month || !day) return undefined;
    const ts = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    return Number.isFinite(ts) ? ts : undefined;
  };

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setFormData({
        heightIn: profile.heightIn ? profile.heightIn.toString() : "0",
        weightLbs: profile.weightLbs ? profile.weightLbs.toString() : "0",
        ageYears: profile.ageYears ? profile.ageYears.toString() : "0",
        goalWeightLbs: profile.goalWeightLbs ? profile.goalWeightLbs.toString() : "0",
        goalDate: toDateInputValue(profile.goalDate),
        fitnessGoal: profile.fitnessGoal || "",
      });
      setDailyCalorieTarget(profile.dailyCalorieTarget ? profile.dailyCalorieTarget.toString() : "");
      setDailyProteinTarget(profile.dailyProteinTarget ? profile.dailyProteinTarget.toString() : "");
      setDailyCarbsTarget(profile.dailyCarbsTarget ? profile.dailyCarbsTarget.toString() : "");
      setDailyFatTarget(profile.dailyFatTarget ? profile.dailyFatTarget.toString() : "");
      setGoalWeightLbs(profile.goalWeightLbs ? profile.goalWeightLbs.toString() : "");
      setGoalDate(toDateInputValue(profile.goalDate));
      if (profile.activityLevel) setActivityLevel(profile.activityLevel as ActivityLevel);
      if (profile.diabetesType) setDiabetesType(profile.diabetesType);
    }
  }, [profile]);

  // Calculate BMI whenever height or weight changes (using imperial formula)
  useEffect(() => {
    const heightInput = parseFloat(formData.heightIn);
    const weightInput = parseFloat(formData.weightLbs);

    if (heightInput > 0 && weightInput > 0) {
      // BMI formula for imperial units: (weight in lbs / (height in inches)^2) * 703
      const calculatedBmi = (weightInput / (heightInput * heightInput)) * 703;
      const roundedBmi = Math.round(calculatedBmi * 10) / 10;
      setBmi(roundedBmi);

      if (roundedBmi < 18.5) setBmiCategory("Underweight");
      else if (roundedBmi < 25) setBmiCategory("Normal weight");
      else if (roundedBmi < 30) setBmiCategory("Overweight");
      else setBmiCategory("Obese");
    } else {
      setBmi(null);
      setBmiCategory("");
    }
  }, [formData.heightIn, formData.weightLbs]);

  // Calculate maintenance calories whenever biometric data or activity level changes
  useEffect(() => {
    const heightInput = parseFloat(formData.heightIn);
    const weightInput = parseFloat(formData.weightLbs);
    const ageInput = parseInt(formData.ageYears);

    if (heightInput > 0 && weightInput > 0 && ageInput > 0) {
      try {
        const maintenance = calculateMacros({
          heightIn: heightInput,
          weightLbs: weightInput,
          ageYears: ageInput,
          activityLevel,
          fitnessGoal: 'maintain',
        });
        setMaintenanceCalories(maintenance);
      } catch (error) {
        console.error("Error calculating maintenance calories:", error);
      }
    }
  }, [formData.heightIn, formData.weightLbs, formData.ageYears, activityLevel]);

  // Calculate goal-based targets and auto-sync into dailyTarget fields
  useEffect(() => {
    const heightInput = parseFloat(formData.heightIn);
    const weightInput = parseFloat(formData.weightLbs);
    const ageInput = parseInt(formData.ageYears);
    const goalWeight = parseFloat(goalWeightLbs);

    if (heightInput > 0 && weightInput > 0 && ageInput > 0 && goalWeight > 0 && formData.fitnessGoal) {
      try {
        const targets = calculateMacros({
          heightIn: heightInput,
          weightLbs: weightInput,
          ageYears: ageInput,
          activityLevel,
          fitnessGoal: formData.fitnessGoal as 'lose_fat' | 'build_muscle' | 'maintain',
          goalWeightLbs: formData.fitnessGoal === 'lose_fat' ? goalWeight : undefined,
          targetDateMs: formData.fitnessGoal === 'lose_fat' && goalDate ? toUtcMidnightTimestampOrUndefined(goalDate) : undefined,
        });
        setGoalTargets(targets);
        // Auto-populate the daily target fields so they are always saved to the DB
        setDailyCalorieTarget(String(targets.dailyCalories));
        setDailyProteinTarget(String(targets.dailyProtein));
        setDailyCarbsTarget(String(targets.dailyCarbs));
        setDailyFatTarget(String(targets.dailyFat));
      } catch (error) {
        console.error("Error calculating goal targets:", error);
      }
    }
  }, [formData.heightIn, formData.weightLbs, formData.ageYears, goalWeightLbs, goalDate, formData.fitnessGoal, activityLevel]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Only allow whole numbers (no decimals)
    const numValue = value.replace(/[^\d]/g, '');
    
    setFormData(prev => ({
      ...prev,
      [name]: numValue,
    }));
  };

  const handleSave = async () => {
    const heightInput = parseInt(formData.heightIn);
    const weightInput = parseInt(formData.weightLbs);
    const ageInput = parseInt(formData.ageYears);

    if (heightInput <= 0 || weightInput <= 0 || ageInput <= 0) {
      toast.error("Please enter valid height, weight, and age");
      return;
    }

    try {
      const goalWeightVal = goalWeightLbs ? parseInt(goalWeightLbs) : undefined;
      const goalDateVal = toUtcMidnightTimestampOrUndefined(goalDate);
      // dailyTarget state fields are always kept in sync with goalTargets via useEffect above,
      // so we can always read directly from them — no need for the goalTargets ?? fallback.
      const effectiveDailyCalorieTarget = parsePositiveIntOrUndefined(dailyCalorieTarget);
      const effectiveDailyProteinTarget = parsePositiveIntOrUndefined(dailyProteinTarget);
      const effectiveDailyCarbsTarget = parsePositiveIntOrUndefined(dailyCarbsTarget);
      const effectiveDailyFatTarget = parsePositiveIntOrUndefined(dailyFatTarget);

      await updateProfile.mutateAsync({
        heightIn: heightInput,
        weightLbs: weightInput,
        ageYears: ageInput,
        fitnessGoal: (formData.fitnessGoal || undefined) as 'lose_fat' | 'build_muscle' | 'maintain' | undefined,
        activityLevel: activityLevel as 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active',
        diabetesType: (diabetesType || undefined) as 'type1' | 'type2' | 'prediabetes' | 'gestational' | 'other' | undefined,
        goalWeightLbs: goalWeightVal,
        goalDate: goalDateVal,
        dailyCalorieTarget: effectiveDailyCalorieTarget,
        dailyProteinTarget: effectiveDailyProteinTarget,
        dailyCarbsTarget: effectiveDailyCarbsTarget,
        dailyFatTarget: effectiveDailyFatTarget,
      });

      await utils.profile.get.invalidate();

      toast.success("Profile saved successfully!");
      refetch();
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile");
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Profile</h1>
        <p className="text-slate-400">Manage your biometric data and fitness goals</p>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Biometric Data</CardTitle>
          <CardDescription>Enter your height, weight, and age for BMI calculation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Height */}
          <div>
            <Label htmlFor="heightIn" className="text-slate-300">
              Height (inches)
            </Label>
            <Input
              id="heightIn"
              name="heightIn"
              type="number"
              step="1"
              min="0"
              placeholder="70"
              value={formData.heightIn}
              onChange={handleInputChange}
              className="bg-slate-900 border-white/10 text-white placeholder-slate-500 mt-2"
            />
          </div>

          {/* Weight */}
          <div>
            <Label htmlFor="weightLbs" className="text-slate-300">
              Weight (lbs)
            </Label>
            <Input
              id="weightLbs"
              name="weightLbs"
              type="number"
              step="1"
              min="0"
              placeholder="154"
              value={formData.weightLbs}
              onChange={handleInputChange}
              className="bg-slate-900 border-white/10 text-white placeholder-slate-500 mt-2"
            />
          </div>

          {/* Age */}
          <div>
            <Label htmlFor="ageYears" className="text-slate-300">
              Age (years)
            </Label>
            <Input
              id="ageYears"
              name="ageYears"
              type="number"
              step="1"
              min="0"
              max="150"
              placeholder="30"
              value={formData.ageYears}
              onChange={handleInputChange}
              className="bg-slate-900 border-white/10 text-white placeholder-slate-500 mt-2"
            />
          </div>

          {/* BMI Display */}
          <div className="bg-slate-900 border border-white/10 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-sm mb-1">Your BMI</p>
                <p className="text-4xl font-bold text-blue-400">{bmi !== null ? bmi : "0"}</p>
                <p className="text-slate-400 mt-1">{bmiCategory}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-slate-400 font-semibold mb-2">BMI Categories:</p>
                <p className="text-blue-400">Underweight: &lt;18.5</p>
                <p className="text-green-400">Normal: 18.5-24.9</p>
                <p className="text-yellow-400">Overweight: 25-29.9</p>
                <p className="text-red-400">Obese: ≥30</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Level */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Activity Level</CardTitle>
          <CardDescription>Select your typical weekly activity level</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={activityLevel} onValueChange={(value) => setActivityLevel(value as ActivityLevel)}>
            <SelectTrigger className="bg-slate-900 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10">
              <SelectItem value="sedentary">Sedentary (little or no exercise)</SelectItem>
              <SelectItem value="lightly_active">Lightly Active (1-3 days/week)</SelectItem>
              <SelectItem value="moderately_active">Moderately Active (3-5 days/week)</SelectItem>
              <SelectItem value="very_active">Very Active (6-7 days/week)</SelectItem>
              <SelectItem value="extremely_active">Extremely Active (physical job)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Diabetes Type */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Diabetes Type</CardTitle>
          <CardDescription>Select your diabetes type for personalized glucose insights (optional)</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={diabetesType} onValueChange={setDiabetesType}>
            <SelectTrigger className="bg-slate-900 border-white/10 text-white">
              <SelectValue placeholder="Select diabetes type (optional)" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10">
              <SelectItem value="type1">Type 1 Diabetes</SelectItem>
              <SelectItem value="type2">Type 2 Diabetes</SelectItem>
              <SelectItem value="prediabetes">Prediabetes</SelectItem>
              <SelectItem value="gestational">Gestational Diabetes</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Maintenance Calories */}
      {maintenanceCalories && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle>Maintenance Calories</CardTitle>
            <CardDescription>Your daily calorie needs at current activity level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 p-3 rounded">
                <p className="text-slate-400 text-sm">Daily Calories</p>
                <p className="text-2xl font-bold text-blue-400">{maintenanceCalories.dailyCalories}</p>
              </div>
              <div className="bg-slate-900 p-3 rounded">
                <p className="text-slate-400 text-sm">Protein</p>
                <p className="text-2xl font-bold text-red-400">{maintenanceCalories.dailyProtein}g</p>
              </div>
              <div className="bg-slate-900 p-3 rounded">
                <p className="text-slate-400 text-sm">Carbs</p>
                <p className="text-2xl font-bold text-yellow-400">{maintenanceCalories.dailyCarbs}g</p>
              </div>
              <div className="bg-slate-900 p-3 rounded">
                <p className="text-slate-400 text-sm">Fat</p>
                <p className="text-2xl font-bold text-orange-400">{maintenanceCalories.dailyFat}g</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fitness Goal */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Fitness Goal</CardTitle>
          <CardDescription>Select your primary fitness objective</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={formData.fitnessGoal} onValueChange={(value) => setFormData(prev => ({ ...prev, fitnessGoal: value }))}>
            <SelectTrigger className="bg-slate-900 border-white/10 text-white">
              <SelectValue placeholder="Select your fitness goal" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10">
              <SelectItem value="lose_fat">Lose Fat</SelectItem>
              <SelectItem value="build_muscle">Build Muscle</SelectItem>
              <SelectItem value="maintain">Maintain</SelectItem>
            </SelectContent>
          </Select>

          {formData.fitnessGoal && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="goalWeightLbs" className="text-slate-300">Goal Weight (lbs)</Label>
                  <Input
                    id="goalWeightLbs"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="150"
                    value={goalWeightLbs}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/[^\d]/g, '');
                      setGoalWeightLbs(sanitized);
                      setFormData((prev) => ({ ...prev, goalWeightLbs: sanitized }));
                    }}
                    className="bg-slate-900 border-white/10 text-white placeholder-slate-500 mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="goalDate" className="text-slate-300">Target Date</Label>
                  <Input
                    id="goalDate"
                    type="date"
                    value={goalDate}
                    onChange={(e) => {
                      setGoalDate(e.target.value);
                      setFormData((prev) => ({ ...prev, goalDate: e.target.value }));
                    }}
                    className="bg-slate-900 border-white/10 text-white mt-2"
                  />
                </div>
              </div>

              {goalTargets && (
                <div className="bg-slate-900 p-4 rounded border border-white/10">
                  <p className="text-slate-300 font-semibold mb-3">Daily Targets for {formData.fitnessGoal === 'lose_fat' ? 'Fat Loss' : formData.fitnessGoal === 'build_muscle' ? 'Muscle Building' : 'Maintenance'}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-slate-400 text-sm">Calories</p>
                      <p className="text-xl font-bold text-blue-400">{goalTargets.dailyCalories}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Protein</p>
                      <p className="text-xl font-bold text-red-400">{goalTargets.dailyProtein}g</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Carbs</p>
                      <p className="text-xl font-bold text-yellow-400">{goalTargets.dailyCarbs}g</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Fat</p>
                      <p className="text-xl font-bold text-orange-400">{goalTargets.dailyFat}g</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    These targets are saved to your profile and used in Food Logging when you save profile.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/10"
                    onClick={() => {
                      window.location.href = "/food-logging#daily-targets";
                    }}
                  >
                    View Current vs Target in Food Logging
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Build Profile with AI Wizard */}
      <Card className="bg-gradient-to-br from-purple-900/30 to-cyan-900/30 border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-cyan-400" />
            Build Profile with AI
          </CardTitle>
          <CardDescription className="text-slate-400">
            Let Gemini AI analyze your goals, health conditions, and biometrics to create a personalized nutrition and workout plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => setShowWizard(true)}
            className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-semibold"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Launch Profile Builder Wizard
          </Button>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Re-run the onboarding wizard to update your AI-generated plan
          </p>
        </CardContent>
      </Card>

      {/* Progress Photos */}
      <ProgressPhotos />

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={updateProfile.isPending}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
      >
        {updateProfile.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Profile"
        )}
      </Button>
    </div>

    {/* Onboarding Wizard re-run */}
    {showWizard && (
      <OnboardingWizard
        onComplete={() => {
          setShowWizard(false);
          utils.profile.get.invalidate();
          toast.success("Profile updated with your new AI plan!");
        }}
        onSkip={() => setShowWizard(false)}
      />
    )}
    </>
  );
}
