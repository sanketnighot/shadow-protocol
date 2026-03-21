import type { AgentMessageBlock } from "@/data/mock";
import { Bot } from "lucide-react";
import { ApprovalRequestCard } from "@/components/agent/ApprovalRequestCard";
import { DecisionCard } from "@/components/agent/DecisionCard";
import { FormattedText } from "@/components/agent/FormattedText";
import { OpportunityCard } from "@/components/agent/OpportunityCard";
import { ToolResultCard } from "@/components/agent/ToolResultCard";
import { ThinkingLoader } from "@/components/agent/ThinkingLoader";
import { StrategyProposalCard } from "@/components/agent/StrategyProposalCard";

type AgentMessageProps = {
  blocks: AgentMessageBlock[];
  onApproveAction?: () => void;
  onRejectAction?: () => void;
  isApprovePending?: boolean;
};

export function AgentMessage({ blocks, onApproveAction, onRejectAction, isApprovePending }: AgentMessageProps) {
  return (
    <div className="flex max-w-[95%] sm:max-w-[85%] flex-col items-start gap-2">
      <div className="flex items-center gap-2 px-1">
        <div className="flex size-6 items-center justify-center rounded-sm border border-white/5 bg-white/10 text-foreground ring-1 ring-white/20 shadow-none border border-white/5">
          <Bot className="size-3.5" />
        </div>
        <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-foreground uppercase">
          Shadow
        </span>
      </div>

      <div className="mt-1 flex w-full flex-col gap-3 border-l-2 border-primary/50 bg-transparent pl-4 sm:pl-5">
        {[...blocks]
          .sort((a, b) => {
            const order = (t: string) =>
              t === "text"
                ? 0
                : t === "strategyProposal"
                  ? 1
                  : t === "opportunity" || t === "toolResult" || t === "decisionResult"
                    ? 2
                    : 3;
            return order(a.type) - order(b.type);
          })
          .map((block, index) => {
          if (block.type === "text") {
            return block.content === "Thinking…" ? (
              <ThinkingLoader key={`${block.type}-${index}`} />
            ) : (
              <div key={`${block.type}-${index}`} className="font-mono text-sm leading-relaxed text-foreground/90">
                <FormattedText content={block.content} />
              </div>
            );
          }
          if (block.type === "strategyProposal") {
            return (
              <StrategyProposalCard key={`${block.type}-${index}`} proposal={block.proposal} />
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
