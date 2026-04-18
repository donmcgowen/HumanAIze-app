import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, FileUp } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import * as pdfjsLib from "pdfjs-dist";

// Use CDN worker to avoid Vite bundling issues with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: string[];
  trends?: {
    direction: "rising" | "falling" | "stable";
    changeMgdl: number;
  };
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

export function ClarityCSVUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importClarityCSV = trpc.sources.importClarityCSV.useMutation({
    onSuccess: (result) => {
      setImportResult(result as ImportResult);
      setIsImporting(false);
      toast.success(`Imported ${result.importedCount} glucose readings`);
      setSelectedFile(null);
    },
    onError: (error) => {
      setIsImporting(false);
      toast.error(error.message || "Failed to import CSV");
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isCSV = file.name.endsWith(".csv");
    const isPDF = file.name.endsWith(".pdf");
    if (!isCSV && !isPDF) {
      toast.error("Please select a CSV or PDF file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }

      return fullText;
    } catch (error) {
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const convertPDFToCSV = async (pdfText: string): Promise<string> => {
    // Parse PDF text to extract glucose readings
    // Look for patterns like "145 mg/dL" or "Glucose: 145"
    const lines = pdfText.split("\n");
    const csvLines = ["Timestamp,Glucose Value (mg/dL),Trend,Type"];
    let foundReadings = false;

    for (const line of lines) {
      // Match patterns like "145 mg/dL" or "Glucose: 145"
      const glucoseMatch = line.match(/(\d{1,3})\s*mg\/dL|Glucose[:\s]+(\d{1,3})/i);
      if (glucoseMatch) {
        const value = glucoseMatch[1] || glucoseMatch[2];
        // Try to extract timestamp if available
        const timeMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i);
        const timestamp = timeMatch ? timeMatch[0] : new Date().toISOString().split("T")[0];
        csvLines.push(`${timestamp},${value},Flat,Sensor`);
        foundReadings = true;
      }
    }

    if (!foundReadings) {
      throw new Error("No glucose readings found in PDF");
    }

    return csvLines.join("\n");
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);

    try {
      let csvContent: string;

      if (selectedFile.name.endsWith(".pdf")) {
        // Extract text from PDF and convert to CSV
        const pdfText = await extractTextFromPDF(selectedFile);
        csvContent = await convertPDFToCSV(pdfText);
      } else {
        // Read CSV directly
        const reader = new FileReader();
        csvContent = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(selectedFile);
        });
      }

      importClarityCSV.mutate({ csvContent });
    } catch (error) {
      setIsImporting(false);
      toast.error(error instanceof Error ? error.message : "Failed to process file");
    }
  };

  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-cyan-400" />
          Import Dexcom Clarity Data
        </CardTitle>
        <CardDescription>Upload a CSV or PDF export from Dexcom Clarity to import glucose readings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-white">How to export from Dexcom Clarity:</p>
          <ol className="list-decimal list-inside text-slate-400 space-y-1">
            <li>Go to clarity.dexcom.com and log in</li>
            <li>Navigate to the Reports section</li>
            <li>Select the date range you want to export</li>
            <li>Click "Export" and choose CSV or PDF format</li>
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
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="border-white/20 hover:bg-white/10"
              disabled={isImporting}
            >
              <FileText className="h-4 w-4 mr-2" />
              {selectedFile?.name.endsWith(".csv") ? "Change CSV" : "Select CSV"}
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="border-white/20 hover:bg-white/10"
              disabled={isImporting}
            >
              <FileUp className="h-4 w-4 mr-2" />
              {selectedFile?.name.endsWith(".pdf") ? "Change PDF" : "Select PDF"}
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
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="w-full bg-cyan-500 hover:bg-cyan-600"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {selectedFile.name.endsWith(".pdf") ? "PDF" : "CSV"}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Import Result */}
        {importResult && (
          <div className="space-y-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">Import Successful</span>
              </div>
              <div className="text-sm text-slate-300 space-y-1">
                <p>✓ Imported: {importResult.importedCount} readings</p>
                {importResult.skippedCount > 0 && <p>⚠ Skipped: {importResult.skippedCount} rows</p>}
              </div>
            </div>

            {/* Statistics */}
            {importResult.statistics && (
              <div className="space-y-3">
                {/* Glucose Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded p-3">
                    <div className="text-xs text-slate-400">Average Glucose</div>
                    <div className="text-2xl font-semibold text-cyan-400">{importResult.statistics.average}</div>
                    <div className="text-xs text-slate-500">mg/dL</div>
                  </div>
                  <div className="bg-white/5 rounded p-3">
                    <div className="text-xs text-slate-400">A1C Estimate</div>
                    <div className="text-2xl font-semibold text-orange-400">{importResult.statistics.a1cEstimate}%</div>
                    <div className="text-xs text-slate-500">estimated</div>
                  </div>
                </div>

                {/* Range Statistics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-xs text-slate-400">Min</div>
                    <div className="text-lg font-semibold text-blue-400">{importResult.statistics.min}</div>
                    <div className="text-xs text-slate-500">mg/dL</div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-xs text-slate-400">Max</div>
                    <div className="text-lg font-semibold text-red-400">{importResult.statistics.max}</div>
                    <div className="text-xs text-slate-500">mg/dL</div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-xs text-slate-400">Std Dev</div>
                    <div className="text-lg font-semibold text-purple-400">{importResult.statistics.stdDev}</div>
                    <div className="text-xs text-slate-500">mg/dL</div>
                  </div>
                </div>

                {/* Time in Range */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
                    <div className="text-xs text-green-400">In Range</div>
                    <div className="text-lg font-semibold text-green-400">{importResult.statistics.timeInRange}%</div>
                    <div className="text-xs text-slate-500">80-160 mg/dL</div>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2">
                    <div className="text-xs text-yellow-400">Above Range</div>
                    <div className="text-lg font-semibold text-yellow-400">{importResult.statistics.timeAboveRange}%</div>
                    <div className="text-xs text-slate-500">&gt;160 mg/dL</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                    <div className="text-xs text-red-400">Below Range</div>
                    <div className="text-lg font-semibold text-red-400">{importResult.statistics.timeBelowRange}%</div>
                    <div className="text-xs text-slate-500">&lt;80 mg/dL</div>
                  </div>
                </div>

                {/* Data Summary */}
                <div className="bg-white/5 rounded p-3">
                  <div className="text-xs text-slate-400 mb-2">Data Summary</div>
                  <div className="space-y-1 text-sm text-slate-300">
                    <p>Total Readings: {importResult.statistics.count}</p>
                    {importResult.trends && (
                      <p>
                        Trend: {importResult.trends.direction} ({importResult.trends.changeMgdl > 0 ? "+" : ""}
                        {importResult.trends.changeMgdl} mg/dL)
                      </p>
                    )}
                    {importResult.statistics.timeRange.start && (
                      <p>Period: {new Date(importResult.statistics.timeRange.start).toLocaleDateString()} to {new Date(importResult.statistics.timeRange.end).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Errors */}
            {importResult.errors.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-yellow-400 mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Import Warnings</span>
                </div>
                <div className="text-xs text-slate-300 space-y-1 max-h-32 overflow-y-auto">
                  {importResult.errors.slice(0, 5).map((error, idx) => (
                    <p key={idx}>• {error}</p>
                  ))}
                  {importResult.errors.length > 5 && (
                    <p className="text-slate-500">... and {importResult.errors.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            <Button
              onClick={() => {
                setImportResult(null);
                setSelectedFile(null);
              }}
              variant="outline"
              className="w-full border-white/20"
            >
              Import Another File
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
