import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ProgressPhotos } from "@/components/ProgressPhotos";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { calculateMacros, getActivityLevelLabel, type ActivityLevel, type MacroSuggestion } from "../../../shared/macroCalculator";

export function Profile() {
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

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setFormData({
        heightIn: profile.heightIn ? profile.heightIn.toString() : "0",
        weightLbs: profile.weightLbs ? profile.weightLbs.toString() : "0",
        ageYears: profile.ageYears ? profile.ageYears.toString() : "0",
        goalWeightLbs: profile.goalWeightLbs ? profile.goalWeightLbs.toString() : "0",
        goalDate: profile.goalDate ? new Date(profile.goalDate).toISOString().split('T')[0] : "",
        fitnessGoal: profile.fitnessGoal || "",
      });
      setDailyCalorieTarget(profile.dailyCalorieTarget ? profile.dailyCalorieTarget.toString() : "0");
      setDailyProteinTarget(profile.dailyProteinTarget ? profile.dailyProteinTarget.toString() : "0");
      setDailyCarbsTarget(profile.dailyCarbsTarget ? profile.dailyCarbsTarget.toString() : "0");
      setDailyFatTarget(profile.dailyFatTarget ? profile.dailyFatTarget.toString() : "0");
      setGoalWeightLbs(profile.goalWeightLbs ? profile.goalWeightLbs.toString() : "");
      if (profile.goalDate) {
        const date = new Date(profile.goalDate);
        setGoalDate(date.toISOString().split('T')[0]);
      }
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
        // Convert imperial to metric for calculation
        const heightCm = heightInput * 2.54;
        const weightKg = weightInput / 2.20462;
        
        const maintenance = calculateMacros({
          heightCm,
          weightKg,
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

  // Calculate goal-based targets
  useEffect(() => {
    const heightInput = parseFloat(formData.heightIn);
    const weightInput = parseFloat(formData.weightLbs);
    const ageInput = parseInt(formData.ageYears);
        const goalWeight = parseFloat(formData.goalWeightLbs);

    if (heightInput > 0 && weightInput > 0 && ageInput > 0 && goalWeight > 0 && formData.fitnessGoal) {
      try {
        // Convert imperial to metric for calculation
        const heightCm = heightInput * 2.54;
        const weightKg = weightInput / 2.20462;
        const goalWeightKg = goalWeight / 2.20462;
        
        const targets = calculateMacros({
          heightCm,
          weightKg,
          ageYears: ageInput,
          activityLevel,
          fitnessGoal: formData.fitnessGoal as 'lose_fat' | 'build_muscle' | 'maintain',
          goalWeightKg: formData.fitnessGoal === 'lose_fat' ? goalWeightKg : undefined,
          targetDateMs: formData.fitnessGoal === 'lose_fat' && formData.goalDate ? new Date(formData.goalDate + 'T00:00:00').getTime() : undefined,
        });
        setGoalTargets(targets);
      } catch (error) {
        console.error("Error calculating goal targets:", error);
      }
    }
  }, [formData.heightIn, formData.weightLbs, formData.ageYears, formData.goalWeightLbs, formData.goalDate, formData.fitnessGoal, activityLevel]);

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
      const goalDateVal = goalDate ? new Date(goalDate).getTime() : undefined;

      await updateProfile.mutateAsync({
        heightIn: heightInput,
        weightLbs: weightInput,
        ageYears: ageInput,
        fitnessGoal: (formData.fitnessGoal || undefined) as 'lose_fat' | 'build_muscle' | 'maintain' | undefined,
        goalWeightLbs: goalWeightVal,
        goalDate: goalDateVal,
        dailyCalorieTarget: dailyCalorieTarget ? parseInt(dailyCalorieTarget) : undefined,
        dailyProteinTarget: dailyProteinTarget ? parseInt(dailyProteinTarget) : undefined,
        dailyCarbsTarget: dailyCarbsTarget ? parseInt(dailyCarbsTarget) : undefined,
        dailyFatTarget: dailyFatTarget ? parseInt(dailyFatTarget) : undefined,
      });

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

      {/* Custom Maintenance Calories */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Customize Maintenance Calories (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            placeholder="Enter custom maintenance calories"
            value={customMaintenanceCalories}
            onChange={(e) => setCustomMaintenanceCalories(e.target.value)}
            className="bg-slate-900 border-white/10 text-white placeholder-slate-500"
          />
        </CardContent>
      </Card>

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
                    onChange={(e) => setGoalWeightLbs(e.target.value.replace(/[^\d]/g, ''))}
                    className="bg-slate-900 border-white/10 text-white placeholder-slate-500 mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="goalDate" className="text-slate-300">Target Date</Label>
                  <Input
                    id="goalDate"
                    type="date"
                    value={goalDate}
                    onChange={(e) => setGoalDate(e.target.value)}
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
                </div>
              )}
            </>
          )}
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
  );
}
