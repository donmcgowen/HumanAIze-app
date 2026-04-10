import { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Activity, Clock, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function Dashboard() {
  const { data: dashboard, isLoading } = trpc.health.dashboard.useQuery({ rangeDays: 14 });
  const { data: syncData } = trpc.sync.status.useQuery(undefined, { refetchInterval: 30000 });
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    if (syncData?.lastSyncTime) {
      const lastSync = new Date(syncData.lastSyncTime);
      const now = new Date();
      const diffMs = now.getTime() - lastSync.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) {
        setLastSyncTime("Just now");
      } else if (diffMins < 60) {
        setLastSyncTime(`${diffMins}m ago`);
      } else {
        const diffHours = Math.floor(diffMins / 60);
        setLastSyncTime(`${diffHours}h ago`);
      }
    }
  }, [syncData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">No data available</div>
      </div>
    );
  }

  const { summary, chart, sourcesByCategory } = dashboard;

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Command Center</h1>
        <p className="text-slate-400">
          Unified glucose, activity, nutrition, and sleep metrics from your connected sources.
        </p>
        {lastSyncTime && (
          <p className="text-sm text-slate-500">Last sync: {lastSyncTime}</p>
        )}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Glucose Average</div>
          <div className="text-3xl font-bold">{summary.glucoseAverage.toFixed(1)}</div>
          <div className="text-xs text-slate-500 mt-1">mg/dL</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Time in Range</div>
          <div className="text-3xl font-bold">{summary.timeInRangeEstimate}%</div>
          <div className="text-xs text-slate-500 mt-1">80–160 mg/dL</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Sleep Average</div>
          <div className="text-3xl font-bold">{summary.sleepAverage.toFixed(1)}h</div>
          <div className="text-xs text-slate-500 mt-1">per night</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Steps Average</div>
          <div className="text-3xl font-bold">{summary.stepsAverage.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">daily</div>
        </div>
      </div>

      {/* Chart */}
      {chart && chart.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">14-Day Glucose Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="glucose" 
                stroke="#3b82f6" 
                dot={false}
                name="Glucose (mg/dL)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Connected Sources */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Glucose Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.glucose.length > 0 ? (
              sourcesByCategory.glucose.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Activity Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.activity.length > 0 ? (
              sourcesByCategory.activity.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Sleep Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.sleep.length > 0 ? (
              sourcesByCategory.sleep.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Nutrition Sources
          </h3>
          <div className="space-y-2">
            {sourcesByCategory.nutrition.length > 0 ? (
              sourcesByCategory.nutrition.map((source) => (
                <div key={source.id} className="text-sm text-slate-300">
                  {source.displayName}
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    source.status === "connected" 
                      ? "bg-green-900 text-green-200" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {source.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No sources connected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
