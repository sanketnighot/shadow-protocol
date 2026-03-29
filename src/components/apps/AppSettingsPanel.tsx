import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  HardDrive,
  ShieldCheck,
  Waves,
  Zap,
  Activity,
} from "lucide-react";
import { useUiStore } from "@/store/useUiStore";
import type { ShadowApp } from "@/types/apps";
import {
  fetchFlowAccountStatusPreview,
  fetchLitWalletStatusPreview,
  mintLitPkp,
  parseFlowConfig,
  parseFilecoinBackupMetadata,
  parseFilecoinConfig,
  parseLitConfig,
  protocolOptions,
  type FlowIntegrationConfig,
  type FilecoinIntegrationConfig,
  type LitIntegrationConfig,
} from "@/lib/apps";
import {
  useAppBackupsQuery,
  useAppConfigQuery,
  useAppsMutations,
  useAppsRuntimeHealthQuery,
  useSetAppConfigMutation,
} from "@/hooks/useApps";
import { cn } from "@/lib/utils";

type AppSettingsPanelProps = {
  app: ShadowApp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function RuntimeStrip({ app, panelOpen }: { app: ShadowApp; panelOpen: boolean }) {
  const q = useAppsRuntimeHealthQuery(panelOpen);
  const { refreshHealth } = useAppsMutations();
  const ok = q.data?.ok === true;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2">
      <Activity className="size-3.5 text-muted" />
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Apps runtime</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] font-mono",
          ok ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400",
        )}
      >
        {q.isLoading ? "Checking…" : ok ? "Healthy" : "Unavailable"}
      </Badge>
      <span className="text-[10px] text-muted font-mono">
        Integration: {app.healthStatus ?? "—"}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto h-7 text-[10px] uppercase tracking-wider"
        disabled={refreshHealth.isPending}
        onClick={() => void refreshHealth.mutateAsync()}
      >
        Sync health
      </Button>
    </div>
  );
}

