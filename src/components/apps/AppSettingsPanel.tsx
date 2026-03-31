import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
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
  cancelVincentLoopback,
  getVincentConsentStatus,
  getVincentConsentUrl,
  mintLitPkp,
  pollVincentLoopback,
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

function AppSectionTitle({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-5 shrink-0 text-primary" />
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{children}</h3>
    </div>
  );
}

/** Human-readable USDFC for quotes and deposits (avoids long float noise in UI). */
function formatUsdfcDisplay(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(raw);
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `${n.toFixed(digits)} USDFC`;
}

function RuntimeStrip({ app, panelOpen }: { app: ShadowApp; panelOpen: boolean }) {
  const q = useAppsRuntimeHealthQuery(panelOpen);
  const { refreshHealth } = useAppsMutations();
  const ok = q.data?.ok === true;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/80 px-4 py-3.5">
      <Activity className="size-4 shrink-0 text-muted" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted">Apps runtime</span>
      <Badge
        variant="outline"
        className={cn(
          "px-2 py-0.5 text-xs font-medium",
          ok ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400",
        )}
      >
        {q.isLoading ? "Checking…" : ok ? "Healthy" : "Unavailable"}
      </Badge>
      <span className="text-sm text-muted">
        Integration: <span className="font-mono text-foreground/90">{app.healthStatus ?? "—"}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="default"
        className="ml-auto h-10 min-h-10 shrink-0 px-4 text-xs font-semibold uppercase tracking-wide"
        disabled={refreshHealth.isPending}
        onClick={() => void refreshHealth.mutateAsync()}
      >
        Sync health
      </Button>
    </div>
  );
}

