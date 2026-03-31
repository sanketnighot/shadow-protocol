import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ListTodo,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  appsFlowCancelScheduledRecord,
  appsFlowCreateSchedule,
  appsFlowEstimateScheduleFee,
  appsFlowListScheduled,
  appsFlowSyncScheduled,
  buildFlowScheduleIntent,
  getDefaultFlowScheduleDraft,
  parseFlowScheduledMetadata,
  validateFlowScheduleDraft,
  type FlowScheduleDraft,
  type FlowScheduledRowIpc,
} from "@/lib/apps";

type FlowSchedulePanelProps = {
  strategyBuilderEnabled?: boolean;
  cadenceAddress?: string;
  linkedEvmAddress?: string;
  network?: "mainnet" | "testnet";
};

const CRON_PRESETS = [
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily", value: "0 9 * * *" },
  { label: "Weekly", value: "0 9 * * 1" },
  { label: "Month End", value: "0 9 28 * *" },
] as const;

/** Preset `operation` values for custom intents (JSON is built for you). */
const CUSTOM_OPERATION_PRESETS = [
  { value: "claim_rewards", label: "Claim rewards" },
  { value: "snapshot_balances", label: "Log balances snapshot" },
] as const;

const CUSTOM_PRESET_VALUES: Set<string> = new Set(
  CUSTOM_OPERATION_PRESETS.map((p) => p.value),
);

function isSimpleCustomPayload(json: string): boolean {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    return (
      keys.length === 1 &&
      keys[0] === "operation" &&
      typeof o.operation === "string"
    );
  } catch {
    return false;
  }
}

function parseCustomSimpleSelection(json: string): {
  preset: string;
  otherOperation: string;
} {
  if (!isSimpleCustomPayload(json)) {
    return { preset: "claim_rewards", otherOperation: "" };
  }
  try {
    const op = (JSON.parse(json) as { operation: string }).operation.trim();
    if (CUSTOM_PRESET_VALUES.has(op)) {
      return { preset: op, otherOperation: "" };
    }
    return { preset: "other", otherOperation: op };
  } catch {
    return { preset: "claim_rewards", otherOperation: "" };
  }
}

function formatUnixTime(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "Not set";
  try {
    return new Date(seconds * 1000).toLocaleString();
  } catch {
    return "Invalid date";
  }
}

