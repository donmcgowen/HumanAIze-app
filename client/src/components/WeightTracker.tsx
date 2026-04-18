import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronUp } from "lucide-react";

export function WeightTracker() {
  const [open, setOpen] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);

  // Fetch weight entries and progress data
  const { data: entries = [], refetch: refetchEntries } = trpc.weight.getEntries.useQuery({ days: 90 });
  const { data: progressData = [] } = trpc.weight.getProgressData.useQuery({ days: 90 });
  const { data: weeklyRate } = trpc.weight.getWeeklyRate.useQuery();

  // Mutation to add weight entry
  const addWeightMutation = trpc.weight.addEntry.useMutation({
    onError: (error) => {
      setError(error.message || "Failed to add weight entry");
    },
  });

  // Mutation to delete weight entry
  const deleteWeightMutation = trpc.weight.deleteEntry.useMutation({
    onSuccess: () => {
      refetchEntries();
    },
  });

  const handleAddWeight = async () => {
    if (!weightInput.trim()) {
      setError("Please enter your current weight");
      return;
    }

    if (isNaN(Number(weightInput))) {
      setError("Please enter a valid weight");
      return;
    }

    const weightNum = Math.round(Number(weightInput));

    try {
      await addWeightMutation.mutateAsync({
        weightLbs: weightNum,
        recordedAt: Date.now(),
        notes: notes || undefined,
      });
      setWeightInput("");
      setNotes("");
      setError("");
      setOpen(false);
      refetchEntries();
    } catch {
      // Error state is set in mutation onError.
    }
  };

  // Calculate weight change
  const currentWeight = entries.length > 0 ? entries[0].weightLbs : null;
  const startWeight = entries.length > 0 ? entries[entries.length - 1].weightLbs : null;
  const weightChange = currentWeight && startWeight ? currentWeight - startWeight : 0;

  // Format estimated completion date
  const formatCompletionDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      {/* Weight Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Starting Weight</p>
          <p className="text-2xl font-bold text-cyan-400 mt-2">
            {startWeight ? `${startWeight} lbs` : "No data"}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Current Weight</p>
          <p className="text-2xl font-bold text-blue-400 mt-2">
            {currentWeight ? `${currentWeight} lbs` : "No data"}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Weight Change</p>
          <p className={`text-2xl font-bold mt-2 ${weightChange > 0 ? "text-green-400" : weightChange < 0 ? "text-red-400" : "text-slate-400"}`}>
            {weightChange > 0 ? "+" : ""}{weightChange} lbs
          </p>
        </div>
      </div>

      {/* Weekly Progress Stats */}
      {weeklyRate && weeklyRate.weeklyRate !== 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Weekly Loss Rate</p>
            <p className="text-2xl font-bold text-purple-400 mt-2">{Math.abs(weeklyRate.weeklyRate)} lbs/week</p>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Est. Completion</p>
            <p className="text-lg font-bold text-green-400 mt-2">{formatCompletionDate(weeklyRate.estimatedCompletionDate)}</p>
            {weeklyRate.daysUntilCompletion && (
              <p className="text-xs text-slate-400 mt-1">{weeklyRate.daysUntilCompletion} days away</p>
            )}
          </div>
        </div>
      )}

      {/* Log Weight Button */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-semibold">
            + Log Weight
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Log Current Weight</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="weight" className="text-slate-300">
                Current Weight (lbs) — Whole numbers only
              </Label>
              <Input
                id="weight"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g., 190"
                value={weightInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d+$/.test(val)) {
                    setWeightInput(val);
                  }
                }}
                className="mt-2 bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="notes" className="text-slate-300">
                Notes (optional)
              </Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about this weight entry..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 bg-slate-800 border-slate-600 text-white"
                rows={3}
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button
              onClick={handleAddWeight}
              disabled={addWeightMutation.isPending}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-semibold"
            >
              {addWeightMutation.isPending ? "Saving..." : "Log Weight"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Weight Progress Graph */}
      {progressData.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Weight Progression</h3>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
              />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                domain={["dataMin - 5", "dataMax + 5"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#e2e8f0" }}
                formatter={(value) => [`${value} lbs`, "Weight"]}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#06b6d4"
                dot={{ fill: "#06b6d4", r: 4 }}
                activeDot={{ r: 6 }}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weight Logs - Collapsible */}
      {entries.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setIsLogsExpanded(!isLogsExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
          >
            <h3 className="text-sm font-semibold text-slate-300">Weight Logs ({entries.length})</h3>
            {isLogsExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isLogsExpanded && (
            <div className="border-t border-slate-700 p-4">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between bg-slate-800 p-3 rounded">
                    <div className="flex-1">
                      <p className="text-white font-semibold">{entry.weightLbs} lbs</p>
                      <p className="text-xs text-slate-400">
                        {new Date(entry.recordedAt).toLocaleDateString()}
                      </p>
                      {entry.notes && <p className="text-xs text-slate-300 mt-1">{entry.notes}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteWeightMutation.mutate({ entryId: entry.id })}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {entries.length === 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-400">No weight entries yet. Start tracking your weight!</p>
        </div>
      )}
    </div>
  );
}
