import { ArrowRight, CheckCircle, XCircle, Settings2 } from "lucide-react";

import type { SwapPreviewPayload } from "@/types/agent";

type StrategyProposal = {
  name: string;
  summary: string;
  trigger: any;
  action: any;
  guardrails: any;
};

type ApprovalRequestCardProps = {
  toolName: string;
  payload: unknown;
  message: string;
  onApprove?: () => void;
  onReject?: () => void;
  isPending?: boolean;
};

function SwapDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm bg-secondary px-3 py-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-xs font-medium text-foreground/90">{value}</span>
    </div>
  );
}

export function ApprovalRequestCard({
  toolName,
  payload,
  message,
  onApprove,
  onReject,
  isPending,
}: ApprovalRequestCardProps) {
  const name = toolName ?? "";
  
  const swap = name === "execute_token_swap" ? (payload as SwapPreviewPayload) : null;
  const strategy = name === "create_automation_strategy" ? (payload as StrategyProposal) : null;

  return (
    <div className="rounded-sm border border-border bg-surface-elevated p-4 shadow-none border border-white/5">
      <p className="mb-4 text-sm leading-6 text-foreground/85">{message}</p>

      {swap && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/15 px-2 py-1 text-sm font-semibold text-primary">
              {swap.amount} {swap.fromToken}
            </span>
            <ArrowRight className="size-3.5 text-muted" />
            <span className="rounded-md bg-green-500/15 px-2 py-1 text-sm font-semibold text-green-400">
              {swap.estimatedOutput} {swap.toToken}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SwapDetail label="Network" value={swap.chain} />
            <SwapDetail label="Slippage" value={swap.slippage} />
            <SwapDetail label="Est. Gas" value={swap.gasEstimate} />
            <SwapDetail label="Est. Output" value={`${swap.estimatedOutput} ${swap.toToken}`} />
          </div>
        </div>
      )}

      {strategy && (
        <div className="mb-4 rounded-sm border border-border bg-secondary/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="size-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{strategy.name}</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">{strategy.summary}</p>
          <div className="mt-3 grid grid-cols-1 gap-2">
             <div className="rounded-sm bg-black/20 p-2">
                <p className="font-mono text-[8px] uppercase tracking-tighter text-muted-foreground mb-1">Trigger</p>
                <p className="text-[10px] text-foreground/80 truncate">{JSON.stringify(strategy.trigger)}</p>
             </div>
             <div className="rounded-sm bg-black/20 p-2">
                <p className="font-mono text-[8px] uppercase tracking-tighter text-muted-foreground mb-1">Action</p>
                <p className="text-[10px] text-foreground/80 truncate">{JSON.stringify(strategy.action)}</p>
             </div>
          </div>
        </div>
      )}

      <div className="flex gap-2.5">
        <button
          onClick={onApprove}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-green-500/15 px-4 py-2 text-xs font-semibold text-green-400 transition hover:bg-green-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle className="size-3.5" />
          Approve
        </button>
        <button
          onClick={onReject}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-red-500/12 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/22 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <XCircle className="size-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}
