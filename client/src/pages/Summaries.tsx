import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

export default function Summaries() {
  const { data: summaryData, isLoading, refetch } = trpc.summaries.list.useQuery();
  const regenerateMutation = trpc.summaries.regenerate.useMutation();

  const handleRegenerate = async () => {
    try {
      await regenerateMutation.mutateAsync();
      await refetch();
      toast.success("Summary regenerated");
    } catch (error) {
      toast.error("Failed to regenerate summary");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="tech-card animate-pulse h-48" />
        ))}
      </div>
    );
  }

  const { summaries, preferences } = summaryData || { summaries: [], preferences: null };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-white/10 pb-6">
        <p className="tech-label">Automated weekly digests</p>
        <h1 className="tech-heading mt-2 text-3xl">Weekly Summaries</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Automated weekly email summaries covering glucose trends, sleep quality, activity levels, and AI-generated insights from your unified health data.
        </p>
      </div>

      {/* Email Configuration */}
      {preferences && (
        <div className="tech-card">
          <div className="mb-4">
            <p className="tech-label">Email delivery settings</p>
            <h3 className="tech-heading mt-2">Delivery preferences</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</p>
              <p className="mt-2 font-semibold text-white">{preferences.weeklyEmailEnabled ? "Enabled" : "Disabled"}</p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Send day</p>
              <p className="mt-2 font-semibold text-white">
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][preferences.summaryDayOfWeek]}
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Time (UTC)</p>
              <p className="mt-2 font-semibold text-white">{String(preferences.summaryHourUtc).padStart(2, "0")}:00</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Note: Email delivery requires a configured email provider secret. Contact support to enable automated dispatch.
          </p>
        </div>
      )}

      {/* Regenerate Button */}
      <div className="flex gap-3">
        <Button onClick={handleRegenerate} disabled={regenerateMutation.isPending} className="tech-button-primary flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
          {regenerateMutation.isPending ? "Regenerating..." : "Regenerate this week"}
        </Button>
      </div>

      {/* Summaries List */}
      {summaries.length === 0 ? (
        <div className="tech-card flex items-center gap-4">
          <AlertCircle className="h-6 w-6 text-slate-500" />
          <div>
            <p className="font-semibold text-slate-300">No summaries yet</p>
            <p className="text-sm text-slate-400">Weekly summaries will appear here as they are generated.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {summaries.map((summary, index) => (
            <div key={index} className="tech-card">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-cyan-300" />
                    <h3 className="tech-heading">{summary.subject}</h3>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Generated {new Date(summary.createdAt).toLocaleDateString()} · Status: {summary.deliveryStatus}
                  </p>
                </div>
                {summary.deliveryStatus === "sent" && <CheckCircle2 className="h-5 w-5 text-cyan-300" />}
                {summary.deliveryStatus === "needs_email_provider" && <AlertCircle className="h-5 w-5 text-yellow-300" />}
              </div>
              <div className="prose prose-invert max-w-none text-sm">
                <Streamdown>{summary.summaryMarkdown}</Streamdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
