import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightsPanel } from "@/components/InsightsPanel";
import { StepCounter } from "@/components/StepCounter";
import { WeightTracker } from "@/components/WeightTracker";
import { CGMSection } from "@/components/CGMSection";
import { BodyMeasurementSection } from "@/components/BodyMeasurementSection";
import { Loader2, Footprints, Weight, Activity, Clock } from "lucide-react";
import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc";

export function Monitoring() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const { data: profile } = trpc.profile.get.useQuery(undefined, { enabled: !!user });
  const { data: dashboard } = trpc.health.dashboard.useQuery({ rangeDays: 14 });
  const [liveSteps, setLiveSteps] = useState(0);
  const handleStepUpdate = useCallback((total: number) => setLiveSteps(total), []);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Generate rule-based insights from steps and glucose data
  const generateInsights = () => {
    const insights = [];

    // Steps Insights
    const dailyGoal = 10000;
    if (liveSteps >= dailyGoal) {
      insights.push({
        type: "success" as const,
        title: "Daily Step Goal Achieved!",
        description: `Great job! You've completed ${liveSteps.toLocaleString()} steps today, exceeding your goal of ${dailyGoal.toLocaleString()}.`,
        action: "Keep up this activity level to support your weight loss goals.",
      });
    } else if (liveSteps >= dailyGoal * 0.75) {
      const stepsPercentage = Math.round((liveSteps / dailyGoal) * 100);
      insights.push({
        type: "tip" as const,
        title: "Almost There on Steps",
        description: `You're at ${stepsPercentage}% of your daily goal with ${liveSteps.toLocaleString()} steps. Just ${(dailyGoal - liveSteps).toLocaleString()} more to go!`,
        action: "Take a short walk to finish strong today.",
      });
    } else if (liveSteps > 0) {
      insights.push({
        type: "tip" as const,
        title: "Increase Daily Activity",
        description: `You've logged ${liveSteps.toLocaleString()} steps today. Aim for ${dailyGoal.toLocaleString()} steps daily to support your weight loss and improve cardiovascular health.`,
        action: "Try taking short walks throughout the day to boost your step count.",
      });
    } else {
      insights.push({
        type: "tip" as const,
        title: "Start Moving Today",
        description: "No steps logged yet. Daily activity is crucial for weight loss and overall health. Aim for 10,000 steps today.",
        action: "Take a walk or engage in light activity to get started.",
      });
    }

    // Glucose Insights (rule-based)
    const avgGlucose = dashboard?.summary?.glucoseAverage;
    if (avgGlucose) {
      if (avgGlucose > 180) {
        insights.push({
          type: "warning" as const,
          title: "Elevated Average Glucose",
          description: `Your 14-day average glucose is ${avgGlucose.toFixed(0)} mg/dL, above the target range of 80–180 mg/dL.`,
          action: "Review recent meals for high-carb items and log glucose after meals to identify patterns.",
        });
      } else if (avgGlucose >= 80 && avgGlucose <= 140) {
        insights.push({
          type: "success" as const,
          title: "Glucose in Healthy Range",
          description: `Your 14-day average glucose is ${avgGlucose.toFixed(0)} mg/dL — within the healthy target range.`,
          action: "Keep logging meals and glucose to maintain this trend.",
        });
      }
    }

    return insights;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Health Monitoring</h1>
          <p className="text-slate-400">Track your weight, glucose, body measurements, and daily activity</p>
        </div>

        {/* Weight Tracking Section - TOP */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
            <Weight className="w-5 h-5 text-blue-400" />
            Weight Tracking
          </h2>
          <WeightTracker />
        </div>

        {/* Body Measurements Section */}
        <div className="mb-6">
          <BodyMeasurementSection />
        </div>

        {/* Steps Section */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
            <Footprints className="w-5 h-5 text-cyan-400" />
            Steps
          </h2>
          <StepCounter onTotalChange={handleStepUpdate} />
        </div>

        {/* Dexcom Clarity Summary Cards */}
        {(profile?.cgmA1cEstimate || profile?.cgmAverageGlucose || profile?.cgmTimeInRange) && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-400" />
              Dexcom Clarity — Last Report
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {profile?.cgmA1cEstimate && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-center">
                  <div className="text-xs text-orange-300 uppercase tracking-wide mb-1">Est. A1C</div>
                  <div className="text-4xl font-bold text-orange-400">{profile.cgmA1cEstimate.toFixed(1)}%</div>
                  <div className="text-xs text-slate-500 mt-1">From Clarity PDF</div>
                </div>
              )}
              {profile?.cgmAverageGlucose && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 text-center">
                  <div className="text-xs text-cyan-300 uppercase tracking-wide mb-1">Avg Glucose</div>
                  <div className="text-4xl font-bold text-cyan-400">{profile.cgmAverageGlucose}</div>
                  <div className="text-xs text-slate-500 mt-1">mg/dL</div>
                </div>
              )}
              {profile?.cgmTimeInRange && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                  <div className="text-xs text-green-300 uppercase tracking-wide mb-1">Time in Range</div>
                  <div className="text-4xl font-bold text-green-400">{profile.cgmTimeInRange.toFixed(0)}%</div>
                  <div className="text-xs text-slate-500 mt-1">Target: ≥70%</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CGM Section */}
        <div className="mb-6">
          <CGMSection />
        </div>

        {/* Insights Section */}
        <InsightsPanel insights={generateInsights()} />

        {/* Health Metrics Summary */}
        <Card className="border border-white/10 bg-slate-950 mt-6">
          <CardHeader>
            <CardTitle className="text-white">Health Metrics</CardTitle>
            <CardDescription>Your current health data summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Average Glucose (14 days)</p>
                <p className="text-2xl font-bold text-red-400">
                  {dashboard?.summary?.glucoseAverage ? `${dashboard.summary.glucoseAverage.toFixed(1)} mg/dL` : "--"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {dashboard?.summary?.glucoseAverage ? "From CGM or manual entries" : "Log glucose readings to view"}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Footprints className="w-4 h-4 text-cyan-400" />
                  <p className="text-slate-400 text-sm">Steps Today</p>
                </div>
                <p className="text-2xl font-bold text-cyan-400">{liveSteps.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">Daily goal: 10,000 steps</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Average Sleep</p>
                <p className="text-2xl font-bold text-purple-400">
                  {dashboard?.summary?.sleepAverage ? `${dashboard.summary.sleepAverage.toFixed(1)} hrs` : "--"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {dashboard?.summary?.sleepAverage ? "14-day average" : "Connect a sleep source to view"}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Time in Range</p>
                <p className="text-2xl font-bold text-green-400">
                  {dashboard?.summary?.timeInRangeEstimate != null ? `${dashboard.summary.timeInRangeEstimate}%` : "--"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {dashboard?.summary?.timeInRangeEstimate != null ? "Glucose 80–160 mg/dL" : "Log glucose readings to view"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
