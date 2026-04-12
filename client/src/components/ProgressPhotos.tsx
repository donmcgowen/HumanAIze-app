import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera, Upload, Trash2, Calendar, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ProgressPhoto } from "@shared/types";

export function ProgressPhotos() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoName, setPhotoName] = useState("");
  const [photoDate, setPhotoDate] = useState(new Date().toISOString().split("T")[0]);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: photos, isLoading } = trpc.progressPhotos.getPhotos.useQuery();
  const uploadMutation = trpc.progressPhotos.uploadPhoto.useMutation();
  const deleteMutation = trpc.progressPhotos.deletePhoto.useMutation();

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      setCameraStream(stream);
      setShowCamera(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast.error("Could not access camera. Please check permissions.");
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
    setCapturedPhoto(null);
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const photoData = canvasRef.current.toDataURL("image/jpeg");
        setCapturedPhoto(photoData);
        stopCamera();
      }
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const photoData = event.target?.result as string;
        setCapturedPhoto(photoData);
        setShowCamera(true);
      };
      reader.readAsDataURL(file);
    }
  };

  // Save photo
  const savePhoto = async () => {
    if (!capturedPhoto || !photoName.trim()) {
      toast.error("Please enter a photo name");
      return;
    }

    try {
      const base64Data = capturedPhoto.split(",")[1] || capturedPhoto;
      const photoTimestamp = new Date(photoDate).getTime();

      await uploadMutation.mutateAsync({
        photoBase64: base64Data,
        photoName: photoName.trim(),
        photoDate: photoTimestamp,
      });

      toast.success("Photo saved successfully!");
      setPhotoName("");
      setPhotoDate(new Date().toISOString().split("T")[0]);
      setCapturedPhoto(null);
      setShowAddModal(false);
      setShowCamera(false);
      utils.progressPhotos.getPhotos.invalidate();
    } catch (error) {
      console.error("Error saving photo:", error);
      toast.error("Failed to save photo");
    }
  };

  // Delete photo
  const deletePhoto = async (photoId: number) => {
    try {
      await deleteMutation.mutateAsync({ photoId });
      toast.success("Photo deleted");
      utils.progressPhotos.getPhotos.invalidate();
    } catch (error) {
      console.error("Error deleting photo:", error);
      toast.error("Failed to delete photo");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Progress Photos</h3>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <Upload className="h-4 w-4" />
          Add Photos
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : photos && photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo: typeof photos[0]) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-lg bg-slate-800">
              <img
                src={photo.photoUrl}
                alt={photo.photoName}
                className="aspect-square w-full object-cover"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="text-center text-sm font-medium text-white">{photo.photoName}</p>
                <p className="text-xs text-slate-300">
                  {new Date(photo.photoDate).toLocaleDateString()}
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deletePhoto(photo.id)}
                  className="gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Camera className="mb-3 h-12 w-12 text-slate-500" />
            <p className="text-sm text-slate-400">No progress photos yet</p>
            <p className="text-xs text-slate-500">Start tracking your progress by adding photos</p>
          </CardContent>
        </Card>
      )}

      {/* Add Photo Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Progress Photo</DialogTitle>
          </DialogHeader>

          {!showCamera ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={startCamera}
                  className="gap-2"
                  variant="outline"
                >
                  <Camera className="h-4 w-4" />
                  Take Photo
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                  variant="outline"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          ) : capturedPhoto ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg bg-slate-900">
                <img
                  src={capturedPhoto}
                  alt="Captured"
                  className="aspect-square w-full object-cover"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="photoName" className="text-sm">
                    Photo Name
                  </Label>
                  <Input
                    id="photoName"
                    placeholder="e.g., Week 1 Progress"
                    value={photoName}
                    onChange={(e) => setPhotoName(e.target.value)}
                    className="mt-1 border-slate-600 bg-slate-900"
                  />
                </div>

                <div>
                  <Label htmlFor="photoDate" className="text-sm">
                    Date
                  </Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="photoDate"
                      type="date"
                      value={photoDate}
                      onChange={(e) => setPhotoDate(e.target.value)}
                      className="border-slate-600 bg-slate-900 pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setCapturedPhoto(null);
                    setPhotoName("");
                    setShowCamera(false);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Retake
                </Button>
                <Button
                  onClick={savePhoto}
                  disabled={uploadMutation.isPending || !photoName.trim()}
                  className="flex-1 gap-2"
                >
                  {uploadMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Save Photo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="aspect-square w-full object-cover"
                />
              </div>
              <canvas ref={canvasRef} className="hidden" />

              <div className="flex gap-2">
                <Button
                  onClick={stopCamera}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={capturePhoto}
                  className="flex-1 gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Capture
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
