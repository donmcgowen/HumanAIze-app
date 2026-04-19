import { useState } from "react";
import { MessageSquarePlus, ThumbsUp, ThumbsDown, Star, Send, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FEEDBACK_EMAIL = "donmcgowen@outlook.com";
const FEEDBACK_SUBJECT = "HumanAIze Feedback";

type FeedbackType = "positive" | "negative" | "suggestion" | null;

export function AppFeedback() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!message.trim()) {
      toast.error("Please enter your feedback before sending.");
      return;
    }

    const typeLabel =
      feedbackType === "positive"
        ? "✅ What's Working Well"
        : feedbackType === "negative"
        ? "❌ Issue / What Needs Improvement"
        : feedbackType === "suggestion"
        ? "💡 Feature Suggestion"
        : "General Feedback";

    const subjectLine = subject.trim()
      ? `${FEEDBACK_SUBJECT}: ${subject.trim()}`
      : FEEDBACK_SUBJECT;

    const body = [
      `Feedback Type: ${typeLabel}`,
      "",
      message.trim(),
      "",
      "---",
      "Sent from HumanAIze App",
    ].join("\n");

    const mailtoUrl = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
      subjectLine
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailtoUrl;
    setSubmitted(true);
    toast.success("Opening your email app to send feedback — thank you!");
  };

  const handleReset = () => {
    setFeedbackType(null);
    setSubject("");
    setMessage("");
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Thanks for your feedback!</h2>
          <p className="text-slate-400 max-w-md">
            Your email app should have opened with your feedback pre-filled. If it didn't open
            automatically, you can email us directly at{" "}
            <a
              href={`mailto:${FEEDBACK_EMAIL}`}
              className="text-cyan-400 underline underline-offset-2"
            >
              {FEEDBACK_EMAIL}
            </a>
            .
          </p>
          <Button
            onClick={handleReset}
            variant="outline"
            className="mt-4 border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Send More Feedback
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
          <MessageSquarePlus className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">App Feedback</h1>
          <p className="text-sm text-slate-400">Help us make HumanAIze better</p>
        </div>
      </div>

      {/* How-to banner */}
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-cyan-400 shrink-0" />
          <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide">
            How to Give Great Feedback
          </h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          Your feedback directly shapes the app. Tell us what you love so we keep it, and tell us
          what frustrates you so we can fix it. Here are a few things you can share:
        </p>
        <ul className="text-sm text-slate-300 space-y-1.5 pl-1">
          <li className="flex items-start gap-2">
            <ThumbsUp className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-white">What's working well</strong> — features you use every
              day, things that feel fast or easy, anything you'd miss if it was gone.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ThumbsDown className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-white">What's not working</strong> — bugs, confusing screens,
              missing data, anything that slows you down or gives wrong results.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Star className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-white">Feature ideas</strong> — something you wish the app
              could do, integrations you want, or improvements to existing features.
            </span>
          </li>
        </ul>
      </div>

      {/* Feedback type selector */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-slate-300">Feedback type</Label>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              {
                type: "positive" as FeedbackType,
                icon: ThumbsUp,
                label: "What's Good",
                color: "green",
              },
              {
                type: "negative" as FeedbackType,
                icon: ThumbsDown,
                label: "What Needs Work",
                color: "red",
              },
              {
                type: "suggestion" as FeedbackType,
                icon: Star,
                label: "Suggestion",
                color: "yellow",
              },
            ] as const
          ).map(({ type, icon: Icon, label, color }) => {
            const isSelected = feedbackType === type;
            const colorMap: Record<string, string> = {
              green: isSelected
                ? "border-green-500 bg-green-500/20 text-green-300"
                : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-green-500/50 hover:text-green-400",
              red: isSelected
                ? "border-red-500 bg-red-500/20 text-red-300"
                : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-red-500/50 hover:text-red-400",
              yellow: isSelected
                ? "border-yellow-500 bg-yellow-500/20 text-yellow-300"
                : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-yellow-500/50 hover:text-yellow-400",
            };
            return (
              <button
                key={type}
                onClick={() => setFeedbackType(isSelected ? null : type)}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all cursor-pointer ${colorMap[color]}`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject line */}
      <div className="space-y-2">
        <Label htmlFor="feedback-subject" className="text-sm font-medium text-slate-300">
          Subject <span className="text-slate-500 font-normal">(optional)</span>
        </Label>
        <Input
          id="feedback-subject"
          placeholder="e.g. Barcode scan not working, Love the dashboard..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500"
        />
      </div>

      {/* Message */}
      <div className="space-y-2">
        <Label htmlFor="feedback-message" className="text-sm font-medium text-slate-300">
          Your feedback <span className="text-red-400">*</span>
        </Label>
        <Textarea
          id="feedback-message"
          placeholder="Tell us what's great, what's broken, or what you'd love to see added. Be as specific as you like — the more detail, the better we can help."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          className="bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500 resize-none"
        />
        <p className="text-xs text-slate-500">
          Clicking Send will open your email app with this message pre-filled, addressed to{" "}
          <span className="text-slate-400">{FEEDBACK_EMAIL}</span>.
        </p>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!message.trim()}
        className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-base disabled:opacity-40"
      >
        <Send className="h-4 w-4 mr-2" />
        Send Feedback
      </Button>
    </div>
  );
}

export default AppFeedback;
