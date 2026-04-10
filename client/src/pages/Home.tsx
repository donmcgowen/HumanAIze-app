import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight, BookOpen, Zap, TrendingUp, Shield } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useState } from "react";

/**
 * Home page with authentication and onboarding
 * Shows login/signup for unauthenticated users
 * Shows dashboard overview for authenticated users
 */
export default function Home() {
  const { user, loading, error, isAuthenticated, logout } = useAuth();
  const [selectedTab, setSelectedTab] = useState<"overview" | "help">("overview");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated view - Login/Signup
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/40 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">Metabolic Insights</h1>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-2xl w-full space-y-8">
            {/* Hero Section */}
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold text-white">
                Personal Health Intelligence
              </h2>
              <p className="text-lg text-slate-400">
                Connect your health devices and get unified glucose, activity, nutrition, and sleep analytics powered by AI insights.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition">
                <CardHeader className="pb-3">
                  <Zap className="w-6 h-6 text-yellow-400 mb-2" />
                  <CardTitle className="text-base">Real-time Sync</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-400">
                    Automatic syncing every 5 minutes from Dexcom, Fitbit, and more
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition">
                <CardHeader className="pb-3">
                  <TrendingUp className="w-6 h-6 text-cyan-400 mb-2" />
                  <CardTitle className="text-base">AI Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-400">
                    Get personalized insights and recommendations based on your data
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition">
                <CardHeader className="pb-3">
                  <Shield className="w-6 h-6 text-green-400 mb-2" />
                  <CardTitle className="text-base">Private & Secure</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-400">
                    Your data stays with you. No third-party sharing
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Auth Buttons */}
            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={() => window.location.href = getLoginUrl()}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white h-12 text-base font-semibold"
              >
                Sign In or Create Account
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <p className="text-center text-sm text-slate-500">
                Uses secure OAuth authentication
              </p>
            </div>

            {/* Help Section */}
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-cyan-400" />
                  <CardTitle>Getting Started</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold text-white">1. Sign In</h4>
                  <p className="text-sm text-slate-400">
                    Create an account or sign in with your existing credentials
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-white">2. Connect Sources</h4>
                  <p className="text-sm text-slate-400">
                    Go to Sources and connect your health devices (Dexcom, Fitbit, etc.)
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-white">3. View Dashboard</h4>
                  <p className="text-sm text-slate-400">
                    See your unified health data and AI-powered insights
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Authenticated view - Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Welcome Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Welcome, {user?.name || "User"}!</h1>
            <p className="text-slate-400 mt-1">Your personal health intelligence dashboard</p>
          </div>
          <Button
            onClick={logout}
            variant="outline"
            className="border-white/10 text-slate-300 hover:text-white"
          >
            Sign Out
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-white/10">
          <button
            onClick={() => setSelectedTab("overview")}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              selectedTab === "overview"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setSelectedTab("help")}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              selectedTab === "help"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Help & Guide
          </button>
        </div>

        {/* Overview Tab */}
        {selectedTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-base">Quick Start</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-400">
                  Get started by connecting your first health source
                </p>
                <Button
                  onClick={() => window.location.href = "/sources"}
                  className="w-full bg-cyan-500 hover:bg-cyan-600"
                >
                  Connect a Source
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-base">View Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-400">
                  See your unified health metrics and trends
                </p>
                <Button
                  onClick={() => window.location.href = "/command-center"}
                  className="w-full bg-cyan-500 hover:bg-cyan-600"
                >
                  Go to Dashboard
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-base">Log Food</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-400">
                  Track your nutrition and correlate with glucose
                </p>
                <Button
                  onClick={() => window.location.href = "/food-logging"}
                  className="w-full bg-cyan-500 hover:bg-cyan-600"
                >
                  Log Food
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Help Tab */}
        {selectedTab === "help" && (
          <div className="space-y-4">
            {/* Connecting Sources */}
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle>Connecting Health Sources</CardTitle>
                <CardDescription>How to add your devices and apps</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold">
                      1
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Go to Sources</h4>
                      <p className="text-sm text-slate-400">
                        Click "Sources" in the sidebar to see available health devices and apps
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold">
                      2
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Click "Connect"</h4>
                      <p className="text-sm text-slate-400">
                        Select a device (e.g., Dexcom, Fitbit) and click the Connect button
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold">
                      3
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Authorize Access</h4>
                      <p className="text-sm text-slate-400">
                        You'll be redirected to the device's login page. Sign in and authorize access
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold">
                      4
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Data Syncs Automatically</h4>
                      <p className="text-sm text-slate-400">
                        Your data will sync every 5 minutes. Check the dashboard to see your metrics
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mt-4">
                  <p className="text-sm text-blue-200">
                    💡 <strong>Tip:</strong> You can connect multiple sources to get a complete picture of your health
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Using the App */}
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle>Using the App</CardTitle>
                <CardDescription>Navigate and use key features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-white mb-1">📊 Command Center</h4>
                    <p className="text-sm text-slate-400">
                      View your unified health metrics including glucose, steps, sleep, and nutrition data
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">📈 History</h4>
                    <p className="text-sm text-slate-400">
                      See trends and patterns over time with interactive charts
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">🍽️ Food Logging</h4>
                    <p className="text-sm text-slate-400">
                      Log your meals and track macros. Correlate food intake with glucose responses
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">💪 Workouts</h4>
                    <p className="text-sm text-slate-400">
                      Log your workouts and see how they affect your glucose and activity metrics
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">🤖 AI Assistant</h4>
                    <p className="text-sm text-slate-400">
                      Chat with an AI assistant to get personalized insights and recommendations
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* FAQs */}
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-white mb-1">How often does data sync?</h4>
                  <p className="text-sm text-slate-400">
                    Data syncs automatically every 5 minutes from your connected sources
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Is my data private?</h4>
                  <p className="text-sm text-slate-400">
                    Yes, your data is stored securely and never shared with third parties
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-1">Can I use this offline?</h4>
                  <p className="text-sm text-slate-400">
                    You can view historical data offline, but syncing requires an internet connection
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-1">What devices are supported?</h4>
                  <p className="text-sm text-slate-400">
                    We support Dexcom, Fitbit, Oura, Apple Health, Google Fit, and more. Check Sources for the full list
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
