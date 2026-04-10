import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InsightsPanel } from "@/components/InsightsPanel";
import { Loader2, Activity, Zap, Plus, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

export function Monitoring() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const { data: sources, isLoading: sourcesLoading } = trpc.sources.list.useQuery();
  const [, navigate] = useLocation();
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  if (isLoading || sourcesLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Filter to show only custom apps
  const customAppSources = sources?.filter((s) => s.provider === "custom_app") || [];
  const connectedCustomApps = customAppSources.filter((s) => s.status === "connected");

  // Generate insights based on connected sources
  const generateInsights = () => {
    const insights = [];
    
    if (connectedCustomApps.length === 0) {
      insights.push({
        type: "tip" as const,
        title: "Get Started with Health Monitoring",
        description: "Connect your first health data source to begin tracking your health metrics.",
        action: "Click the '+' button to add a custom app connection."
      });
    } else {
      insights.push({
        type: "success" as const,
        title: "Data Sources Connected",
        description: `You have ${connectedCustomApps.length} active health data source${connectedCustomApps.length !== 1 ? 's' : ''} syncing your metrics.`,
        action: "Keep your sources connected for continuous health insights."
      });
      
      if (connectedCustomApps.length < 3) {
        insights.push({
          type: "tip" as const,
          title: "Add More Data Sources",
          description: "Connect additional health apps for comprehensive health analysis and better personalized recommendations.",
          action: "Click the '+' button to add more custom app connections."
        });
      }
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

        {/* Connected Sources Dropdown */}
        <Card className="mb-6 border border-white/10 bg-slate-950">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">Connected Sources</CardTitle>
                <CardDescription>Your active health data connections</CardDescription>
              </div>
              <Button
                onClick={() => navigate("/sources")}
                className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Source
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {connectedCustomApps.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No connected sources yet</p>
                <Button
                  onClick={() => navigate("/sources")}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold"
                >
                  Connect Your First Source
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {connectedCustomApps.map((source) => (
                  <div
                    key={source.id}
                    className="p-4 rounded-lg bg-slate-900 border border-green-500/30 cursor-pointer hover:bg-slate-800 transition-colors"
                    onClick={() => handleSourceClick(source.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Zap className="w-5 h-5 text-yellow-400" />
                        <div>
                          <p className="font-semibold text-white">{source.displayName || "Custom App"}</p>
                          <p className="text-xs text-slate-400">
                            {source.category || "Custom data"} • Connected
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                        <ChevronDown
                          className={`w-5 h-5 text-slate-400 transition-transform ${
                            expandedSourceId === source.id.toString() ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>

                    {expandedSourceId === source.id.toString() && (
                      <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
                        {source.lastSyncAt && (
                          <p className="text-sm text-slate-400">
                            Last sync: {new Date(source.lastSyncAt).toLocaleDateString()}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-white/10 text-slate-300 hover:text-white"
                          >
                            Sync Now
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-white/10 text-red-400 hover:text-red-300"
                          >
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                <p className="text-2xl font-bold text-red-400">-- mg/dL</p>
                <p className="text-xs text-slate-500 mt-1">Connect a glucose source to view</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Daily Activity</p>
                <p className="text-2xl font-bold text-blue-400">-- steps</p>
                <p className="text-xs text-slate-500 mt-1">Connect an activity source to view</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Average Sleep</p>
                <p className="text-2xl font-bold text-purple-400">-- hours</p>
                <p className="text-xs text-slate-500 mt-1">Connect a sleep source to view</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-white/10">
                <p className="text-slate-400 text-sm mb-2">Heart Rate</p>
                <p className="text-2xl font-bold text-orange-400">-- bpm</p>
                <p className="text-xs text-slate-500 mt-1">Connect a heart rate source to view</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
