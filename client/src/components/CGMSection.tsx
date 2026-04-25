import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, FileUp, Loader2, AlertCircle, CheckCircle, Activity, Brain, Plus, Trash2, Droplets } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker - use CDN URL to avoid Vite bundling issues with the worker file
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function glucoseColor(mgdl: number) {
  if (mgdl < 70) return "text-red-400";
  if (mgdl <= 180) return "text-green-400";
  return "text-orange-400";
}

export function CGMSection() {
  const utils = trpc.useUtils();
  const dayStart = todayStart();

  const { data: stats, isLoading: statsLoading } = trpc.cgm.getStats.useQuery({ days: 30 });
  const { data: insights, isLoading: insightsLoading } = trpc.cgm.getInsights.useQuery();
  const { data: entries, isLoading: entriesLoading } = trpc.manualGlucose.getTodayEntries.useQuery({ dayStart });

  // --- File import state ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Manual entry state ---
  const [isAdding, setIsAdding] = useState(false);
  const [mgdl, setMgdl] = useState("");
  const [readingTime, setReadingTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");

  const importMutation = trpc.sources.importClarityCSV.useMutation({
    onSuccess: (result) => {
      setIsImporting(false);
      setSelectedFile(null);
      toast.success(`Imported ${result.importedCount} glucose readings`);
      utils.cgm.getStats.invalidate();
      utils.cgm.getDailyAverages.invalidate();
      utils.cgm.getInsights.invalidate();
    },
    onError: (error) => {
      setIsImporting(false);
      toast.error(error.message || "Failed to import file");
    },
  });

  const addMutation = trpc.manualGlucose.addEntry.useMutation({
    onSuccess: () => {
      setMgdl("");
      setNotes("");
      setIsAdding(false);
      toast.success("Glucose reading saved");
      utils.manualGlucose.getTodayEntries.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save reading");
    },
  });

  const deleteMutation = trpc.manualGlucose.deleteEntry.useMutation({
    onSuccess: () => {
      toast.success("Reading deleted");
      utils.manualGlucose.getTodayEntries.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete reading");
    },
  });

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
    }
    return fullText;
  };

  const convertPDFToCSV = (pdfText: string): string => {
    const lines = pdfText.split("\n");
    const csvLines = ["Timestamp,Glucose Value (mg/dL),Trend,Type"];
    for (const line of lines) {
      const glucoseMatch = line.match(/(\d{1,3})\s*mg\/dL|Glucose[:\s]+(\d{1,3})/i);
      if (glucoseMatch) {
        const value = glucoseMatch[1] || glucoseMatch[2];
        const timeMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i);
        const timestamp = timeMatch ? timeMatch[0] : new Date().toISOString().split("T")[0];
        csvLines.push(`${timestamp},${value},Flat,Sensor`);
      }
    }
    if (csvLines.length < 2) throw new Error("No glucose readings found in PDF");
    return csvLines.join("\n");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".pdf")) {
      toast.error("Please select a CSV or PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }
    setSelectedFile(file);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsImporting(true);
    try {
      let csvContent: string;
      if (selectedFile.name.endsWith(".pdf")) {
        const pdfText = await extractTextFromPDF(selectedFile);
        csvContent = convertPDFToCSV(pdfText);
      } else {
        csvContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(selectedFile);
        });
      }
      importMutation.mutate({ csvContent });
    } catch (error) {
      setIsImporting(false);
      toast.error(error instanceof Error ? error.message : "Failed to process file");
    }
  };

  const handleAdd = () => {
    const value = parseFloat(mgdl);
    if (!mgdl || isNaN(value) || value <= 0 || value > 1000) {
      toast.error("Enter a valid glucose value (1–1000 mg/dL)");
      return;
    }
    const [hours, minutes] = readingTime.split(":").map(Number);
    const ts = new Date();
    ts.setHours(hours, minutes, 0, 0);
    addMutation.mutate({ mgdl: value, readingAt: ts.getTime(), notes: notes || undefined });
  };

  const insightColors: Record<string, string> = {
    success: "bg-green-900/20 border-green-500/30 text-green-400",
    warning: "bg-yellow-900/20 border-yellow-500/30 text-yellow-400",
    info: "bg-blue-900/20 border-blue-500/30 text-blue-400",
  };

  const noData = !statsLoading && !stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-cyan-400" />
        <div>
          <h2 className="text-xl font-semibold text-white">Blood Sugar & CGM Data</h2>
          <p className="text-slate-400 text-sm">Log manual readings or import from Dexcom Clarity</p>
        </div>
      </div>

      {/* Combined entry card */}
      <Card className="border border-white/10 bg-slate-950">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Droplets className="h-5 w-5 text-cyan-400" />
            Glucose Data Entry
          </CardTitle>
          <CardDescription>Add a manual reading or import a Dexcom Clarity export</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="manual">
            <TabsList className="mb-4 bg-slate-900 border border-white/10">
              <TabsTrigger value="manual" className="data-[state=active]:bg-slate-700">
                <Droplets className="h-4 w-4 mr-2" />
                Manual Entry
              </TabsTrigger>
              <TabsTrigger value="import" className="data-[state=active]:bg-slate-700">
                <FileText className="h-4 w-4 mr-2" />
                Import Dexcom
              </TabsTrigger>
            </TabsList>

            {/* Manual entry tab */}
            <TabsContent value="manual" className="space-y-4">
              {isAdding ? (
                <div className="space-y-3 p-4 rounded-lg border border-white/10 bg-slate-900/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Glucose (mg/dL)</label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="1000"
                        placeholder="e.g., 120"
                        value={mgdl}
                        onChange={(e) => setMgdl(e.target.value)}
                        className="bg-slate-900 border-white/10"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Time</label>
                      <Input
                        type="time"
                        value={readingTime}
                        onChange={(e) => setReadingTime(e.target.value)}
                        className="bg-slate-900 border-white/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">Notes (optional)</label>
                    <Textarea
                      placeholder="e.g., fasting, after meal..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="bg-slate-900 border-white/10 resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleAdd} disabled={addMutation.isPending} className="bg-cyan-500 hover:bg-cyan-600">
                      {addMutation.isPending ? "Saving..." : "Save Reading"}
                    </Button>
                    <Button onClick={() => { setIsAdding(false); setMgdl(""); setNotes(""); }} variant="outline" className="border-white/20 hover:bg-white/10">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setIsAdding(true)} className="w-full bg-cyan-500 hover:bg-cyan-600">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Glucose Reading
                </Button>
              )}

              {/* Today's readings */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Today's Readings</h3>
                {entriesLoading ? (
                  <div className="text-sm text-slate-400 text-center py-4">Loading...</div>
                ) : entries && entries.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {entries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-white/10 hover:bg-slate-800/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className={`text-xl font-bold ${glucoseColor(entry.mgdl)}`}>
                              {entry.mgdl} <span className="text-sm font-normal text-slate-400">mg/dL</span>
                            </span>
                            <span className="text-sm text-slate-400">
                              {new Date(entry.readingAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {entry.notes && <div className="text-xs text-slate-500 italic mt-1">{entry.notes}</div>}
                        </div>
                        <Button
                          onClick={() => deleteMutation.mutate({ entryId: entry.id })}
                          disabled={deleteMutation.isPending}
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 text-center py-6 rounded-lg bg-slate-900/30 border border-white/10">
                    No readings logged today.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Import Dexcom tab */}
            <TabsContent value="import" className="space-y-4">
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-400 space-y-1">
                <p className="text-white font-medium">Export from Dexcom Clarity:</p>
                <p>1. Go to clarity.dexcom.com → Reports → Export (CSV or PDF)</p>
                <p>2. Select your date range and download the file</p>
                <p>3. Upload it here to analyze your glucose trends</p>
              </div>

              <input ref={fileInputRef} type="file" accept=".csv,.pdf" onChange={handleFileSelect} className="hidden" />

              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="border-white/20 hover:bg-white/10" disabled={isImporting}>
                  <FileText className="h-4 w-4 mr-2" />
                  Select CSV
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="border-white/20 hover:bg-white/10" disabled={isImporting}>
                  <FileUp className="h-4 w-4 mr-2" />
                  Select PDF
                </Button>
              </div>

              {selectedFile && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <p className="text-sm text-slate-300">
                    <span className="font-medium">Selected:</span> {selectedFile.name}
                  </p>
                </div>
              )}

              {selectedFile && (
                <Button onClick={handleImport} disabled={isImporting} className="w-full bg-cyan-500 hover:bg-cyan-600">
                  {isImporting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Import {selectedFile.name.endsWith(".pdf") ? "PDF" : "CSV"}</>
                  )}
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Metrics / AI Insights */}
      {statsLoading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400 mr-2" />
          <span className="text-slate-400 text-sm">Loading glucose data...</span>
        </div>
      ) : noData ? (
        <Card className="border border-white/10 bg-slate-950">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Activity className="h-12 w-12 text-slate-600 mb-3" />
            <p className="text-slate-400 mb-1">No CGM data yet</p>
            <p className="text-slate-500 text-sm">Import a Dexcom Clarity CSV or PDF to see your metrics</p>
          </CardContent>
        </Card>
      ) : stats ? (
        <Card className="border border-white/10 bg-slate-950">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-400" />
              AI Health Insights
            </CardTitle>
            <CardDescription>Personalized recommendations based on your glucose, food logs, and goals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insightsLoading ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                <span className="text-slate-400 text-sm">Generating AI insights...</span>
              </div>
            ) : insights && insights.length > 0 ? (
              insights.map((insight, i) => (
                <div key={i} className={`p-4 rounded-lg border ${insightColors[insight.type] || insightColors.info}`}>
                  <p className="font-semibold text-sm mb-1">{insight.title}</p>
                  <p className="text-xs opacity-90">{insight.message}</p>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 p-3 text-slate-500 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                AI insights unavailable — add food logs and glucose data to unlock recommendations.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
