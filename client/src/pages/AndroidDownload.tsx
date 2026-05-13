import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, ShieldCheck, ArrowLeft } from "lucide-react";

const apkUrl = import.meta.env.VITE_ANDROID_APK_URL || "/downloads/humanaize-android-latest.apk";

export default function AndroidDownload() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href="/" className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to landing
        </a>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-cyan-300" />
              </div>
              <CardTitle className="text-white">Install HumanAIze on Android</CardTitle>
            </div>
            <CardDescription>
              Download the latest Android build and install directly without the Play Store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-semibold h-11">
              <a href={apkUrl} download>
                <Download className="w-4 h-4 mr-2" />
                Download Android APK
              </a>
            </Button>

            <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-white mb-2">Install steps</h3>
              <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1">
                <li>Download the APK file on your Android phone.</li>
                <li>Open Settings and enable Install unknown apps for your browser/files app.</li>
                <li>Open the downloaded APK and tap Install.</li>
                <li>Sign up with email and password, then start tracking your health data.</li>
              </ol>
            </div>

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5" />
              <p>
                For safety, only install APK files hosted on your official HumanAIze domain.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
