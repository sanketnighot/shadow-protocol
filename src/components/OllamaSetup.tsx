import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  checkOllamaStatus,
  getSystemInfo,
  listenOllamaProgress,
} from "@/lib/ollama";
import { isRecommended, MODEL_OPTIONS } from "@/lib/modelOptions";
import { useOllamaStore } from "@/store/useOllamaStore";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

function modelMatches(list: string[], model: string): boolean {
  const base = model.split(":")[0];
  return (
    list.some((m) => m.startsWith(base) || m === model) || list.includes(model)
  );
}

export function OllamaSetup() {
  const showSetupModal = useOllamaStore((s) => s.showSetupModal);
  const setupStatus = useOllamaStore((s) => s.setupStatus);
  const progressStep = useOllamaStore((s) => s.progressStep);
  const progressPct = useOllamaStore((s) => s.progressPct);
  const errorMessage = useOllamaStore((s) => s.errorMessage);
  const selectedModel = useOllamaStore((s) => s.selectedModel);
  const setSelectedModel = useOllamaStore((s) => s.setSelectedModel);
  const setSetupStatus = useOllamaStore((s) => s.setSetupStatus);
  const setSetupComplete = useOllamaStore((s) => s.setSetupComplete);
  const setProgress = useOllamaStore((s) => s.setProgress);
  const setLastStatus = useOllamaStore((s) => s.setLastStatus);
  const setError = useOllamaStore((s) => s.setError);
  const closeSetupModal = useOllamaStore((s) => s.closeSetupModal);

  const [systemInfo, setSystemInfo] = useState<{
    totalMemoryGb: number;
    cpuCount: number;
  } | null>(null);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [customModelInput, setCustomModelInput] = useState("");
  const runningRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  const runSetup = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setSetupStatus("checking");
    setProgress("Checking Ollama...", 5);

    const unlisten = await listenOllamaProgress((step, pct) => {
      setProgress(step, pct);
    });
    unlistenRef.current = unlisten;

    try {
      let status = await checkOllamaStatus();
      setLastStatus(status);

      if (!status.installed) {
        setSetupStatus("installing");
        setProgress("Installing Ollama...", 10);
        await invoke("install_ollama");
        status = await checkOllamaStatus();
        setLastStatus(status);
      }

      if (status.installed && !status.running) {
        setSetupStatus("installing");
        setProgress("Starting Ollama service...", 70);
        await invoke("start_ollama_service");
        status = await checkOllamaStatus();
        setLastStatus(status);
      }

      const modelToCheck = chosenModel ?? selectedModel;
      const modelBase = modelToCheck?.split(":")[0];
      const hasModel =
        modelToCheck &&
        (status.models.some(
          (m) => m.startsWith(modelBase ?? "") || m === modelToCheck
        ) ||
          status.models.includes(modelToCheck));

      if (!hasModel && status.installed && status.running && !chosenModel) {
        const info = await getSystemInfo();
        setSystemInfo(info);
        setSetupStatus("choosing_model");
        unlistenRef.current?.();
        unlistenRef.current = null;
        runningRef.current = false;
        return;
      }

      const model = chosenModel ?? selectedModel ?? "llama3.2:3b";
      if (!modelMatches(status.models, model)) {
        setSetupStatus("pulling");
        setProgress(`Pulling ${model}...`, 0);
        setSelectedModel(model);
        await invoke("pull_model", { modelName: model });
      } else {
        setSelectedModel(model);
      }

      setSetupStatus("ready");
      setSetupComplete(true);
      setProgress("Ready!", 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSetupStatus("error");
    } finally {
      runningRef.current = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }, [
    chosenModel,
    selectedModel,
    setSetupStatus,
    setSetupComplete,
    setProgress,
    setLastStatus,
    setSelectedModel,
    setError,
  ]);

  const handleModelChosen = useCallback(
    (modelId: string) => {
      setChosenModel(modelId);
      setSelectedModel(modelId);
      setSetupStatus("pulling");
      void runSetup();
    },
    [setSelectedModel, setSetupStatus, runSetup],
  );

  useEffect(() => {
    if (showSetupModal && setupStatus !== "ready" && setupStatus !== "choosing_model") {
      void runSetup();
    }
    return () => {
      unlistenRef.current?.();
    };
  }, [showSetupModal]);

  const isReady = setupStatus === "ready";
  const isError = setupStatus === "error";
  const isChoosingModel = setupStatus === "choosing_model";

  const handleOpenChange = (open: boolean) => {
    if (!open && isReady) {
      closeSetupModal();
    }
  };

  return (
    <Dialog open={showSetupModal} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={isReady}
        className="glass-panel max-w-md rounded-sm bg-background p-6"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-[-0.03em]">
            Setting up AI Agent
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            {isChoosingModel
              ? "Choose a model to download. Recommendations are based on your system."
              : isReady
                ? "Ollama is ready. You can start using the AI agent."
                : "Downloading and configuring Ollama for local AI. This may take a few minutes."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {isError && errorMessage && (
            <p className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {errorMessage}
            </p>
          )}
          {isChoosingModel && systemInfo && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Your system: {systemInfo.totalMemoryGb} GB RAM •{" "}
                {systemInfo.cpuCount} CPU cores
              </p>
              <div className="grid gap-2">
                {MODEL_OPTIONS.map((opt) => {
                  const recommended = isRecommended(opt.id, systemInfo.totalMemoryGb);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleModelChosen(opt.id)}
                      className={cn(
                        "flex items-center justify-between rounded-[16px] border px-4 py-3 text-left transition-all hover:-translate-y-0.5",
                        recommended
                          ? "border-primary/30 bg-primary/12 text-foreground"
                          : "border-border bg-secondary text-muted hover:bg-surface-elevated"
                      )}
                    >
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <span className="ml-2 text-xs text-muted">
                          {opt.desc} • {opt.sizeGb}GB
                        </span>
                      </div>
                      {recommended && (
                        <span className="flex items-center gap-1 rounded-sm bg-primary/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          <Sparkles className="size-3" />
                          Recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Or type any model (e.g. mistral, codellama:7b)"
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-secondary px-3 py-1 text-sm outline-none placeholder:text-muted focus:border-primary/50"
                  onKeyDown={(e) => {
                    const name = customModelInput.trim();
                    if (e.key === "Enter" && name) {
                      setCustomModelInput("");
                      handleModelChosen(name);
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={!customModelInput.trim()}
                  onClick={() => {
                    const name = customModelInput.trim();
                    if (name) {
                      setCustomModelInput("");
                      handleModelChosen(name);
                    }
                  }}
                >
                  Pull
                </Button>
              </div>
            </div>
          )}
          {!isReady && !isError && !isChoosingModel && (
            <>
              <p className="text-sm text-muted">
                {progressStep || "Initializing..."}
              </p>
              <Progress value={progressPct} className="h-2" />
            </>
          )}
          {isReady && (
            <div className="flex items-center gap-2 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              <CheckCircle2 className="size-4 shrink-0" />
              Ready! You can start chatting.
            </div>
          )}
        </div>

        <DialogFooter showCloseButton={false} className="mt-4">
          {isReady ? (
            <Button
              type="button"
              className="rounded-sm"
              onClick={() => closeSetupModal()}
            >
              Continue
            </Button>
          ) : isError ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-sm"
              onClick={() => void runSetup()}
            >
              Retry
            </Button>
          ) : !isChoosingModel ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" />
              Please wait...
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
