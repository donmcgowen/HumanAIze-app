import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InsightsPanel } from "@/components/InsightsPanel";
import { StepCounter } from "@/components/StepCounter";
import { WeightTracker } from "@/components/WeightTracker";
import { CGMSection } from "@/components/CGMSection";
import { Loader2, Zap, Plus, ChevronDown, Footprints, Weight } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function Monitoring() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const { data: sources, isLoading: sourcesLoading } = trpc.sources.list.useQuery();
  const { data: dashboard } = trpc.health.dashboard.useQuery({ rangeDays: 14 });
  const [liveSteps, setLiveSteps] = useState(0);
  const handleStepUpdate = useCallback((total: number) => setLiveSteps(total), []);
  const [, navigate] = useLocation();
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  if (isLoading || sourcesLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Show all connected sources (Dexcom, Connect App, etc.)
  const allSources = sources || [];
  const connectedSources = allSources.filter((s) => s.status === "connected");

  // Generate insights based on weight loss, steps, and goals
  const generateInsights = () => {
    const insights = [];
    
    // Weight Loss Insights - placeholder
    // Note: weightProgress is not available in dashboard.summary
    // This would need to be fetched from weight tracking data
    
    // Steps Insights
    if (liveSteps > 0) {
      const dailyGoal = 10000;
      const stepsPercentage = Math.round((liveSteps / dailyGoal) * 100);
      
      if (liveSteps >= dailyGoal) {
        insights.push({
          type: "success" as const,
          title: "Daily Step Goal Achieved!",
          description: `Great job! You've completed ${liveSteps.toLocaleString()} steps today, exceeding your goal of ${dailyGoal.toLocaleString()}.`,
          action: "Keep up this activity level to support your weight loss goals."
        });
      } else if (liveSteps >= dailyGoal * 0.75) {
        insights.push({
          type: "tip" as const,
          title: "Almost There on Steps",
          description: `You're at ${stepsPercentage}% of your daily goal with ${liveSteps.toLocaleString()} steps. Just ${(dailyGoal - liveSteps).toLocaleString()} more to go!`,
          action: "Take a short walk to finish strong today."
        });
      } else if (liveSteps > 0) {
        insights.push({
          type: "tip" as const,
          title: "Increase Daily Activity",
          description: `You've logged ${liveSteps.toLocaleString()} steps today. Aim for ${dailyGoal.toLocaleString()} steps daily to support your weight loss and improve cardiovascular health.`,
          action: "Try taking short walks throughout the day to boost your step count."
        });
      }
    } else {
      insights.push({
        type: "tip" as const,
        title: "Start Moving Today",
        description: "No steps logged yet. Daily activity is crucial for weight loss and overall health. Aim for 10,000 steps today.",
        action: "Take a walk or engage in light activity to get started."
      });
    }
    
    // Personalized Recommendations
    if (liveSteps < 8000) {
      insights.push({
        type: "tip" as const,
        title: "Recommendations to Hit Your Goal",
        description: "Increase daily steps to 10,000+ for better calorie burn and improved health. Track your weight consistently to monitor progress.",
        action: "Review your profile settings to optimize your goals."
      });
    }
    
    return insights;
  };

  const handleSourceClick = (sourceId: number) => {
    setExpandedSourceId(expandedSourceId === sourceId.toString() ? null : sourceId.toString());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Health Monitoring</h1>
          <p className="text-slate-400">Connect and manage your custom health data sources</p>
        </div>

        {/* Weight Tracking Section - TOP */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
            <Weight className="w-5 h-5 text-blue-400" />
            Weight Tracking
          </h2>
          <WeightTracker />
        </div>

        {/* Steps Section */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
            <Footprints className="w-5 h-5 text-cyan-400" />
            Steps
          </h2>
          <StepCounter onTotalChange={handleStepUpdate} />
        </div>

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
                <p className="text-slate-400 text-sm mb-2">Average Glucose</p>
                <p className="text-2xl font-bold text-red-400">{dashboard?.summary.glucoseAverage.toFixed(1) ?? '--'} mg/dL</p>
                <p className="text-xs text-slate-500 mt-1">{dashboard?.summary.glucoseAverage ? 'From connected sources' : 'Connect a glucose source to view'}</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Footprints className="w-4 h-4 text-cyan-400" />
                  <p className="text-slate-400 text-sm">Steps Today</p>
                </div>
                <p className="text-2xl font-bold text-cyan-400">{liveSteps.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">Built-in pedometer • goal: 10,000</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Average Sleep</p>
                <p className="text-2xl font-bold text-purple-400">{dashboard?.summary.sleepAverage.toFixed(1) ?? '--'} hours</p>
                <p className="text-xs text-slate-500 mt-1">{dashboard?.summary.sleepAverage ? 'From connected sources' : 'Connect a sleep source to view'}</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Time in Range</p>
                <p className="text-2xl font-bold text-green-400">{dashboard?.summary.timeInRangeEstimate ?? '--'}%</p>
                <p className="text-xs text-slate-500 mt-1">{dashboard?.summary.timeInRangeEstimate ? 'Glucose 80-160 mg/dL' : 'Connect a glucose source to view'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CGM Data Section */}
        <div className="mt-6">
          <CGMSection />
        </div>
      </div>
    </div>
  );
}
