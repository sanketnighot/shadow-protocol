import { motion } from "framer-motion";
import { Bot } from "lucide-react";

import { AgentInput } from "@/components/agent/AgentInput";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { UserMessage } from "@/components/agent/UserMessage";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAgentChat } from "@/hooks/useAgentChat";

export function AgentChat() {
  const { activeThread, isStreaming, messages, sendMessage } = useAgentChat();
  const activeTitle = activeThread?.title ?? "New conversation";

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,17,24,0.96),rgba(10,10,15,0.98))] shadow-[0_32px_100px_rgba(0,0,0,0.28)] sm:rounded-[34px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,62,160,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_28%)]" />
      <div className="relative shrink-0 border-b border-white/8 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.32em] text-muted uppercase">
              Agent conversation
            </p>
            <p className="mt-3 truncate text-sm text-muted">
              <span className="text-foreground">{activeTitle}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-6 sm:gap-5">
          {messages.length > 0 ? (
            <>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: index * 0.08, duration: 0.2 }}
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
                    <AgentMessage blocks={message.blocks} />
                  )}
                </motion.div>
              ))}
              {isStreaming ? (
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                  <span className="size-2 animate-pulse rounded-full bg-primary" />
                  Agent is thinking locally
                </div>
              ) : null}
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

      <div className="relative shrink-0 border-t border-white/8 bg-[linear-gradient(180deg,rgba(8,8,12,0),rgba(8,8,12,0.94)_22%,rgba(8,8,12,0.98))] px-3 pb-3 pt-4 sm:px-6 sm:pb-6">
        <div className="mx-auto w-full max-w-4xl">
          <AgentInput disabled={isStreaming} onSubmit={sendMessage} />
        </div>
      </div>
    </section>
  );
}
