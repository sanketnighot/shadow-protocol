import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
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
  deleteModel,
  getSystemInfo,
  listenOllamaProgress,
} from "@/lib/ollama";
import { isRecommended, MODEL_OPTIONS } from "@/lib/modelOptions";
import { useOllamaStore } from "@/store/useOllamaStore";
import { useToast } from "@/hooks/useToast";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

function modelMatches(list: string[], model: string): boolean {
  const base = model.split(":")[0];
  return (
    list.some((m) => m.startsWith(base) || m === model) || list.includes(model)
  );
}

export function ChatModelPicker() {
  const { info, success } = useToast();
  const selectedModel = useOllamaStore((s) => s.selectedModel);
  const setSelectedModel = useOllamaStore((s) => s.setSelectedModel);
  const lastStatus = useOllamaStore((s) => s.lastStatus);
  const setLastStatus = useOllamaStore((s) => s.setLastStatus);
  const setProgress = useOllamaStore((s) => s.setProgress);
  const openSetupModal = useOllamaStore((s) => s.openSetupModal);

  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const [customModelQuery, setCustomModelQuery] = useState("");
  const [systemInfo, setSystemInfo] = useState<{
    totalMemoryGb: number;
    cpuCount: number;
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

  const fetchSystemInfo = useCallback(async () => {
    try {
      const info = await getSystemInfo();
      setSystemInfo(info);
    } catch {
      setSystemInfo(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void fetchSystemInfo();
  }, [refreshStatus, fetchSystemInfo]);

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

  const handleDelete = useCallback(
    async (modelId: string) => {
      if (deletingModel) return;

      setDeletingModel(modelId);
      try {
        await deleteModel(modelId);
        const status = await refreshStatus();
        if (selectedModel === modelId && status) {
          const stillInstalled = status.models;
          setSelectedModel(stillInstalled[0] ?? "");
          if (stillInstalled.length === 0) {
            openSetupModal();
          }
        }
        success("Model removed", `${modelId} deleted`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        info("Delete failed", msg);
      } finally {
        setDeletingModel(null);
      }
    },
    [deletingModel, refreshStatus, selectedModel, setSelectedModel, openSetupModal, info, success],
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
          variant="ghost"
          size="sm"
          className="gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-foreground hover:bg-white/10"
          disabled={isPulling}
        >
          {isPulling ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span className="hidden sm:inline">Pulling… {pullProgress}%</span>
            </>
          ) : (
            <>
              <span className="truncate max-w-[140px]">
                {selectedModel || "Select model"}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-70" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[300px] max-w-[90vw]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
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
                <div className="flex shrink-0 items-center gap-1">
                  {selectedModel === m ? (
                    <Check className="size-4 text-primary" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleSelect(m);
                      }}
                    >
                      Use
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 gap-1 rounded-full px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive",
                      deletingModel === m && "opacity-50"
                    )}
                    disabled={deletingModel !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(m);
                    }}
                  >
                    {deletingModel === m ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                </div>
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
                  className="h-7 gap-1 rounded-full px-2 text-xs"
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
