import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function BodyMeasurementSection() {
  const utils = trpc.useUtils();
  const [isAdding, setIsAdding] = useState(false);
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");
  const [notes, setNotes] = useState("");

  const { data: measurements, isLoading: measurementsLoading } = trpc.bodyMeasurements.getEntries.useQuery({
    limit: 50,
  });

  const { data: trends } = trpc.bodyMeasurements.getTrends.useQuery({
    days: 30,
  });

  const addMutation = trpc.bodyMeasurements.addEntry.useMutation({
    onSuccess: () => {
      setChest("");
      setWaist("");
      setHips("");
      setNotes("");
      setIsAdding(false);
      toast.success("Measurement recorded");
      utils.bodyMeasurements.getEntries.invalidate();
      utils.bodyMeasurements.getTrends.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add measurement");
    },
  });

  const deleteMutation = trpc.bodyMeasurements.deleteEntry.useMutation({
    onSuccess: () => {
      toast.success("Measurement deleted");
      utils.bodyMeasurements.getEntries.invalidate();
      utils.bodyMeasurements.getTrends.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete measurement");
    },
  });

  const handleAddMeasurement = () => {
    if (!chest && !waist && !hips) {
      toast.error("Please enter at least one measurement");
      return;
    }

    addMutation.mutate({
      chestInches: chest ? parseFloat(chest) : undefined,
      waistInches: waist ? parseFloat(waist) : undefined,
      hipsInches: hips ? parseFloat(hips) : undefined,
      notes: notes || undefined,
    });
  };

  const renderTrendIndicator = (change?: number) => {
    if (!change) return null;
    const isPositive = change > 0;
    return (
      <div className={`flex items-center gap-1 text-sm ${isPositive ? "text-red-500" : "text-green-500"}`}>
        {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        <span>{Math.abs(change).toFixed(1)}"</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500" />
            Body Measurements
          </CardTitle>
          <CardDescription>Track chest, waist, and hips measurements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Trends Summary */}
          {trends && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="text-sm text-muted-foreground mb-2">Chest</div>
                <div className="text-2xl font-bold text-foreground">
                  {trends.chest.current ? trends.chest.current.toFixed(1) : "—"}
                  <span className="text-sm text-muted-foreground ml-2">"</span>
                </div>
                {renderTrendIndicator(trends.chest.change)}
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="text-sm text-muted-foreground mb-2">Waist</div>
                <div className="text-2xl font-bold text-foreground">
                  {trends.waist.current ? trends.waist.current.toFixed(1) : "—"}
                  <span className="text-sm text-muted-foreground ml-2">"</span>
                </div>
                {renderTrendIndicator(trends.waist.change)}
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="text-sm text-muted-foreground mb-2">Hips</div>
                <div className="text-2xl font-bold text-foreground">
                  {trends.hips.current ? trends.hips.current.toFixed(1) : "—"}
                  <span className="text-sm text-muted-foreground ml-2">"</span>
                </div>
                {renderTrendIndicator(trends.hips.change)}
              </div>
            </div>
          )}

          {/* Add Measurement Form */}
          {isAdding ? (
            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Chest (inches)</label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 38.5"
                    value={chest}
                    onChange={(e) => setChest(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Waist (inches)</label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 32.0"
                    value={waist}
                    onChange={(e) => setWaist(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Hips (inches)</label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 40.5"
                    value={hips}
                    onChange={(e) => setHips(e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Notes (optional)</label>
                <Textarea
                  placeholder="Add any notes about these measurements..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-background resize-none"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddMeasurement}
                  disabled={addMutation.isPending}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  {addMutation.isPending ? "Saving..." : "Save Measurement"}
                </Button>
                <Button
                  onClick={() => {
                    setIsAdding(false);
                    setChest("");
                    setWaist("");
                    setHips("");
                    setNotes("");
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setIsAdding(true)}
              className="w-full bg-cyan-600 hover:bg-cyan-700"
            >
              <Plus size={16} className="mr-2" />
              Add Measurement
            </Button>
          )}

          {/* Measurements History */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Measurements</h3>
            {measurementsLoading ? (
              <div className="text-sm text-muted-foreground text-center py-4">Loading measurements...</div>
            ) : measurements && measurements.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {measurements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {new Date(m.recordedAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-1">
                        {m.chestInches && <div>Chest: {m.chestInches.toFixed(1)}"</div>}
                        {m.waistInches && <div>Waist: {m.waistInches.toFixed(1)}"</div>}
                        {m.hipsInches && <div>Hips: {m.hipsInches.toFixed(1)}"</div>}
                        {m.notes && <div className="text-xs italic mt-1">{m.notes}</div>}
                      </div>
                    </div>
                    <Button
                      onClick={() => deleteMutation.mutate({ entryId: m.id })}
                      disabled={deleteMutation.isPending}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-6 rounded-lg bg-muted/30 border border-border">
                No measurements recorded yet. Start tracking your body measurements!
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
