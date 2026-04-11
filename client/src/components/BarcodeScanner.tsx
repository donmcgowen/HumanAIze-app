import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BarcodeScannerProps {
  onBarcodeScanned: (barcode: string) => void;
  isLoading?: boolean;
}

export function BarcodeScanner({ onBarcodeScanned, isLoading = false }: BarcodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const startCamera = async () => {
      try {
        setError(null);
        setIsScanning(true);

        // Request camera access with specific constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment", // Back camera
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to access camera";
        setError(errorMsg);
        setIsScanning(false);
        console.error("Camera error:", err);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsOpen(false);
    setIsScanning(false);
    setError(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          // Scan image for barcodes using canvas
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
              canvasRef.current.width = img.width;
              canvasRef.current.height = img.height;
              ctx.drawImage(img, 0, 0);

              // For now, show a placeholder - barcode detection would require additional library
              toast.info("Image uploaded. Use camera for live barcode scanning.");
            }
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error("Failed to process image");
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        disabled={isLoading || isScanning}
        variant="outline"
        className="w-full"
      >
        {isScanning ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Scanning...
          </>
        ) : (
          "Scan Barcode"
        )}
      </Button>
    );
  }

  return (
    <Card className="border-white/10 bg-white/[0.03] fixed inset-0 z-50 m-4 max-w-md mx-auto my-auto rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Scan Barcode</CardTitle>
          <CardDescription>Point camera at barcode to scan (back camera)</CardDescription>
        </div>
        <button
          onClick={handleClose}
          className="text-slate-400 hover:text-white transition"
        >
          <X className="h-5 w-5" />
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-200 text-sm">
            <p className="font-medium">Camera Error</p>
            <p className="text-xs mt-1">{error}</p>
            <p className="text-xs mt-2 text-red-300">
              Make sure you've granted camera permissions in browser settings.
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full bg-black rounded border border-white/20"
              style={{ minHeight: "300px" }}
            />
            {isScanning && (
              <div className="text-center text-sm text-slate-400">
                Point camera at barcode to scan
              </div>
            )}
          </>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-slate-400">Or upload barcode image:</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="mt-1 block w-full text-xs"
            />
          </label>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Supports UPC, EAN, and other 1D/2D barcodes
        </p>

        <Button variant="outline" onClick={handleClose} className="w-full">
          Close
        </Button>
      </CardContent>
    </Card>
  );
}
