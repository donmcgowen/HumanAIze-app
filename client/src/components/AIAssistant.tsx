import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Sparkles, X, Send, Minimize2, Maximize2, ChevronDown,
  User, Bot, Loader2, Trash2, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

interface Profile {
  gender?: string | null;
  ageYears?: number | null;
  weightLbs?: number | null;
  heightIn?: number | null;
  fitnessGoal?: string | null;
  activityLevel?: string | null;
  healthConditions?: string | null;
  dailyCalorieTarget?: number | null;
  dailyProteinTarget?: number | null;
  dailyCarbsTarget?: number | null;
  dailyFatTarget?: number | null;
}

// ─── Page context labels ──────────────────────────────────────────────────────

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/food-logging": "Food Logging",
  "/workouts": "Workouts",
  "/progress": "Progress Tracking",
  "/profile": "Profile Settings",
  "/health-monitoring": "Health Monitoring",
};

// ─── Suggested prompts per page ───────────────────────────────────────────────

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/food-logging": [
    "What should I eat for dinner to hit my protein goal?",
    "How many calories are in a chicken breast?",
    "Suggest a high-protein breakfast",
  ],
  "/workouts": [
    "Create a 4-day workout split for muscle gain",
    "What exercises target my lower back?",
    "How long should I rest between sets?",
  ],
  "/progress": [
    "How long will it take to reach my goal weight?",
    "What's a healthy rate of weight loss per week?",
    "Analyze my progress and give suggestions",
  ],
  "/health-monitoring": [
    "What blood pressure range is healthy?",
    "How does sleep affect weight loss?",
    "What metrics should I track daily?",
  ],
  "/": [
    "Give me a summary of my health goals",
    "What should I focus on today?",
    "How can I improve my nutrition?",
  ],
};

// ─── Markdown-lite renderer ───────────────────────────────────────────────────

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^• /gm, "• ")
    .replace(/\n/g, "<br/>");
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  profile?: Profile | null;
}

export function AIAssistant({ profile }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [location] = useLocation();

  const askMutation = trpc.profile.askAssistant.useMutation();
  const groceryQuery = trpc.grocery.getItems.useQuery(undefined, { staleTime: 60_000 });

  // Build profile summary for Gemini context
  const buildProfileSummary = useCallback(() => {
    if (!profile) return "";
    const parts: string[] = [];
    if (profile.gender) parts.push(`Gender: ${profile.gender}`);
    if (profile.ageYears) parts.push(`Age: ${profile.ageYears} years`);
    if (profile.weightLbs) parts.push(`Weight: ${profile.weightLbs} lbs`);
    if (profile.heightIn) {
      const ft = Math.floor(profile.heightIn / 12);
      const inches = profile.heightIn % 12;
      parts.push(`Height: ${ft}'${inches}"`);
    }
    if (profile.fitnessGoal) parts.push(`Goal: ${profile.fitnessGoal.replace(/_/g, " ")}`);
    if (profile.activityLevel) parts.push(`Activity: ${profile.activityLevel.replace(/_/g, " ")}`);
    if (profile.healthConditions && profile.healthConditions !== "none") {
      parts.push(`Health conditions: ${profile.healthConditions}`);
    }
    if (profile.dailyCalorieTarget) parts.push(`Daily calorie target: ${profile.dailyCalorieTarget} kcal`);
    if (profile.dailyProteinTarget) parts.push(`Protein target: ${profile.dailyProteinTarget}g`);
    if (profile.dailyCarbsTarget) parts.push(`Carbs target: ${profile.dailyCarbsTarget}g`);
    if (profile.dailyFatTarget) parts.push(`Fat target: ${profile.dailyFatTarget}g`);
    // Add grocery list context so Gemini can reference what the user has stocked
    const groceryItems = groceryQuery.data ?? [];
    if (groceryItems.length > 0) {
      const unchecked = groceryItems.filter((i) => !i.isChecked).map((i) => i.name);
      const checked = groceryItems.filter((i) => i.isChecked).map((i) => i.name);
      if (unchecked.length > 0) parts.push(`Grocery list (to buy): ${unchecked.slice(0, 20).join(", ")}`);
      if (checked.length > 0) parts.push(`Already purchased: ${checked.slice(0, 10).join(", ")}`);
    }
    return parts.join(", ");
  }, [profile, groceryQuery.data]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isMinimized]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const pageName = PAGE_LABELS[location] ?? "the app";
      const greeting = profile?.ageYears
        ? `Hi! I'm your HumanAIze AI assistant. I can see you're on ${pageName}. I have access to your profile and health goals, so I can give you personalized advice. What can I help you with?`
        : `Hi! I'm your HumanAIze AI assistant. I'm here to help with nutrition, fitness, and health questions. What can I help you with?`;

      setMessages([{
        id: "welcome",
        role: "assistant",
        text: greeting,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setUnreadCount(0);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const handleSend = async (text?: string) => {
    const messageText = text ?? input.trim();
    if (!messageText || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await askMutation.mutateAsync({
        message: messageText,
        context: PAGE_LABELS[location] ?? location,
        profileSummary: buildProfileSummary(),
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: result.reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (isMinimized) {
        setUnreadCount((c) => c + 1);
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: "Sorry, I couldn't connect to the AI right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setUnreadCount(0);
  };

  const suggestions = PAGE_SUGGESTIONS[location] ?? PAGE_SUGGESTIONS["/"];

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 group"
          aria-label="Open AI Assistant"
        >
          <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all hover:scale-110 active:scale-95">
            <Sparkles className="h-6 w-6 text-white" />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-slate-950 flex items-center justify-center">
                <span className="text-[10px] text-white font-bold">{unreadCount}</span>
              </div>
            )}
          </div>
          <div className="absolute right-16 top-1/2 -translate-y-1/2 bg-slate-800 border border-white/10 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
            Ask AI Assistant
          </div>
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div
          className={`fixed right-4 z-50 flex flex-col bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 transition-all duration-300 ${
            isMinimized
              ? "bottom-4 w-72 h-14"
              : "bottom-4 w-80 sm:w-96 h-[520px]"
          }`}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b border-white/10 cursor-pointer"
            onClick={() => isMinimized && setIsMinimized(false)}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-none">HumanAIze AI</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {isLoading ? "Thinking..." : "Personal Health Assistant"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!isMinimized && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearChat(); }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Clear chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === "user"
                        ? "bg-cyan-500/20 border border-cyan-500/30"
                        : "bg-purple-500/20 border border-purple-500/30"
                    }`}>
                      {msg.role === "user"
                        ? <User className="h-3.5 w-3.5 text-cyan-400" />
                        : <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      }
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-cyan-600/30 border border-cyan-500/20 text-white rounded-tr-sm"
                          : "bg-slate-800 border border-white/10 text-slate-200 rounded-tl-sm"
                      }`}
                    >
                      <div
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                        className="leading-relaxed"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                    <div className="bg-slate-800 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggested prompts (show when no messages or after welcome) */}
                {messages.length <= 1 && !isLoading && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs text-slate-500 text-center">Suggested questions</p>
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="w-full text-left text-xs text-slate-300 bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 hover:bg-slate-700/50 hover:border-cyan-500/30 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-white/10">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about health & fitness..."
                    disabled={isLoading}
                    className="flex-1 bg-slate-800 border-white/10 text-white placeholder:text-slate-500 rounded-xl text-sm h-9"
                  />
                  <Button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    size="sm"
                    className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded-xl px-3 h-9 disabled:opacity-40"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-600 text-center mt-1.5">Powered by Gemini 2.0 Flash</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
