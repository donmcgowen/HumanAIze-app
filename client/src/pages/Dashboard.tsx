import { trpc } from "@/lib/trpc";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { Activity, AlertCircle, CheckCircle2, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: dashboard, isLoading, error } = trpc.health.dashboard.useQuery({ rangeDays: 14 });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="tech-stat animate-pulse">
              <div className="h-3 w-20 bg-white/10" />
              <div className="h-8 w-32 bg-white/10" />
            </div>
          ))}
        </div>
        <div className="tech-chart-container animate-pulse h-80" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="tech-card flex items-center gap-4 border-red-500/30 bg-red-500/5">
        <AlertCircle className="h-6 w-6 text-red-300" />
        <div>
          <p className="font-semibold text-red-200">Failed to load dashboard</p>
          <p className="text-sm text-red-300/70">{error?.message || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  const { chart, summary, insights, sourcesByCategory } = dashboard;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-white/10 pb-6">
        <p className="tech-label">Real-time unified analytics</p>
        <h1 className="tech-heading mt-2 text-3xl">Command Center</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Unified glucose, activity, nutrition, and sleep metrics from your connected sources. Explore trends, correlations, and AI-generated insights across your metabolic health.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="tech-stat">
          <span className="tech-stat-label">Glucose average</span>
          <span className="tech-stat-value">{summary.glucoseAverage}</span>
          <span className="text-xs text-slate-400">mg/dL</span>
        </div>
        <div className="tech-stat">
          <span className="tech-stat-label">Time in range</span>
          <span className="tech-stat-value">{summary.timeInRangeEstimate}%</span>
          <span className="text-xs text-slate-400">80–160 mg/dL</span>
        </div>
        <div className="tech-stat">
          <span className="tech-stat-label">Sleep average</span>
          <span className="tech-stat-value">{summary.sleepAverage}h</span>
          <span className="text-xs text-slate-400">per night</span>
        </div>
        <div className="tech-stat">
          <span className="tech-stat-label">Steps average</span>
          <span className="tech-stat-value">{summary.stepsAverage.toLocaleString()}</span>
          <span className="text-xs text-slate-400">daily</span>
        </div>
      </div>

      {/* Unified Metrics Chart */}
      <div className="tech-chart-container">
        <p className="tech-label mb-4">14-day unified metric window</p>
        <ResponsiveContainer width="100%" height={400}>
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
            <Line yAxisId="left" type="monotone" dataKey="glucose" stroke="#22d3ee" name="Glucose (mg/dL)" strokeWidth={2} dot={false} />
            <Bar yAxisId="right" dataKey="steps" fill="rgba(34,211,238,0.2)" name="Steps" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Connected Sources Status */}
      <div className="tech-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="tech-label">Integration status</p>
            <h3 className="tech-heading mt-2">Connected Sources</h3>
          </div>
          <Button onClick={() => setLocation("/sources")} className="tech-button-secondary">
            Manage sources
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {["glucose", "activity", "nutrition", "sleep"].map((category) => {
            const sources = sourcesByCategory[category as keyof typeof sourcesByCategory] || [];
            const connected = sources.filter((s) => s.status === "connected").length;
            return (
              <div key={category} className="flex items-center justify-between border border-white/10 bg-white/[0.02] p-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{category}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{connected} connected</p>
                </div>
                {connected > 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-cyan-300" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-slate-500" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div className="tech-card">
          <div className="mb-4">
            <p className="tech-label">Intelligent analysis</p>
            <h3 className="tech-heading mt-2">Top insights</h3>
          </div>
          <div className="space-y-3">
            {insights.map((insight, index) => (
              <div key={index} className="flex gap-3 border-l-2 border-cyan-300/40 pl-4 py-2">
                <div className="flex-shrink-0 pt-1">
                  {insight.severity === "priority" && <Zap className="h-4 w-4 text-red-300" />}
                  {insight.severity === "watch" && <AlertCircle className="h-4 w-4 text-yellow-300" />}
                  {insight.severity === "info" && <Activity className="h-4 w-4 text-cyan-300" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-white">{insight.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{insight.summary}</p>
                  <p className="mt-2 text-xs text-cyan-300/70">{insight.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Status */}
      <div className="tech-card flex items-center gap-4">
        <Clock className="h-5 w-5 text-slate-400" />
        <div>
          <p className="text-sm font-semibold text-white">Last sync status</p>
          <p className="text-xs text-slate-400 capitalize">{summary.syncState} — {summary.connectedSourceCount} active sources</p>
        </div>
      </div>
    </div>
  );
}
