import type { AgentMessageBlock } from "@/data/mock";
import { ApprovalRequestCard } from "@/components/agent/ApprovalRequestCard";
import { DecisionCard } from "@/components/agent/DecisionCard";
import { FormattedText } from "@/components/agent/FormattedText";
import { OpportunityCard } from "@/components/agent/OpportunityCard";
import { ToolResultCard } from "@/components/agent/ToolResultCard";

type AgentMessageProps = {
  blocks: AgentMessageBlock[];
  onApproveAction?: () => void;
  onRejectAction?: () => void;
  isApprovePending?: boolean;
};

export function AgentMessage({ blocks, onApproveAction, onRejectAction, isApprovePending }: AgentMessageProps) {
  return (
    <div className="max-w-full rounded-xl rounded-bl-md border border-white/8 bg-[linear-gradient(180deg,rgba(20,20,28,0.96),rgba(14,14,20,0.98))] px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] sm:max-w-4xl sm:px-4 sm:py-3">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[9px] tracking-[0.25em] text-muted uppercase">
          Shadow
        </p>
      </div>
      <div className="mt-2 space-y-2">
        {[...blocks]
          .sort((a, b) => {
            const order = (t: string) =>
              t === "text"
                ? 0
                : t === "opportunity" || t === "toolResult" || t === "decisionResult"
                  ? 1
                  : 2;
            return order(a.type) - order(b.type);
          })
          .map((block, index) => {
          if (block.type === "text") {
            return block.content === "Thinking…" ? (
              <div key={`${block.type}-${index}`} className="flex h-5 items-center gap-1">
                <span className="size-1.5 animate-pulse rounded-full bg-primary/80" />
                <span className="size-1.5 animate-pulse rounded-full bg-primary/80 [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-primary/80 [animation-delay:300ms]" />
              </div>
            ) : (
              <FormattedText key={`${block.type}-${index}`} content={block.content} />
            );
          }
          if (block.type === "opportunity") {
            return (
              <OpportunityCard
                key={`${block.type}-${index}`}
                title={block.title}
                apy={block.apy}
                tvl={block.tvl}
                risk={block.risk}
                actionLabel={block.actionLabel}
              />
            );
          }
          if (block.type === "toolResult") {
            return (
              <ToolResultCard
                key={`${block.type}-${index}`}
                toolName={block.toolName}
                content={block.content}
              />
            );
          }
          if (block.type === "decisionResult") {
            return (
              <DecisionCard
                key={`${block.type}-${index}`}
                insights={block.insights}
                decision={block.decision}
                simulated={block.simulated}
              />
            );
          }
          if (block.type === "approvalRequest") {
            return (
              <ApprovalRequestCard
                key={`${block.type}-${index}`}
                toolName={block.toolName}
                payload={block.payload}
                message={block.message}
                onApprove={onApproveAction}
                onReject={onRejectAction}
                isPending={isApprovePending}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
