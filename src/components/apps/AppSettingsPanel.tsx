import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  HardDrive,
  Key,
  Link2,
  Link2Off,
  Settings2,
  ShieldCheck,
  Waves,
  Zap,
} from "lucide-react";
import { useUiStore } from "@/store/useUiStore";
import { useWalletStore } from "@/store/useWalletStore";
import type { ShadowApp } from "@/types/apps";
import {
  fetchFlowAccountStatusPreview,
  fetchLitWalletStatusPreview,
  getVincentConsentStatus,
  getVincentConsentUrl,
  mintLitPkp,
  parseFlowConfig,
  parseFilecoinBackupMetadata,
  parseFilecoinConfig,
  parseLitConfig,
  protocolOptions,
  revokeVincentConsent,
  setVincentDelegateeKey,
  submitVincentJwt,
  type FlowIntegrationConfig,
  type FilecoinIntegrationConfig,
  type LitIntegrationConfig,
  type VincentConsentStatus,
} from "@/lib/apps";
import {
  useAppBackupsQuery,
  useAppConfigQuery,
  useAppsMutations,
  useAppsRuntimeHealthQuery,
  useFilecoinBackupNowMutation,
  useFilecoinCostQuoteQuery,
  useFilecoinDatasetsQuery,
  useFilecoinRestoreByCidMutation,
  useSetAppConfigMutation,
} from "@/hooks/useApps";
import { FlowSchedulePanel } from "@/components/strategy/FlowSchedulePanel";
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

  // Vincent consent state
  const [vincentConsent, setVincentConsent] = useState<VincentConsentStatus | null>(null);
  const [vincentLoading, setVincentLoading] = useState(false);
  const [vincentJwtInput, setVincentJwtInput] = useState("");
  const [vincentJwtError, setVincentJwtError] = useState<string | null>(null);
  const [showJwtInput, setShowJwtInput] = useState(false);
  const [delegateeKeyInput, setDelegateeKeyInput] = useState("");
  const [showDelegateeKeyInput, setShowDelegateeKeyInput] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const loadVincentConsent = useCallback(async () => {
    if (!panelOpen) return;
    try {
      const status = await getVincentConsentStatus();
      setVincentConsent(status);
    } catch {
      // non-fatal
    }
  }, [panelOpen]);

  useEffect(() => {
    void loadVincentConsent();
  }, [loadVincentConsent]);

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
          title: "Agent Wallet Created",
          description: `PKP address: ${address.slice(0, 10)}…${address.slice(-6)}`,
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

  const handleOpenConsentPage = async () => {
    setVincentLoading(true);
    try {
      const { url } = await getVincentConsentUrl();
      await (window as unknown as { __TAURI__?: unknown }).__TAURI__
        ? import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url))
        : window.open(url, "_blank");
      setShowJwtInput(true);
    } catch {
      setShowJwtInput(true); // Fallback: just show input
    } finally {
      setVincentLoading(false);
    }
  };

  const handleSubmitJwt = async () => {
    const jwt = vincentJwtInput.trim();
    if (!jwt) return;
    setVincentLoading(true);
    setVincentJwtError(null);
    try {
      await submitVincentJwt(jwt);
      await loadVincentConsent();
      setShowJwtInput(false);
      setVincentJwtInput("");
      addNotification({
        title: "Vincent Wallet Authorized",
        description: "Vincent consent granted. Agent can now use delegated abilities.",
        type: "success",
        createdAtLabel: "Just now",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "JWT verification failed.";
      setVincentJwtError(msg);
    } finally {
      setVincentLoading(false);
    }
  };

  const handleRevokeConsent = async () => {
    if (!window.confirm("Revoke Vincent consent? The agent will no longer be able to execute abilities on your behalf.")) return;
    try {
      await revokeVincentConsent();
      setVincentConsent(null);
      addNotification({
        title: "Vincent Access Revoked",
        description: "Consent revoked. Re-authorize from settings when ready.",
        type: "success",
        createdAtLabel: "Just now",
      });
    } catch {
      addNotification({
        title: "Revoke Failed",
        description: "Could not revoke consent. Try again.",
        type: "warning",
        createdAtLabel: "Just now",
      });
    }
  };

  const handleSaveDelegateeKey = async () => {
    const key = delegateeKeyInput.trim();
    if (!key) return;
    setSavingKey(true);
    try {
      await setVincentDelegateeKey(key);
      setDelegateeKeyInput("");
      setShowDelegateeKeyInput(false);
      addNotification({
        title: "Delegatee Key Saved",
        description: "Stored in OS keychain. Vincent can now execute on-chain abilities.",
        type: "success",
        createdAtLabel: "Just now",
      });
    } catch {
      addNotification({
        title: "Key Save Failed",
        description: "Could not store delegatee key.",
        type: "warning",
        createdAtLabel: "Just now",
      });
    } finally {
      setSavingKey(false);
    }
  };

  const commit = async () => {
    try {
      await save.mutateAsync({ appId, config: draft });
      addNotification({
        title: "Integration Updated",
        description: "Vincent Agent Wallet settings saved.",
        type: "success",
        createdAtLabel: "Just now",
      });
    } catch {
      addNotification({
        title: "Integration Error",
        description: "Could not save settings.",
        type: "warning",
        createdAtLabel: "Just now",
      });
    }
  };

  const hasPkp = Boolean(draft.pkpEthAddress);
  const hasActiveConsent = vincentConsent?.hasConsent === true;
  const consentExpired = vincentConsent?.expired === true;

  return (
    <div className="space-y-6">
      {/* Vincent Agent Wallet Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="size-4 text-primary" />
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Vincent Agent Wallet (PKP)</p>
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
                addNotification({ title: "Address Copied", description: "PKP address copied.", type: "success", createdAtLabel: "Just now" });
              }}
            >
              {draft.pkpEthAddress}
            </button>
            <p className="text-[10px] text-muted">
              Distributed MPC wallet on Lit datil-test. Key split across 100+ TEE nodes — no single point of compromise.
            </p>
          </div>
        ) : (
          <div className="rounded-sm border border-border bg-secondary p-3 space-y-3">
            <p className="text-xs text-muted leading-relaxed">
              Create a PKP wallet for your AI agent. The wallet key is distributed across Lit&apos;s network — your existing wallet authenticates creation.
            </p>
            <Button
              type="button"
              className="w-full h-9 rounded-sm text-xs font-bold uppercase tracking-[0.14em]"
              disabled={minting}
              onClick={() => void handleMintPkp()}
            >
              {minting ? "Creating wallet…" : "Create Agent Wallet"}
            </Button>
          </div>
        )}
      </div>

      {/* Vincent Consent Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="size-4 text-primary" />
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Vincent Authorization</p>
        </div>

        {hasActiveConsent ? (
          <div className="rounded-sm border border-violet-500/20 bg-violet-500/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-violet-400" />
                <span className="text-xs text-violet-300 font-medium">Vincent Authorized</span>
              </div>
              <Badge variant="outline" className="text-[9px] border-violet-500/40 text-violet-400">Active</Badge>
            </div>
            {vincentConsent?.pkpAddress && (
              <p className="font-mono text-[10px] text-muted truncate">
                {vincentConsent.pkpAddress}
              </p>
            )}
            {vincentConsent && vincentConsent.grantedAbilities.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Granted Abilities</p>
                <div className="flex flex-wrap gap-1">
                  {vincentConsent.grantedAbilities.map((ab) => (
                    <Badge key={ab} variant="outline" className="text-[9px] border-violet-500/30 text-violet-300 font-mono">
                      {ab}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {vincentConsent?.expiresAt && (
              <p className="text-[10px] text-muted">
                Expires: {new Date(vincentConsent.expiresAt * 1000).toLocaleDateString()}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-7 text-[10px] uppercase tracking-wider text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={() => void handleRevokeConsent()}
            >
              <Link2Off className="size-3 mr-1.5" />
              Revoke Access
            </Button>
          </div>
        ) : (
          <div className="rounded-sm border border-border bg-secondary p-3 space-y-3">
            {consentExpired && (
              <div className="rounded-sm border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-400">
                Vincent consent has expired. Please re-authorize.
              </div>
            )}
            <p className="text-xs text-muted leading-relaxed">
              Authorize SHADOW to execute DeFi abilities on your behalf using Vincent&apos;s delegated signing. This opens the Vincent consent page in your browser.
            </p>

            {!showJwtInput ? (
              <Button
                type="button"
                className="w-full h-9 rounded-sm text-xs font-bold uppercase tracking-[0.14em]"
                disabled={vincentLoading}
                onClick={() => void handleOpenConsentPage()}
              >
                <ExternalLink className="size-3.5 mr-1.5" />
                {vincentLoading ? "Opening…" : "Authorize Vincent Wallet"}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-muted">
                  After authorizing on heyvincent.ai, paste your JWT token below:
                </p>
                <Input
                  placeholder="Paste Vincent JWT token here…"
                  value={vincentJwtInput}
                  onChange={(e) => { setVincentJwtInput(e.target.value); setVincentJwtError(null); }}
                  className="h-8 text-xs font-mono"
                />
                {vincentJwtError && (
                  <p className="text-[10px] text-red-400">{vincentJwtError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1 h-8 text-xs"
                    disabled={vincentLoading || !vincentJwtInput.trim()}
                    onClick={() => void handleSubmitJwt()}
                  >
                    {vincentLoading ? "Verifying…" : "Submit JWT"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => { setShowJwtInput(false); setVincentJwtInput(""); setVincentJwtError(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!showJwtInput && (
              <button
                type="button"
                className="w-full text-[10px] text-muted hover:text-foreground transition-colors underline underline-offset-2"
                onClick={() => setShowJwtInput(true)}
              >
                Already have a JWT? Paste it here
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delegatee Key Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Key className="size-4 text-primary" />
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Delegatee Key (OS Keychain)</p>
        </div>
        <p className="text-xs text-muted leading-relaxed mb-3">
          The delegatee wallet key signs Vincent ability execution requests. Stored in your OS keychain — never exposed to the frontend.
        </p>

        {!showDelegateeKeyInput ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-8 text-[10px] uppercase tracking-wider"
            onClick={() => setShowDelegateeKeyInput(true)}
          >
            <Key className="size-3 mr-1.5" />
            Set Delegatee Key
          </Button>
        ) : (
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="0x… private key for delegatee wallet"
              value={delegateeKeyInput}
              onChange={(e) => setDelegateeKeyInput(e.target.value)}
              className="h-8 text-xs font-mono"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1 h-8 text-xs"
                disabled={savingKey || !delegateeKeyInput.trim()}
                onClick={() => void handleSaveDelegateeKey()}
              >
                {savingKey ? "Saving…" : "Save to Keychain"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => { setShowDelegateeKeyInput(false); setDelegateeKeyInput(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Policy Guardrails Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="size-4 text-primary" />
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Local Policy Guardrails</p>
        </div>
        <p className="text-xs text-muted leading-relaxed mb-4">
          {hasActiveConsent
            ? "Vincent on-chain policies are active. Local guardrails serve as an additional pre-flight check."
            : "Enforced locally before every transaction. Enable Vincent for additional on-chain policy enforcement."}
        </p>
        {isLoading ? (
          <p className="text-xs font-mono text-muted">Loading configuration…</p>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-foreground">Daily notional limit (USD)</span>
                <span className="text-sm font-mono text-primary tabular-nums">${draft.dailySpendLimitUsd}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={draft.dailySpendLimitUsd}
                onChange={(e) => setDraft((d) => ({ ...d, dailySpendLimitUsd: Number(e.target.value) }))}
                className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted font-mono opacity-60">
                <span>$0</span><span>$5000</span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-foreground">Per-trade limit (USD)</span>
                <span className="text-sm font-mono text-primary tabular-nums">${draft.perTradeLimitUsd}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={25}
                value={draft.perTradeLimitUsd}
                onChange={(e) => setDraft((d) => ({ ...d, perTradeLimitUsd: Number(e.target.value) }))}
                className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-foreground">Approval threshold (USD)</span>
                <span className="text-sm font-mono text-primary tabular-nums">${draft.approvalThresholdUsd}</span>
              </div>
              <input
                type="range"
                min={0}
                max={50000}
                step={100}
                value={draft.approvalThresholdUsd}
                onChange={(e) => setDraft((d) => ({ ...d, approvalThresholdUsd: Number(e.target.value) }))}
                className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
            </div>

            <div className="mt-6 space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Allowed protocols</p>
              <div className="grid gap-2">
                {protocolOptions().map((p) => {
                  const on = draft.allowedProtocols.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-sm border border-border bg-secondary p-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("size-2 rounded-full", on ? "bg-emerald-500" : "bg-muted")} />
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
                    addNotification({ title: "Integration Error", description: "Could not load adapter status.", type: "warning", createdAtLabel: "Just now" });
                  }
                }}
              >
                Load adapter status
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
        Save Vincent Settings
      </Button>
    </div>
  );
}

type FlowTab = "config" | "schedule";

function FlowSettings({ appId, panelOpen }: { appId: string; panelOpen: boolean }) {
  const { data: raw, isLoading } = useAppConfigQuery(appId, panelOpen);
  const save = useSetAppConfigMutation();
  const addNotification = useUiStore((s) => s.addNotification);
  const addresses = useWalletStore((s) => s.addresses);
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const [activeTab, setActiveTab] = useState<FlowTab>("config");
  const [draft, setDraft] = useState<FlowIntegrationConfig>(() => parseFlowConfig({}));
  const [flowPreview, setFlowPreview] = useState<string | null>(null);
  const suggestedLinkedEvmRef = useRef(false);

  const evmWalletChoices = useMemo(
    () => addresses.filter((a) => a.startsWith("0x") && a.length === 42),
    [addresses],
  );

  useEffect(() => {
    if (raw !== undefined) {
      setDraft(parseFlowConfig(raw));
    }
  }, [raw]);

  useEffect(() => {
    if (!panelOpen) {
      suggestedLinkedEvmRef.current = false;
      return;
    }
    if (suggestedLinkedEvmRef.current || isLoading || raw === undefined) return;
    setDraft((d) => {
      if (d.linkedEvmAddress.trim()) {
        suggestedLinkedEvmRef.current = true;
        return d;
      }
      const pick =
        (activeAddress?.startsWith("0x") && activeAddress.length === 42 ? activeAddress : null) ??
        evmWalletChoices[0] ??
        "";
      suggestedLinkedEvmRef.current = true;
      if (!pick) return d;
      return { ...d, linkedEvmAddress: pick };
    });
  }, [panelOpen, raw, isLoading, activeAddress, evmWalletChoices]);

  const commit = async () => {
    try {
      await save.mutateAsync({
        appId,
        config: {
          network: draft.network,
          linkedEvmAddress: draft.linkedEvmAddress.trim(),
          cadenceAddress: draft.cadenceAddress.trim(),
        },
      });
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
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-sm border border-border bg-secondary p-1">
        <button
          type="button"
          onClick={() => setActiveTab("config")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
            activeTab === "config"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          <Settings2 className="size-3" />
          Config
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
            activeTab === "schedule"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          <CalendarClock className="size-3" />
          Scheduled Txns
        </button>
      </div>

      {activeTab === "schedule" && <FlowSchedulePanel />}

      {activeTab === "config" && <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Waves className="size-4 text-primary" />
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Flow</p>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        <span className="text-foreground/90">Flow EVM</span> balances use your SHADOW{" "}
        <span className="font-mono">0x</span> wallets in Portfolio.{" "}
        <span className="text-foreground/90">Cadence</span> FLOW and Cadence tooling need your
        separate Cadence account address (16 hex), configured below.
      </p>
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
            <label htmlFor="flow-linked-evm" className="text-[10px] font-mono uppercase text-muted">
              Flow EVM wallet in SHADOW
            </label>
            {evmWalletChoices.length > 0 ||
            (draft.linkedEvmAddress.trim() &&
              draft.linkedEvmAddress.startsWith("0x") &&
              draft.linkedEvmAddress.length === 42) ? (
              <select
                id="flow-linked-evm"
                value={
                  draft.linkedEvmAddress &&
                  (evmWalletChoices.includes(draft.linkedEvmAddress) ||
                    (draft.linkedEvmAddress.startsWith("0x") &&
                      draft.linkedEvmAddress.length === 42))
                    ? draft.linkedEvmAddress
                    : ""
                }
                onChange={(e) =>
                  setDraft((d) => ({ ...d, linkedEvmAddress: e.target.value.slice(0, 42) }))
                }
                className="flex h-9 w-full rounded-sm border border-border bg-secondary px-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="">Select wallet…</option>
                {draft.linkedEvmAddress.trim() &&
                  draft.linkedEvmAddress.startsWith("0x") &&
                  draft.linkedEvmAddress.length === 42 &&
                  !evmWalletChoices.includes(draft.linkedEvmAddress) && (
                    <option value={draft.linkedEvmAddress}>
                      {draft.linkedEvmAddress.slice(0, 6)}…{draft.linkedEvmAddress.slice(-4)}{" "}
                      (saved)
                    </option>
                  )}
                {evmWalletChoices.map((addr) => (
                  <option key={addr} value={addr}>
                    {addr.slice(0, 6)}…{addr.slice(-4)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted font-mono">
                Add a <span className="text-foreground/80">0x</span> wallet in SHADOW to link Flow
                EVM activity.
              </p>
            )}
            <p className="text-[10px] text-muted leading-snug">
              This is the EVM address that holds Flow EVM / testnet tokens in Portfolio—not your
              Cadence account.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="flow-cadence" className="text-[10px] font-mono uppercase text-muted">
              Cadence account address
            </label>
            <Input
              id="flow-cadence"
              value={draft.cadenceAddress}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cadenceAddress: e.target.value.slice(0, 66) }))
              }
              placeholder="16 hex characters (optional 0x)"
              className="rounded-sm bg-secondary border-border font-mono text-xs"
            />
            <p className="text-[10px] text-muted leading-snug">
              Required for <span className="text-foreground/80">Flow</span> /{" "}
              <span className="text-foreground/80">Flow Testnet (Cadence)</span> in Portfolio when
              you only use an EVM wallet in SHADOW.
            </p>
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
      </div>}
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

function formatBackupBytes(n: number | null): string {
  if (n == null || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function filecoinStatusBadgeClass(status: string): string {
  if (status === "complete") return "border-emerald-500/40 text-emerald-400";
  if (status === "partial") return "border-amber-500/40 text-amber-400";
  return "border-red-500/40 text-red-400";
}

function FilecoinSettings({ appId, panelOpen }: { appId: string; panelOpen: boolean }) {
  const { data: raw, isLoading } = useAppConfigQuery(appId, panelOpen);
  const backups = useAppBackupsQuery(panelOpen, true);
  const save = useSetAppConfigMutation();
  const backupNow = useFilecoinBackupNowMutation();
  const restoreByCid = useFilecoinRestoreByCidMutation();
  const addNotification = useUiStore((s) => s.addNotification);
  const [draft, setDraft] = useState<FilecoinIntegrationConfig>(() => parseFilecoinConfig({}));

  const estimateQuoteSize = useMemo(() => {
    const first = backups.data?.[0]?.sizeBytes;
    return typeof first === "number" && first >= 127 ? first : 2048;
  }, [backups.data]);

  const quoteQ = useFilecoinCostQuoteQuery(estimateQuoteSize, panelOpen && !isLoading);
  const datasetsQ = useFilecoinDatasetsQuery(panelOpen && !isLoading);

  const totalBackupBytes = useMemo(() => {
    const list = backups.data ?? [];
    return list.reduce((acc, b) => acc + (typeof b.sizeBytes === "number" ? b.sizeBytes : 0), 0);
  }, [backups.data]);

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
        Synapse signing uses the{" "}
        <span className="text-foreground/80">unlocked SHADOW wallet</span> (same key as transfers on
        Filecoin Calibration)—unlock before backup, restore, quotes, or dataset listing.
      </p>

      <div className="space-y-3 rounded-sm border border-border bg-secondary/40 p-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Storage overview</p>
        <div className="grid gap-2 text-[10px] font-mono text-muted sm:grid-cols-2">
          <div>
            Backups: <span className="text-foreground">{backups.data?.length ?? 0}</span>
          </div>
          <div>
            Total size:{" "}
            <span className="text-foreground">{formatBackupBytes(totalBackupBytes || null)}</span>
          </div>
          <div>
            Active datasets:{" "}
            <span className="text-foreground">
              {datasetsQ.isLoading
                ? "…"
                : Array.isArray(datasetsQ.data?.dataSets)
                  ? datasetsQ.data.dataSets.length
                  : "—"}
            </span>
          </div>
          <div>
            Quote ({estimateQuoteSize} B):{" "}
            <span className="text-foreground">
              {quoteQ.isLoading
                ? "…"
                : quoteQ.data
                  ? `${quoteQ.data.ratePerMonthUsdfc} USDFC/mo · dep ${quoteQ.data.depositNeededUsdfc}`
                  : "—"}
            </span>
          </div>
        </div>
        {backups.data && backups.data.length > 0 ? (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-[9px]", filecoinStatusBadgeClass(backups.data[0].status))}
            >
              Latest: {backups.data[0].status}
            </Badge>
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full text-[10px] font-mono uppercase tracking-wider"
          disabled={backupNow.isPending || isLoading}
          onClick={() => {
            void backupNow.mutateAsync().then(
              () => {
                addNotification({
                  title: "Backup queued",
                  description: "Filecoin snapshot uploaded or recorded.",
                  type: "success",
                  createdAtLabel: "Just now",
                });
              },
              () => {
                addNotification({
                  title: "Backup failed",
                  description: "Could not complete Filecoin backup.",
                  type: "warning",
                  createdAtLabel: "Just now",
                });
              },
            );
          }}
        >
          {backupNow.isPending ? "Backing up…" : "Backup now"}
        </Button>
      </div>

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
                {draft.policy.costLimit.toFixed(2)} USDFC
              </span>
            </div>
            <input
              type="range"
              min={0.01}
              max={25}
              step={0.01}
              value={draft.policy.costLimit}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  policy: { ...d.policy, costLimit: Number(e.target.value) },
                }))
              }
              className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
            />
            <p className="text-[10px] text-muted leading-snug">
              Synapse often quotes ~1–3+ USDFC deposit for small snapshots; set this above the quote
              or backup will be rejected (check the error message for the exact amount).
            </p>
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
                ["transactionHistory", "Transaction history (SQLite)"],
                ["portfolioSnapshots", "Portfolio snapshots (history)"],
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
            {(backups.data ?? []).map((b) => {
              const rowMeta = parseFilecoinBackupMetadata(b.metadataJson);
              const copiesLabel =
                typeof rowMeta.committedCopies === "number"
                  ? `${rowMeta.committedCopies}${
                      typeof rowMeta.requestedCopies === "number"
                        ? `/${rowMeta.requestedCopies}`
                        : ""
                    } copies`
                  : null;
              return (
                <li
                  key={b.id}
                  className="rounded-sm border border-border bg-secondary px-3 py-2 text-[11px] font-mono text-muted"
                >
                  <div className="flex justify-between gap-2 text-foreground">
                    <span className="truncate" title={b.cid}>
                      {b.cid}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[9px]", filecoinStatusBadgeClass(b.status))}
                    >
                      {b.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] opacity-80">
                    <span>
                      {formatBackupTime(b.createdAt)} · v{b.encryptionVersion}
                    </span>
                    <span>· {formatBackupBytes(b.sizeBytes)}</span>
                    {copiesLabel ? <span>· {copiesLabel}</span> : null}
                    {rowMeta.storageRatePerMonthUsdfc ? (
                      <span>· {rowMeta.storageRatePerMonthUsdfc} USDFC/mo</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[9px] font-mono uppercase"
                      onClick={() => {
                        void navigator.clipboard.writeText(b.cid).then(
                          () => {
                            addNotification({
                              title: "Copied",
                              description: "Piece CID copied to clipboard.",
                              type: "success",
                              createdAtLabel: "Just now",
                            });
                          },
                          () => {
                            addNotification({
                              title: "Copy failed",
                              description: "Clipboard unavailable.",
                              type: "warning",
                              createdAtLabel: "Just now",
                            });
                          },
                        );
                      }}
                    >
                      <Copy className="size-3 mr-1" />
                      Copy CID
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[9px] font-mono uppercase"
                      disabled={restoreByCid.isPending}
                      onClick={() => {
                        void restoreByCid.mutateAsync(b.cid).then(
                          (ok) => {
                            addNotification({
                              title: ok ? "Restore applied" : "Nothing to restore",
                              description: ok
                                ? "Snapshot merged into local state."
                                : "No matching data in snapshot.",
                              type: ok ? "success" : "warning",
                              createdAtLabel: "Just now",
                            });
                          },
                          () => {
                            addNotification({
                              title: "Restore failed",
                              description: "Could not download or apply snapshot.",
                              type: "warning",
                              createdAtLabel: "Just now",
                            });
                          },
                        );
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                </li>
              );
            })}
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
