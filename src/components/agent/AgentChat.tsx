import { motion } from "framer-motion";
import { Bot } from "lucide-react";

import { AgentInput } from "@/components/agent/AgentInput";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { UserMessage } from "@/components/agent/UserMessage";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAgentChat } from "@/hooks/useAgentChat";

export function AgentChat() {
  const { isStreaming, messages, sendMessage } = useAgentChat();

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-[24px] border border-white/10 sm:rounded-[32px]">
      <div className="shrink-0 border-b border-white/10 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              Agent conversation
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-foreground sm:text-3xl">
              Private DeFi guidance, locally orchestrated.
            </h1>
          </div>
          <div className="flex gap-1.5">
            <span className="size-2.5 animate-pulse rounded-full bg-primary" />
            <span className="size-2.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
            <span className="size-2.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-5">
          {messages.length > 0 ? (
            <>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                >
                  {message.role === "user" ? (
                    <UserMessage content={message.blocks[0]?.type === "text" ? message.blocks[0].content : ""} />
                  ) : (
                    <AgentMessage blocks={message.blocks} />
                  )}
                </motion.div>
              ))}
              {isStreaming ? (
                <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
                  Agent is thinking locally...
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={<Bot className="size-5" />}
              title="No messages yet"
              description="Ask SHADOW for yield, portfolio actions, or a new strategy and the conversation will start here."
            />
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 p-4 sm:p-6">
        <AgentInput disabled={isStreaming} onSubmit={sendMessage} />
      </div>
    </section>
  );
}
