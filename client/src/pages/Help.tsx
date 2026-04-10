import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Zap, TrendingUp, Shield, HelpCircle } from "lucide-react";
import { useState } from "react";

/**
 * Help page with comprehensive guides and FAQs
 */
export function Help() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Help & Guide</h1>
        <p className="text-slate-400 mt-1">Learn how to use Metabolic Insights</p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition cursor-pointer">
          <CardHeader className="pb-3">
            <Zap className="w-6 h-6 text-yellow-400 mb-2" />
            <CardTitle className="text-base">Getting Started</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Connect your first health device in 4 easy steps
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition cursor-pointer">
          <CardHeader className="pb-3">
            <TrendingUp className="w-6 h-6 text-cyan-400 mb-2" />
            <CardTitle className="text-base">Features</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Explore all the features and how to use them
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition cursor-pointer">
          <CardHeader className="pb-3">
            <Shield className="w-6 h-6 text-green-400 mb-2" />
            <CardTitle className="text-base">Privacy & Security</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              How we protect your health data
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Connecting Sources */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Connecting Health Sources</CardTitle>
          <CardDescription>How to add your devices and apps</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold text-sm">
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
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold text-sm">
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
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold text-sm">
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
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold text-sm">
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

      {/* Features Guide */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Features & How to Use Them</CardTitle>
          <CardDescription>Overview of each section in the app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-white mb-1">📊 Command Center</h4>
              <p className="text-sm text-slate-400">
                Your main dashboard showing unified health metrics including glucose, steps, sleep, and nutrition data. See your current status and trends at a glance.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">📈 History</h4>
              <p className="text-sm text-slate-400">
                View trends and patterns over time with interactive charts. Analyze how your metrics change daily, weekly, and monthly.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">📡 Monitoring</h4>
              <p className="text-sm text-slate-400">
                Real-time monitoring of your connected sources. See sync status, last update times, and connection health.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">🍽️ Food Logging</h4>
              <p className="text-sm text-slate-400">
                Log your meals and track macros (protein, carbs, fat). Correlate food intake with glucose responses to understand how different foods affect you.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">💪 Workouts</h4>
              <p className="text-sm text-slate-400">
                Log your workouts and see how they affect your glucose and activity metrics. Track performance over time.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">🤖 Assistant</h4>
              <p className="text-sm text-slate-400">
                Chat with an AI assistant to get personalized insights and recommendations based on your health data.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">📋 Weekly Summaries</h4>
              <p className="text-sm text-slate-400">
                Get AI-generated summaries of your health metrics and insights from the past week.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">👤 Profile</h4>
              <p className="text-sm text-slate-400">
                Manage your profile information, health goals, and preferences.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supported Devices */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Supported Health Devices</CardTitle>
          <CardDescription>Devices and apps you can connect</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-white mb-2">Glucose Monitoring</h4>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>• Dexcom CGM</li>
                <li>• Glooko</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">Activity & Sleep</h4>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>• Fitbit</li>
                <li>• Oura Ring</li>
                <li>• Apple Health</li>
                <li>• Google Fit</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">Nutrition</h4>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>• MyFitnessPal</li>
                <li>• Cronometer</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">Custom</h4>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>• Manual data entry</li>
                <li>• Custom integrations</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQs */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            {
              q: "How often does data sync?",
              a: "Data syncs automatically every 5 minutes from your connected sources. You can also manually trigger a sync from the Monitoring page.",
            },
            {
              q: "Is my data private?",
              a: "Yes, your data is stored securely and never shared with third parties. We use industry-standard encryption and security practices.",
            },
            {
              q: "Can I use this offline?",
              a: "You can view historical data offline, but syncing requires an internet connection. New data will sync once you're back online.",
            },
            {
              q: "What if I disconnect a source?",
              a: "Your historical data remains in the app. You can reconnect the source anytime, and new data will sync from the reconnection point.",
            },
            {
              q: "How do I delete my account?",
              a: "Go to your Profile page and look for the account deletion option. This will remove all your data permanently.",
            },
            {
              q: "Can I export my data?",
              a: "Yes, you can export your health data from the dashboard. Check the settings menu for export options.",
            },
            {
              q: "What should I do if sync is failing?",
              a: "Check the Monitoring page to see sync status. If a source shows an error, try reconnecting it. If issues persist, check your device's app for any authorization issues.",
            },
            {
              q: "How accurate is the AI Assistant?",
              a: "The AI Assistant provides insights based on your data patterns. It's not a substitute for medical advice. Always consult with healthcare professionals for medical decisions.",
            },
          ].map((faq, index) => (
            <div key={index} className="border border-white/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/[0.05] transition"
              >
                <h4 className="font-semibold text-white text-left">{faq.q}</h4>
                <HelpCircle
                  className={`w-5 h-5 text-cyan-400 transition-transform flex-shrink-0 ${
                    expandedFaq === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              {expandedFaq === index && (
                <div className="px-3 pb-3 pt-0 text-sm text-slate-400 bg-white/[0.02]">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Privacy & Security */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Privacy & Security</CardTitle>
          <CardDescription>How we protect your health data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-white mb-2">Data Encryption</h4>
            <p className="text-sm text-slate-400">
              All your data is encrypted in transit and at rest using industry-standard encryption protocols.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">No Third-Party Sharing</h4>
            <p className="text-sm text-slate-400">
              We never sell or share your health data with third parties. Your data stays with you.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Secure Authentication</h4>
            <p className="text-sm text-slate-400">
              We use OAuth 2.0 for secure authentication. Your passwords are never stored on our servers.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Compliance</h4>
            <p className="text-sm text-slate-400">
              We comply with HIPAA and other health data protection regulations.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
