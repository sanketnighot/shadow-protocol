import { ArrowRight, CheckCircle, ShieldAlert, XCircle } from "lucide-react";

import type { SwapPreviewPayload } from "@/types/agent";

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
    <div className="flex flex-col gap-0.5 rounded-lg bg-white/5 px-3 py-2">
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
  const swap = payload as SwapPreviewPayload | null;
  const isSwap = toolName === "execute_token_swap" && swap;

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0 text-amber-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
          Action requires approval
        </p>
      </div>

      <p className="mb-4 text-sm leading-6 text-foreground/85">{message}</p>

      {isSwap && (
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

      <div className="flex gap-2.5">
        <button
          onClick={onApprove}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-500/15 px-4 py-2 text-xs font-semibold text-green-400 transition hover:bg-green-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle className="size-3.5" />
          Approve
        </button>
        <button
          onClick={onReject}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/12 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/22 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <XCircle className="size-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}
