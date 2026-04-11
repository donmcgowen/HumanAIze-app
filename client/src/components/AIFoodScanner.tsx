'use client';

import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Camera, Mic, X, Check } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface FoodRecognitionResult {
  foods: Array<{
    name: string;
    portionSize: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
}

interface AIFoodScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onFoodsRecognized: (foods: FoodRecognitionResult['foods']) => void;
}

export function AIFoodScanner({ isOpen, onClose, onFoodsRecognized }: AIFoodScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [stage, setStage] = useState<'camera' | 'preview' | 'description'>('camera');
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [textDescription, setTextDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const recognizeWithAI = trpc.food.recognizeWithAI.useMutation({
    onSuccess: (result) => {
      onFoodsRecognized(result.foods);
      handleClose();
      toast.success(`Recognized: ${result.foods.map((f) => f.name).join(', ')}`);
    },
    onError: (error) => {
      toast.error('Failed to analyze food. Please try again.');
      console.error('Recognition error:', error);
    },
  });

  // Initialize camera when modal opens
  useEffect(() => {
    if (!isOpen || stage !== 'camera') {
      return;
    }

    const initCamera = async () => {
      try {
        console.log('[AIFoodScanner] Requesting camera access...');
        setCameraError(null);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        console.log('[AIFoodScanner] Camera stream obtained:', stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;

          // Wait for video to load metadata
          const onLoadedMetadata = () => {
            console.log('[AIFoodScanner] Video metadata loaded');
            setCameraActive(true);
            videoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata);
          };

          videoRef.current.addEventListener('loadedmetadata', onLoadedMetadata);

          // Try to play video
          try {
            await videoRef.current.play();
            console.log('[AIFoodScanner] Video playback started');
          } catch (playError) {
            console.error('[AIFoodScanner] Play error:', playError);
            setCameraError('Failed to start video playback');
          }
        }
      } catch (error) {
        console.error('[AIFoodScanner] Camera initialization error:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Camera not available. Please check permissions.';
        setCameraError(errorMessage);
        toast.error(`Camera error: ${errorMessage}`);
      }
    };

    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          console.log('[AIFoodScanner] Stopping track:', track.kind);
          track.stop();
        });
        setCameraActive(false);
      }
    };
  }, [isOpen, stage]);

  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) {
      toast.error('Camera not ready');
      return;
    }

    try {
      const context = canvasRef.current.getContext('2d');
      if (!context) {
        toast.error('Failed to get canvas context');
        return;
      }

      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;

      if (canvasRef.current.width === 0 || canvasRef.current.height === 0) {
        toast.error('Video not ready yet. Please wait a moment.');
        return;
      }

      context.drawImage(videoRef.current, 0, 0);
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.9);
      setPhotoData(imageData);
      setStage('preview');
      toast.success('Photo captured!');
    } catch (error) {
      console.error('[AIFoodScanner] Capture error:', error);
      toast.error('Failed to capture photo');
    }
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        toast.success('Voice recorded!');
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone error:', error);
      toast.error('Microphone not available.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  // Analyze food with Gemini
  const analyzeFood = async () => {
    if (!photoData) {
      toast.error('Please capture a photo first');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Convert base64 to blob for upload
      const response = await fetch(photoData);
      const photoBlob = await response.blob();

      // Upload photo to storage
      const formData = new FormData();
      formData.append('file', photoBlob, 'food.jpg');

      const uploadRes = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload photo');
      const { url: photoUrl } = await uploadRes.json();

      // Upload audio if recorded
      let audioUrl: string | undefined;
      if (recordedAudio) {
        const audioFormData = new FormData();
        audioFormData.append('file', recordedAudio, 'description.webm');

        const audioRes = await fetch('/api/storage/upload', {
          method: 'POST',
          body: audioFormData,
        });

        if (audioRes.ok) {
          const { url } = await audioRes.json();
          audioUrl = url;
        }
      }

      // Call recognition endpoint
      await recognizeWithAI.mutateAsync({
        photoUrl,
        audioUrl,
        textDescription: textDescription || '',
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze food');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    // Stop recording
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    // Reset state
    setStage('camera');
    setPhotoData(null);
    setCameraActive(false);
    setCameraError(null);
    setIsRecording(false);
    setRecordedAudio(null);
    setTextDescription('');
    onClose();
  };

  const retakePhoto = () => {
    setPhotoData(null);
    setRecordedAudio(null);
    setTextDescription('');
    setStage('camera');
  };

  // Show button when closed
  if (!isOpen) {
    return null;
  }

  // Show camera stage
  if (stage === 'camera') {
    return (
      <Card className="border-white/10 bg-white/[0.03] fixed inset-0 z-50 m-4 max-w-md mx-auto my-auto rounded-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>AI Food Scanner</CardTitle>
            <CardDescription>Take a photo of your food</CardDescription>
          </div>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          {cameraError ? (
            <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-200 text-sm">
              <p className="font-semibold mb-2">Camera Error</p>
              <p>{cameraError}</p>
              <p className="text-xs mt-2">Please check that:</p>
              <ul className="text-xs list-disc list-inside mt-1">
                <li>Camera permissions are granted</li>
                <li>No other app is using the camera</li>
                <li>You're using a browser that supports camera access</li>
              </ul>
            </div>
          ) : (
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mx-auto mb-2" />
                    <p className="text-white text-sm">Initializing camera...</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={capturePhoto}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600"
              disabled={!cameraActive || !!cameraError}
            >
              <Camera className="h-4 w-4 mr-2" />
              Take Photo
            </Button>
            <Button variant="outline" onClick={handleClose} size="sm">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show preview stage
  if (stage === 'preview' && photoData) {
    return (
      <Card className="border-white/10 bg-white/[0.03] fixed inset-0 z-50 m-4 max-w-md mx-auto my-auto rounded-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Photo Preview</CardTitle>
            <CardDescription>Review your photo</CardDescription>
          </div>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            <img src={photoData} alt="Captured food" className="w-full h-full object-cover" />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setStage('description')}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600"
            >
              <Check className="h-4 w-4 mr-2" />
              Analyze Food
            </Button>
            <Button variant="outline" onClick={retakePhoto} size="sm">
              <Camera className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show description stage
  if (stage === 'description' && photoData) {
    return (
      <Card className="border-white/10 bg-white/[0.03] fixed inset-0 z-50 m-4 max-w-md mx-auto my-auto rounded-lg overflow-y-auto max-h-[90vh]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Add Description</CardTitle>
            <CardDescription>Help AI calculate macros accurately</CardDescription>
          </div>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            <img src={photoData} alt="Captured food" className="w-full h-full object-cover" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-400">
              Optional: Describe the food to help AI calculate macros accurately
            </Label>
            <Textarea
              placeholder="e.g., Grilled chicken breast with rice and broccoli"
              value={textDescription}
              onChange={(e) => setTextDescription(e.target.value)}
              className="bg-white/10 border-white/20 text-sm min-h-20"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Or record a voice description</Label>
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              variant={isRecording ? 'destructive' : 'outline'}
              className="w-full"
            >
              <Mic className="h-4 w-4 mr-2" />
              {isRecording ? 'Stop Recording' : 'Record Voice'}
            </Button>
            {recordedAudio && <div className="text-xs text-green-400">✓ Voice recorded</div>}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={analyzeFood}
              disabled={isAnalyzing}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Analyze & Add
                </>
              )}
            </Button>
            <Button variant="outline" onClick={retakePhoto} size="sm">
              <Camera className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
