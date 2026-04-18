import { FoodLogger } from "@/components/FoodLogger";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export function FoodLogging() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur border-b border-white/10 px-4 py-4">
        <h1 className="text-2xl font-bold text-white">Food Log</h1>
        <p className="text-slate-400 text-sm">Track your daily meals and macros</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        <FoodLogger />
      </div>
    </div>
  );
}
