import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  appsFlowCancelScheduledRecord,
  appsFlowEstimateScheduleFee,
  appsFlowListScheduled,
  appsFlowSyncScheduled,
  type FlowScheduledRowIpc,
} from "@/lib/apps";

type FlowSchedulePanelProps = {
  strategyBuilderEnabled: boolean;
};

export function FlowSchedulePanel({ strategyBuilderEnabled }: FlowSchedulePanelProps) {
  const [rows, setRows] = useState<FlowScheduledRowIpc[]>([]);
  const [feeText, setFeeText] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cronDraft, setCronDraft] = useState("0 0 * * 1");
  const [cancelId, setCancelId] = useState("");

  const load = useCallback(async () => {
    if (!strategyBuilderEnabled) return;
    setBusy("list");
    try {
      const data = await appsFlowListScheduled(40);
      setRows(data);
    } finally {
      setBusy(null);
    }
  }, [strategyBuilderEnabled]);

  const sync = useCallback(async () => {
    if (!strategyBuilderEnabled) return;
    setBusy("sync");
    try {
      await appsFlowSyncScheduled();
      await load();
    } finally {
      setBusy(null);
    }
  }, [strategyBuilderEnabled, load]);

  const estimate = useCallback(async () => {
    if (!strategyBuilderEnabled) return;
    setBusy("fee");
    try {
      const res = (await appsFlowEstimateScheduleFee({
        executionEffort: 120,
        priorityRaw: 1,
        dataSizeMB: "0.0001",
      })) as { feeFlow?: string; note?: string };
      setFeeText(`${res.feeFlow ?? "?"} FLOW — ${res.note ?? ""}`.trim());
    } catch (e) {
      setFeeText(String(e));
    } finally {
      setBusy(null);
    }
  }, [strategyBuilderEnabled]);

  const cancel = useCallback(async () => {
    if (!strategyBuilderEnabled || !cancelId.trim()) return;
    setBusy("cancel");
    try {
      await appsFlowCancelScheduledRecord(cancelId.trim());
      setCancelId("");
      await load();
    } finally {
      setBusy(null);
    }
  }, [strategyBuilderEnabled, cancelId, load]);

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted">
        Flow on-chain scheduling logs intents to Cadence when you approve automation (unlock session, set{" "}
        <span className="font-mono text-foreground">cadenceAddress</span> in Flow app settings). Full
        FlowTransactionScheduler handlers are still deployed per-account.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-sm text-xs"
          disabled={!strategyBuilderEnabled || busy !== null}
          onClick={() => void load()}
        >
          {busy === "list" ? "Loading…" : "Refresh local list"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-sm text-xs"
          disabled={!strategyBuilderEnabled || busy !== null}
          onClick={() => void sync()}
        >
          {busy === "sync" ? "Sync…" : "Sync tx status"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-sm text-xs"
          disabled={!strategyBuilderEnabled || busy !== null}
          onClick={() => void estimate()}
        >
          {busy === "fee" ? "Fee…" : "Estimate schedule fee"}
        </Button>
      </div>

      {feeText ? (
        <p className="rounded-sm border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] text-foreground">
          {feeText}
        </p>
      ) : null}

      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Cron preset (for strategy action)
        </p>
        <input
          value={cronDraft}
          onChange={(e) => setCronDraft(e.currentTarget.value)}
          className="w-full rounded-sm border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground outline-none"
          aria-label="Cron expression preset"
        />
        <p className="mt-1 text-[10px] text-muted">
          Paste into Flow on-chain → cron field on DCA / rebalance when chain is Flow.
        </p>
      </div>

      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Cancel by local record id
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={cancelId}
            onChange={(e) => setCancelId(e.currentTarget.value)}
            placeholder="uuid"
            className="min-w-[12rem] flex-1 rounded-sm border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground outline-none"
            aria-label="Record id to cancel"
          />
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="rounded-sm text-xs"
            disabled={!strategyBuilderEnabled || busy !== null || !cancelId.trim()}
            onClick={() => void cancel()}
          >
            {busy === "cancel" ? "…" : "Cancel (signs)"}
          </Button>
        </div>
      </div>

      <div className="max-h-48 overflow-auto rounded-sm border border-border">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-secondary/80 text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">Status</th>
              <th className="px-2 py-1 font-medium">Handler</th>
              <th className="px-2 py-1 font-medium">Tx id</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-3 text-muted">
                  No rows yet. Approve a Flow schedule from the agent or automation heartbeat.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-2 py-1 align-top">{r.status}</td>
                  <td className="px-2 py-1 align-top">{r.handlerType}</td>
                  <td className="px-2 py-1 font-mono align-top break-all">{r.submittedTxId || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
