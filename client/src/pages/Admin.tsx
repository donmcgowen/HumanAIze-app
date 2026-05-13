import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Shield, Users, Clock3, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_EMAIL = "donmcgowen@outlook.com";

type Range = 7 | 30 | 60;

function formatDate(value: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

export function Admin() {
  const { user } = useAuth();
  const [days, setDays] = useState<Range>(30);

  const isAdmin = useMemo(() => {
    const email = (user?.email ?? "").trim().toLowerCase();
    return user?.role === "admin" || email === ADMIN_EMAIL;
  }, [user?.email, user?.role]);

  const query = trpc.admin.listUserActivity.useQuery(
    { days },
    {
      enabled: isAdmin,
      refetchInterval: 60_000,
    }
  );

  const users = query.data ?? [];
  const activeUsers = users.filter((u: any) => Number(u.actionsLastWindow ?? 0) > 0).length;
  const totalActions = users.reduce((sum: number, u: any) => sum + Number(u.actionsLastWindow ?? 0), 0);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 md:p-8">
        <div className="max-w-3xl rounded-lg border border-red-400/30 bg-red-500/10 p-6">
          <h1 className="text-xl font-bold text-red-200">Admin Access Required</h1>
          <p className="mt-2 text-sm text-red-100/80">
            This page is available only to authorized admin accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 space-y-4">
      <div className="rounded-lg border border-white/10 bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-cyan-400/40 bg-cyan-500/10 p-2">
              <Shield className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white">Admin Portal</h1>
              <p className="text-xs md:text-sm text-slate-400">
                User activity monitoring for the last {days} days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 60].map((value) => (
              <Button
                key={value}
                size="sm"
                variant={days === value ? "default" : "outline"}
                className={days === value ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "border-white/20 text-slate-200"}
                onClick={() => setDays(value as Range)}
              >
                {value}d
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 text-slate-200"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 bg-card p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
            <Users className="h-4 w-4" />
            Total Accounts
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{users.length}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-card p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
            <Activity className="h-4 w-4" />
            Active Users ({days}d)
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{activeUsers}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-card p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
            <Clock3 className="h-4 w-4" />
            Total Actions ({days}d)
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totalActions}</div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-card overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-white/[0.03] border-b border-white/10">
            <tr>
              <th className="text-left px-4 py-3 text-slate-300 font-semibold">User</th>
              <th className="text-left px-4 py-3 text-slate-300 font-semibold">Created</th>
              <th className="text-left px-4 py-3 text-slate-300 font-semibold">Last Login</th>
              <th className="text-left px-4 py-3 text-slate-300 font-semibold">Last Activity</th>
              <th className="text-right px-4 py-3 text-slate-300 font-semibold">Actions ({days}d)</th>
              <th className="text-right px-4 py-3 text-slate-300 font-semibold">Avg/Day</th>
              <th className="text-left px-4 py-3 text-slate-300 font-semibold">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-slate-400">Loading user activity...</td>
              </tr>
            )}
            {!query.isLoading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-slate-400">No user accounts found.</td>
              </tr>
            )}
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{u.name || u.username || "(no name)"}</div>
                  <div className="text-xs text-slate-400">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-300">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-slate-300">{formatDate(u.lastSignedIn)}</td>
                <td className="px-4 py-3 text-slate-300">{formatDate(u.lastActivityAt)}</td>
                <td className="px-4 py-3 text-right text-white font-medium">{u.actionsLastWindow}</td>
                <td className="px-4 py-3 text-right text-slate-200">{Number(u.avgActionsPerDay ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded px-2 py-1 text-xs font-semibold capitalize ${
                      u.frequency === "high"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : u.frequency === "medium"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-500/20 text-slate-300"
                    }`}
                  >
                    {u.frequency}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