function toDateTimeLocalValue(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function statusTone(status: string): string {
  if (status === "sealed") return "border-emerald-500/30 text-emerald-300";
  if (status.includes("cancel")) return "border-amber-500/30 text-amber-300";
  return "border-primary/30 text-primary";
}

function handlerLabel(handlerType: string): string {
  switch (handlerType) {
    case "dca":
      return "DCA";
    case "rebalance":
      return "Rebalance";
    case "alert":
      return "Alert";
    case "custom":
      return "Custom";
    case "cron_intent":
      return "Cron";
    default:
      return handlerType;
  }
}

function scheduleLabelForRow(row: FlowScheduledRowIpc): string {
  const meta = parseFlowScheduledMetadata(row.metadataJson);
  if (meta.schedule?.type === "cron" && meta.schedule.cronExpression) {
    return `Recurring · ${meta.schedule.cronExpression}`;
  }
  if (meta.schedule?.type === "one_time" && meta.schedule.oneShotTimestamp) {
    return `One-time · ${formatUnixTime(meta.schedule.oneShotTimestamp)}`;
  }
  if (row.cronExpression) {
    return `Recurring · ${row.cronExpression}`;
  }
  return "Intent logged on-chain";
}

function scheduleSummaryForRow(row: FlowScheduledRowIpc): string {
  const meta = parseFlowScheduledMetadata(row.metadataJson);
  return meta.summary?.trim() || "Flow schedule";
}

export function FlowSchedulePanel({
  strategyBuilderEnabled = true,
  cadenceAddress,
  linkedEvmAddress,
  network = "testnet",
}: FlowSchedulePanelProps) {
  const [rows, setRows] = useState<FlowScheduledRowIpc[]>([]);
  const [draft, setDraft] = useState<FlowScheduleDraft>(() =>
    getDefaultFlowScheduleDraft(),
  );
  const [feeText, setFeeText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  /** Custom handler: simple presets vs raw JSON (for power users). */
  const [customUseAdvancedJson, setCustomUseAdvancedJson] = useState(false);

  const cadenceReady =
    cadenceAddress === undefined ? true : cadenceAddress.trim().length > 0;
  const evmReady =
    linkedEvmAddress === undefined ? true : linkedEvmAddress.trim().length > 0;
  const validation = useMemo(() => validateFlowScheduleDraft(draft), [draft]);
  const oneShotLocalValue = toDateTimeLocalValue(draft.oneShotTimestamp);

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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (draft.handlerType !== "custom") return;
    const raw = draft.customJson.trim();
    if (raw === "") return;
    if (!isSimpleCustomPayload(draft.customJson)) {
      setCustomUseAdvancedJson(true);
    }
  }, [draft.handlerType, draft.customJson]);

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
    setFeeText("");
    try {
      const res = (await appsFlowEstimateScheduleFee({
        executionEffort: draft.handlerType === "rebalance" ? 160 : 120,
        priorityRaw: 1,
        dataSizeMB: "0.0001",
      })) as { feeFlow?: string; note?: string };
      setFeeText(`${res.feeFlow ?? "?"} FLOW · ${res.note ?? ""}`.trim());
    } catch (error) {
      setFeeText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [draft.handlerType, strategyBuilderEnabled]);

  const submitSchedule = useCallback(async () => {
    if (!strategyBuilderEnabled) return;
    if (!cadenceReady) {
      setSubmitError(
        "Add your Cadence account in Setup before creating a Flow schedule.",
      );
      return;
    }
    if (!validation.ok) {
      setSubmitError(validation.errors[0] ?? "Fix the highlighted schedule fields.");
      return;
    }

    setBusy("create");
    setSubmitError(null);
    setSubmitMessage(null);
    try {
      const intent = buildFlowScheduleIntent(draft);
      const result = await appsFlowCreateSchedule({
        handlerType: draft.handlerType,
        cronExpression:
          draft.scheduleMode === "cron" ? draft.cronExpression.trim() : null,
        intentJson: intent,
      });
      setSubmitMessage(
        result.note ?? "Flow scheduling intent was submitted successfully.",
      );
      setDraft((current) => ({
        ...getDefaultFlowScheduleDraft(),
        fromSymbol: current.fromSymbol,
        toSymbol: current.toSymbol,
      }));
      await load();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not submit the Flow schedule.",
      );
    } finally {
      setBusy(null);
    }
  }, [cadenceReady, draft, load, strategyBuilderEnabled, validation]);

  const cancelRow = useCallback(
    async (row: FlowScheduledRowIpc) => {
      if (!strategyBuilderEnabled) return;
      if (
        !window.confirm(
          `Cancel "${scheduleSummaryForRow(row)}"? This will log a cancel intent on Flow.`,
        )
      ) {
        return;
      }
      setBusy(`cancel:${row.id}`);
      try {
        await appsFlowCancelScheduledRecord(row.id);
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load, strategyBuilderEnabled],
  );

  const totalSubmitted = rows.filter((row) => row.status === "submitted").length;
  const totalSealed = rows.filter((row) => row.status === "sealed").length;

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-3 rounded-sm border border-border bg-secondary/30 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
            How this works
          </p>
        </div>
        <div className="grid gap-2 text-xs text-muted md:grid-cols-3">
          <div className="rounded-sm border border-border bg-background/70 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
              1. Setup
            </p>
            <p className="mt-1">
              Add your Cadence account, keep the app runtime healthy, and unlock
              your SHADOW session before signing.
            </p>
          </div>
          <div className="rounded-sm border border-border bg-background/70 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
              2. Create
            </p>
            <p className="mt-1">
              Choose a recurring cron schedule or a one-time execution, estimate
              fee, then submit the Flow intent.
            </p>
          </div>
          <div className="rounded-sm border border-border bg-background/70 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
              3. Manage
            </p>
            <p className="mt-1">
              Refresh, sync status, or cancel existing Flow schedules from the
              list below.
            </p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-sm border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2 text-xs">
              {cadenceReady ? (
                <CheckCircle2 className="size-3.5 text-emerald-400" />
              ) : (
                <AlertCircle className="size-3.5 text-amber-400" />
              )}
              <span className="font-mono uppercase tracking-[0.18em] text-muted">
                Cadence
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground">
              {cadenceReady
                ? cadenceAddress
                : "Cadence address missing in Setup."}
            </p>
          </div>
          <div className="rounded-sm border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2 text-xs">
              {evmReady ? (
                <CheckCircle2 className="size-3.5 text-emerald-400" />
              ) : (
                <AlertCircle className="size-3.5 text-amber-400" />
              )}
              <span className="font-mono uppercase tracking-[0.18em] text-muted">
                Flow EVM link
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground">
              {evmReady
                ? linkedEvmAddress
                : "Optional, but useful for matching Flow EVM balances."}
            </p>
          </div>
          <div className="rounded-sm border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2 text-xs">
              <CalendarClock className="size-3.5 text-primary" />
              <span className="font-mono uppercase tracking-[0.18em] text-muted">
                Network
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground capitalize">{network}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-sm border border-border bg-secondary/20 p-4">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
              Create schedule
            </p>
            <p className="text-xs text-muted">
              Manual creation for the Flow app popup. Agents can keep scheduling
              through automation using the same backend.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Schedule type
            </p>
            <div className="flex gap-1 rounded-sm border border-border bg-secondary p-1">
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({ ...current, scheduleMode: "cron" }))
                }
                className={cn(
                  "flex-1 rounded-sm px-3 py-2 text-xs transition-colors",
                  draft.scheduleMode === "cron"
                    ? "bg-background text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                Recurring
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    scheduleMode: "one_time",
                  }))
                }
                className={cn(
                  "flex-1 rounded-sm px-3 py-2 text-xs transition-colors",
                  draft.scheduleMode === "one_time"
                    ? "bg-background text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                One-time
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Handler
            </p>
            <select
              value={draft.handlerType}
              onChange={(event) => {
                const nextHandler = event.currentTarget
                  .value as FlowScheduleDraft["handlerType"];
                setDraft((current) => {
                  const next = { ...current, handlerType: nextHandler };
                  if (
                    nextHandler === "custom" &&
                    next.customJson.trim() === ""
                  ) {
                    next.customJson = JSON.stringify({
                      operation: "claim_rewards",
                    });
                  }
                  return next;
                });
                if (nextHandler !== "custom") {
                  setCustomUseAdvancedJson(false);
                }
              }}
              className="flex h-10 w-full rounded-sm border border-border bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="dca">DCA buy</option>
              <option value="rebalance">Rebalance</option>
              <option value="alert">Alert</option>
              <option value="custom">Custom action</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Summary
          </p>
          <input
            value={draft.summary}
            onChange={(event) => {
              const nextSummary = event.currentTarget.value.slice(0, 140);
              setDraft((current) => ({
                ...current,
                summary: nextSummary,
              }));
            }}
            placeholder="Weekly FLOW accumulation"
            className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
          />
        </div>

        {draft.scheduleMode === "cron" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {CRON_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-sm text-[10px] uppercase tracking-wider"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      cronExpression: preset.value,
                    }))
                  }
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Cron expression
              </p>
              <input
                value={draft.cronExpression}
                onChange={(event) => {
                  const nextCron = event.currentTarget.value.slice(0, 128);
                  setDraft((current) => ({
                    ...current,
                    cronExpression: nextCron,
                  }));
                }}
                className="w-full rounded-sm border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground outline-none"
                aria-label="Cron expression"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Execute at
            </p>
            <input
              type="datetime-local"
              value={oneShotLocalValue}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setDraft((current) => ({
                  ...current,
                  oneShotTimestamp: nextValue
                    ? Math.floor(new Date(nextValue).getTime() / 1000)
                    : null,
                }));
              }}
              className="flex h-10 w-full rounded-sm border border-border bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <p className="text-[10px] text-muted">
              Stored as a Unix timestamp and logged as a Flow scheduling intent.
            </p>
          </div>
        )}

        {draft.handlerType === "dca" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Spend asset
              </p>
              <input
                value={draft.fromSymbol}
                onChange={(event) => {
                  const nextFromSymbol = event.currentTarget.value.slice(0, 16);
                  setDraft((current) => ({
                    ...current,
                    fromSymbol: nextFromSymbol,
                  }));
                }}
                className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
              />
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Buy asset
              </p>
              <input
                value={draft.toSymbol}
                onChange={(event) => {
                  const nextToSymbol = event.currentTarget.value.slice(0, 16);
                  setDraft((current) => ({
                    ...current,
                    toSymbol: nextToSymbol,
                  }));
                }}
                placeholder="FUSD"
                className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
              />
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Amount
              </p>
              <input
                value={draft.amount}
                onChange={(event) => {
                  const nextAmount = event.currentTarget.value.slice(0, 32);
                  setDraft((current) => ({
                    ...current,
                    amount: nextAmount,
                  }));
                }}
                placeholder="25"
                className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
              />
            </div>
          </div>
        ) : null}

        {draft.handlerType === "rebalance" ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Target allocations
            </p>
            <textarea
              value={draft.targetAllocationsText}
              onChange={(event) => {
                const nextAllocations = event.currentTarget.value.slice(0, 280);
                setDraft((current) => ({
                  ...current,
                  targetAllocationsText: nextAllocations,
                }));
              }}
              placeholder="FLOW:60, FUSD:40"
              className="min-h-24 w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
            />
          </div>
        ) : null}

        {draft.handlerType === "custom" ? (
          <div className="space-y-3 rounded-sm border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  Custom action
                </p>
                <p className="mt-1 text-[11px] text-muted leading-relaxed">
                  Pick a common Flow intent. SHADOW still sends one JSON object
                  to the backend — you only choose the action name.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-primary underline underline-offset-2 hover:text-primary/80"
                onClick={() => {
                  if (customUseAdvancedJson) {
                    if (!isSimpleCustomPayload(draft.customJson)) {
                      setSubmitError(
                        "This JSON is not a single { operation: \"…\" } object. Fix it or stay in advanced mode.",
                      );
                      return;
                    }
                    setSubmitError(null);
                    setCustomUseAdvancedJson(false);
                  } else {
                    setSubmitError(null);
                    setCustomUseAdvancedJson(true);
                  }
                }}
              >
                {customUseAdvancedJson ? "Use simple picker" : "Edit as JSON"}
              </button>
            </div>

            {!customUseAdvancedJson ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label
                    htmlFor="flow-custom-preset"
                    className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
                  >
                    Action
                  </label>
                  <select
                    id="flow-custom-preset"
                    value={parseCustomSimpleSelection(draft.customJson).preset}
                    onChange={(event) => {
                      const v = event.currentTarget.value;
                      setDraft((current) => {
                        if (v === "other") {
                          let op = "custom";
                          try {
                            const parsed = JSON.parse(
                              current.customJson,
                            ) as { operation?: string };
                            if (
                              typeof parsed.operation === "string" &&
                              !CUSTOM_PRESET_VALUES.has(parsed.operation)
                            ) {
                              op = parsed.operation;
                            }
                          } catch {
                            /* keep default */
                          }
                          return {
                            ...current,
                            customJson: JSON.stringify({ operation: op }),
                          };
                        }
                        return {
                          ...current,
                          customJson: JSON.stringify({ operation: v }),
                        };
                      });
                    }}
                    className="flex h-10 w-full rounded-sm border border-border bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {CUSTOM_OPERATION_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                    <option value="other">Other…</option>
                  </select>
                </div>
                {parseCustomSimpleSelection(draft.customJson).preset ===
                "other" ? (
                  <div className="space-y-2">
                    <label
                      htmlFor="flow-custom-other-op"
                      className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
                    >
                      Operation name
                    </label>
                    <input
                      id="flow-custom-other-op"
                      value={
                        parseCustomSimpleSelection(draft.customJson)
                          .otherOperation
                      }
                      onChange={(event) => {
                        const text = event.currentTarget.value.slice(0, 64);
                        setDraft((current) => ({
                          ...current,
                          customJson: JSON.stringify({
                            operation: text.trim() || "custom",
                          }),
                        }));
                      }}
                      placeholder="e.g. claim_rewards"
                      className="w-full rounded-sm border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground outline-none"
                    />
                    <p className="text-[10px] text-muted">
                      Use lowercase words with underscores (same style as agent
                      tools). Advanced users can switch to JSON for richer
                      payloads.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  Advanced JSON
                </p>
                <textarea
                  value={draft.customJson}
                  onChange={(event) => {
                    const nextCustomJson = event.currentTarget.value.slice(
                      0,
                      512,
                    );
                    setDraft((current) => ({
                      ...current,
                      customJson: nextCustomJson,
                    }));
                  }}
                  placeholder='{"operation":"claim_rewards"}'
                  className="min-h-28 w-full rounded-sm border border-border bg-secondary px-3 py-2 font-mono text-xs text-foreground outline-none"
                />
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-sm text-xs uppercase tracking-[0.16em]"
            disabled={!strategyBuilderEnabled || busy !== null}
            onClick={() => void estimate()}
          >
            {busy === "fee" ? "Estimating…" : "Estimate fee"}
          </Button>
          <Button
            type="button"
            className="h-9 rounded-sm text-xs uppercase tracking-[0.16em]"
            disabled={!strategyBuilderEnabled || busy !== null || !cadenceReady}
            onClick={() => void submitSchedule()}
          >
            {busy === "create" ? "Submitting…" : "Create Flow schedule"}
          </Button>
        </div>

        {feeText ? (
          <p className="rounded-sm border border-border bg-background/70 px-3 py-2 text-[11px] text-foreground">
            {feeText}
          </p>
        ) : null}

        {!cadenceReady ? (
          <p className="rounded-sm border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
            Add your Cadence account in the Setup tab first. Manual Flow
            schedules need that account to sign and log on-chain intents.
          </p>
        ) : null}

        {!validation.ok ? (
          <div className="rounded-sm border border-border bg-background/60 px-3 py-2 text-[11px] text-muted">
            {validation.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        {submitError ? (
          <p className="rounded-sm border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
            {submitError}
          </p>
        ) : null}

        {submitMessage ? (
          <p className="rounded-sm border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">
            {submitMessage}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-sm border border-border bg-secondary/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <ListTodo className="size-4 text-primary" />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
                Manage schedules
              </p>
              <p className="text-xs text-muted">
                Local records stored in SQLite and synced against Flow tx status.
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-sm text-[10px] uppercase tracking-wider"
              disabled={!strategyBuilderEnabled || busy !== null}
              onClick={() => void load()}
            >
              <RefreshCcw className="mr-1.5 size-3" />
              {busy === "list" ? "Refreshing…" : "Refresh list"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-sm text-[10px] uppercase tracking-wider"
              disabled={!strategyBuilderEnabled || busy !== null}
              onClick={() => void sync()}
            >
              <Clock3 className="mr-1.5 size-3" />
              {busy === "sync" ? "Syncing…" : "Sync status"}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-sm border border-border bg-background/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Total records
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">{rows.length}</p>
          </div>
          <div className="rounded-sm border border-border bg-background/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Submitted
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">{totalSubmitted}</p>
          </div>
          <div className="rounded-sm border border-border bg-background/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Sealed
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">{totalSealed}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border bg-background/60 p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              No Flow schedules yet
            </p>
            <p className="mt-2 text-xs text-muted">
              Create one above, or let the agent / automation engine submit the
              first Flow schedule for this account.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const meta = parseFlowScheduledMetadata(row.metadataJson);
              const isCancelling = busy === `cancel:${row.id}`;
              return (
                <div
                  key={row.id}
                  className="rounded-sm border border-border bg-background/60 p-3"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {scheduleSummaryForRow(row)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {scheduleLabelForRow(row)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wider",
                        statusTone(row.status),
                      )}
                    >
                      {row.status}
                    </span>
                    <span className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted">
                      {handlerLabel(row.handlerType)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-[11px] text-muted md:grid-cols-2">
                    <p>
                      Created:{" "}
                      <span className="text-foreground">
                        {formatUnixTime(row.createdAt)}
                      </span>
                    </p>
                    <p>
                      Executed:{" "}
                      <span className="text-foreground">
                        {formatUnixTime(row.executedAt)}
                      </span>
                    </p>
                    <p className="md:col-span-2">
                      Tx id:{" "}
                      <span className="font-mono text-foreground break-all">
                        {row.submittedTxId || "—"}
                      </span>
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-sm text-[10px] uppercase tracking-wider"
                      disabled={!strategyBuilderEnabled || busy !== null}
                      onClick={() => void load()}
                    >
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-7 rounded-sm text-[10px] uppercase tracking-wider"
                      disabled={
                        !strategyBuilderEnabled ||
                        row.submittedTxId.trim() === "" ||
                        isCancelling
                      }
                      onClick={() => void cancelRow(row)}
                    >
                      <Trash2 className="mr-1.5 size-3" />
                      {isCancelling ? "Cancelling…" : "Cancel"}
                    </Button>
                  </div>

                  <details className="mt-3 rounded-sm border border-border bg-secondary/40 p-2">
                    <summary className="cursor-pointer text-[11px] text-muted">
                      Show stored intent details
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] text-muted">
                      {JSON.stringify(meta, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-sm border border-primary/15 bg-primary/5 p-4 text-xs text-muted">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary" />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
            What gets created
          </p>
        </div>
        <p className="mt-2 leading-relaxed">
          SHADOW currently logs Flow scheduling intents on-chain and tracks them
          locally in SQLite. That gives you a manual path in the popup, while
          agents and automation can submit the same intent records through the
          backend. Full autonomous handler execution still depends on the
          account-level Flow scheduler resources deployed on your side.
        </p>
      </div>
    </div>
  );
}
