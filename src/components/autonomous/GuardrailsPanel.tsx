import { useEffect, useState } from "react";
import { Shield, AlertTriangle, Power, Save, Plus, X } from "lucide-react";

import { getGuardrails, setGuardrails, activateKillSwitch, deactivateKillSwitch } from "@/lib/autonomous";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { GuardrailConfig } from "@/types/autonomous";

const DEFAULT_GUARDRAILS: GuardrailConfig = {
  blockedTokens: [],
  blockedProtocols: [],
  maxSlippageBps: 300,
  emergencyKillSwitch: false,
};

export function GuardrailsPanel() {
  const [config, setConfig] = useState<GuardrailConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newBlockedToken, setNewBlockedToken] = useState("");
  const [newBlockedProtocol, setNewBlockedProtocol] = useState("");
  const { success, warning } = useToast();

  useEffect(() => {
    void fetchGuardrails();
  }, []);

  const fetchGuardrails = async () => {
    try {
      const result = await getGuardrails();
      setConfig(result);
    } catch (err) {
      logError("Failed to fetch guardrails", err);
      setConfig(DEFAULT_GUARDRAILS);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      await setGuardrails(config);
      success("Guardrails saved", "Your safety settings have been updated.");
    } catch (err) {
      warning("Failed to save guardrails", String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleKillSwitch = async () => {
    if (!config) return;
    try {
      if (config.emergencyKillSwitch) {
        await deactivateKillSwitch();
        setConfig({ ...config, emergencyKillSwitch: false });
        success("Kill switch deactivated", "Automated actions can now resume.");
      } else {
        await activateKillSwitch();
        setConfig({ ...config, emergencyKillSwitch: true });
        warning("Kill switch activated", "All automated actions are now blocked.");
      }
    } catch (err) {
      warning("Failed to toggle kill switch", String(err));
    }
  };

  const addBlockedToken = () => {
    if (!config || !newBlockedToken.trim()) return;
    const token = newBlockedToken.trim().toLowerCase();
    if (config.blockedTokens.includes(token)) return;
    setConfig({
      ...config,
      blockedTokens: [...config.blockedTokens, token],
    });
    setNewBlockedToken("");
  };

  const removeBlockedToken = (token: string) => {
    if (!config) return;
    setConfig({
      ...config,
      blockedTokens: config.blockedTokens.filter((t) => t !== token),
    });
  };

  const addBlockedProtocol = () => {
    if (!config || !newBlockedProtocol.trim()) return;
    const protocol = newBlockedProtocol.trim().toLowerCase();
    if (config.blockedProtocols.includes(protocol)) return;
    setConfig({
      ...config,
      blockedProtocols: [...config.blockedProtocols, protocol],
    });
    setNewBlockedProtocol("");
  };

  const removeBlockedProtocol = (protocol: string) => {
    if (!config) return;
    setConfig({
      ...config,
      blockedProtocols: config.blockedProtocols.filter((p) => p !== protocol),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-4">
      {/* Kill Switch */}
      <div
        className={cn(
          "glass-panel rounded-sm p-4",
          config.emergencyKillSwitch && "border-red-500/50"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-sm",
                config.emergencyKillSwitch
                  ? "bg-red-500/20 text-red-400"
                  : "bg-primary/10 text-primary"
              )}
            >
              <Power className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">Kill Switch</h3>
              <p className="text-xs text-muted">
                {config.emergencyKillSwitch
                  ? "All automated actions are blocked"
                  : "Emergency stop for all automated actions"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={config.emergencyKillSwitch ? "destructive" : "outline"}
            className={cn(
              "rounded-sm",
              !config.emergencyKillSwitch && "border-white/10"
            )}
            onClick={handleKillSwitch}
          >
            {config.emergencyKillSwitch ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      {/* Spending Limits */}
      <div className="glass-panel rounded-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="size-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Spending Limits</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs text-muted">Portfolio Floor (USD)</label>
            <input
              type="number"
              value={config.portfolioFloorUsd ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  portfolioFloorUsd: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="No floor set"
              className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted">Max Single TX (USD)</label>
            <input
              type="number"
              value={config.maxSingleTxUsd ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maxSingleTxUsd: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="No limit set"
              className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted">Daily Spend Limit (USD)</label>
            <input
              type="number"
              value={config.dailySpendLimitUsd ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  dailySpendLimitUsd: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="No limit set"
              className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted">Require Approval Above (USD)</label>
            <input
              type="number"
              value={config.requireApprovalAboveUsd ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  requireApprovalAboveUsd: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Always require approval"
              className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Blocked Tokens */}
      <div className="glass-panel rounded-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="size-4 text-amber-500" />
          <h3 className="text-sm font-medium text-foreground">Blocked Tokens</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newBlockedToken}
            onChange={(e) => setNewBlockedToken(e.target.value)}
            placeholder="Token address or symbol"
            className="flex-1 rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && addBlockedToken()}
          />
          <Button size="sm" variant="outline" className="rounded-sm" onClick={addBlockedToken}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.blockedTokens.length === 0 ? (
            <p className="text-xs text-muted">No blocked tokens</p>
          ) : (
            config.blockedTokens.map((token) => (
              <span
                key={token}
                className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-xs text-muted"
              >
                {token}
                <button
                  onClick={() => removeBlockedToken(token)}
                  className="text-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Blocked Protocols */}
      <div className="glass-panel rounded-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="size-4 text-amber-500" />
          <h3 className="text-sm font-medium text-foreground">Blocked Protocols</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newBlockedProtocol}
            onChange={(e) => setNewBlockedProtocol(e.target.value)}
            placeholder="Protocol name or address"
            className="flex-1 rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && addBlockedProtocol()}
          />
          <Button size="sm" variant="outline" className="rounded-sm" onClick={addBlockedProtocol}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.blockedProtocols.length === 0 ? (
            <p className="text-xs text-muted">No blocked protocols</p>
          ) : (
            config.blockedProtocols.map((protocol) => (
              <span
                key={protocol}
                className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-xs text-muted"
              >
                {protocol}
                <button
                  onClick={() => removeBlockedProtocol(protocol)}
                  className="text-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Save Button */}
      <Button className="w-full rounded-sm" onClick={handleSave} disabled={isSaving}>
        <Save className="mr-2 size-4" />
        {isSaving ? "Saving..." : "Save Guardrails"}
      </Button>
    </div>
  );
}
