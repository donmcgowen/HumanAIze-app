import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, FileUp, Brain } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface CSVImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: string[];
  statistics?: {
    count: number;
    average: number;
    min: number;
    max: number;
    stdDev: number;
    timeInRange: number;
    timeAboveRange: number;
    timeBelowRange: number;
    a1cEstimate: number;
    timeRange: { start: string; end: string };
  };
}

interface PDFImportResult {
  success: boolean;
  extractionMethod: string;
  metrics: {
    averageGlucose: number | null;
    timeInRange: number | null;
    a1cEstimate: number | null;
    timeAboveRange: number | null;
    timeBelowRange: number | null;
    standardDeviation: number | null;
    minGlucose: number | null;
    maxGlucose: number | null;
  };
  aiSummary: string | null;
  aiInsights?: string[];
}

export function ClarityCSVUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<CSVImportResult | null>(null);
  const [pdfResult, setPdfResult] = useState<PDFImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const importClarityCSV = trpc.sources.importClarityCSV.useMutation({
    onSuccess: (result) => {
      setCsvResult(result as CSVImportResult);
      setIsImporting(false);
      toast.success(`Imported ${result.importedCount} glucose readings`);
      setSelectedFile(null);
      utils.profile.get.invalidate();
    },
    onError: (error) => {
      setIsImporting(false);
      toast.error(error.message || "Failed to import CSV");
    },
  });

  const importClarityPDF = trpc.sources.importClarityPDF.useMutation({
    onSuccess: (result) => {
      setPdfResult(result as PDFImportResult);
      setIsImporting(false);
      const method = result.extractionMethod === "ai" ? " (AI-extracted)" : "";
      toast.success(`Dexcom Clarity report imported${method}`);
      setSelectedFile(null);
      utils.profile.get.invalidate();
    },
    onError: (error) => {
      setIsImporting(false);
      toast.error(error.message || "Failed to import PDF");
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isCSV = file.name.toLowerCase().endsWith(".csv");
    const isPDF = file.name.toLowerCase().endsWith(".pdf");
    if (!isCSV && !isPDF) {
      toast.error("Please select a CSV or PDF file");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error("File size must be less than 15MB");
      return;
    }

    setSelectedFile(file);
    setCsvResult(null);
    setPdfResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsImporting(true);

    try {
      if (selectedFile.name.toLowerCase().endsWith(".pdf")) {
        // Convert PDF to base64 and send to server for AI extraction
        const arrayBuffer = await selectedFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        importClarityPDF.mutate({ pdfBase64: base64 });
      } else {
        // Read CSV directly
        const reader = new FileReader();
        const csvContent = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(selectedFile);
        });
        importClarityCSV.mutate({ csvContent });
      }
    } catch (error) {
      setIsImporting(false);
      toast.error(error instanceof Error ? error.message : "Failed to process file");
    }
  };

  const isPDF = selectedFile?.name.toLowerCase().endsWith(".pdf");

  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-cyan-400" />
          Import Dexcom Clarity Data
        </CardTitle>
        <CardDescription>
          Upload a CSV or PDF export from Dexcom Clarity. PDFs are analyzed by AI to extract A1C, Average Glucose, and Time in Range.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-white">How to export from Dexcom Clarity:</p>
          <ol className="list-decimal list-inside text-slate-400 space-y-1">
            <li>Go to <span className="text-cyan-400">clarity.dexcom.com</span> and log in</li>
            <li>Navigate to the Reports section</li>
            <li>Select the date range you want to export</li>
            <li>Click "Export" and choose PDF format</li>
            <li>Upload the downloaded file here</li>
          </ol>
        </div>

        {/* File Upload */}
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = ".csv";
                  fileInputRef.current.click();
                }
              }}
              variant="outline"
              className="border-white/20 hover:bg-white/10"
              disabled={isImporting}
            >
              <FileText className="h-4 w-4 mr-2" />
              Select CSV
            </Button>
            <Button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = ".pdf";
                  fileInputRef.current.click();
                }
              }}
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
              {isPDF && (
                <p className="text-xs text-cyan-400 mt-1 flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  AI will extract A1C, Average Glucose, and Time in Range
                </p>
              )}
            </div>
          )}

          {selectedFile && (
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="w-full bg-cyan-500 hover:bg-cyan-600"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isPDF ? "Analyzing PDF with AI..." : "Importing..."}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {isPDF ? "PDF" : "CSV"}
                </>
              )}
            </Button>
          )}
        </div>

        {/* PDF Import Result */}
        {pdfResult && pdfResult.success && (
          <div className="space-y-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-400 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">
                  Dexcom Clarity Report Imported
                  {pdfResult.extractionMethod === "ai" && (
                    <span className="ml-2 text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">AI Analyzed</span>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-400">Metrics saved to your profile and displayed in Monitoring.</p>
            </div>

            {/* AI Summary */}
            {pdfResult.aiSummary && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                  <Brain className="h-4 w-4" />
                  <span className="text-sm font-medium">AI Summary</span>
                </div>
                <p className="text-sm text-slate-300">{pdfResult.aiSummary}</p>
              </div>
            )}

            {/* AI Insights */}
            {pdfResult.aiInsights && pdfResult.aiInsights.length > 0 && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-purple-400 mb-2">
                  <Brain className="h-4 w-4" />
                  <span className="text-sm font-medium">Trend Insights</span>
                </div>
                <ul className="space-y-2">
                  {pdfResult.aiInsights.map((insight, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-2">
              {pdfResult.metrics.a1cEstimate !== null && (
                <div className="bg-white/5 rounded p-3 text-center">
                  <div className="text-xs text-slate-400">Est. A1C</div>
                  <div className="text-2xl font-bold text-orange-400">{pdfResult.metrics.a1cEstimate.toFixed(1)}%</div>
                </div>
              )}
              {pdfResult.metrics.averageGlucose !== null && (
                <div className="bg-white/5 rounded p-3 text-center">
                  <div className="text-xs text-slate-400">Avg Glucose</div>
                  <div className="text-2xl font-bold text-cyan-400">{pdfResult.metrics.averageGlucose}</div>
                  <div className="text-xs text-slate-500">mg/dL</div>
                </div>
              )}
              {pdfResult.metrics.timeInRange !== null && (
                <div className="bg-white/5 rounded p-3 text-center">
                  <div className="text-xs text-slate-400">Time in Range</div>
                  <div className="text-2xl font-bold text-green-400">{pdfResult.metrics.timeInRange.toFixed(0)}%</div>
                </div>
              )}
            </div>

            {/* Additional metrics */}
            {(pdfResult.metrics.timeAboveRange !== null || pdfResult.metrics.timeBelowRange !== null || pdfResult.metrics.standardDeviation !== null) && (
              <div className="grid grid-cols-3 gap-2">
                {pdfResult.metrics.timeAboveRange !== null && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-center">
                    <div className="text-xs text-yellow-400">Above Range</div>
                    <div className="text-lg font-semibold text-yellow-400">{pdfResult.metrics.timeAboveRange.toFixed(0)}%</div>
                  </div>
                )}
                {pdfResult.metrics.timeBelowRange !== null && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-center">
                    <div className="text-xs text-red-400">Below Range</div>
                    <div className="text-lg font-semibold text-red-400">{pdfResult.metrics.timeBelowRange.toFixed(0)}%</div>
                  </div>
                )}
                {pdfResult.metrics.standardDeviation !== null && (
                  <div className="bg-white/5 rounded p-2 text-center">
                    <div className="text-xs text-slate-400">Std Dev</div>
                    <div className="text-lg font-semibold text-purple-400">{pdfResult.metrics.standardDeviation}</div>
                    <div className="text-xs text-slate-500">mg/dL</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CSV Import Result */}
        {csvResult && csvResult.success && (
          <div className="space-y-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">Import Successful</span>
              </div>
              <div className="text-sm text-slate-300 space-y-1">
                <p>✓ Imported: {csvResult.importedCount} readings</p>
                {csvResult.skippedCount > 0 && <p>⚠ Skipped: {csvResult.skippedCount} rows</p>}
              </div>
            </div>

            {csvResult.statistics && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded p-3">
                  <div className="text-xs text-slate-400">Average Glucose</div>
                  <div className="text-2xl font-semibold text-cyan-400">{csvResult.statistics.average}</div>
                  <div className="text-xs text-slate-500">mg/dL</div>
                </div>
                <div className="bg-white/5 rounded p-3">
                  <div className="text-xs text-slate-400">A1C Estimate</div>
                  <div className="text-2xl font-semibold text-orange-400">{csvResult.statistics.a1cEstimate}%</div>
                  <div className="text-xs text-slate-500">estimated</div>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
                  <div className="text-xs text-green-400">In Range</div>
                  <div className="text-lg font-semibold text-green-400">{csvResult.statistics.timeInRange}%</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-xs text-slate-400">Std Dev</div>
                  <div className="text-lg font-semibold text-purple-400">{csvResult.statistics.stdDev}</div>
                  <div className="text-xs text-slate-500">mg/dL</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {(csvResult?.errors?.length ?? 0) > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Import Warnings</span>
            </div>
            <ul className="text-sm text-slate-300 space-y-1">
              {csvResult!.errors.slice(0, 5).map((error, i) => (
                <li key={i}>• {error}</li>
              ))}
              {csvResult!.errors.length > 5 && (
                <li className="text-slate-500">...and {csvResult!.errors.length - 5} more</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
