'use client';

import { useRef, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  // Initialize camera
  useEffect(() => {
    if (!isOpen || stage !== 'camera' || cameraActive) return;

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setCameraActive(true);
        }
      } catch (error) {
        console.error('Camera error:', error);
        toast.error('Camera not available. Please check permissions.');
      }
    };

    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        setCameraActive(false);
      }
    };
  }, [isOpen, stage, cameraActive]);

  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);

    const imageData = canvasRef.current.toDataURL('image/jpeg');
    setPhotoData(imageData);
    setStage('preview');
    toast.success('Photo captured!');
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI Food Scanner</DialogTitle>
        </DialogHeader>

        {stage === 'camera' && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={capturePhoto}
                className="flex-1 bg-cyan-500 hover:bg-cyan-600"
                disabled={!cameraActive}
              >
                <Camera className="h-4 w-4 mr-2" />
                Take Photo
              </Button>
              <Button variant="outline" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {stage === 'preview' && photoData && (
          <div className="space-y-4">
            <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
              <img src={photoData} alt="Captured food" className="w-full h-full object-cover" />
            </div>

            <Button
              onClick={() => setStage('description')}
              className="w-full bg-cyan-500 hover:bg-cyan-600"
            >
              <Check className="h-4 w-4 mr-2" />
              Analyze Food
            </Button>

            <Button variant="outline" onClick={retakePhoto} className="w-full">
              Retake Photo
            </Button>
          </div>
        )}

        {stage === 'description' && photoData && (
          <div className="space-y-4">
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
              {recordedAudio && (
                <div className="text-xs text-green-400">✓ Voice recorded</div>
              )}
            </div>

            <Button
              onClick={analyzeFood}
              disabled={isAnalyzing}
              className="w-full bg-cyan-500 hover:bg-cyan-600"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Analyze & Add Food
                </>
              )}
            </Button>

            <Button variant="outline" onClick={retakePhoto} className="w-full">
              Retake Photo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
