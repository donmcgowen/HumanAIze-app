import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Plus, Send } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

export default function Assistant() {
  const { data: threadData, isLoading: threadsLoading, refetch: refetchThreads } = trpc.assistant.messages.useQuery();
  const { data: dashboard } = trpc.health.dashboard.useQuery({ rangeDays: 14 });
  const createThreadMutation = trpc.assistant.createThread.useMutation();
  const sendMessageMutation = trpc.assistant.sendMessage.useMutation();
  const [input, setInput] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadData?.activeThreadId) {
      setActiveThreadId(threadData.activeThreadId);
    }
  }, [threadData?.activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadData?.messages]);

  const handleCreateThread = async () => {
    try {
      const result = await createThreadMutation.mutateAsync({});
      setActiveThreadId(result.activeThreadId);
      await refetchThreads();
    } catch (error) {
      toast.error("Failed to create thread");
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !activeThreadId) return;

    const userMessage = input;
    setInput("");

    try {
      await sendMessageMutation.mutateAsync({
        threadId: activeThreadId,
        content: userMessage,
      });
      await refetchThreads();
    } catch (error) {
      toast.error("Failed to send message");
      setInput(userMessage);
    }
  };

  if (threadsLoading) {
    return (
      <div className="space-y-4">
        <div className="tech-card animate-pulse h-96" />
      </div>
    );
  }

  const currentThread = threadData?.threads?.find((t) => t.id === activeThreadId);
  const messages = threadData?.messages || [];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-4 border-r border-white/10 pr-6">
        <div>
          <p className="tech-label">Conversation history</p>
          <h3 className="tech-heading mt-2">Threads</h3>
        </div>
        <Button onClick={handleCreateThread} className="tech-button-primary w-full flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" />
          New conversation
        </Button>
        <div className="space-y-2">
          {threadData?.threads?.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setActiveThreadId(thread.id)}
              className={`w-full rounded-none border px-3 py-2 text-left text-sm transition ${
                activeThreadId === thread.id
                  ? "border-cyan-300/40 bg-cyan-300/10 text-white"
                  : "border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]"
              }`}
            >
              <p className="truncate font-medium">{thread.title}</p>
              <p className="text-xs text-slate-500">{new Date(thread.updatedAt).toLocaleDateString()}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col">
        {currentThread ? (
          <>
            {/* Header */}
            <div className="border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-cyan-300" />
                <div>
                  <p className="tech-label">AI-powered health insights</p>
                  <h2 className="tech-heading mt-1">{currentThread.title}</h2>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                Ask questions about your glucose, activity, nutrition, and sleep patterns. The assistant uses your unified metric window to provide context-aware responses.
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Bot className="mx-auto h-12 w-12 text-slate-500 mb-4" />
                    <p className="text-slate-400">Start a conversation about your health metrics</p>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-md rounded-none border px-4 py-3 ${
                        message.role === "user"
                          ? "border-cyan-300/30 bg-cyan-300/10 text-white"
                          : "border-white/10 bg-white/[0.03] text-slate-200"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <Streamdown>{message.content}</Streamdown>
                      ) : (
                        <p className="text-sm">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-3 border-t border-white/10 pt-4">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask about your health metrics..."
                className="tech-input flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || sendMessageMutation.isPending}
                className="tech-button-primary flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Bot className="mx-auto h-16 w-16 text-slate-500 mb-4" />
              <p className="text-slate-400">Create or select a conversation to begin</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
