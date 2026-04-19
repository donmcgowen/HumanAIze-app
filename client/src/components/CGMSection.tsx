import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, FileUp, Loader2, AlertCircle, CheckCircle, Activity, Brain, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker - use CDN URL to avoid Vite bundling issues with the worker file
if (typeof window !== 'undefined') {
  // Use unpkg CDN for the worker - matches the installed pdfjs-dist version
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;
}

export function CGMSection() {
  const utils = trpc.useUtils();

  const { data: stats, isLoading: statsLoading } = trpc.cgm.getStats.useQuery({ days: 30 });
  const { data: dailyAvgs, isLoading: chartLoading } = trpc.cgm.getDailyAverages.useQuery({ days: 7 });
  const { data: insights, isLoading: insightsLoading } = trpc.cgm.getInsights.useQuery();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          <h2 className="text-xl font-semibold text-white">CGM Data</h2>
          <p className="text-slate-400 text-sm">Continuous glucose monitoring insights powered by AI</p>
        </div>
      </div>

      {/* Import Card */}
      <Card className="border border-white/10 bg-slate-950">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-400" />
            Import Dexcom Clarity Data
          </CardTitle>
          <CardDescription>Upload a CSV or PDF export from Dexcom Clarity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-400 space-y-1">
            <p className="text-white font-medium">Export from Dexcom Clarity:</p>
            <p>1. Go to clarity.dexcom.com → Reports → Export (CSV or PDF)</p>
            <p>2. Select your date range and download the file</p>
            <p>3. Upload it here to analyze your glucose trends</p>
          </div>

          <input ref={fileInputRef} type="file" accept=".csv,.pdf" onChange={handleFileSelect} className="hidden" />

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="border-white/20 hover:bg-white/10"
              disabled={isImporting}
            >
              <FileText className="h-4 w-4 mr-2" />
              Select CSV
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="border-white/20 hover:bg-white/10"
              disabled={isImporting}
            >
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
        </CardContent>
      </Card>

      {/* Metrics Row */}
      {statsLoading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400 mr-2" />
          <span className="text-slate-400 text-sm">Loading glucose data...</span>
        </div>
      ) : noData ? (
        <Card className="border border-white/10 bg-slate-950">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Activity className="h-12 w-12 text-slate-600 mb-3" />
            <p className="text-slate-400 mb-1">No glucose data yet</p>
            <p className="text-slate-500 text-sm">Import a Dexcom Clarity CSV or PDF above to see your metrics</p>
          </CardContent>
        </Card>
      ) : stats ? (
        <>
          {/* Single Metric Box: Avg Glucose only (A1C and TIR shown on Monitoring page) */}
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <Card className="border border-white/10 bg-gradient-to-br from-cyan-950/50 to-slate-950">
              <CardContent className="pt-6 pb-4">
                <p className="text-slate-400 text-sm mb-1">Avg Glucose (30d)</p>
                <p className="text-3xl font-bold text-cyan-400">{stats.average}</p>
                <p className="text-slate-500 text-xs mt-1">mg/dL</p>
                <div className="mt-3 text-xs text-slate-400">
                  Range: {stats.min} – {stats.max} mg/dL
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 7-Day Chart */}
          <Card className="border border-white/10 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-cyan-400" />
                7-Day Blood Sugar Trend
              </CardTitle>
              <CardDescription>Daily average glucose with reference lines for target range</CardDescription>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                </div>
              ) : dailyAvgs && dailyAvgs.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dailyAvgs} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} domain={[40, "auto"]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                      labelStyle={{ color: "#e2e8f0" }}
                      formatter={(value: any, name: string) => [`${value} mg/dL`, name === "avg" ? "Avg" : name === "min" ? "Min" : "Max"]}
                    />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "70", fill: "#ef4444", fontSize: 10 }} />
                    <ReferenceLine y={180} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "180", fill: "#f59e0b", fontSize: 10 }} />
                    <Line type="monotone" dataKey="min" stroke="#3b82f6" strokeWidth={1} dot={false} name="min" />
                    <Line type="monotone" dataKey="avg" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4, fill: "#06b6d4" }} name="avg" />
                    <Line type="monotone" dataKey="max" stroke="#f59e0b" strokeWidth={1} dot={false} name="max" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 text-sm text-center py-10">No chart data available for the last 7 days</p>
              )}
            </CardContent>
          </Card>

          {/* AI Insights */}
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
        </>
      ) : null}
    </div>
  );
}
