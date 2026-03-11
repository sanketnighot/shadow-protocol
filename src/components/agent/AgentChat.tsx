import { motion } from "framer-motion";

import { AgentInput } from "@/components/agent/AgentInput";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { UserMessage } from "@/components/agent/UserMessage";
import { useAgentChat } from "@/hooks/useAgentChat";

export function AgentChat() {
  const { messages } = useAgentChat();

  return (
    <section className="glass-panel rounded-[32px] border border-white/10 p-6">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Agent conversation
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
            Private DeFi guidance, locally orchestrated.
          </h1>
        </div>
        <div className="flex gap-1.5">
          <span className="size-2.5 animate-pulse rounded-full bg-primary" />
          <span className="size-2.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
          <span className="size-2.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
        </div>
      </div>

      <div className="space-y-5 py-6">
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
      </div>

      <AgentInput />
    </section>
  );
}
