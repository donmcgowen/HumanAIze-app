import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InsightsPanel } from "@/components/InsightsPanel";
import { MacroCalculator } from "@/components/MacroCalculator";
import { ProgressPhotos } from "@/components/ProgressPhotos";
import { toast } from "sonner";
import { Loader2, Settings } from "lucide-react";
import type { ActivityLevel, MacroSuggestion } from "../../../shared/macroCalculator";

export function Profile() {
  const { data: profile, isLoading: isLoadingProfile, refetch } = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.upsert.useMutation();

  const [formData, setFormData] = useState({
    heightCm: "",
    weightKg: "",
    ageYears: "",
    fitnessGoal: "",
  });

  const [bmi, setBmi] = useState<number | null>(null);
  const [bmiCategory, setBmiCategory] = useState<string>("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [goalWeightKg, setGoalWeightKg] = useState<string>("");
  const [goalDate, setGoalDate] = useState<string>("");
  const [dailyTargets, setDailyTargets] = useState<any>(null);
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState<string>("");
  const [dailyProteinTarget, setDailyProteinTarget] = useState<string>("");
  const [dailyCarbsTarget, setDailyCarbsTarget] = useState<string>("");
  const [dailyFatTarget, setDailyFatTarget] = useState<string>("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [showMacroCalculator, setShowMacroCalculator] = useState(false);

  // Unit conversion helpers
  const convertWeight = (kg: number, toUnit: "kg" | "lbs") => {
    return toUnit === "lbs" ? Math.round(kg * 2.20462 * 10) / 10 : kg;
  };

  const convertHeight = (cm: number, toUnit: "cm" | "in") => {
    return toUnit === "in" ? Math.round(cm / 2.54 * 10) / 10 : cm;
  };

  const displayWeight = () => {
    const kg = parseFloat(formData.weightKg);
    if (!kg || kg <= 0) return "";
    return convertWeight(kg, weightUnit).toString();
  };

  const displayHeight = () => {
    const cm = parseFloat(formData.heightCm);
    if (!cm || cm <= 0) return "";
    return convertHeight(cm, heightUnit).toString();
  };

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setFormData({
        heightCm: profile.heightCm?.toString() || "",
        weightKg: profile.weightKg?.toString() || "",
        ageYears: profile.ageYears?.toString() || "",
        fitnessGoal: profile.fitnessGoal || "",
      });
      // Load persisted daily targets
      setDailyCalorieTarget(profile.dailyCalorieTarget?.toString() || "");
      setDailyProteinTarget(profile.dailyProteinTarget?.toString() || "");
      setDailyCarbsTarget(profile.dailyCarbsTarget?.toString() || "");
      setDailyFatTarget(profile.dailyFatTarget?.toString() || "");
      // Activity level will be added after database migration
      // Load goal data
      setGoalWeightKg(profile.goalWeightKg?.toString() || "");
      if (profile.goalDate) {
        const date = new Date(profile.goalDate);
        setGoalDate(date.toISOString().split('T')[0]);
      }
    }
  }, [profile]);

  // Calculate BMI whenever height or weight changes
  useEffect(() => {
    const heightInput = parseFloat(formData.heightCm);
    const weightInput = parseFloat(formData.weightKg);

    if (heightInput > 0 && weightInput > 0) {
      let calculatedBmi: number;
      
      if (heightUnit === "in" && weightUnit === "lbs") {
        // Imperial formula: BMI = (weight_lbs / (height_inches²)) × 703
        calculatedBmi = (weightInput / (heightInput * heightInput)) * 703;
      } else if (heightUnit === "cm" && weightUnit === "kg") {
        // Metric formula: BMI = weight_kg / (height_m²)
        const heightM = heightInput / 100;
        calculatedBmi = weightInput / (heightM * heightM);
      } else {
        // Mixed units - convert to metric first
        let heightCm = heightUnit === "in" ? heightInput * 2.54 : heightInput;
        let weightKg = weightUnit === "lbs" ? weightInput / 2.20462 : weightInput;
        const heightM = heightCm / 100;
        calculatedBmi = weightKg / (heightM * heightM);
      }
      
      setBmi(Math.round(calculatedBmi * 10) / 10);

      // Determine BMI category
      if (calculatedBmi < 18.5) {
        setBmiCategory("Underweight");
      } else if (calculatedBmi < 25) {
        setBmiCategory("Normal weight");
      } else if (calculatedBmi < 30) {
        setBmiCategory("Overweight");
      } else {
        setBmiCategory("Obese");
      }
    } else {
      setBmi(null);
      setBmiCategory("");
    }
  }, [formData.heightCm, formData.weightKg, heightUnit, weightUnit]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGoalChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      fitnessGoal: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Convert values to metric (cm/kg) before saving
      let heightCmValue = formData.heightCm ? parseFloat(formData.heightCm) : undefined;
      let weightKgValue = formData.weightKg ? parseFloat(formData.weightKg) : undefined;
      
      // If user entered values in non-metric units, convert them to metric
      if (heightCmValue && heightUnit === "in") {
        heightCmValue = heightCmValue * 2.54;
      }
      if (weightKgValue && weightUnit === "lbs") {
        weightKgValue = weightKgValue / 2.20462;
      }

      // Convert goal weight if needed
      let goalWeightValue = goalWeightKg ? parseFloat(goalWeightKg) : undefined;
      if (goalWeightValue && weightUnit === "lbs") {
        goalWeightValue = goalWeightValue / 2.20462;
      }

      // Convert goal date to timestamp
      let goalDateTimestamp = undefined;
      if (goalDate) {
        goalDateTimestamp = new Date(goalDate).getTime();
      }

      await updateProfile.mutateAsync({
        heightCm: heightCmValue,
        weightKg: weightKgValue,
        ageYears: formData.ageYears ? parseInt(formData.ageYears) : undefined,
        fitnessGoal: (formData.fitnessGoal as "lose_fat" | "build_muscle" | "maintain") || undefined,
        // activityLevel will be added after database migration
        goalWeightKg: goalWeightValue,
        goalDate: goalDateTimestamp,
        dailyCalorieTarget: dailyCalorieTarget ? parseInt(dailyCalorieTarget) : undefined,
        dailyProteinTarget: dailyProteinTarget ? parseInt(dailyProteinTarget) : undefined,
        dailyCarbsTarget: dailyCarbsTarget ? parseInt(dailyCarbsTarget) : undefined,
        dailyFatTarget: dailyFatTarget ? parseInt(dailyFatTarget) : undefined,
      });

      toast.success("Profile updated successfully");
      refetch();
    } catch (error) {
      toast.error("Failed to update profile");
      console.error(error);
    }
  };

  const getBmiColor = () => {
    if (!bmiCategory) return "text-gray-400";
    if (bmiCategory === "Underweight") return "text-blue-400";
    if (bmiCategory === "Normal weight") return "text-green-400";
    if (bmiCategory === "Overweight") return "text-yellow-400";
    return "text-red-400";
  };

  const getGoalLabel = (goal: string) => {
    const labels: Record<string, string> = {
      lose_fat: "Lose Fat",
      build_muscle: "Build Muscle",
      maintain: "Maintain",
    };
    return labels[goal] || goal;
  };

  // Calculate daily targets when profile data changes
  useEffect(() => {
    if (formData.heightCm && formData.weightKg && formData.ageYears && formData.fitnessGoal) {
      const heightCm = parseFloat(formData.heightCm);
      const weightKg = parseFloat(formData.weightKg);
      const ageYears = parseInt(formData.ageYears);
      
      // Calculate TDEE using Mifflin-St Jeor formula
      const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
      const tdee = Math.round(bmr * 1.55);
      
      // Calculate macros based on goal
      let dailyCalories: number;
      let proteinMultiplier: number;
      let fatMultiplier: number;
      
      if (formData.fitnessGoal === "lose_fat") {
        dailyCalories = Math.round(tdee * 0.8);
        proteinMultiplier = 2.0;
        fatMultiplier = 0.9;
      } else if (formData.fitnessGoal === "build_muscle") {
        dailyCalories = Math.round(tdee * 1.1);
        proteinMultiplier = 2.0;
        fatMultiplier = 1.1;
      } else {
        dailyCalories = tdee;
        proteinMultiplier = 1.7;
        fatMultiplier = 1.0;
      }
      
      // Cap macros to ensure realistic values
      // Protein: 25-35% of calories
      const maxProteinCalories = Math.round(dailyCalories * 0.35);
      let dailyProtein = Math.round(Math.min(weightKg * proteinMultiplier, maxProteinCalories / 4));
      
      // Fat: 20-35% of calories
      const maxFatCalories = Math.round(dailyCalories * 0.35);
      let dailyFat = Math.round(Math.min(weightKg * fatMultiplier, maxFatCalories / 9));
      
      // Carbs: fill remaining calories (ensure non-negative)
      let dailyCarbs = Math.round((dailyCalories - dailyProtein * 4 - dailyFat * 9) / 4);
      dailyCarbs = Math.max(dailyCarbs, 0);
      
      setDailyTargets({
        dailyCalories,
        dailyProtein,
        dailyCarbs,
        dailyFat,
      });
      // Auto-update the target fields with calculated values
      setDailyCalorieTarget(dailyCalories.toString());
      setDailyProteinTarget(dailyProtein.toString());
      setDailyCarbsTarget(dailyCarbs.toString());
      setDailyFatTarget(dailyFat.toString());
    }
  }, [formData.heightCm, formData.weightKg, formData.ageYears, formData.fitnessGoal]);

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">User Profile</h1>
          <p className="text-slate-400">Manage your biometric data and fitness goals</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Biometric Data Card */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-white">Biometric Data</CardTitle>
                  <CardDescription>Enter your height, weight, and age for BMI calculation</CardDescription>
                </div>

              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="heightCm" className="text-slate-300">
                    Height
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="heightCm"
                      name="heightCm"
                      type="number"
                      placeholder={heightUnit === "cm" ? "170" : "67"}
                      value={formData.heightCm}
                      onChange={handleInputChange}
                      className="bg-slate-900 border-white/10 text-white placeholder-slate-500"
                    />
                    <Select value={heightUnit} onValueChange={(value) => setHeightUnit(value as "cm" | "in")}>
                      <SelectTrigger className="w-20 bg-slate-900 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">cm</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center px-3 py-2 rounded-md bg-slate-900 border border-white/10 text-slate-400 text-sm">
                      {displayHeight()} {heightUnit}
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="weightKg" className="text-slate-300">
                    Weight
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="weightKg"
                      name="weightKg"
                      type="number"
                      placeholder={weightUnit === "kg" ? "70" : "154"}
                      value={formData.weightKg}
                      onChange={handleInputChange}
                      className="bg-slate-900 border-white/10 text-white placeholder-slate-500"
                    />
                    <Select value={weightUnit} onValueChange={(value) => setWeightUnit(value as "kg" | "lbs")}>
                      <SelectTrigger className="w-20 bg-slate-900 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="lbs">lbs</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center px-3 py-2 rounded-md bg-slate-900 border border-white/10 text-slate-400 text-sm">
                      {displayWeight()} {weightUnit}
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="ageYears" className="text-slate-300">
                    Age (years)
                  </Label>
                  <Input
                    id="ageYears"
                    name="ageYears"
                    type="number"
                    placeholder="30"
                    value={formData.ageYears}
                    onChange={handleInputChange}
                    className="mt-2 bg-slate-900 border-white/10 text-white placeholder-slate-500"
                  />
                </div>
              </div>

              {/* BMI Display */}
              {bmi !== null && (
                <div className="mt-6 p-4 rounded-lg bg-slate-900 border border-white/10">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-slate-400 text-sm">Your BMI</p>
                      <p className={`text-3xl font-bold ${getBmiColor()}`}>{bmi}</p>
                      <p className={`text-sm mt-1 ${getBmiColor()}`}>{bmiCategory}</p>
                    </div>
                    <div className="text-right text-slate-400 text-xs">
                      <p>BMI Categories:</p>
                      <p className="text-blue-400">Underweight: &lt;18.5</p>
                      <p className="text-green-400">Normal: 18.5-24.9</p>
                      <p className="text-yellow-400">Overweight: 25-29.9</p>
                      <p className="text-red-400">Obese: ≥30</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fitness Goal Card */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white">Fitness Goal</CardTitle>
              <CardDescription>Select your primary fitness objective</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={formData.fitnessGoal} onValueChange={handleGoalChange}>
                <SelectTrigger className="bg-slate-900 border-white/10 text-white">
                  <SelectValue placeholder="Select your fitness goal" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10">
                  <SelectItem value="lose_fat">
                    <span className="text-white">Lose Fat</span>
                  </SelectItem>
                  <SelectItem value="build_muscle">
                    <span className="text-white">Build Muscle</span>
                  </SelectItem>
                  <SelectItem value="maintain">
                    <span className="text-white">Maintain</span>
                  </SelectItem>
                </SelectContent>
              </Select>

              <div>
                <Label htmlFor="activityLevel" className="text-slate-300">
                  Activity Level
                </Label>
                <Select value={activityLevel} onValueChange={(value) => setActivityLevel(value as ActivityLevel)}>
                  <SelectTrigger className="mt-2 bg-slate-900 border-white/10 text-white">
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
              </div>

              {formData.fitnessGoal && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="goalWeight" className="text-slate-300">
                        Goal Weight ({weightUnit})
                      </Label>
                      <Input
                        id="goalWeight"
                        type="number"
                        placeholder={weightUnit === "kg" ? "70" : "154"}
                        value={goalWeightKg}
                        onChange={(e) => setGoalWeightKg(e.target.value)}
                        className="mt-2 bg-slate-900 border-white/10 text-white placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="goalDate" className="text-slate-300">
                        Target Date
                      </Label>
                      <Input
                        id="goalDate"
                        type="date"
                        value={goalDate}
                        onChange={(e) => setGoalDate(e.target.value)}
                        className="mt-2 bg-slate-900 border-white/10 text-white placeholder-slate-500"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                    <p className="text-slate-300 text-sm font-semibold mb-3">
                      <span>Daily Targets for {getGoalLabel(formData.fitnessGoal)}</span>
                    </p>
                    {dailyTargets && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-slate-800 p-3 rounded">
                          <p className="text-slate-400 text-xs">Calories</p>
                          <p className="text-cyan-400 text-lg font-bold">{dailyTargets.dailyCalories}</p>
                        </div>
                        <div className="bg-slate-800 p-3 rounded">
                          <p className="text-slate-400 text-xs">Protein</p>
                          <p className="text-cyan-400 text-lg font-bold">{dailyTargets.dailyProtein}g</p>
                        </div>
                        <div className="bg-slate-800 p-3 rounded">
                          <p className="text-slate-400 text-xs">Carbs</p>
                          <p className="text-cyan-400 text-lg font-bold">{dailyTargets.dailyCarbs}g</p>
                        </div>
                        <div className="bg-slate-800 p-3 rounded">
                          <p className="text-slate-400 text-xs">Fat</p>
                          <p className="text-cyan-400 text-lg font-bold">{dailyTargets.dailyFat}g</p>
                        </div>
                      </div>
                    )}
                    <p className="text-slate-400 text-xs mb-3">Customize your daily targets (optional):</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label htmlFor="dailyCalorieTarget" className="text-slate-300 text-xs">
                          Calories
                        </Label>
                        <Input
                          id="dailyCalorieTarget"
                          type="number"
                          placeholder="2000"
                          value={dailyCalorieTarget}
                          onChange={(e) => setDailyCalorieTarget(e.target.value)}
                          className="mt-1 bg-slate-800 border-white/10 text-white placeholder-slate-500 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dailyProteinTarget" className="text-slate-300 text-xs">
                          Protein (g)
                        </Label>
                        <Input
                          id="dailyProteinTarget"
                          type="number"
                          placeholder="150"
                          value={dailyProteinTarget}
                          onChange={(e) => setDailyProteinTarget(e.target.value)}
                          className="mt-1 bg-slate-800 border-white/10 text-white placeholder-slate-500 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dailyCarbsTarget" className="text-slate-300 text-xs">
                          Carbs (g)
                        </Label>
                        <Input
                          id="dailyCarbsTarget"
                          type="number"
                          placeholder="200"
                          value={dailyCarbsTarget}
                          onChange={(e) => setDailyCarbsTarget(e.target.value)}
                          className="mt-1 bg-slate-800 border-white/10 text-white placeholder-slate-500 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dailyFatTarget" className="text-slate-300 text-xs">
                          Fat (g)
                        </Label>
                        <Input
                          id="dailyFatTarget"
                          type="number"
                          placeholder="65"
                          value={dailyFatTarget}
                          onChange={(e) => setDailyFatTarget(e.target.value)}
                          className="mt-1 bg-slate-800 border-white/10 text-white placeholder-slate-500 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-white/10">
                    <p className="text-slate-300 text-sm">
                      <span className="font-semibold">Goal:</span> {getGoalLabel(formData.fitnessGoal)}
                    </p>
                    {formData.fitnessGoal === "lose_fat" && (
                      <p className="text-slate-400 text-xs mt-2">
                        Focus on caloric deficit, regular cardio, and strength training to preserve muscle mass.
                      </p>
                    )}
                    {formData.fitnessGoal === "build_muscle" && (
                      <p className="text-slate-400 text-xs mt-2">
                        Prioritize strength training, adequate protein intake, and caloric surplus for muscle growth.
                      </p>
                    )}
                    {formData.fitnessGoal === "maintain" && (
                      <p className="text-slate-400 text-xs mt-2">
                        Balance your nutrition and exercise to maintain current fitness levels.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Macro Calculator */}
          {formData.heightCm && formData.weightKg && formData.ageYears && formData.fitnessGoal && (
            <MacroCalculator
              heightCm={parseFloat(formData.heightCm)}
              weightKg={parseFloat(formData.weightKg)}
              ageYears={parseInt(formData.ageYears)}
              fitnessGoal={formData.fitnessGoal as "lose_fat" | "build_muscle" | "maintain"}
              activityLevel={activityLevel}
              onApply={(macros: MacroSuggestion) => {
                setDailyCalorieTarget(macros.dailyCalories.toString());
                setDailyProteinTarget(macros.dailyProtein.toString());
                setDailyCarbsTarget(macros.dailyCarbs.toString());
                setDailyFatTarget(macros.dailyFat.toString());
                toast.success("Macro targets applied!");
              }}
              isLoading={updateProfile.isPending}
            />
          )}

          {/* Progress Photos Section */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white">Progress Photos</CardTitle>
              <CardDescription>Track your physical transformation with photos</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressPhotos />
            </CardContent>
          </Card>

          {/* Insights Section */}
          <InsightsPanel 
            insights={[
              {
                type: "tip" as const,
                title: "Complete Your Profile",
                description: "Your biometric data helps us provide personalized health recommendations and track your progress.",
                action: "Save your profile to get started with personalized insights."
              },
              {
                type: "success" as const,
                title: "Track Your Progress",
                description: "Monitor your BMI changes and fitness goal progress over time.",
                action: "Connect health data sources to see how your metrics align with your goals."
              }
            ]}
          />

          {/* Submit Button */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={updateProfile.isPending}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold"
            >
              {updateProfile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Profile"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
