import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Key, Save, Trash2, Cpu, AlertTriangle, RefreshCw } from "lucide-react";

import packageJson from "../../../package.json";
import { ModelSelector } from "@/components/ModelSelector";
import { AgentGovernance } from "@/components/settings/AgentGovernance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import { hasTauriRuntime } from "@/lib/tauri";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { type ThemePreference, useUiStore } from "@/store/useUiStore";
import { getAgentSoul, getAgentMemory } from "@/lib/agent";

const THEME_OPTIONS: ThemePreference[] = ["dark", "light", "system"];

const APP_ABOUT = {
  name: "SHADOW Protocol",
  tagline: "Private DeFi workstation",
  description:
    "Privacy-first desktop app for DeFi automation. Build strategies, run automations, and manage cross-chain assets with local AI and human-in-the-loop approvals.",
} as const;

export function SettingsPage() {
  const themePreference = useUiStore((state) => state.themePreference);
  const setThemePreference = useUiStore((state) => state.setThemePreference);
  const developerModeEnabled = useUiStore((state) => state.developerModeEnabled);
  const toggleDeveloperMode = useUiStore((state) => state.toggleDeveloperMode);
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);

  const handleDeveloperModeToggle = () => {
    const turningOn = !developerModeEnabled;
    toggleDeveloperMode();
    if (turningOn && hasTauriRuntime()) {
      void invoke("open_devtools").catch(() => {
        /* Inspector may be unavailable in some builds */
      });
    }
  };

  const { success, warning: toastWarning } = useToast();
  const resetOnboarding = useOnboardingStore((s) => s.resetOnboarding);
  const startReplay = useOnboardingStore((s) => s.startReplay);

  const handleReplayOnboarding = async () => {
    try {
      const [soul, memory] = await Promise.all([getAgentSoul(), getAgentMemory()]);
      const memories = memory.facts.map((f) => f.fact);
      startReplay(soul, memories);
      // Reload to restart onboarding flow
      window.location.reload();
    } catch (err) {
      logError("Failed to load existing config", err);
      // Start replay anyway with empty state
      startReplay(null, []);
      window.location.reload();
    }
  };

  const [perplexityKey, setPerplexityKey] = useState("");
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [alchemyKey, setAlchemyKey] = useState("");
  const [isAlchemyKeySaved, setIsAlchemyKeySaved] = useState(false);
  const [isSavingAlchemy, setIsSavingAlchemy] = useState(false);

  const [ollamaKey, setOllamaKey] = useState("");
  const [isOllamaKeySaved, setIsOllamaKeySaved] = useState(false);
  const [isSavingOllama, setIsSavingOllama] = useState(false);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return;
    }

    const fetchKeys = async () => {
      try {
        const pResult = await invoke<{ key?: string }>("get_perplexity_key");
        if (pResult.key) {
          setPerplexityKey("********");
          setIsKeySaved(true);
        }
        const aResult = await invoke<{ key?: string }>("get_alchemy_key");
        if (aResult.key) {
          setAlchemyKey("********");
          setIsAlchemyKeySaved(true);
        }
        const oResult = await invoke<{ key?: string }>("get_ollama_key");
        if (oResult.key) {
          setOllamaKey("********");
          setIsOllamaKeySaved(true);
        }
      } catch (err) {
        logError("Failed to fetch keys", err);
      }
    };
    void fetchKeys();
  }, []);

  const handleSaveKey = async () => {
    if (!perplexityKey || perplexityKey === "********") return;
    setIsSaving(true);
    try {
      const result = await invoke<{ success: boolean; error?: string }>(
        "set_perplexity_key",
        { input: { key: perplexityKey } }
      );
      if (result.success) {
        success("Perplexity API Key saved", "Your Shadow Oracle is now enhanced with real-time web research.");
        setIsKeySaved(true);
        setPerplexityKey("********");
      } else {
        toastWarning("Failed to save key", result.error || "Unknown error");
      }
    } catch (err) {
      toastWarning("Failed to save key", String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveKey = async () => {
    try {
      const result = await invoke<{ success: boolean; error?: string }>("remove_perplexity_key");
      if (result.success) {
        success("Key removed", "Perplexity API key has been cleared from keychain.");
        setPerplexityKey("");
        setIsKeySaved(false);
      }
    } catch (err) {
      toastWarning("Failed to remove key", String(err));
    }
  };

  const handleSaveAlchemyKey = async () => {
    if (!alchemyKey || alchemyKey === "********") return;
    setIsSavingAlchemy(true);
    try {
      const result = await invoke<{ success: boolean; error?: string }>(
        "set_alchemy_key",
        { input: { key: alchemyKey } }
      );
      if (result.success) {
        success("Alchemy API Key saved", "Portfolio data will now be fetched using your secure key.");
        setIsAlchemyKeySaved(true);
        setAlchemyKey("********");
      } else {
        toastWarning("Failed to save key", result.error || "Unknown error");
      }
    } catch (err) {
      toastWarning("Failed to save key", String(err));
    } finally {
      setIsSavingAlchemy(false);
    }
  };

  const handleRemoveAlchemyKey = async () => {
    try {
      const result = await invoke<{ success: boolean; error?: string }>("remove_alchemy_key");
      if (result.success) {
        success("Key removed", "Alchemy API key has been cleared from keychain.");
        setAlchemyKey("");
        setIsAlchemyKeySaved(false);
      }
    } catch (err) {
      toastWarning("Failed to remove key", String(err));
    }
  };

  const handleSaveOllamaKey = async () => {
    if (!ollamaKey || ollamaKey === "********") return;
    setIsSavingOllama(true);
    try {
      const result = await invoke<{ success: boolean; error?: string }>(
        "set_ollama_key",
        { input: { key: ollamaKey } }
      );
      if (result.success) {
        success("Ollama API Key saved", "Your Ollama requests will now include this key.");
        setIsOllamaKeySaved(true);
        setOllamaKey("********");
      } else {
        toastWarning("Failed to save key", result.error || "Unknown error");
      }
    } catch (err) {
      toastWarning("Failed to save key", String(err));
    } finally {
      setIsSavingOllama(false);
    }
  };

  const handleRemoveOllamaKey = async () => {
    try {
      const result = await invoke<{ success: boolean; error?: string }>(
        "remove_ollama_key",
      );
      if (result.success) {
        success(
          "Key removed",
          "Ollama API key has been cleared from keychain.",
        );
        setOllamaKey("");
        setIsOllamaKeySaved(false);
      }
    } catch (err) {
      toastWarning("Failed to remove key", String(err));
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteAllData = async () => {
    setIsDeleting(true);
    try {
      const result = await invoke<{ success: boolean; error?: string }>(
        "delete_all_data",
      );
      if (result.success) {
        success("All data deleted", "The application has been reset.");
        resetOnboarding();
        // Clear all persisted state in localStorage
        localStorage.clear();
        // Force a reload to clear all in-memory state and restart onboarding
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        toastWarning("Deletion failed", result.error || "Unknown error");
      }
    } catch (err) {
      toastWarning("Deletion failed", String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <section className="glass-panel rounded-sm p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Settings
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Configuration & Security
        </h1>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="glass-panel rounded-sm p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">
            Shadow Intelligence
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Configure external intelligence sources for your Shadow Oracle.
          </p>

          <div className="mt-6 space-y-4">
            <div className="rounded-sm border border-border bg-secondary p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/10 text-primary">
                  <Key className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Perplexity (Sonar) API Key
                  </h3>
                  <p className="text-xs text-muted">
                    Required for real-time web research and market catalysts.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  type="password"
                  value={perplexityKey}
                  onChange={(e) => setPerplexityKey(e.target.value)}
                  placeholder={
                    isKeySaved ? "********" : "pplx-xxxxxxxxxxxxxxxx"
                  }
                  className="flex-1 rounded-sm border border-border bg-secondary px-4 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  disabled={isKeySaved && perplexityKey === "********"}
                />
                {!isKeySaved || perplexityKey !== "********" ? (
                  <Button
                    size="sm"
                    className="rounded-sm"
                    onClick={handleSaveKey}
                    disabled={isSaving || !perplexityKey}
                  >
                    <Save className="mr-2 size-4" />
                    Save
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-sm border-red-500/20 text-red-400 hover:bg-red-500/10"
                    onClick={handleRemoveKey}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-sm border border-border bg-secondary p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-blue-500/10 text-blue-400">
                  <Save className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Alchemy API Key
                  </h3>
                  <p className="text-xs text-muted">
                    Required for cross-chain portfolio data and token transfers.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  type="password"
                  value={alchemyKey}
                  onChange={(e) => setAlchemyKey(e.target.value)}
                  placeholder={
                    isAlchemyKeySaved ? "********" : "your-alchemy-key"
                  }
                  className="flex-1 rounded-sm border border-border bg-secondary px-4 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  disabled={isAlchemyKeySaved && alchemyKey === "********"}
                />
                {!isAlchemyKeySaved || alchemyKey !== "********" ? (
                  <Button
                    size="sm"
                    className="rounded-sm"
                    onClick={handleSaveAlchemyKey}
                    disabled={isSavingAlchemy || !alchemyKey}
                  >
                    <Save className="mr-2 size-4" />
                    Save
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-sm border-red-500/20 text-red-400 hover:bg-red-500/10"
                    onClick={handleRemoveAlchemyKey}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-sm border border-border bg-secondary p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-orange-500/10 text-orange-400">
                  <Cpu className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Ollama API Key
                  </h3>
                  <p className="text-xs text-muted">
                    Optional. Used for authenticated Ollama instances or
                    compatible endpoints.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  type="password"
                  value={ollamaKey}
                  onChange={(e) => setOllamaKey(e.target.value)}
                  placeholder={
                    isOllamaKeySaved ? "********" : "your-ollama-key"
                  }
                  className="flex-1 rounded-sm border border-border bg-secondary px-4 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  disabled={isOllamaKeySaved && ollamaKey === "********"}
                />
                {!isOllamaKeySaved || ollamaKey !== "********" ? (
                  <Button
                    size="sm"
                    className="rounded-sm"
                    onClick={handleSaveOllamaKey}
                    disabled={isSavingOllama || !ollamaKey}
                  >
                    <Save className="mr-2 size-4" />
                    Save
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-sm border-red-500/20 text-red-400 hover:bg-red-500/10"
                    onClick={handleRemoveOllamaKey}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-sm p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">Theme</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Choose the theme that matches your environment.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setThemePreference(option)}
                className={cn(
                  "rounded-sm border px-4 py-4 text-left transition-all hover:-translate-y-0.5 active:scale-95",
                  themePreference === option
                    ? "border-primary/30 bg-primary/12 text-foreground shadow-none border border-white/5"
                    : "border-border bg-secondary text-muted hover:bg-surface-elevated",
                )}
              >
                <p className="font-semibold capitalize">{option}</p>
                <p className="mt-2 text-sm leading-6">
                  {option === "system"
                    ? "Follow your macOS or Windows preference automatically."
                    : `Keep SHADOW in ${option} mode across launches.`}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-sm p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">
            Developer mode
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Enable to see testnets (Ethereum Sepolia, Base Sepolia, Polygon
            Amoy, Flow Testnet) in the Portfolio section.             In the desktop app, right‑click opens a menu with Reload window and
            Open DevTools; Cmd+Option+I (macOS) or Ctrl+Shift+I (Windows/Linux)
            toggles the inspector.
          </p>
          <button
            type="button"
            onClick={handleDeveloperModeToggle}
            className={cn(
              "mt-4 flex w-fit items-center gap-3 rounded-sm border px-4 py-3 text-left transition-all hover:-translate-y-0.5 active:scale-95",
              developerModeEnabled
                ? "border-primary/30 bg-primary/12 text-foreground"
                : "border-border bg-secondary text-muted hover:bg-surface-elevated",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-11 shrink-0 items-center rounded-sm border transition-colors",
                developerModeEnabled
                  ? "border-primary/50 bg-primary/30 justify-end"
                  : "border-white/20 bg-white/10 justify-start",
              )}
            >
              <span
                className={cn(
                  "block h-5 w-5 shrink-0 rounded-sm bg-white shadow transition-transform",
                  developerModeEnabled ? "mr-1" : "ml-1",
                )}
              />
            </span>
            <span className="font-medium">
              {developerModeEnabled ? "On" : "Off"}
            </span>
          </button>
        </section>

        <section className="glass-panel rounded-sm p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">AI Model</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Local model for the AI agent. Requires Ollama to be set up.
          </p>
          <div className="mt-4">
            <ModelSelector />
          </div>
        </section>

        <section className="glass-panel rounded-sm p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">
            Command palette
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Open anywhere with <span className="font-mono">Cmd/Ctrl + K</span>.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated"
            onClick={openCommandPalette}
          >
            Open command palette
          </Button>
        </section>
      </div>

      <AgentGovernance />

      <section className="glass-panel rounded-sm p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-foreground">About</h2>
        <div className="mt-5 space-y-4">
          <div className="rounded-sm border border-border bg-secondary p-4 max-w-md">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
              {APP_ABOUT.name}
            </p>
            <p className="mt-1 text-sm text-muted">{APP_ABOUT.tagline}</p>
            <p className="mt-3 text-sm leading-6 text-foreground">
              {APP_ABOUT.description}
            </p>
            <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Version</dt>
                <dd className="font-medium text-foreground">
                  v{packageJson.version}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="glass-panel border-red-500/20 bg-red-500/5 rounded-sm border p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="size-5 text-red-400" />
          <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-red-300/70">
          Once you delete your account data, there is no going back. This will
          clear all wallets, transaction history, and API keys from this device.
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          <Button
            variant="outline"
            className="rounded-sm border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
            onClick={handleReplayOnboarding}
          >
            <RefreshCw className="mr-2 size-4" />
            Replay Onboarding
          </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="rounded-sm border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300"
            >
              <Trash2 className="mr-2 size-4" />
              Delete All Data
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-border bg-surface sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="size-5" />
                Absolute Deletion
              </DialogTitle>
              <DialogDescription className="text-muted">
                This action is irreversible. All your local data, including
                private keys and settings, will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 flex gap-2">
              <Button
                className="rounded-sm bg-red-600 text-white hover:bg-red-700"
                onClick={handleDeleteAllData}
                disabled={isDeleting}
              >
                {isDeleting ? "Wiping Data..." : "Yes, Delete Everything"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </section>
    </div>
  );
}
