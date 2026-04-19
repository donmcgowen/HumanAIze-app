import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Calendar, TrendingUp, Target, Zap, Weight, Ruler } from "lucide-react";
import { GoalTracker } from "@/components/GoalTracker";
import { WeightTracker } from "@/components/WeightTracker";
import { BodyMeasurementSection } from "@/components/BodyMeasurementSection";

type ViewType = "weekly" | "monthly";

export function Progress() {
  const [viewType, setViewType] = useState<ViewType>("weekly");
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "90days">("30days");

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    
    if (dateRange === "7days") {
      start.setDate(end.getDate() - 7);
    } else if (dateRange === "30days") {
      start.setDate(end.getDate() - 30);
    } else {
      start.setDate(end.getDate() - 90);
    }

    return {
      startDate: start.getTime(),
      endDate: end.getTime(),
    };
  }, [dateRange]);

  const { data: trends, isLoading } = trpc.progress.getTrends.useQuery({
    startDate,
    endDate,
  });

  const chartData = useMemo(() => {
    if (!trends) return [];
    return viewType === "weekly" ? trends.weeklyAverages : trends.monthlyAverages;
  }, [trends, viewType]);

  const macroBreakdown = useMemo(() => {
    if (!trends || trends.dailyStats.length === 0) return [];
    
    const avgCalories = Math.round(
      trends.dailyStats.reduce((sum, d) => sum + d.calories, 0) / trends.dailyStats.length
    );
    
    const avgProtein = Math.round(
      trends.dailyStats.reduce((sum, d) => sum + d.protein, 0) / trends.dailyStats.length
    );
    
    const avgCarbs = Math.round(
      trends.dailyStats.reduce((sum, d) => sum + d.carbs, 0) / trends.dailyStats.length
    );
    
    const avgFat = Math.round(
      trends.dailyStats.reduce((sum, d) => sum + d.fat, 0) / trends.dailyStats.length
    );

    return [
      { name: "Protein", value: avgProtein * 4, color: "#ef4444" },
      { name: "Carbs", value: avgCarbs * 4, color: "#3b82f6" },
      { name: "Fat", value: avgFat * 9, color: "#eab308" },
    ];
  }, [trends]);

  const colors = {
    calories: "#06b6d4",
    protein: "#ef4444",
    carbs: "#3b82f6",
    fat: "#eab308",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Loading progress data...</div>
      </div>
    );
  }

  if (!trends) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">No data available. Start logging food to see your progress!</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Progress Tracking</h1>
          <p className="text-slate-400">Monitor your macro trends and consistency over time</p>
        </div>

        {/* Weight Tracking Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <Weight className="w-6 h-6 text-blue-400" />
            Weight Tracking
          </h2>
          <WeightTracker />
        </div>

        {/* Body Measurements Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <Ruler className="w-6 h-6 text-cyan-400" />
            Body Measurements
          </h2>
          <BodyMeasurementSection />
        </div>

        {/* Goal Tracker Section */}
        <div className="mb-12">
          <GoalTracker />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-8">
          <Select value={dateRange} onValueChange={(value) => setDateRange(value as any)}>
            <SelectTrigger className="w-40 bg-slate-900 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10">
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="90days">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button
              onClick={() => setViewType("weekly")}
              variant={viewType === "weekly" ? "default" : "outline"}
              className={viewType === "weekly" ? "bg-cyan-500 hover:bg-cyan-600" : "border-white/10 text-white"}
            >
              Weekly
            </Button>
            <Button
              onClick={() => setViewType("monthly")}
              variant={viewType === "monthly" ? "default" : "outline"}
              className={viewType === "monthly" ? "bg-cyan-500 hover:bg-cyan-600" : "border-white/10 text-white"}
            >
              Monthly
            </Button>
          </div>
        </div>

        {/* Consistency Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border border-white/10 bg-slate-950">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Days Tracked</p>
                  <p className="text-3xl font-bold text-cyan-400">{trends.consistencyMetrics.daysTracked}</p>
                </div>
                <Calendar className="h-8 w-8 text-cyan-400/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-slate-950">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Adherence Rate</p>
                  <p className="text-3xl font-bold text-green-400">{trends.consistencyMetrics.adherenceRate}%</p>
                </div>
                <Target className="h-8 w-8 text-green-400/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-slate-950">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Calorie Target Hit</p>
                  <p className="text-3xl font-bold text-blue-400">{trends.consistencyMetrics.daysHitCalorieTarget}</p>
                </div>
                <Zap className="h-8 w-8 text-blue-400/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-slate-950">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Protein Target Hit</p>
                  <p className="text-3xl font-bold text-red-400">{trends.consistencyMetrics.daysHitProteinTarget}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-red-400/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-slate-950">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Avg Daily Calories</p>
                  <p className="text-3xl font-bold text-yellow-400">
                    {trends.dailyStats.length > 0
                      ? Math.round(trends.dailyStats.reduce((sum, d) => sum + d.calories, 0) / trends.dailyStats.length)
                      : 0}
                  </p>
                </div>
                <Zap className="h-8 w-8 text-yellow-400/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Calorie Trend */}
          <Card className="border border-white/10 bg-slate-950 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-white">Calorie Trend</CardTitle>
              <CardDescription>Daily calorie intake over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey={viewType === "weekly" ? "week" : "month"} stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="avgCalories" stroke={colors.calories} strokeWidth={2} name="Avg Calories" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Macro Breakdown */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white">Macro Breakdown</CardTitle>
              <CardDescription>Average macro distribution</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={macroBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {macroBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="ml-4 space-y-2">
                {macroBreakdown.map((macro) => (
                  <div key={macro.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: macro.color }} />
                    <span className="text-sm text-slate-300">{macro.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Macro Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Protein Trend */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white">Protein Intake</CardTitle>
              <CardDescription>Daily protein consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey={viewType === "weekly" ? "week" : "month"} stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Bar dataKey="avgProtein" fill={colors.protein} name="Protein (g)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Carbs & Fat Trend */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white">Carbs & Fat Intake</CardTitle>
              <CardDescription>Daily carbs and fat consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey={viewType === "weekly" ? "week" : "month"} stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="avgCarbs" stroke={colors.carbs} strokeWidth={2} name="Carbs (g)" />
                  <Line type="monotone" dataKey="avgFat" stroke={colors.fat} strokeWidth={2} name="Fat (g)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Insights */}
        <Card className="border border-white/10 bg-slate-950 mt-8">
          <CardHeader>
            <CardTitle className="text-white">Insights & Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {trends.consistencyMetrics.adherenceRate >= 80 && (
              <div className="p-4 rounded-lg bg-green-900/20 border border-green-500/30">
                <p className="text-green-400 font-semibold">🎉 Excellent Adherence!</p>
                <p className="text-green-300 text-sm mt-1">You're hitting your targets {trends.consistencyMetrics.adherenceRate}% of the time. Keep up the consistency!</p>
              </div>
            )}
            
            {trends.consistencyMetrics.daysHitProteinTarget < trends.consistencyMetrics.daysTracked * 0.5 && (
              <div className="p-4 rounded-lg bg-red-900/20 border border-red-500/30">
                <p className="text-red-400 font-semibold">⚠️ Protein Intake Low</p>
                <p className="text-red-300 text-sm mt-1">You're hitting your protein target less than 50% of the time. Try adding more protein-rich foods like chicken, fish, or eggs.</p>
              </div>
            )}
            
            {trends.consistencyMetrics.daysHitCalorieTarget < trends.consistencyMetrics.daysTracked * 0.5 && (
              <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                <p className="text-yellow-400 font-semibold">💡 Calorie Tracking Tip</p>
                <p className="text-yellow-300 text-sm mt-1">Your calorie intake varies significantly. Try to be more consistent with portion sizes to hit your daily targets.</p>
              </div>
            )}

            {trends.consistencyMetrics.adherenceRate >= 50 && trends.consistencyMetrics.adherenceRate < 80 && (
              <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
                <p className="text-blue-400 font-semibold">📈 Good Progress</p>
                <p className="text-blue-300 text-sm mt-1">You're on track with {trends.consistencyMetrics.adherenceRate}% adherence. Small improvements in consistency will help you reach your goals faster.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
