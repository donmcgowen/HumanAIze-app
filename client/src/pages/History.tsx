import { trpc } from "@/lib/trpc";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { TrendingUp, TrendingDown, Calendar } from "lucide-react";

export default function History() {
  const [rangeDays, setRangeDays] = useState(14);
  const { data: history, isLoading } = trpc.health.history.useQuery({ rangeDays });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="tech-chart-container animate-pulse h-80" />
      </div>
    );
  }

  if (!history) {
    return <div className="tech-card">No data available</div>;
  }

  const { chart, summary, highlights } = history;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-white/10 pb-6">
        <p className="tech-label">Extended trend analysis</p>
        <h1 className="tech-heading mt-2 text-3xl">History</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Explore historical trends across your glucose, activity, nutrition, and sleep data. Filter by date range to identify patterns and correlations.
        </p>
      </div>

      {/* Date Range Selector */}
      <div className="flex gap-2 flex-wrap">
        {[7, 14, 21, 30].map((days) => (
          <Button
            key={days}
            onClick={() => setRangeDays(days)}
            className={days === rangeDays ? "tech-button-primary" : "tech-button-secondary"}
          >
            {days} days
          </Button>
        ))}
      </div>

      {/* Highlights */}
      {highlights && (
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.highestGlucoseDay && (
            <div className="tech-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="tech-label">Highest glucose day</p>
                  <p className="tech-heading mt-2">{highlights.highestGlucoseDay.glucose} mg/dL</p>
                </div>
                <TrendingUp className="h-6 w-6 text-red-300" />
              </div>
              <p className="mt-3 text-xs text-slate-400">{highlights.highestGlucoseDay.label}</p>
            </div>
          )}
          {highlights.mostActiveDay && (
            <div className="tech-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="tech-label">Most active day</p>
                  <p className="tech-heading mt-2">{highlights.mostActiveDay.steps.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-6 w-6 text-cyan-300" />
              </div>
              <p className="mt-3 text-xs text-slate-400">{highlights.mostActiveDay.label} steps</p>
            </div>
          )}
          {highlights.strongestRecoveryDay && (
            <div className="tech-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="tech-label">Best recovery night</p>
                  <p className="tech-heading mt-2">{highlights.strongestRecoveryDay.sleepScore}</p>
                </div>
                <TrendingUp className="h-6 w-6 text-green-300" />
              </div>
              <p className="mt-3 text-xs text-slate-400">{highlights.strongestRecoveryDay.label} sleep score</p>
            </div>
          )}
        </div>
      )}

      {/* Glucose Trend */}
      <div className="tech-chart-container">
        <p className="tech-label mb-4">Glucose trend</p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" style={{ fontSize: "12px" }} />
            <YAxis stroke="rgba(255,255,255,0.4)" style={{ fontSize: "12px" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(10,14,20,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.8)" }}
            />
            <Line type="monotone" dataKey="glucose" stroke="#22d3ee" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Activity Trend */}
      <div className="tech-chart-container">
        <p className="tech-label mb-4">Activity & sleep correlation</p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" style={{ fontSize: "12px" }} />
            <YAxis yAxisId="left" stroke="rgba(255,255,255,0.4)" style={{ fontSize: "12px" }} />
            <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.4)" style={{ fontSize: "12px" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(10,14,20,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.8)" }}
            />
            <Legend wrapperStyle={{ paddingTop: "16px" }} />
            <Bar yAxisId="left" dataKey="steps" fill="rgba(34,211,238,0.2)" name="Steps" />
            <Line yAxisId="right" type="monotone" dataKey="sleepHours" stroke="#10b981" strokeWidth={2} name="Sleep (hours)" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Nutrition Trend */}
      <div className="tech-chart-container">
        <p className="tech-label mb-4">Daily calorie and macronutrient intake</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" style={{ fontSize: "12px" }} />
            <YAxis stroke="rgba(255,255,255,0.4)" style={{ fontSize: "12px" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(10,14,20,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.8)" }}
            />
            <Legend wrapperStyle={{ paddingTop: "16px" }} />
            <Bar dataKey="carbs" fill="rgba(168,85,247,0.4)" name="Carbs (g)" />
            <Bar dataKey="protein" fill="rgba(34,211,238,0.4)" name="Protein (g)" />
            <Bar dataKey="fat" fill="rgba(249,115,22,0.4)" name="Fat (g)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="tech-stat">
          <span className="tech-stat-label">Avg glucose</span>
          <span className="tech-stat-value">{summary.glucoseAverage}</span>
          <span className="text-xs text-slate-400">mg/dL</span>
        </div>
        <div className="tech-stat">
          <span className="tech-stat-label">Avg sleep</span>
          <span className="tech-stat-value">{summary.sleepAverage}h</span>
          <span className="text-xs text-slate-400">per night</span>
        </div>
        <div className="tech-stat">
          <span className="tech-stat-label">Avg steps</span>
          <span className="tech-stat-value">{(summary.stepsAverage / 1000).toFixed(1)}k</span>
          <span className="text-xs text-slate-400">daily</span>
        </div>
        <div className="tech-stat">
          <span className="tech-stat-label">Avg calories</span>
          <span className="tech-stat-value">{(summary.caloriesAverage / 1000).toFixed(1)}k</span>
          <span className="text-xs text-slate-400">kcal</span>
        </div>
      </div>
    </div>
  );
}
