import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { useEffect, useRef } from "react";

import { AgentInput } from "@/components/agent/AgentInput";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { ChatModelPicker } from "@/components/agent/ChatModelPicker";
import { UserMessage } from "@/components/agent/UserMessage";
import { EmptyState } from "@/components/shared/EmptyState";
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
  const lastUserMsgRef = useRef<HTMLDivElement>(null);

  const lastUserMsgIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  })();

  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "user") return;
    lastUserMsgRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [messages]);

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,17,24,0.96),rgba(10,10,15,0.98))] shadow-[0_32px_100px_rgba(0,0,0,0.28)] sm:rounded-[34px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,62,160,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_28%)]" />
      <div className="relative shrink-0 border-b border-white/8 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.32em] text-muted uppercase">
              Agent conversation
            </p>
            <p className="mt-1.5 truncate text-xs text-muted">
              <span className="text-foreground">{activeTitle}</span>
            </p>
          </div>
          <ChatModelPicker />
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 lg:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 pb-4 sm:gap-3">
          {messages.length > 0 ? (
            <>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  ref={message.role === "user" && index === lastUserMsgIdx ? lastUserMsgRef : undefined}
                  initial={{ opacity: 0, y: 8, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.15 }}
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
                      onApproveAction={pendingAgentAction ? approveAction : undefined}
                      onRejectAction={pendingAgentAction ? rejectAction : undefined}
                      isApprovePending={isApprovePending}
                    />
                  )}
                </motion.div>
              ))}
            </>
          ) : (
            <div className="flex min-h-full items-center py-10">
              <EmptyState
                icon={<Bot className="size-5" />}
                title="No messages yet"
                description="Ask SHADOW for yield, portfolio actions, or a new strategy and the conversation will start here."
              />
            </div>
          )}
        </div>
      </div>

      <div className="relative shrink-0 border-t border-white/8 bg-[linear-gradient(180deg,rgba(8,8,12,0),rgba(8,8,12,0.94)_22%,rgba(8,8,12,0.98))] px-3 pb-3 pt-3 sm:px-5 sm:pb-4">
        <div className="mx-auto w-full max-w-4xl">
          <AgentInput disabled={isStreaming} onSubmit={sendMessage} />
        </div>
      </div>
    </section>
  );
}
