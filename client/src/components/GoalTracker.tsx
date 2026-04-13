import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Target, TrendingDown, Calendar, Zap } from "lucide-react";

export function GoalTracker() {
  const { data: goalProgress, isLoading } = trpc.progress.getGoal.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-slate-400">Loading goal progress...</div>
      </div>
    );
  }

  if (!goalProgress) {
    return (
      <Card className="border border-white/10 bg-slate-950">
        <CardHeader>
          <CardTitle className="text-white">Fitness Goal Tracker</CardTitle>
          <CardDescription>Set a weight goal to start tracking progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-40">
            <div className="text-center">
              <Target className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No goal set yet</p>
              <Button className="bg-cyan-500 hover:bg-cyan-600">
                Set Your Goal
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressData = [
    {
      label: "Start Weight",
      weight: goalProgress.startWeight,
      type: "start",
    },
    {
      label: "Current Weight",
      weight: goalProgress.currentWeight,
      type: "current",
    },
    {
      label: "Goal Weight",
      weight: goalProgress.goalWeight,
      type: "goal",
    },
  ];

  const timelineData = [
    {
      name: "Days Elapsed",
      value: goalProgress.daysElapsed,
      color: "#06b6d4",
    },
    {
      name: "Days Remaining",
      value: Math.max(0, goalProgress.daysRemaining),
      color: "#f59e0b",
    },
  ];

  const isWeightLoss = goalProgress.goalWeight < goalProgress.startWeight;
  const directionText = isWeightLoss ? "Weight Loss" : "Weight Gain";
  const directionIcon = isWeightLoss ? "📉" : "📈";
  
  // Convert kg to lbs (1 kg = 2.20462 lbs)
  const kgToLbs = (kg: number) => kg * 2.20462;

  return (
    <div className="space-y-6">
      {/* Main Goal Card */}
      <Card className="border border-white/10 bg-gradient-to-br from-slate-950 to-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white text-2xl">{directionIcon} {directionText} Goal</CardTitle>
              <CardDescription>Track your progress toward your fitness goal</CardDescription>
            </div>
            <div className={`text-4xl font-bold ${goalProgress.isOnTrack ? "text-green-400" : "text-yellow-400"}`}>
              {goalProgress.progressPercentage}%
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">Current Weight</p>
              <p className="text-2xl font-bold text-cyan-400">{kgToLbs(goalProgress.currentWeight).toFixed(1)} lbs</p>
            </div>

            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">Goal Weight</p>
              <p className="text-2xl font-bold text-green-400">{kgToLbs(goalProgress.goalWeight).toFixed(1)} lbs</p>
            </div>

            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">Weight {isWeightLoss ? "Lost" : "Gained"}</p>
              <p className="text-2xl font-bold text-blue-400">{kgToLbs(Math.abs(goalProgress.weightLost)).toFixed(1)} lbs</p>
            </div>

            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">To Go</p>
              <p className="text-2xl font-bold text-yellow-400">{kgToLbs(goalProgress.weightToGo).toFixed(1)} lbs</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Overall Progress</span>
              <span className="text-cyan-400 font-semibold">{goalProgress.progressPercentage}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-white/10">
              <div
                className="bg-gradient-to-r from-cyan-500 to-green-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${goalProgress.progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Status Message */}
          <div className={`p-4 rounded-lg border ${goalProgress.isOnTrack 
            ? "bg-green-900/20 border-green-500/30" 
            : "bg-yellow-900/20 border-yellow-500/30"}`}>
            <p className={goalProgress.isOnTrack ? "text-green-400 font-semibold" : "text-yellow-400 font-semibold"}>
              {goalProgress.isOnTrack 
                ? "✅ On Track!" 
                : "⚠️ Behind Schedule"}
            </p>
            <p className={goalProgress.isOnTrack ? "text-green-300 text-sm mt-1" : "text-yellow-300 text-sm mt-1"}>
              {goalProgress.isOnTrack
                ? `At your current rate, you'll reach your goal by ${goalProgress.estimatedCompletionDate?.toLocaleDateString() || "soon"}`
                : `Estimated completion: ${goalProgress.estimatedCompletionDate?.toLocaleDateString() || "N/A"} (Goal date: ${new Date(goalProgress.daysRemaining * 24 * 60 * 60 * 1000 + Date.now()).toLocaleDateString()})`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Chart */}
      <Card className="border border-white/10 bg-slate-950">
        <CardHeader>
          <CardTitle className="text-white">Timeline</CardTitle>
          <CardDescription>Days elapsed vs days remaining</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="value" fill="#06b6d4" name="Days" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Weekly Rate */}
      <Card className="border border-white/10 bg-slate-950">
        <CardHeader>
          <CardTitle className="text-white">Weekly Rate</CardTitle>
          <CardDescription>Your average weight change per week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-slate-400 text-sm mb-2">Weekly Change</p>
              <p className="text-3xl font-bold text-cyan-400">{kgToLbs(goalProgress.weeklyWeightChangeRate).toFixed(2)} lbs</p>
              <p className="text-slate-400 text-xs mt-2">per week</p>
            </div>

            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-slate-400 text-sm mb-2">Estimated Days</p>
              <p className="text-3xl font-bold text-green-400">{goalProgress.daysUntilCompletion || "N/A"}</p>
              <p className="text-slate-400 text-xs mt-2">until goal</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <Card className="border border-white/10 bg-slate-950">
        <CardHeader>
          <CardTitle className="text-white">Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {goalProgress.progressPercentage > 75 && (
            <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/30">
              <p className="text-green-400 font-semibold text-sm">🎉 Almost There!</p>
              <p className="text-green-300 text-xs mt-1">You're {100 - goalProgress.progressPercentage}% away from your goal. Keep up the momentum!</p>
            </div>
          )}

          {goalProgress.weeklyWeightChangeRate > 0 && isWeightLoss && (
            <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-500/30">
              <p className="text-blue-400 font-semibold text-sm">📉 Steady Progress</p>
              <p className="text-blue-300 text-xs mt-1">You're losing {kgToLbs(Math.abs(goalProgress.weeklyWeightChangeRate)).toFixed(2)} lbs per week on average.</p>
            </div>
          )}

          {goalProgress.daysRemaining < 0 && (
            <div className="p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
              <p className="text-yellow-400 font-semibold text-sm">⏰ Goal Date Passed</p>
              <p className="text-yellow-300 text-xs mt-1">Your goal date has passed. Consider extending your goal date or adjusting your target.</p>
            </div>
          )}

          {goalProgress.progressPercentage === 0 && (
            <div className="p-3 rounded-lg bg-purple-900/20 border border-purple-500/30">
              <p className="text-purple-400 font-semibold text-sm">🚀 Just Started</p>
              <p className="text-purple-300 text-xs mt-1">You've just started your journey. Stay consistent and you'll reach your goal!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