function LitSettings({ appId, panelOpen }: { appId: string; panelOpen: boolean }) {
  const { data: raw, isLoading } = useAppConfigQuery(appId, panelOpen);
  const save = useSetAppConfigMutation();
  const addNotification = useUiStore((s) => s.addNotification);
  const [draft, setDraft] = useState<LitIntegrationConfig>(() => parseLitConfig({}));
  const [adapterPreview, setAdapterPreview] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);

  useEffect(() => {
    if (raw !== undefined) {
      setDraft(parseLitConfig(raw));
    }
  }, [raw]);

  const toggleProtocol = (id: string) => {
    setDraft((d) => {
      const has = d.allowedProtocols.includes(id);
      const allowedProtocols = has
        ? d.allowedProtocols.filter((p) => p !== id)
        : [...d.allowedProtocols, id];
      return { ...d, allowedProtocols };
    });
  };

  const handleMintPkp = async () => {
    setMinting(true);
    try {
      const result = (await mintLitPkp()) as Record<string, unknown>;
      const address = typeof result.pkpEthAddress === "string" ? result.pkpEthAddress : "";
      if (address) {
        setDraft((d) => ({
          ...d,
          pkpEthAddress: address,
          pkpPublicKey: typeof result.pkpPublicKey === "string" ? result.pkpPublicKey : undefined,
          pkpTokenId: typeof result.tokenId === "string" ? result.tokenId : undefined,
        }));
        addNotification({
          title: "PKP Agent Wallet Created",
          description: `Address: ${address.slice(0, 10)}…${address.slice(-6)}`,
          type: "success",
          createdAtLabel: "Just now",
        });
      }
    } catch {
      addNotification({
        title: "PKP Mint Failed",
        description: "Ensure wallet is unlocked and Lit network is reachable.",
        type: "warning",
        createdAtLabel: "Just now",
      });
    } finally {
      setMinting(false);
    }
  };

  const commit = async () => {
    try {
      await save.mutateAsync({ appId, config: draft });
      addNotification({
        title: "Integration Updated",
        description: "Lit settings saved locally.",
        type: "success",
        createdAtLabel: "Just now",
      });
    } catch {
      addNotification({
        title: "Integration Error",
        description: "Could not save Lit settings.",
        type: "warning",
        createdAtLabel: "Just now",
      });
    }
  };

  const hasPkp = Boolean(draft.pkpEthAddress);

  return (
    <div className="space-y-6">
      {/* PKP Agent Wallet Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="size-4 text-primary" />
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Agent Wallet (PKP)</p>
        </div>
        {hasPkp ? (
          <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted">PKP Address</span>
              <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">Active</Badge>
            </div>
            <button
              type="button"
              className="w-full text-left font-mono text-xs text-foreground truncate hover:text-primary transition-colors"
              onClick={() => {
                void navigator.clipboard.writeText(draft.pkpEthAddress ?? "");
                addNotification({
                  title: "Address Copied",
                  description: "PKP wallet address copied to clipboard.",
                  type: "success",
                  createdAtLabel: "Just now",
                });
              }}
            >
              {draft.pkpEthAddress}
            </button>
            <p className="text-[10px] text-muted">
              Distributed MPC wallet on Lit&apos;s datil-test network. Key is split across 100+ TEE nodes — no single point of compromise.
            </p>
          </div>
        ) : (
          <div className="rounded-sm border border-border bg-secondary p-3 space-y-3">
            <p className="text-xs text-muted leading-relaxed">
              Create a PKP wallet for your AI agent. The wallet key is distributed across Lit&apos;s decentralized network — your existing wallet authenticates the creation process.
            </p>
            <Button
              type="button"
              className="w-full h-9 rounded-sm text-xs font-bold uppercase tracking-[0.14em]"
              disabled={minting}
              onClick={() => void handleMintPkp()}
            >
              {minting ? "Creating PKP wallet…" : "Create Agent Wallet"}
            </Button>
          </div>
        )}
      </div>

      {/* Guardrails Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="size-4 text-primary" />
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Policy Guardrails</p>
        </div>
        <p className="text-xs text-muted leading-relaxed mb-4">
          Enforced by Lit TEE nodes before every transaction. Policies run as Lit Actions on the decentralized network — they can&apos;t be bypassed.
        </p>
        {isLoading ? (
          <p className="text-xs font-mono text-muted">Loading configuration…</p>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-foreground">Daily notional limit (USD)</span>
                <span className="text-sm font-mono text-primary tabular-nums">
                  ${draft.dailySpendLimitUsd}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={draft.dailySpendLimitUsd}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, dailySpendLimitUsd: Number(e.target.value) }))
                }
                className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted font-mono opacity-60">
                <span>$0</span>
                <span>$5000</span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-foreground">Per-trade limit (USD)</span>
                <span className="text-sm font-mono text-primary tabular-nums">
                  ${draft.perTradeLimitUsd}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={25}
                value={draft.perTradeLimitUsd}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, perTradeLimitUsd: Number(e.target.value) }))
                }
                className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-foreground">Approval threshold (USD)</span>
                <span className="text-sm font-mono text-primary tabular-nums">
                  ${draft.approvalThresholdUsd}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50000}
                step={100}
                value={draft.approvalThresholdUsd}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, approvalThresholdUsd: Number(e.target.value) }))
                }
                className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
            </div>

            <div className="mt-6 space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Allowed protocols</p>
              <div className="grid gap-2">
                {protocolOptions().map((p) => {
                  const on = draft.allowedProtocols.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-sm border border-border bg-secondary p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "size-2 rounded-full",
                            on ? "bg-emerald-500" : "bg-muted",
                          )}
                        />
                        <span className="text-sm font-medium">{p.label}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] uppercase tracking-wider"
                        onClick={() => toggleProtocol(p.id)}
                      >
                        {on ? "Permitted" : "Allow"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-[10px] uppercase tracking-wider"
                onClick={async () => {
                  try {
                    const j = await fetchLitWalletStatusPreview();
                    setAdapterPreview(JSON.stringify(j, null, 2));
                  } catch {
                    setAdapterPreview(null);
                    addNotification({
                      title: "Integration Error",
                      description: "Could not load Lit adapter status.",
                      type: "warning",
                      createdAtLabel: "Just now",
                    });
                  }
                }}
              >
                Load adapter status (saved config)
              </Button>
              {adapterPreview && (
                <pre className="text-[10px] font-mono text-muted whitespace-pre-wrap break-all max-h-32 overflow-y-auto rounded-sm border border-border bg-secondary p-2">
                  {adapterPreview}
                </pre>
              )}
            </div>
          </>
        )}
      </div>

      <Button
        className="w-full h-11 rounded-sm text-xs font-bold uppercase tracking-[0.18em]"
        disabled={save.isPending || isLoading}
        onClick={() => void commit()}
      >
        Save Lit settings
      </Button>
    </div>
  );
}

function FlowSettings({ appId, panelOpen }: { appId: string; panelOpen: boolean }) {
  const { data: raw, isLoading } = useAppConfigQuery(appId, panelOpen);
  const save = useSetAppConfigMutation();
  const addNotification = useUiStore((s) => s.addNotification);
  const [draft, setDraft] = useState<FlowIntegrationConfig>(() => parseFlowConfig({}));
  const [flowPreview, setFlowPreview] = useState<string | null>(null);

  useEffect(() => {
    if (raw !== undefined) {
      setDraft(parseFlowConfig(raw));
    }
  }, [raw]);

  const commit = async () => {
    try {
      await save.mutateAsync({ appId, config: draft });
      addNotification({
        title: "Integration Updated",
        description: "Flow settings saved locally.",
        type: "success",
        createdAtLabel: "Just now",
      });
    } catch {
      addNotification({
        title: "Integration Error",
        description: "Could not save Flow settings.",
        type: "warning",
        createdAtLabel: "Just now",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Waves className="size-4 text-primary" />
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Flow</p>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        Cadence transactions and sponsorship are prepared via the apps runtime. Recurring jobs are
        owned by SHADOW&apos;s scheduler, not native Flow recurrence.
      </p>
      {isLoading ? (
        <p className="text-xs font-mono text-muted">Loading configuration…</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="flow-net" className="text-[10px] font-mono uppercase text-muted">
              Network
            </label>
            <select
              id="flow-net"
              value={draft.network}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  network: e.target.value === "mainnet" ? "mainnet" : "testnet",
                }))
              }
              className="flex h-9 w-full rounded-sm border border-border bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="flow-hint" className="text-[10px] font-mono uppercase text-muted">
              Account hint (optional)
            </label>
            <Input
              id="flow-hint"
              value={draft.accountHint}
              onChange={(e) => setDraft((d) => ({ ...d, accountHint: e.target.value.slice(0, 256) }))}
              placeholder="0x… or Flow address"
              className="rounded-sm bg-secondary border-border font-mono text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-8 text-[10px] uppercase tracking-wider"
            onClick={async () => {
              try {
                const j = await fetchFlowAccountStatusPreview();
                setFlowPreview(JSON.stringify(j, null, 2));
              } catch {
                setFlowPreview(null);
                addNotification({
                  title: "Integration Error",
                  description: "Could not load Flow adapter status.",
                  type: "warning",
                  createdAtLabel: "Just now",
                });
              }
            }}
          >
            Load Flow adapter status
          </Button>
          {flowPreview && (
            <pre className="text-[10px] font-mono text-muted whitespace-pre-wrap break-all max-h-28 overflow-y-auto rounded-sm border border-border bg-secondary p-2">
              {flowPreview}
            </pre>
          )}
        </div>
      )}
      <Button
        className="w-full h-11 rounded-sm text-xs font-bold uppercase tracking-[0.18em]"
        disabled={save.isPending || isLoading}
        onClick={() => void commit()}
      >
        Save Flow settings
      </Button>
    </div>
  );
}

function formatBackupTime(createdAt: number): string {
  const ms = createdAt > 1e12 ? createdAt : createdAt * 1000;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

function FilecoinSettings({ appId, panelOpen }: { appId: string; panelOpen: boolean }) {
  const { data: raw, isLoading } = useAppConfigQuery(appId, panelOpen);
  const backups = useAppBackupsQuery(panelOpen, true);
  const save = useSetAppConfigMutation();
  const addNotification = useUiStore((s) => s.addNotification);
  const [draft, setDraft] = useState<FilecoinIntegrationConfig>(() => parseFilecoinConfig({}));

  useEffect(() => {
    if (raw !== undefined) {
      setDraft(parseFilecoinConfig(raw));
    }
  }, [raw]);

  const commit = async () => {
    try {
      await save.mutateAsync({ appId, config: draft });
      addNotification({
        title: "Integration Updated",
        description: "Filecoin settings saved locally.",
        type: "success",
        createdAtLabel: "Just now",
      });
    } catch {
      addNotification({
        title: "Integration Error",
        description: "Could not save Filecoin settings.",
        type: "warning",
        createdAtLabel: "Just now",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <HardDrive className="size-4 text-primary" />
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Backup</p>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        Snapshots are JSON payloads (upgrade path: keychain-sealed ciphertext). Rows below are
        recorded locally after each successful Synapse upload; pricing uses on-chain USDFC quotes.
      </p>

      {isLoading ? (
        <p className="text-xs font-mono text-muted">Loading configuration…</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Time to live (1-365 days)</span>
              <span className="text-xs font-mono text-primary tabular-nums">
                {draft.policy.ttl} days
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={365}
              step={1}
              value={draft.policy.ttl}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  policy: { ...d.policy, ttl: Number(e.target.value) },
                }))
              }
              className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
            />
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center gap-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                Max deposit cap (USDFC)
              </span>
              <span className="text-xs font-mono text-primary tabular-nums">
                {draft.policy.costLimit} USDFC
              </span>
            </div>
            <input
              type="range"
              min={0.001}
              max={0.05}
              step={0.001}
              value={draft.policy.costLimit}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  policy: { ...d.policy, costLimit: Number(e.target.value) },
                }))
              }
              className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
            />
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center gap-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Redundancy (Copies)</span>
              <span className="text-xs font-mono text-primary tabular-nums">
                {draft.policy.redundancy}x
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={draft.policy.redundancy}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  policy: { ...d.policy, redundancy: Number(e.target.value) },
                }))
              }
              className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 pb-2">
            <Checkbox
              id="fc-autoRenew"
              checked={draft.policy.autoRenew}
              onCheckedChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  policy: { ...d.policy, autoRenew: v === true },
                }))
              }
            />
            <Label htmlFor="fc-autoRenew" className="text-xs text-muted cursor-pointer">
              Auto-renew active agents
            </Label>
          </div>

          <div className="space-y-3 pt-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted">
              Backup scope
            </p>
            {(
              [
                ["agentMemory", "Agent memory + persona (soul)"],
                ["configs", "Integration configs (app_configs)"],
                ["strategies", "Strategies (active_strategies)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`fc-${key}`}
                  checked={draft.backupScope[key as keyof typeof draft.backupScope]}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      backupScope: { ...d.backupScope, [key]: v === true },
                    }))
                  }
                />
                <Label htmlFor={`fc-${key}`} className="text-xs text-muted cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-sm border border-border bg-secondary/40 p-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Latest snapshot</p>
        {backups.data && backups.data.length > 0 ? (
          (() => {
            const latest = backups.data[0];
            const meta = parseFilecoinBackupMetadata(latest.metadataJson);
            return (
              <div className="space-y-1 text-[10px] font-mono text-muted">
                <div className="truncate text-foreground" title={latest.cid}>
                  CID: {latest.cid}
                </div>
                <div>Status: {latest.status}</div>
                {latest.notes ? <div className="opacity-90">{latest.notes}</div> : null}
                {meta.storageRatePerMonthUsdfc ? (
                  <div>Quoted rate: {meta.storageRatePerMonthUsdfc} USDFC/mo</div>
                ) : null}
                {meta.depositNeededUsdfc ? (
                  <div>Deposit needed: {meta.depositNeededUsdfc} USDFC</div>
                ) : null}
                {typeof meta.committedCopies === "number" ? (
                  <div>
                    Copies: {meta.committedCopies}
                    {typeof meta.requestedCopies === "number"
                      ? ` / ${meta.requestedCopies} requested`
                      : ""}
                    {meta.uploadComplete === false ? " (partial)" : ""}
                  </div>
                ) : null}
              </div>
            );
          })()
        ) : (
          <p className="text-[10px] text-muted">No uploads yet.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Recent snapshots</p>
        {backups.isLoading ? (
          <p className="text-xs font-mono text-muted">Loading backups…</p>
        ) : backups.data && backups.data.length === 0 ? (
          <p className="text-xs text-muted">No backups recorded yet.</p>
        ) : (
          <ul className="max-h-40 space-y-2 overflow-y-auto custom-scrollbar pr-1">
            {(backups.data ?? []).map((b) => (
              <li
                key={b.id}
                className="rounded-sm border border-border bg-secondary px-3 py-2 text-[11px] font-mono text-muted"
              >
                <div className="flex justify-between gap-2 text-foreground">
                  <span className="truncate">{b.cid}</span>
                  <Badge variant="outline" className="shrink-0 text-[9px]">
                    {b.status}
                  </Badge>
                </div>
                <div className="mt-1 text-[10px] opacity-80">
                  {formatBackupTime(b.createdAt)} · v{b.encryptionVersion}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        className="w-full h-11 rounded-sm text-xs font-bold uppercase tracking-[0.18em]"
        disabled={save.isPending || isLoading}
        onClick={() => void commit()}
      >
        Save Filecoin settings
      </Button>
    </div>
  );
}

export function AppSettingsPanel({ app, open, onOpenChange }: AppSettingsPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background border-border text-foreground p-0 overflow-hidden rounded-sm">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-secondary">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-sm border border-primary/20 bg-primary/12 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div className="text-left min-w-0">
              <p className="font-mono text-[10px] tracking-[0.24em] text-muted uppercase">
                Configuration
              </p>
              <DialogTitle className="mt-0.5 text-lg font-bold tracking-tight truncate">
                {app ? `${app.name}` : "Integration"} settings
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {app && <RuntimeStrip app={app} panelOpen={open} />}

          {app?.id === "lit-protocol" && <LitSettings appId={app.id} panelOpen={open} />}
          {app?.id === "flow" && <FlowSettings appId={app.id} panelOpen={open} />}
          {app?.id === "filecoin-storage" && <FilecoinSettings appId={app.id} panelOpen={open} />}

          {app && app.id !== "lit-protocol" && app.id !== "flow" && app.id !== "filecoin-storage" && (
            <p className="text-sm text-muted">No settings surface for this integration.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
