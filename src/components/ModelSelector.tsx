import { Check, ChevronDown, Download, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  checkOllamaStatus,
  getSystemInfo,
  listenOllamaProgress,
} from "@/lib/ollama";
import { isRecommended, MODEL_OPTIONS } from "@/lib/modelOptions";
import { useOllamaStore } from "@/store/useOllamaStore";
import { useToast } from "@/hooks/useToast";
import { invoke } from "@tauri-apps/api/core";

function modelMatches(list: string[], model: string): boolean {
  const base = model.split(":")[0];
  return (
    list.some((m) => m.startsWith(base) || m === model) || list.includes(model)
  );
}

export function ModelSelector() {
  const { info, success } = useToast();
  const selectedModel = useOllamaStore((s) => s.selectedModel);
  const setSelectedModel = useOllamaStore((s) => s.setSelectedModel);
  const lastStatus = useOllamaStore((s) => s.lastStatus);
  const setLastStatus = useOllamaStore((s) => s.setLastStatus);
  const setProgress = useOllamaStore((s) => s.setProgress);
  const openSetupModal = useOllamaStore((s) => s.openSetupModal);

  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [customModelQuery, setCustomModelQuery] = useState("");
  const [systemInfo, setSystemInfo] = useState<{
    totalMemoryGb: number;
  } | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await checkOllamaStatus();
      setLastStatus(status);
      return status;
    } catch {
      setLastStatus({ installed: false, running: false, models: [] });
      return null;
    }
  }, [setLastStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    getSystemInfo()
      .then((si) => setSystemInfo(si))
      .catch(() => setSystemInfo(null));
  }, []);

  const handlePull = useCallback(
    async (modelId: string) => {
      if (isPulling) return;
      const name = modelId.trim();
      if (!name) return;

      let status = lastStatus ?? (await refreshStatus());
      if (!status?.installed || !status.running) {
        openSetupModal();
        return;
      }

      setIsPulling(true);
      setPullProgress(0);
      setCustomModelQuery("");
      const unlisten = await listenOllamaProgress((step, pct) => {
        setPullProgress(pct);
        setProgress(step, pct);
      });

      try {
        await invoke("pull_model", { modelName: name });
        setSelectedModel(name);
        await refreshStatus();
        success("Model downloaded", `Switched to ${name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        info("Download failed", msg);
      } finally {
        setIsPulling(false);
        unlisten();
      }
    },
    [
      isPulling,
      lastStatus,
      refreshStatus,
      setSelectedModel,
      setProgress,
      openSetupModal,
      info,
      success,
    ],
  );

  const handleSelect = useCallback(
    async (modelId: string) => {
      if (modelId === selectedModel) return;
      if (isPulling) return;

      let status = lastStatus ?? (await refreshStatus());
      if (!status) {
        openSetupModal();
        return;
      }

      if (modelMatches(status.models, modelId)) {
        setSelectedModel(modelId);
        success("Model switched", `Using ${modelId}`);
      } else {
        await handlePull(modelId);
      }
    },
    [
      selectedModel,
      isPulling,
      lastStatus,
      refreshStatus,
      setSelectedModel,
      openSetupModal,
      handlePull,
      success,
    ],
  );

  const handlePullCustom = useCallback(() => {
    const name = customModelQuery.trim();
    if (name) void handlePull(name);
  }, [customModelQuery, handlePull]);

  const models = lastStatus?.models ?? [];
  const recommendedToDownload = MODEL_OPTIONS.filter(
    (opt) =>
      isRecommended(opt.id, systemInfo?.totalMemoryGb ?? 16) &&
      !modelMatches(models, opt.id),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated sm:w-auto"
          disabled={isPulling}
        >
          {isPulling ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Downloading... {pullProgress}%
            </>
          ) : (
            <>
              <span>
                {selectedModel || "Select model"}
              </span>
              <ChevronDown className="size-4 opacity-70" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        <DropdownMenuLabel className="text-muted">
          AI Model {systemInfo && `• ${systemInfo.totalMemoryGb} GB RAM`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {models.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted">
              Local models
            </DropdownMenuLabel>
            {models.map((m) => (
              <DropdownMenuItem
                key={m}
                onClick={() => void handleSelect(m)}
                disabled={isPulling}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="font-medium">{m}</span>
                {selectedModel === m ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-sm px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSelect(m);
                    }}
                  >
                    Use
                  </Button>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        )}

        {recommendedToDownload.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted">
              Recommended to download
            </DropdownMenuLabel>
            {recommendedToDownload.map((opt) => (
              <DropdownMenuItem
                key={opt.id}
                onClick={() => void handlePull(opt.id)}
                disabled={isPulling}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    {opt.label}
                    <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                      Recommended
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {opt.desc} • {opt.sizeGb}GB
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-sm px-2 text-xs"
                  disabled={isPulling}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handlePull(opt.id);
                  }}
                >
                  <Download className="size-3" />
                  Pull
                </Button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        )}

        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted">
            Pull any model
          </DropdownMenuLabel>
          <div
            className="flex gap-2 px-2 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Input
              placeholder="e.g. mistral, codellama:7b"
              value={customModelQuery}
              onChange={(e) => setCustomModelQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePullCustom();
              }}
              className="h-8 flex-1 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 shrink-0"
              disabled={isPulling || !customModelQuery.trim()}
              onClick={handlePullCustom}
            >
              <Search className="size-3" />
              Pull
            </Button>
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
