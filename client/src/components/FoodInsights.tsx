import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { Loader2 } from "lucide-react";

interface InsightRecommendation {
  category: "food_choice" | "portion_size" | "macro_balance" | "meal_timing";
  title: string;
  advice: string;
  priority: "high" | "medium" | "low";
  actionable: boolean;
}

interface FoodInsightsProps {
  insights: InsightRecommendation[] | null;
  isLoading: boolean;
  dailyCalorieGoal: number;
  currentCalories: number;
  currentProtein: number;
  dailyProteinGoal: number;
  currentCarbs: number;
  dailyCarbGoal: number;
  currentFat: number;
  dailyFatGoal: number;
}

export function FoodInsights({
  insights,
  isLoading,
  dailyCalorieGoal,
  currentCalories,
  currentProtein,
  dailyProteinGoal,
  currentCarbs,
  dailyCarbGoal,
  currentFat,
  dailyFatGoal,
}: FoodInsightsProps) {
  const caloriePercent = Math.round((currentCalories / dailyCalorieGoal) * 100);
  const proteinPercent = Math.round((currentProtein / dailyProteinGoal) * 100);
  const carbsPercent = Math.round((currentCarbs / dailyCarbGoal) * 100);
  const fatPercent = Math.round((currentFat / dailyFatGoal) * 100);

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return "bg-red-500";
    if (percent >= 85) return "bg-yellow-500";
    if (percent >= 70) return "bg-cyan-500";
    return "bg-slate-500";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-red-500/30 bg-red-500/5";
      case "medium":
        return "border-yellow-500/30 bg-yellow-500/5";
      case "low":
        return "border-cyan-500/30 bg-cyan-500/5";
      default:
        return "border-slate-500/30 bg-slate-500/5";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "high":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "medium":
        return <TrendingUp className="h-4 w-4 text-yellow-500" />;
      case "low":
        return <CheckCircle className="h-4 w-4 text-cyan-500" />;
      default:
        return <Lightbulb className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-cyan-400" />
          Real-Time Insights
        </CardTitle>
        <CardDescription>AI-powered recommendations based on your intake and goals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Macro Progress Bars */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-300">Calories</span>
              <span className="text-xs text-slate-400">
                {Math.round(currentCalories)} / {dailyCalorieGoal} cal ({caloriePercent}%)
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${getProgressColor(caloriePercent)} transition-all`}
                style={{ width: `${Math.min(caloriePercent, 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-300">Protein</span>
              <span className="text-xs text-slate-400">
                {Math.round(currentProtein)}g / {dailyProteinGoal}g ({proteinPercent}%)
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${getProgressColor(proteinPercent)} transition-all`}
                style={{ width: `${Math.min(proteinPercent, 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-300">Carbs</span>
              <span className="text-xs text-slate-400">
                {Math.round(currentCarbs)}g / {dailyCarbGoal}g ({carbsPercent}%)
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${getProgressColor(carbsPercent)} transition-all`}
                style={{ width: `${Math.min(carbsPercent, 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-300">Fat</span>
              <span className="text-xs text-slate-400">
                {Math.round(currentFat)}g / {dailyFatGoal}g ({fatPercent}%)
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${getProgressColor(fatPercent)} transition-all`}
                style={{ width: `${Math.min(fatPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="border-t border-white/10 pt-4">
          <h4 className="text-sm font-semibold text-white mb-3">Recommendations</h4>

          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
              <span className="ml-2 text-sm text-slate-400">Analyzing your intake...</span>
            </div>
          ) : insights && insights.length > 0 ? (
            <div className="space-y-3">
              {insights.map((insight, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${getPriorityColor(insight.priority)} transition-colors`}
                >
                  <div className="flex items-start gap-3">
                    {getPriorityIcon(insight.priority)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-medium text-white">{insight.title}</h5>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-slate-300 capitalize">
                          {insight.category.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{insight.advice}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">
                {insights === null ? "Log some food to get personalized recommendations" : "No recommendations at this time"}
              </p>
            </div>
          )}
        </div>

        {/* Quick Tips */}
        <div className="border-t border-white/10 pt-4 text-xs text-slate-400 space-y-1">
          <p>💡 Tip: Aim for consistent meal timing to stabilize energy and glucose levels</p>
          <p>💡 Tip: Protein with each meal helps with satiety and blood sugar control</p>
        </div>
      </CardContent>
    </Card>
  );
}
