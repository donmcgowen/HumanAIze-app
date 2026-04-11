import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: string[];
  statistics?: {
    count: number;
    average: number;
    min: number;
    max: number;
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

    if (!file.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      const csvContent = e.target?.result as string;
      importClarityCSV.mutate({ csvContent });
    };

    reader.onerror = () => {
      setIsImporting(false);
      toast.error("Failed to read file");
    };

    reader.readAsText(selectedFile);
  };

  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-cyan-400" />
          Import Dexcom Clarity Data
        </CardTitle>
        <CardDescription>Upload a CSV export from Dexcom Clarity to import glucose readings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-white">How to export from Dexcom Clarity:</p>
          <ol className="list-decimal list-inside text-slate-400 space-y-1">
            <li>Go to clarity.dexcom.com and log in</li>
            <li>Navigate to the Reports section</li>
            <li>Select the date range you want to export</li>
            <li>Click "Export" and choose CSV format</li>
            <li>Upload the downloaded file here</li>
          </ol>
        </div>

        {/* File Upload */}
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="w-full border-white/20 hover:bg-white/10"
            disabled={isImporting}
          >
            <Upload className="h-4 w-4 mr-2" />
            {selectedFile ? selectedFile.name : "Select CSV File"}
          </Button>

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
                  Import CSV
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
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded p-2">
                  <div className="text-xs text-slate-400">Average</div>
                  <div className="text-lg font-semibold text-white">{importResult.statistics.average}</div>
                  <div className="text-xs text-slate-500">mg/dL</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-xs text-slate-400">Range</div>
                  <div className="text-lg font-semibold text-white">
                    {importResult.statistics.min}-{importResult.statistics.max}
                  </div>
                  <div className="text-xs text-slate-500">mg/dL</div>
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