/** Paste raw consent JWT or full `http://127.0.0.1:…/vincent-consent?jwt=…` from the browser bar. */
function extractVincentJwtFromPaste(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return trimmed;
    }
    const jwt = u.searchParams.get("jwt");
    if (jwt !== null && jwt.length >= 32) {
      return jwt;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
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
  const [vincentLoopbackHint, setVincentLoopbackHint] = useState<string | null>(null);
  const vincentLoopbackIntervalRef = useRef<number | null>(null);

  const clearVincentLoopbackPoll = useCallback(() => {
    if (vincentLoopbackIntervalRef.current !== null) {
      window.clearInterval(vincentLoopbackIntervalRef.current);
      vincentLoopbackIntervalRef.current = null;
    }
  }, []);

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
    return () => {
      clearVincentLoopbackPoll();
    };
  }, [clearVincentLoopbackPoll]);

  const applyVincentConsentJwt = useCallback(
    async (jwt: string) => {
      setVincentJwtError(null);
      setVincentLoading(true);
      try {
        await submitVincentJwt(jwt);
        await loadVincentConsent();
        setShowJwtInput(false);
        setVincentJwtInput("");
        setVincentLoopbackHint(null);
        clearVincentLoopbackPoll();
        void cancelVincentLoopback();
        addNotification({
          title: "Vincent Wallet Authorized",
          description: "Vincent consent granted. Agent can now use delegated abilities.",
          type: "success",
          createdAtLabel: "Just now",
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
        setVincentJwtError(msg.trim() || "JWT verification failed.");
      } finally {
        setVincentLoading(false);
      }
    },
    [loadVincentConsent, addNotification, clearVincentLoopbackPoll],
  );

  useEffect(() => {
    if (!panelOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const { jwt } = await pollVincentLoopback();
        if (cancelled || !jwt) return;
        await applyVincentConsentJwt(jwt);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panelOpen, applyVincentConsentJwt]);

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
    const vincentAppId = draft.vincentAppId?.trim() ?? "";
    if (!vincentAppId) {
      const message = "Add your Vincent App ID first, then try authorization again.";
      setVincentJwtError(message);
      addNotification({
        title: "Vincent App ID Required",
        description: message,
        type: "warning",
        createdAtLabel: "Just now",
      });
      return;
    }

    setVincentLoading(true);
    setVincentJwtError(null);
    try {
      await cancelVincentLoopback();
      clearVincentLoopbackPoll();

      const { url, redirectUri } = await getVincentConsentUrl({ appId: vincentAppId });
      setVincentLoopbackHint(redirectUri ?? null);

      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") {
        throw new Error("Vincent authorization URL is invalid.");
      }

      let opened = false;
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(parsedUrl.toString());
        opened = true;
      } catch {
        const popup = window.open(parsedUrl.toString(), "_blank", "noopener,noreferrer");
        opened = popup !== null;
      }

      if (!opened) {
        throw new Error("Could not open the Vincent authorization page automatically.");
      }
      setShowJwtInput(true);

      vincentLoopbackIntervalRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const { jwt, error } = await pollVincentLoopback();
            if (jwt) {
              await applyVincentConsentJwt(jwt);
            } else if (error) {
              clearVincentLoopbackPoll();
              setVincentJwtError(error);
              void cancelVincentLoopback();
            }
          } catch {
            // ignore transient poll errors
          }
        })();
      }, 1500);
    } catch (err) {
      setShowJwtInput(true);
      setVincentLoopbackHint(null);
      setVincentJwtError(
        err instanceof Error
          ? err.message
          : "Could not open the Vincent authorization page.",
      );
    } finally {
      setVincentLoading(false);
    }
  };

  const handleSubmitJwt = async () => {
    const jwt = extractVincentJwtFromPaste(vincentJwtInput).trim();
    if (!jwt) return;
    await applyVincentConsentJwt(jwt);
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
    <div className="space-y-10">
      {/* Vincent Agent Wallet Section */}
      <section className="space-y-4">
        <AppSectionTitle icon={Zap}>Vincent Agent Wallet (PKP)</AppSectionTitle>

        {hasPkp ? (
          <div className="rounded-md border border-emerald-500/25 bg-emerald-500/6 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">PKP address</span>
              <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-400">
                Active
              </Badge>
            </div>
            <button
              type="button"
              className="w-full break-all text-left font-mono text-sm text-foreground hover:text-primary transition-colors"
              onClick={() => {
                void navigator.clipboard.writeText(draft.pkpEthAddress ?? "");
                addNotification({ title: "Address Copied", description: "PKP address copied.", type: "success", createdAtLabel: "Just now" });
              }}
            >
              {draft.pkpEthAddress}
            </button>
            <p className="text-sm text-muted leading-relaxed">
              Distributed MPC wallet on Lit datil-test. Key split across 100+ TEE nodes — no single point of compromise.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-secondary/60 p-5 space-y-4">
            <p className="text-sm text-muted leading-relaxed">
              Create a PKP wallet for your AI agent. The wallet key is distributed across Lit&apos;s network — your existing wallet authenticates creation.
            </p>
            <Button
              type="button"
              className="w-full h-11 rounded-md text-sm font-semibold"
              disabled={minting}
              onClick={() => void handleMintPkp()}
            >
              {minting ? "Creating wallet…" : "Create Agent Wallet"}
            </Button>
          </div>
        )}
      </section>

      {/* Vincent Consent Section */}
      <section className="space-y-4">
        <AppSectionTitle icon={Link2}>Vincent Authorization</AppSectionTitle>

        {hasActiveConsent ? (
          <div className="rounded-md border border-violet-500/25 bg-violet-500/6 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-violet-400" />
                <span className="text-sm text-violet-200 font-medium">Vincent authorized</span>
              </div>
              <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-300">
                Active
              </Badge>
            </div>
            {vincentConsent?.pkpAddress && (
              <p className="font-mono text-xs text-muted break-all">
                {vincentConsent.pkpAddress}
              </p>
            )}
            {vincentConsent && vincentConsent.grantedAbilities.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Granted abilities</p>
                <div className="flex flex-wrap gap-2">
                  {vincentConsent.grantedAbilities.map((ab) => (
                    <Badge key={ab} variant="outline" className="text-xs border-violet-500/30 text-violet-200 font-mono">
                      {ab}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {vincentConsent?.expiresAt && (
              <p className="text-sm text-muted">
                Expires: {new Date(vincentConsent.expiresAt * 1000).toLocaleDateString()}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="default"
              className="w-full h-11 text-sm font-semibold text-red-400 border-red-500/35 hover:bg-red-500/10"
              onClick={() => void handleRevokeConsent()}
            >
              <Link2Off className="size-4 mr-2" />
              Revoke access
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-secondary/60 p-5 space-y-4">
            {consentExpired && (
              <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Vincent consent has expired. Please re-authorize.
              </div>
            )}
            <p className="text-sm text-muted leading-relaxed">
              Authorize SHADOW to execute DeFi abilities on your behalf using Vincent&apos;s delegated signing. This opens the Vincent consent page in your browser.
            </p>
            <div className="text-xs text-amber-200/90 leading-relaxed rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 space-y-2">
              <p>
                PKP consent on <span className="font-mono text-amber-100/95">dashboard.heyvincent.ai</span> is
                the Lit Vincent flow — see{" "}
                <a
                  className="text-amber-100 underline underline-offset-2 hover:text-amber-50"
                  href="https://docs.heyvincent.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  docs.heyvincent.ai
                </a>
                . The API overview at{" "}
                <a
                  className="text-amber-100 underline underline-offset-2 hover:text-amber-50"
                  href="https://heyvincent.ai/docs#introduction"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  heyvincent.ai/docs
                </a>{" "}
                is for the REST/MCP product (secrets, OAuth on{" "}
                <span className="font-mono text-amber-100/90">safeskills.ai</span>), not this consent page.
              </p>
              <p>
                <span className="font-mono">401 user_unauthenticated</span> on{" "}
                <span className="font-mono">authenticate</span>: Stytch has no session in this browser. Use
                the same browser SHADOW opens; go to{" "}
                <span className="font-mono text-amber-100/95">https://dashboard.heyvincent.ai</span>, finish
                sign-in from the main login (User area, not only Developer), then click{" "}
                <strong className="font-semibold text-amber-100">Authorize</strong> again. If it still fails,
                relax third-party cookie blocking for the dashboard or try another browser. Publish an{" "}
                <strong className="font-semibold text-amber-100">active app version</strong> under Developer.
                <strong className="font-semibold text-amber-100"> User → Apps</strong> may stay empty until
                consent succeeds once.
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="vincent-app-id"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Vincent App ID
              </label>
              <Input
                id="vincent-app-id"
                placeholder="Paste the Vincent app id from dashboard.heyvincent.ai"
                value={draft.vincentAppId ?? ""}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    vincentAppId: e.target.value.slice(0, 256),
                  }))
                }
                className="h-11 text-sm font-mono"
              />
              <p className="text-xs text-muted leading-relaxed">
                Save is not required before authorizing. SHADOW will use this value immediately.
              </p>
            </div>

            {!showJwtInput ? (
              <Button
                type="button"
                className="w-full h-11 rounded-md text-sm font-semibold"
                disabled={vincentLoading}
                onClick={() => void handleOpenConsentPage()}
              >
                <ExternalLink className="size-4 mr-2" />
                {vincentLoading ? "Opening…" : "Authorize Vincent Wallet"}
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted leading-relaxed">
                  After you approve in the browser, SHADOW listens on localhost for the redirect. Keep this settings
                  window open until consent finishes — closing it stops the listener and the browser may show{" "}
                  <span className="font-mono text-xs">connection refused</span>. If that happens, paste the full URL
                  from the address bar (or only the JWT) below. Add this redirect URL to your Vincent app allow-list:
                </p>
                {vincentLoopbackHint ? (
                  <p className="font-mono text-xs text-violet-200/90 break-all rounded-md border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                    {vincentLoopbackHint}
                  </p>
                ) : null}
                <p className="text-sm text-muted leading-relaxed">
                  Paste the consent JWT, or the whole <span className="font-mono text-xs">http://127.0.0.1:…?jwt=…</span>{" "}
                  line — not <span className="font-mono text-xs">session_jwt</span> from Stytch login.
                </p>
                <Input
                  placeholder="Consent JWT or full redirect URL from browser…"
                  value={vincentJwtInput}
                  onChange={(e) => { setVincentJwtInput(e.target.value); setVincentJwtError(null); }}
                  className="h-11 text-sm font-mono"
                />
                {vincentJwtError && (
                  <p className="text-sm text-red-400">{vincentJwtError}</p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="flex-1 h-11 text-sm font-semibold"
                    disabled={vincentLoading || !vincentJwtInput.trim()}
                    onClick={() => void handleSubmitJwt()}
                  >
                    {vincentLoading ? "Verifying…" : "Submit JWT"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 text-sm"
                    onClick={() => {
                      clearVincentLoopbackPoll();
                      void cancelVincentLoopback();
                      setShowJwtInput(false);
                      setVincentJwtInput("");
                      setVincentJwtError(null);
                      setVincentLoopbackHint(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!showJwtInput && (
              <button
                type="button"
                className="w-full text-sm text-muted hover:text-foreground transition-colors underline underline-offset-4"
                onClick={() => setShowJwtInput(true)}
              >
                Already have a JWT? Paste it here
              </button>
            )}
            {vincentJwtError && !showJwtInput && (
              <p className="text-sm text-red-400">{vincentJwtError}</p>
            )}
          </div>
        )}
      </section>

      {/* Delegatee Key Section */}
      <section className="space-y-4">
        <AppSectionTitle icon={Key}>Delegatee Key (OS Keychain)</AppSectionTitle>
        <p className="text-sm text-muted leading-relaxed">
          The delegatee wallet key signs Vincent ability execution requests. Stored in your OS keychain — never exposed to the frontend.
        </p>

        {!showDelegateeKeyInput ? (
          <Button
            type="button"
            variant="outline"
            size="default"
            className="w-full h-11 text-sm font-semibold"
            onClick={() => setShowDelegateeKeyInput(true)}
          >
            <Key className="size-4 mr-2" />
            Set delegatee key
          </Button>
        ) : (
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="0x… private key for delegatee wallet"
              value={delegateeKeyInput}
              onChange={(e) => setDelegateeKeyInput(e.target.value)}
              className="h-11 text-sm font-mono"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="flex-1 h-11 text-sm font-semibold"
                disabled={savingKey || !delegateeKeyInput.trim()}
                onClick={() => void handleSaveDelegateeKey()}
              >
                {savingKey ? "Saving…" : "Save to Keychain"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 text-sm"
                onClick={() => { setShowDelegateeKeyInput(false); setDelegateeKeyInput(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Policy Guardrails Section */}
      <section className="space-y-4">
        <AppSectionTitle icon={ShieldCheck}>Local Policy Guardrails</AppSectionTitle>
        <p className="text-sm text-muted leading-relaxed">
          {hasActiveConsent
            ? "Vincent on-chain policies are active. Local guardrails serve as an additional pre-flight check."
            : "Enforced locally before every transaction. Enable Vincent for additional on-chain policy enforcement."}
        </p>
        {isLoading ? (
          <p className="text-sm text-muted">Loading configuration…</p>
        ) : (
          <>
            <div className="space-y-5">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm font-medium text-foreground">Daily notional limit (USD)</span>
                <span className="text-base font-mono text-primary tabular-nums">${draft.dailySpendLimitUsd}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={draft.dailySpendLimitUsd}
                onChange={(e) => setDraft((d) => ({ ...d, dailySpendLimitUsd: Number(e.target.value) }))}
                className="h-2 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted font-mono opacity-70">
                <span>$0</span><span>$5000</span>
              </div>
            </div>

            <div className="space-y-5 pt-2">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm font-medium text-foreground">Per-trade limit (USD)</span>
                <span className="text-base font-mono text-primary tabular-nums">${draft.perTradeLimitUsd}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={25}
                value={draft.perTradeLimitUsd}
                onChange={(e) => setDraft((d) => ({ ...d, perTradeLimitUsd: Number(e.target.value) }))}
                className="h-2 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-5 pt-2">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm font-medium text-foreground">Approval threshold (USD)</span>
                <span className="text-base font-mono text-primary tabular-nums">${draft.approvalThresholdUsd}</span>
              </div>
              <input
                type="range"
                min={0}
                max={50000}
                step={100}
                value={draft.approvalThresholdUsd}
                onChange={(e) => setDraft((d) => ({ ...d, approvalThresholdUsd: Number(e.target.value) }))}
                className="h-2 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
              />
            </div>

            <div className="mt-8 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Allowed protocols</p>
              <div className="grid gap-3">
                {protocolOptions().map((p) => {
                  const on = draft.allowedProtocols.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-4 rounded-md border border-border bg-secondary/70 px-4 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("size-2.5 shrink-0 rounded-full", on ? "bg-emerald-500" : "bg-muted")} />
                        <span className="text-sm font-medium">{p.label}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="default"
                        className="h-9 shrink-0 px-4 text-xs font-semibold"
                        onClick={() => toggleProtocol(p.id)}
                      >
                        {on ? "Permitted" : "Allow"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-6 space-y-3">
              <Button
                type="button"
                variant="outline"
                size="default"
                className="w-full h-11 text-sm font-semibold"
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
                <pre className="text-xs font-mono text-muted whitespace-pre-wrap break-all max-h-48 overflow-y-auto rounded-md border border-border bg-secondary/80 p-4">
                  {adapterPreview}
                </pre>
              )}
            </div>
          </>
        )}
      </section>

      <Button
        className="w-full h-12 rounded-md text-sm font-semibold"
        disabled={save.isPending || isLoading}
        onClick={() => void commit()}
      >
        Save Vincent settings
      </Button>
    </div>
  );
}

type FlowTab = "config" | "schedule";

function isCadenceAddressInput(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  const body = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  return body.length === 16 && /^[a-fA-F0-9]+$/.test(body);
}

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
    const cadence = draft.cadenceAddress.trim();
    if (!isCadenceAddressInput(cadence)) {
      addNotification({
        title: "Invalid Cadence Address",
        description: "Use 16 hex characters with optional 0x prefix.",
        type: "warning",
        createdAtLabel: "Just now",
      });
      return;
    }
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
    <div className="space-y-8">
      {/* Tab bar */}
      <div className="flex gap-2 rounded-md border border-border bg-secondary/70 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("config")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors min-h-11",
            activeTab === "config"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          <Settings2 className="size-4 shrink-0" />
          Setup
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors min-h-11",
            activeTab === "schedule"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          <CalendarClock className="size-4 shrink-0" />
          Scheduler
        </button>
      </div>

      {activeTab === "schedule" && (
        <FlowSchedulePanel
          cadenceAddress={draft.cadenceAddress.trim()}
          linkedEvmAddress={draft.linkedEvmAddress.trim()}
          network={draft.network}
        />
      )}

      {activeTab === "config" && <div className="space-y-8">
      <div className="rounded-md border border-border bg-secondary/40 p-5 md:p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-primary shrink-0" />
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Setup checklist
          </p>
        </div>
        <div className="mt-5 grid gap-4 text-sm text-muted leading-relaxed md:grid-cols-3">
          <div className="rounded-md border border-border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
              1. Pick network
            </p>
            <p className="mt-2">
              Choose testnet while experimenting, or mainnet when your Flow
              account resources are already deployed.
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
              2. Link wallets
            </p>
            <p className="mt-2">
              Link a SHADOW 0x wallet for Flow EVM visibility and add a Cadence
              address for Cadence balances and scheduling.
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
              3. Open scheduler
            </p>
            <p className="mt-2">
              Save these settings, then use the Scheduler tab to create, sync,
              and cancel Flow schedules manually.
            </p>
          </div>
        </div>
      </div>
      <div>
        <AppSectionTitle icon={Waves}>Flow</AppSectionTitle>
        <p className="mt-4 text-sm text-muted leading-relaxed">
        <span className="text-foreground font-medium">Flow EVM</span> balances use your SHADOW{" "}
        <span className="font-mono">0x</span> wallets in Portfolio.{" "}
        <span className="text-foreground font-medium">Cadence</span> FLOW and Cadence tooling need your
        separate Cadence account address (16 hex), configured below.
      </p>
      <p className="mt-3 text-sm text-muted leading-relaxed">
        Cadence transactions and sponsorship are prepared via the apps runtime. Recurring jobs are
        owned by SHADOW&apos;s scheduler, not native Flow recurrence.
      </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading configuration…</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="flow-net" className="text-xs font-semibold uppercase tracking-wide text-muted">
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
              className="flex h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="flow-linked-evm" className="text-xs font-semibold uppercase tracking-wide text-muted">
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
                className="flex h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
            <p className="text-xs text-muted leading-relaxed">
              This is the EVM address that holds Flow EVM / testnet tokens in Portfolio—not your
              Cadence account.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="flow-cadence" className="text-xs font-semibold uppercase tracking-wide text-muted">
              Cadence account address
            </label>
            <Input
              id="flow-cadence"
              value={draft.cadenceAddress}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cadenceAddress: e.target.value.slice(0, 66) }))
              }
              placeholder="16 hex characters (optional 0x)"
              className="h-11 rounded-md bg-secondary border-border font-mono text-sm"
            />
            <p className="text-xs text-muted leading-relaxed">
              Required for <span className="text-foreground/90 font-medium">Flow</span> /{" "}
              <span className="text-foreground/90 font-medium">Flow Testnet (Cadence)</span> in Portfolio when
              you only use an EVM wallet in SHADOW.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="default"
            className="w-full h-11 text-sm font-semibold"
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
            <pre className="text-xs font-mono text-muted whitespace-pre-wrap break-all max-h-48 overflow-y-auto rounded-md border border-border bg-secondary/80 p-4">
              {flowPreview}
            </pre>
          )}
        </div>
      )}
      <Button
        className="w-full h-12 rounded-md text-sm font-semibold"
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
    <div className="space-y-10">
      <section className="space-y-4">
        <AppSectionTitle icon={HardDrive}>Backup</AppSectionTitle>
      <p className="text-sm text-muted leading-relaxed">
        Snapshots are JSON payloads (upgrade path: keychain-sealed ciphertext). Rows below are
        recorded locally after each successful Synapse upload; pricing uses on-chain USDFC quotes.
        Synapse signing uses the{" "}
        <span className="text-foreground font-medium">unlocked SHADOW wallet</span> (same key as transfers on
        Filecoin Calibration)—unlock before backup, restore, quotes, or dataset listing.
      </p>
      </section>

      <div className="space-y-4 rounded-md border border-border bg-secondary/50 p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Storage overview</p>
        <div className="grid gap-4 text-sm text-muted sm:grid-cols-2">
          <div>
            <span className="block text-xs font-medium text-muted mb-1">Backups</span>
            <span className="font-mono text-base text-foreground tabular-nums">{backups.data?.length ?? 0}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-muted mb-1">Total size</span>
            <span className="font-mono text-base text-foreground">{formatBackupBytes(totalBackupBytes || null)}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-muted mb-1">Active datasets</span>
            <span className="font-mono text-base text-foreground tabular-nums">
              {datasetsQ.isLoading
                ? "…"
                : Array.isArray(datasetsQ.data?.dataSets)
                  ? datasetsQ.data.dataSets.length
                  : "—"}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="block text-xs font-medium text-muted mb-1">
              Quote ({estimateQuoteSize} B sample)
            </span>
            <span className="text-sm text-foreground leading-snug">
              {quoteQ.isLoading
                ? "…"
                : quoteQ.data
                  ? (
                    <>
                      <span className="font-mono">{quoteQ.data.ratePerMonthUsdfc}</span>
                      {" USDFC/mo · deposit "}
                      <span className="font-mono">{formatUsdfcDisplay(quoteQ.data.depositNeededUsdfc)}</span>
                    </>
                  )
                  : "—"}
            </span>
          </div>
        </div>
        {backups.data && backups.data.length > 0 ? (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-xs", filecoinStatusBadgeClass(backups.data[0].status))}
            >
              Latest: {backups.data[0].status}
            </Badge>
          </div>
        ) : null}
        <Button
          type="button"
          variant="default"
          size="default"
          className="h-12 w-full text-sm font-semibold"
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
        <p className="text-sm text-muted">Loading configuration…</p>
      ) : (
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm font-medium text-foreground">Time to live (1–365 days)</span>
              <span className="text-base font-mono text-primary tabular-nums">
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
              className="h-2 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
            />
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm font-medium text-foreground">
                Max deposit cap (USDFC)
              </span>
              <span className="text-base font-mono text-primary tabular-nums">
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
              className="h-2 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
            />
            <p className="text-xs text-muted leading-relaxed">
              Synapse often quotes ~1–3+ USDFC deposit for small snapshots; set this above the quote
              or backup will be rejected (check the error message for the exact amount).
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm font-medium text-foreground">Redundancy (copies)</span>
              <span className="text-base font-mono text-primary tabular-nums">
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
              className="h-2 w-full appearance-none rounded-full bg-secondary accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-3 pt-2 pb-2">
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
            <Label htmlFor="fc-autoRenew" className="text-sm text-muted cursor-pointer leading-snug">
              Auto-renew active agents
            </Label>
          </div>

          <div className="space-y-4 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
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
                <Label htmlFor={`fc-${key}`} className="text-sm text-muted cursor-pointer leading-snug">
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-md border border-border bg-secondary/50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Latest snapshot</p>
        {backups.data && backups.data.length > 0 ? (
          (() => {
            const latest = backups.data[0];
            const meta = parseFilecoinBackupMetadata(latest.metadataJson);
            return (
              <div className="space-y-2 text-sm font-mono text-muted">
                <div className="break-all text-foreground" title={latest.cid}>
                  CID: {latest.cid}
                </div>
                <div>Status: {latest.status}</div>
                {latest.notes ? <div className="opacity-90 text-sm font-sans">{latest.notes}</div> : null}
                {meta.storageRatePerMonthUsdfc ? (
                  <div>Quoted rate: {meta.storageRatePerMonthUsdfc} USDFC/mo</div>
                ) : null}
                {meta.depositNeededUsdfc ? (
                  <div>Deposit needed: {formatUsdfcDisplay(meta.depositNeededUsdfc)}</div>
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
          <p className="text-sm text-muted">No uploads yet.</p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recent snapshots</p>
        {backups.isLoading ? (
          <p className="text-sm text-muted">Loading backups…</p>
        ) : backups.data && backups.data.length === 0 ? (
          <p className="text-sm text-muted">No backups recorded yet.</p>
        ) : (
          <ul className="max-h-64 space-y-3 overflow-y-auto custom-scrollbar pr-1">
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
                  className="rounded-md border border-border bg-secondary/70 px-4 py-3 text-sm font-mono text-muted"
                >
                  <div className="flex justify-between gap-2 text-foreground">
                    <span className="min-w-0 break-all" title={b.cid}>
                      {b.cid}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-xs", filecoinStatusBadgeClass(b.status))}
                    >
                      {b.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-85">
                    <span>
                      {formatBackupTime(b.createdAt)} · v{b.encryptionVersion}
                    </span>
                    <span>· {formatBackupBytes(b.sizeBytes)}</span>
                    {copiesLabel ? <span>· {copiesLabel}</span> : null}
                    {rowMeta.storageRatePerMonthUsdfc ? (
                      <span>· {rowMeta.storageRatePerMonthUsdfc} USDFC/mo</span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      className="h-9 text-xs font-semibold"
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
                      size="default"
                      className="h-9 text-xs font-semibold"
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
        className="w-full h-12 rounded-md text-sm font-semibold"
        disabled={save.isPending || isLoading}
        onClick={() => void commit()}
      >
        Save Filecoin settings
      </Button>
    </div>
  );
}

export function AppSettingsPanel({ app, open, onOpenChange }: AppSettingsPanelProps) {
  /** Flow scheduler benefits from extra horizontal room; all modals use most of the viewport. */
  const wideLayout = app?.id === "flow";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 border-border bg-background p-0 text-foreground shadow-2xl overflow-hidden rounded-xl",
          /* Override dialog default sm:max-w-lg — nearly full width, capped on huge monitors */
          "w-full max-w-[calc(100vw-1rem)] sm:max-w-[min(98vw,90rem)]",
          wideLayout && "sm:max-w-[min(99vw,120rem)]",
        )}
      >
        <DialogHeader className="border-b border-border bg-secondary/90 px-6 py-6 md:px-8 md:py-7">
          <div className="flex items-start gap-4 pr-10">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/15 text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Configuration
              </p>
              <DialogTitle className="mt-1.5 text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {app ? `${app.name}` : "Integration"} settings
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[min(88vh,56rem)] space-y-8 overflow-y-auto px-6 py-6 text-base leading-relaxed md:px-8 md:py-8 custom-scrollbar antialiased">
          {app && <RuntimeStrip app={app} panelOpen={open} />}

          {app?.id === "lit-protocol" && <LitSettings appId={app.id} panelOpen={open} />}
          {app?.id === "flow" && <FlowSettings appId={app.id} panelOpen={open} />}
          {app?.id === "filecoin-storage" && <FilecoinSettings appId={app.id} panelOpen={open} />}

          {app && app.id !== "lit-protocol" && app.id !== "flow" && app.id !== "filecoin-storage" && (
            <p className="text-base text-muted leading-relaxed">No settings surface for this integration.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
