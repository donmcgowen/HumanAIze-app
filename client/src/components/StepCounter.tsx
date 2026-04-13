import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Footprints, TrendingUp } from "lucide-react";
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

  const lastMagRef = useRef(0);
  const lastStepTimeRef = useRef(0);
  const sessionStepsRef = useRef(0);

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
    if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
      try {
        const state = await (DeviceMotionEvent as any).requestPermission();
        if (state !== "granted") return;
      } catch {
        return;
      }
    }
    window.addEventListener("devicemotion", handleMotion);
    setIsTracking(true);
  }, [handleMotion]);

  const stopTracking = useCallback(() => {
    window.removeEventListener("devicemotion", handleMotion);
    setIsTracking(false);
  }, [handleMotion]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [handleMotion]);

  const totalToday = (savedSteps || 0) + sessionSteps;

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
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4">
      {/* Header with title and current steps */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Footprints className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-300">Steps</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-cyan-400">{totalToday.toLocaleString()}</span>
          {isTracking && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse text-xs">
              Tracking
            </Badge>
          )}
        </div>
      </div>

      {/* 7-day mini chart */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-slate-400" />
          <p className="text-xs text-slate-400">Last 7 days</p>
        </div>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={chartData} barSize={16}>
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6 }}
              labelStyle={{ color: "#e2e8f0" }}
              itemStyle={{ color: "#22d3ee" }}
              formatter={(v: number) => [v.toLocaleString(), "steps"]}
              cursor={{ fill: "rgba(34, 211, 238, 0.1)" }}
            />
            <Bar dataKey="steps" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isToday ? "#22d3ee" : "#334155"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
