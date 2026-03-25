import { motion } from "framer-motion";
import { Bot, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { AgentInput } from "@/components/agent/AgentInput";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { UserMessage } from "@/components/agent/UserMessage";
import { useAgentChat } from "@/hooks/useAgentChat";

export function AgentChat() {
  const {
    activeThread,
    isStreaming,
    messages,
    sendMessage,
    approveAction,
    rejectAction,
    isApprovePending,
    pendingAgentAction,
  } = useAgentChat();
  const activeTitle = activeThread?.title ?? "New conversation";
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    lastMessageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [messages, isStreaming]);

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-sm border bg-surface shadow-none border-white/5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent-purple)_10%,transparent),transparent_50%)]" />

      <div className="relative z-10 shrink-0 border-b border-border bg-white/2 px-5 py-4 sm:px-6 sm:py-5 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-primary uppercase flex items-center gap-2">
              <Bot className="size-3.5" />
              Agent Copilot
            </p>
            <p className="truncate text-lg font-bold text-foreground tracking-tight">
              {activeTitle}
            </p>
          </div>
          {/* <ChatModelPicker /> */}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8"
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-20 sm:pb-24">
          {messages.length > 0 ? (
            <>
              {messages
                .filter((m) => !m.metadata?.hidden)
                .map((message, index) => (
                <motion.div
                  key={message.id}
                  ref={
                    index === messages.length - 1 ? lastMessageRef : undefined
                  }
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.2,
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "user" ? (
                    <UserMessage
                      content={
                        message.blocks[0]?.type === "text"
                          ? message.blocks[0].content
                          : ""
                      }
                    />
                  ) : (
                    <AgentMessage
                      blocks={message.blocks}
                      onApproveAction={
                        pendingAgentAction ? approveAction : undefined
                      }
                      onRejectAction={
                        pendingAgentAction ? rejectAction : undefined
                      }
                      isApprovePending={isApprovePending}
                    />
                  )}
                </motion.div>
              ))}
            </>
          ) : (
            <div className="flex min-h-[400px] flex-col items-center justify-center py-10">
              <div className="flex size-16 items-center justify-center rounded-sm bg-primary/10 text-primary shadow-none border border-white/5 shadow-primary/20 ring-1 ring-border mb-6">
                <Sparkles className="size-8" />
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-foreground mb-2">
                How can I help you today?
              </h3>
              <p className="text-sm text-muted text-center max-w-[300px] leading-relaxed">
                Ask SHADOW for yield strategies, portfolio rebalancing, or to
                execute cross-chain actions.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 z-20 px-4 sm:px-6 lg:px-8 flex justify-center">
        <div className="w-full max-w-4xl">
          <AgentInput disabled={isStreaming} onSubmit={sendMessage} />
        </div>
      </div>
    </section>
  );
}
