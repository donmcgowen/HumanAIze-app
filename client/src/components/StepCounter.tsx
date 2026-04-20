import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Footprints,
  TrendingUp,
  Upload,
  Smartphone,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Info,
  HelpCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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

function tsToDateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ---------- accelerometer step detection ------------------------------------

const STEP_THRESHOLD = 12;
const STEP_COOLDOWN_MS = 300;

function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

// ---------- Apple Health XML parser -----------------------------------------

interface ParsedDay {
  date: string; // YYYY-MM-DD
  steps: number;
}

async function parseAppleHealthXML(file: File): Promise<ParsedDay[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const records = xml.querySelectorAll('Record[type="HKQuantityTypeIdentifierStepCount"]');
        const dayMap = new Map<string, number>();
        records.forEach((r) => {
          const dateStr = r.getAttribute("startDate")?.slice(0, 10);
          const val = parseFloat(r.getAttribute("value") || "0");
          if (dateStr && !isNaN(val)) {
            dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + val);
          }
        });
        const result: ParsedDay[] = [];
        dayMap.forEach((steps, date) => result.push({ date, steps: Math.round(steps) }));
        resolve(result.sort((a, b) => a.date.localeCompare(b.date)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ---------- Google Fit / generic CSV parser ----------------------------------

async function parseStepsCSV(file: File): Promise<ParsedDay[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter(Boolean);
        if (lines.length < 2) { resolve([]); return; }
        const header = lines[0].toLowerCase();
        // Try to detect column indices
        const cols = header.split(",").map((c) => c.trim().replace(/"/g, ""));
        const dateIdx = cols.findIndex((c) => c.includes("date") || c.includes("start"));
        const stepsIdx = cols.findIndex((c) => c.includes("step"));
        if (dateIdx === -1 || stepsIdx === -1) {
          reject(new Error("Could not find date/steps columns. Expected columns named 'date' and 'steps'."));
          return;
        }
        const dayMap = new Map<string, number>();
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((p) => p.trim().replace(/"/g, ""));
          const rawDate = parts[dateIdx];
          const rawSteps = parseFloat(parts[stepsIdx]);
          if (!rawDate || isNaN(rawSteps)) continue;
          const dateKey = rawDate.slice(0, 10);
          dayMap.set(dateKey, (dayMap.get(dateKey) ?? 0) + rawSteps);
        }
        const result: ParsedDay[] = [];
        dayMap.forEach((steps, date) => result.push({ date, steps: Math.round(steps) }));
        resolve(result.sort((a, b) => a.date.localeCompare(b.date)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ---------- component --------------------------------------------------------

const DAILY_GOAL = 10000;
const AUTO_TRACK_KEY = "humanaize_step_autotrack";

interface StepCounterProps {
  onTotalChange?: (total: number) => void;
}

type ImportStatus = { type: "success" | "error"; message: string } | null;

export function StepCounter({ onTotalChange }: StepCounterProps = {}) {
  // Track the current day so we can detect midnight rollover
  const [dayStart, setDayStart] = useState(todayStart);

  // Server state
  const { data: savedSteps = 0, refetch: refetchToday } = trpc.steps.getToday.useQuery({ dayStart });
  const { data: history = [], refetch: refetchHistory } = trpc.steps.getHistory.useQuery({
    startDate: sevenDaysAgo(),
    endDate: dayStart + 24 * 60 * 60 * 1000,
  });
  const logMutation = trpc.steps.logToday.useMutation();

  // Local counting state
  const [sessionSteps, setSessionSteps] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);

  // Auto-track preference (persisted in localStorage)
  const [autoTrack, setAutoTrack] = useState(() => {
    try { return localStorage.getItem(AUTO_TRACK_KEY) === "1"; } catch { return false; }
  });

  // Import UI state
  const [showImport, setShowImport] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [manualSteps, setManualSteps] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastMagRef = useRef(0);
  const lastStepTimeRef = useRef(0);
  const sessionStepsRef = useRef(0);

  useEffect(() => {
    sessionStepsRef.current = sessionSteps;
  }, [sessionSteps]);

  useEffect(() => {
    setSupported(typeof DeviceMotionEvent !== "undefined");
  }, []);

  // Midnight reset: check every minute if the day has changed
  useEffect(() => {
    const midnightCheck = setInterval(() => {
      const newDayStart = todayStart();
      if (newDayStart !== dayStart) {
        // Day has rolled over — reset session steps and refresh server data
        setDayStart(newDayStart);
        setSessionSteps(0);
        sessionStepsRef.current = 0;
        refetchToday();
        refetchHistory();
      }
    }, 60_000); // check every 60 seconds
    return () => clearInterval(midnightCheck);
  }, [dayStart, refetchToday, refetchHistory]);

  // Auto-start tracking when page loads if preference is set
  useEffect(() => {
    if (autoTrack && supported && !isTracking) {
      startTracking();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, autoTrack]);

  const toggleAutoTrack = (val: boolean) => {
    setAutoTrack(val);
    try { localStorage.setItem(AUTO_TRACK_KEY, val ? "1" : "0"); } catch {}
    if (val && !isTracking) startTracking();
    if (!val && isTracking) stopTracking();
  };

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

  useEffect(() => {
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [handleMotion]);

  const totalToday = (savedSteps || 0) + sessionSteps;

  useEffect(() => {
    onTotalChange?.(totalToday);
  }, [totalToday, onTotalChange]);

  // Chart data
  const chartData = (() => {
    const map = new Map<number, number>(history.map((h) => [h.date, h.steps]));
    map.set(dayStart, totalToday);
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) days.push(dayStart - i * 24 * 60 * 60 * 1000);
    return days.map((d) => ({ label: formatDate(d), steps: map.get(d) ?? 0, isToday: d === dayStart }));
  })();

  // ---------- import handlers -------------------------------------------------

  const handleManualSubmit = async () => {
    const val = parseInt(manualSteps, 10);
    if (isNaN(val) || val < 0 || val > 100000) {
      setImportStatus({ type: "error", message: "Please enter a valid step count (0–100,000)." });
      return;
    }
    setIsImporting(true);
    try {
      await logMutation.mutateAsync({ steps: val, dayStart });
      await refetchToday();
      setManualSteps("");
      setImportStatus({ type: "success", message: `Today's steps set to ${val.toLocaleString()}.` });
    } catch {
      setImportStatus({ type: "error", message: "Failed to save steps. Please try again." });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      let days: ParsedDay[] = [];
      const name = file.name.toLowerCase();
      if (name.endsWith(".xml")) {
        days = await parseAppleHealthXML(file);
      } else if (name.endsWith(".csv")) {
        days = await parseStepsCSV(file);
      } else if (name.endsWith(".zip")) {
        setImportStatus({
          type: "error",
          message: "Please unzip the file first and upload the 'export.xml' file inside.",
        });
        setIsImporting(false);
        return;
      } else {
        setImportStatus({ type: "error", message: "Unsupported file type. Please upload an .xml or .csv file." });
        setIsImporting(false);
        return;
      }

      if (days.length === 0) {
        setImportStatus({ type: "error", message: "No step data found in the file." });
        setIsImporting(false);
        return;
      }

      // Save each day to the server
      const todayKey = tsToDateKey(dayStart);
      let savedCount = 0;
      for (const day of days) {
        const ts = new Date(day.date + "T00:00:00").getTime();
        await logMutation.mutateAsync({ steps: day.steps, dayStart: ts });
        savedCount++;
      }

      await refetchToday();
      await refetchHistory();

      const todayEntry = days.find((d) => d.date === todayKey);
      setImportStatus({
        type: "success",
        message: `Imported ${savedCount} days of step data.${todayEntry ? ` Today: ${todayEntry.steps.toLocaleString()} steps.` : ""}`,
      });
    } catch (err: any) {
      setImportStatus({ type: "error", message: err?.message ?? "Import failed. Please check the file and try again." });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---------- render ----------------------------------------------------------

  const progressPct = Math.min(100, Math.round((totalToday / DAILY_GOAL) * 100));

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4">
      {/* Header */}
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

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{progressPct}% of daily goal</span>
          <span>{DAILY_GOAL.toLocaleString()} steps</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5">
          <div
            className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 7-day chart */}
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

      {/* Live tracking controls */}
      {supported && (
        <div className="space-y-2">
          {/* Auto-track toggle row */}
          <div className="flex items-center justify-between bg-slate-800/60 rounded-md px-3 py-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-slate-300 font-medium">Auto-start when app opens</span>
              <button
                onClick={() => setShowHowItWorks((v) => !v)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="How does this work?"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Toggle switch */}
            <button
              onClick={() => toggleAutoTrack(!autoTrack)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                autoTrack ? "bg-cyan-500" : "bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  autoTrack ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* How it works explanation */}
          {showHowItWorks && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3 space-y-1.5 text-xs text-blue-200">
              <p className="font-semibold text-blue-300">How the live step counter works</p>
              <p>The app uses your phone's <strong>accelerometer</strong> (motion sensor) to detect the physical jolt of each step — the same way a fitness app counts steps.</p>
              <p className="font-medium text-yellow-300 mt-1">Important limitations:</p>
              <ul className="list-disc list-inside space-y-1 text-yellow-200/80">
                <li><strong>App must be open</strong> — it only counts while this page is visible on your screen.</li>
                <li><strong>Counts from now</strong> — it does not pick up steps taken before you opened the app today.</li>
                <li><strong>iPhone requires a permission tap</strong> — iOS asks for motion sensor access the first time.</li>
                <li><strong>Not as accurate as a dedicated fitness app</strong> — phone position matters (pocket vs. hand).</li>
              </ul>
              <p className="text-slate-400 mt-1">For full-day step history, use the <strong>Import</strong> option to pull data from your phone's Health app.</p>
            </div>
          )}

          {/* Manual start/stop + import row */}
          <div className="flex gap-2">
            {!isTracking ? (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 text-xs"
                onClick={startTracking}
              >
                <Smartphone className="w-3 h-3 mr-1" />
                Start Tracking Now
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs"
                onClick={stopTracking}
              >
                Stop Tracking
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 text-xs px-2"
              onClick={() => { setShowImport((v) => !v); setImportStatus(null); }}
            >
              <Upload className="w-3 h-3 mr-1" />
              Import
              {showImport ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
            </Button>
          </div>
        </div>
      )}

      {/* Import panel */}
      {showImport && (
        <div className="border border-slate-700 rounded-lg p-3 space-y-4 bg-slate-800/50">
          {/* Manual entry */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-300">Enter Today's Steps Manually</p>
            <p className="text-xs text-slate-500">
              Open your phone's Health app, find today's step count, and type it here.
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="e.g. 8432"
                value={manualSteps}
                onChange={(e) => setManualSteps(e.target.value)}
                className="bg-slate-900 border-slate-600 text-slate-200 text-sm h-8"
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              />
              <Button
                size="sm"
                className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs h-8 px-3"
                onClick={handleManualSubmit}
                disabled={isImporting || !manualSteps}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="border-t border-slate-700" />

          {/* File import */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-300">Import from Health App File</p>

            {/* Apple Health instructions */}
            <div className="bg-slate-900/60 rounded-md p-2.5 space-y-1">
              <p className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <span>🍎</span> Apple Health (iPhone)
              </p>
              <ol className="text-xs text-slate-500 space-y-0.5 list-decimal list-inside">
                <li>Open the <strong className="text-slate-400">Health</strong> app on your iPhone</li>
                <li>Tap your profile picture (top right)</li>
                <li>Scroll down → tap <strong className="text-slate-400">Export All Health Data</strong></li>
                <li>Unzip the downloaded file</li>
                <li>Upload the <strong className="text-slate-400">export.xml</strong> file below</li>
              </ol>
            </div>

            {/* Google Fit instructions */}
            <div className="bg-slate-900/60 rounded-md p-2.5 space-y-1">
              <p className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <span>🤖</span> Google Fit / Android Health (Android)
              </p>
              <ol className="text-xs text-slate-500 space-y-0.5 list-decimal list-inside">
                <li>Go to <strong className="text-slate-400">takeout.google.com</strong> on your phone or computer</li>
                <li>Select only <strong className="text-slate-400">Fit</strong> → click Export</li>
                <li>Download and unzip the archive</li>
                <li>Find a CSV file with "Daily activity" or "Steps" in the name</li>
                <li>Upload that <strong className="text-slate-400">.csv</strong> file below</li>
              </ol>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.csv"
                onChange={handleFileImport}
                className="hidden"
                id="step-file-input"
              />
              <label
                htmlFor="step-file-input"
                className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                  isImporting
                    ? "border-slate-600 text-slate-500 cursor-not-allowed"
                    : "border-cyan-600 text-cyan-400 hover:bg-cyan-600/10"
                }`}
              >
                <Upload className="w-3 h-3" />
                {isImporting ? "Importing…" : "Choose File (.xml or .csv)"}
              </label>
            </div>

            <div className="flex items-start gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-md p-2">
              <Info className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300">
                Your file is processed entirely on your device — it is never sent to any third-party server. Only the daily step totals are saved to HumanAIze.
              </p>
            </div>
          </div>

          {/* Status message */}
          {importStatus && (
            <div
              className={`flex items-start gap-2 rounded-md p-2.5 text-xs ${
                importStatus.type === "success"
                  ? "bg-green-500/10 border border-green-500/20 text-green-300"
                  : "bg-red-500/10 border border-red-500/20 text-red-300"
              }`}
            >
              {importStatus.type === "success" ? (
                <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              )}
              {importStatus.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
