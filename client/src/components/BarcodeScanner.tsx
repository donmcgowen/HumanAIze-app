import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";

// Extend Window type for BarcodeDetector
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Array<{ rawValue: string; format: string }>>;
    };
  }
}

interface BarcodeScannerProps {
  onBarcodeScanned: (barcode: string) => void;
  isLoading?: boolean;
}

export function BarcodeScanner({ onBarcodeScanned, isLoading = false }: BarcodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const lastDetectedRef = useRef<string | null>(null);
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const startCamera = async () => {
      try {
        setError(null);
        setIsScanning(false);
        setScannerReady(false);
        lastDetectedRef.current = null;
        setDetectedBarcode(null);

        // Initialize BarcodeDetector if available
        if (window.BarcodeDetector) {
          try {
            detectorRef.current = new window.BarcodeDetector({
              formats: [
                'ean_13', 'ean_8', 'upc_a', 'upc_e',
                'code_128', 'code_39', 'code_93',
                'itf', 'qr_code', 'data_matrix',
              ],
            });
            console.log('[BarcodeScanner] BarcodeDetector initialized');
          } catch (e) {
            console.warn('[BarcodeScanner] BarcodeDetector init failed, will use jsQR fallback');
            detectorRef.current = null;
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;

          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };

          videoRef.current.onplaying = () => {
            setScannerReady(true);
            setIsScanning(true);
            scanningRef.current = true;
            startDetectionLoop();
          };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to access camera";
        setError(errorMsg);
        console.error("Camera error:", err);
      }
    };

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  const startDetectionLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const detect = async () => {
      if (!scanningRef.current) return;
      if (video.readyState < video.HAVE_ENOUGH_DATA || video.videoWidth === 0) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      try {
        // Use native BarcodeDetector if available (best for EAN-13/UPC)
        if (detectorRef.current) {
          const barcodes = await detectorRef.current.detect(video);
          if (barcodes.length > 0) {
            const barcode = barcodes[0].rawValue;
            if (barcode && barcode !== lastDetectedRef.current) {
              handleBarcodeDetected(barcode);
              return;
            }
          }
        } else {
          // Fallback: draw to canvas and use jsQR for QR codes only
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          
          // Dynamic import jsQR as fallback
          try {
            const jsQR = (await import('jsqr')).default;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code?.data && code.data !== lastDetectedRef.current) {
              handleBarcodeDetected(code.data);
              return;
            }
          } catch {
            // jsQR not available
          }
        }
      } catch (err) {
        // Detection errors are non-fatal, keep scanning
      }

      if (scanningRef.current) {
        animFrameRef.current = requestAnimationFrame(detect);
      }
    };

    animFrameRef.current = requestAnimationFrame(detect);
  }, []);

  const handleBarcodeDetected = (barcode: string) => {
    console.log('[BarcodeScanner] Barcode detected:', barcode);
    lastDetectedRef.current = barcode;
    setDetectedBarcode(barcode);
    scanningRef.current = false;
    setIsScanning(false);

    // Vibrate on mobile if supported
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }

    toast.success(`Barcode scanned: ${barcode}`);
    onBarcodeScanned(barcode);

    // Close scanner after short delay
    setTimeout(() => {
      handleClose();
    }, 800);
  };

  const handleClose = () => {
    stopCamera();
    setIsOpen(false);
    setIsScanning(false);
    setScannerReady(false);
    setError(null);
    setDetectedBarcode(null);
    lastDetectedRef.current = null;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const bitmap = await createImageBitmap(file);
      
      if (detectorRef.current) {
        const barcodes = await detectorRef.current.detect(bitmap);
        if (barcodes.length > 0) {
          handleBarcodeDetected(barcodes[0].rawValue);
          return;
        }
      }

      // Fallback to jsQR for QR codes
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          try {
            const jsQR = (await import('jsqr')).default;
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code?.data) {
              handleBarcodeDetected(code.data);
              return;
            }
          } catch {
            // jsQR not available
          }
        }
      }

      toast.error("No barcode found in image. Try a clearer photo.");
    } catch (err) {
      toast.error("Failed to process image");
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        disabled={isLoading}
        variant="outline"
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Looking up product...
          </>
        ) : (
          <>
            <ScanLine className="mr-2 h-4 w-4" />
            Scan Barcode
          </>
        )}
      </Button>
    );
  }

  return (
    <Card className="border-white/10 bg-[#0a0f1e] fixed inset-0 z-50 m-4 max-w-md mx-auto my-auto rounded-lg overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Scan Barcode</CardTitle>
          <CardDescription className="text-xs">
            {detectorRef.current
              ? "Auto-detects EAN-13, UPC-A, QR codes and more"
              : "Point camera at QR code or barcode"}
          </CardDescription>
        </div>
        <button onClick={handleClose} className="text-slate-400 hover:text-white transition">
          <X className="h-5 w-5" />
        </button>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {error ? (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-200 text-sm">
            <p className="font-medium">Camera Error</p>
            <p className="text-xs mt-1">{error}</p>
            <p className="text-xs mt-2 text-red-300">
              Make sure camera permissions are granted in browser settings.
            </p>
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Scanning overlay */}
            {scannerReady && !detectedBarcode && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* Corner brackets */}
                <div className="relative w-56 h-40">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400 rounded-tl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400 rounded-br" />
                  {/* Scanning line animation */}
                  <div className="absolute inset-x-2 h-0.5 bg-cyan-400/70 animate-scan-line" style={{
                    animation: 'scanLine 2s ease-in-out infinite',
                    top: '50%',
                  }} />
                </div>
              </div>
            )}

            {/* Detected overlay */}
            {detectedBarcode && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-900/50">
                <div className="text-center">
                  <div className="text-green-400 text-4xl mb-2">✓</div>
                  <p className="text-white text-sm font-medium">Barcode detected!</p>
                  <p className="text-green-300 text-xs mt-1">{detectedBarcode}</p>
                </div>
              </div>
            )}

            {/* Loading overlay */}
            {!scannerReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto mb-2" />
                  <p className="text-white text-sm">Starting camera...</p>
                </div>
              </div>
            )}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {isScanning && !detectedBarcode && (
          <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <ScanLine className="h-3 w-3 text-cyan-400 animate-pulse" />
            Scanning automatically — hold barcode steady in the frame
          </p>
        )}

        <div className="space-y-1">
          <label className="block">
            <span className="text-xs text-slate-400">Or upload a barcode image:</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="mt-1 block w-full text-xs text-slate-400"
            />
          </label>
        </div>

        <Button variant="outline" onClick={handleClose} className="w-full text-sm">
          Cancel
        </Button>
      </CardContent>

      <style>{`
        @keyframes scanLine {
          0%, 100% { transform: translateY(-60px); opacity: 0.3; }
          50% { transform: translateY(60px); opacity: 1; }
        }
      `}</style>
    </Card>
  );
}
