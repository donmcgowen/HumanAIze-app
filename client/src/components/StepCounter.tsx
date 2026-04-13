import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Footprints, Play, Square, RotateCcw, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ---------- helpers ----------------------------------------------------------

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sevenDaysAgo(): number {
  return todayStart() - 6 * 24 * 60 * 60 * 1000;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short" });
}

// ---------- accelerometer step detection ------------------------------------

const STEP_THRESHOLD = 12; // m/s² delta needed to count a step
const STEP_COOLDOWN_MS = 300; // minimum ms between two steps

function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

// ---------- component --------------------------------------------------------

const DAILY_GOAL = 10000;

interface StepCounterProps {
  onTotalChange?: (total: number) => void;
}

export function StepCounter({ onTotalChange }: StepCounterProps = {}) {
  const dayStart = todayStart();

  // Server state
  const { data: savedSteps = 0, refetch: refetchToday } = trpc.steps.getToday.useQuery({ dayStart });
  const { data: history = [] } = trpc.steps.getHistory.useQuery({
    startDate: sevenDaysAgo(),
    endDate: dayStart + 24 * 60 * 60 * 1000,
  });
  const logMutation = trpc.steps.logToday.useMutation();

  // Local counting state
  const [sessionSteps, setSessionSteps] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const lastMagRef = useRef(0);
  const lastStepTimeRef = useRef(0);
  const sessionStepsRef = useRef(0); // keep ref in sync for the event handler

  useEffect(() => {
    sessionStepsRef.current = sessionSteps;
  }, [sessionSteps]);

  // Check support on mount
  useEffect(() => {
    setSupported(typeof DeviceMotionEvent !== "undefined");
  }, []);

  // Persist to server whenever sessionSteps changes (debounced 2 s)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (sessionSteps === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const total = (savedSteps || 0) + sessionSteps;
      await logMutation.mutateAsync({ steps: total, dayStart });
      refetchToday();
    }, 2000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [sessionSteps]);

  // Motion event handler
  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

    const mag = magnitude(acc.x, acc.y, acc.z);
    const delta = Math.abs(mag - lastMagRef.current);
    lastMagRef.current = mag;

    const now = Date.now();
    if (delta > STEP_THRESHOLD && now - lastStepTimeRef.current > STEP_COOLDOWN_MS) {
      lastStepTimeRef.current = now;
      setSessionSteps((s) => s + 1);
    }
  }, []);

  const startTracking = useCallback(async () => {
    // iOS 13+ requires explicit permission
    if (
      typeof (DeviceMotionEvent as any).requestPermission === "function"
    ) {
      try {
        const state = await (DeviceMotionEvent as any).requestPermission();
        if (state !== "granted") return;
      } catch {
        return;
      }
    }
    setPermissionGranted(true);
    window.addEventListener("devicemotion", handleMotion);
    setIsTracking(true);
  }, [handleMotion]);

  const stopTracking = useCallback(() => {
    window.removeEventListener("devicemotion", handleMotion);
    setIsTracking(false);
  }, [handleMotion]);

  const resetSession = useCallback(() => {
    setSessionSteps(0);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [handleMotion]);

  const totalToday = (savedSteps || 0) + sessionSteps;
  const progressPct = Math.min(100, Math.round((totalToday / DAILY_GOAL) * 100));

  // Notify parent whenever the live total changes
  useEffect(() => {
    onTotalChange?.(totalToday);
  }, [totalToday, onTotalChange]);

  // Chart data — replace today's saved value with live total
  const chartData = (() => {
    const map = new Map<number, number>(history.map((h) => [h.date, h.steps]));
    map.set(dayStart, totalToday);
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) days.push(dayStart - i * 24 * 60 * 60 * 1000);
    return days.map((d) => ({ label: formatDate(d), steps: map.get(d) ?? 0, isToday: d === dayStart }));
  })();

  return (
    <Card className="border border-white/10 bg-slate-950 mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Footprints className="w-5 h-5 text-cyan-400" />
            <div>
              <CardTitle className="text-white">Step Counter</CardTitle>
              <CardDescription>Built-in pedometer using your device accelerometer</CardDescription>
            </div>
          </div>
          {isTracking && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
              Tracking
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Big step number */}
        <div className="text-center py-4">
          <p className="text-6xl font-bold text-white tabular-nums">{totalToday.toLocaleString()}</p>
          <p className="text-slate-400 mt-1">steps today</p>
          {sessionSteps > 0 && (
            <p className="text-cyan-400 text-sm mt-1">+{sessionSteps.toLocaleString()} this session</p>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">Daily goal</span>
            <span className="text-slate-300 font-medium">{progressPct}% of {DAILY_GOAL.toLocaleString()}</span>
          </div>
          <Progress
            value={progressPct}
            className="h-3 bg-slate-800"
          />
        </div>

        {/* Controls */}
        {supported === false ? (
          <div className="rounded-lg bg-slate-900 border border-white/10 p-4 text-center">
            <p className="text-slate-400 text-sm">Accelerometer not available on this device.</p>
            <p className="text-slate-500 text-xs mt-1">Use a mobile device for automatic step detection.</p>
          </div>
        ) : (
          <div className="flex gap-3">
            {!isTracking ? (
              <Button
                onClick={startTracking}
                className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Start Tracking
              </Button>
            ) : (
              <Button
                onClick={stopTracking}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-semibold flex items-center gap-2"
                variant="outline"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>
            )}
            {sessionSteps > 0 && (
              <Button
                onClick={resetSession}
                variant="outline"
                className="border-white/10 text-slate-400 hover:text-white"
                title="Reset session steps"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}

        {/* 7-day chart */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <p className="text-slate-400 text-sm">Last 7 days</p>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} barSize={28}>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
                itemStyle={{ color: "#22d3ee" }}
                formatter={(v: number) => [v.toLocaleString(), "steps"]}
              />
              <Bar dataKey="steps" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.isToday ? "#22d3ee" : "#334155"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Goal achievement message */}
        {totalToday >= DAILY_GOAL && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 text-center">
            <p className="text-green-400 font-semibold">Goal reached! Great work today.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
