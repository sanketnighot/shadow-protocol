import type { AgentMessageBlock } from "@/data/mock";
import { OpportunityCard } from "@/components/agent/OpportunityCard";
import { PrivacyToggle } from "@/components/shared/PrivacyToggle";

type AgentMessageProps = {
  blocks: AgentMessageBlock[];
};

export function AgentMessage({ blocks }: AgentMessageProps) {
  return (
    <div className="max-w-full rounded-[24px] rounded-bl-md border border-white/10 bg-white/5 px-4 py-4 sm:max-w-3xl sm:rounded-[32px] sm:px-5 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
            Shadow
          </p>
          <p className="mt-2 text-sm text-muted">Execution notes</p>
        </div>
        <PrivacyToggle enabled />
      </div>
      <div className="mt-5 space-y-4">
        {blocks.map((block, index) =>
          block.type === "text" ? (
            <p key={`${block.type}-${index}`} className="text-sm leading-7 text-foreground/90">
              {block.content}
            </p>
          ) : (
            <OpportunityCard
              key={`${block.type}-${index}`}
              title={block.title}
              apy={block.apy}
              tvl={block.tvl}
              risk={block.risk}
              actionLabel={block.actionLabel}
            />
          ),
        )}
      </div>
    </div>
  );
}
