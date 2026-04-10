import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Clock, Link2, Unlink2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export default function Sources() {
  const { data: sources, isLoading, refetch } = trpc.sources.list.useQuery();
  const connectMutation = trpc.sources.connect.useMutation();
  const disconnectMutation = trpc.sources.disconnect.useMutation();
  const syncMutation = trpc.sources.sync.useMutation();
  const [syncing, setSyncing] = useState<Set<number>>(new Set());

  const handleConnect = async (sourceId: number) => {
    try {
      await connectMutation.mutateAsync({ sourceId });
      await refetch();
      toast.success("Source connected successfully");
    } catch (error) {
      toast.error("Failed to connect source");
    }
  };

  const handleDisconnect = async (sourceId: number) => {
    try {
      await disconnectMutation.mutateAsync({ sourceId });
      await refetch();
      toast.success("Source disconnected");
    } catch (error) {
      toast.error("Failed to disconnect source");
    }
  };

  const handleSync = async (sourceId: number) => {
    try {
      setSyncing((prev) => new Set(prev).add(sourceId));
      await syncMutation.mutateAsync({ sourceId });
      await refetch();
      toast.success("Sync completed");
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="tech-card animate-pulse h-32" />
        ))}
      </div>
    );
  }

  const groupedByCategory = {
    glucose: sources?.filter((s) => s.category === "glucose" || s.category === "multi") || [],
    activity: sources?.filter((s) => s.category === "activity" || s.category === "multi") || [],
    nutrition: sources?.filter((s) => s.category === "nutrition" || s.category === "multi") || [],
    sleep: sources?.filter((s) => s.category === "sleep" || s.category === "multi") || [],
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-white/10 pb-6">
        <p className="tech-label">Data integration management</p>
        <h1 className="tech-heading mt-2 text-3xl">Connected Sources</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Link, manage, and sync your health data sources. Each connection enables unified analytics across glucose, activity, nutrition, and sleep metrics.
        </p>
      </div>

      {/* Glucose Sources */}
      <div>
        <p className="tech-label mb-4">Continuous glucose monitoring</p>
        <div className="space-y-3">
          {groupedByCategory.glucose.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onConnect={() => handleConnect(source.id)}
              onDisconnect={() => handleDisconnect(source.id)}
              onSync={() => handleSync(source.id)}
              isSyncing={syncing.has(source.id)}
            />
          ))}
        </div>
      </div>

      {/* Activity Sources */}
      <div>
        <p className="tech-label mb-4">Activity & fitness</p>
        <div className="space-y-3">
          {groupedByCategory.activity.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onConnect={() => handleConnect(source.id)}
              onDisconnect={() => handleDisconnect(source.id)}
              onSync={() => handleSync(source.id)}
              isSyncing={syncing.has(source.id)}
            />
          ))}
        </div>
      </div>

      {/* Nutrition Sources */}
      <div>
        <p className="tech-label mb-4">Nutrition & food logging</p>
        <div className="space-y-3">
          {groupedByCategory.nutrition.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onConnect={() => handleConnect(source.id)}
              onDisconnect={() => handleDisconnect(source.id)}
              onSync={() => handleSync(source.id)}
              isSyncing={syncing.has(source.id)}
            />
          ))}
        </div>
      </div>

      {/* Sleep Sources */}
      <div>
        <p className="tech-label mb-4">Sleep & recovery</p>
        <div className="space-y-3">
          {groupedByCategory.sleep.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onConnect={() => handleConnect(source.id)}
              onDisconnect={() => handleDisconnect(source.id)}
              onSync={() => handleSync(source.id)}
              isSyncing={syncing.has(source.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceCard({ source, onConnect, onDisconnect, onSync, isSyncing }: any) {
  const isConnected = source.status === "connected";
  const statusColor =
    source.status === "connected"
      ? "text-cyan-300"
      : source.status === "attention"
        ? "text-yellow-300"
        : source.status === "ready"
          ? "text-slate-400"
          : "text-slate-500";

  return (
    <div className="tech-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div>
              {isConnected && <CheckCircle2 className="h-5 w-5 text-cyan-300" />}
              {source.status === "attention" && <AlertCircle className="h-5 w-5 text-yellow-300" />}
              {source.status === "ready" && <Clock className="h-5 w-5 text-slate-400" />}
              {source.status === "planned" && <AlertCircle className="h-5 w-5 text-slate-500" />}
            </div>
            <div>
              <p className="font-semibold text-white">{source.displayName}</p>
              <p className="mt-1 text-xs text-slate-400">{source.description}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${statusColor}`}>{source.status}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{source.implementationStage}</span>
            {source.lastSyncAt && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Last sync: {new Date(source.lastSyncAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isConnected ? (
            <>
              <Button
                size="sm"
                onClick={onSync}
                disabled={isSyncing}
                className="tech-button-secondary flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync"}
              </Button>
              <Button size="sm" onClick={onDisconnect} className="tech-button-danger flex items-center gap-2">
                <Unlink2 className="h-4 w-4" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onConnect} className="tech-button-primary flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Connect
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
