import type { AgentMessageBlock } from "@/data/mock";
import { OpportunityCard } from "@/components/agent/OpportunityCard";
import { PrivacyToggle } from "@/components/shared/PrivacyToggle";

type AgentMessageProps = {
  blocks: AgentMessageBlock[];
};

export function AgentMessage({ blocks }: AgentMessageProps) {
  return (
    <div className="max-w-full rounded-[26px] rounded-bl-lg border border-white/8 bg-[linear-gradient(180deg,rgba(20,20,28,0.96),rgba(14,14,20,0.98))] px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.2)] sm:max-w-4xl sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted uppercase">
            Shadow
          </p>
          <p className="mt-2 text-sm text-muted">Execution notes</p>
        </div>
        <PrivacyToggle enabled />
      </div>
      <div className="mt-5 space-y-4">
        {blocks.map((block, index) =>
          block.type === "text" ? (
            <p
              key={`${block.type}-${index}`}
              className="text-sm leading-7 text-foreground/88 sm:text-[15px]"
            >
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
