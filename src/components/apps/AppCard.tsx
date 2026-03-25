import { Zap, Waves, HardDrive, Globe, Lock, ScanFace, Play, Settings, Star, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShadowApp } from "@/data/apps";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  Waves,
  HardDrive,
  Globe,
  Lock,
  ScanFace,
};

type AppCardProps = {
  app: ShadowApp;
  onInstall: (app: ShadowApp) => void;
  onConfigure: (app: ShadowApp) => void;
  onDisable: (app: ShadowApp) => void;
  onEnable: (app: ShadowApp) => void;
};

export function AppCard({ app, onInstall, onConfigure, onDisable, onEnable }: AppCardProps) {
  const Icon = ICON_MAP[app.icon] || Zap;

  return (
    <div className="rounded-sm border border-white/5 bg-surface-elevated p-5 transition-colors hover:bg-surface-elevated/80">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/12 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">{app.name}</h3>
            <p className="mt-1 truncate text-xs text-muted uppercase tracking-wider font-mono">
              {app.author}
            </p>
          </div>
        </div>
        
        {app.isInstalled && (
          <div className={cn(
            "flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            app.status === "active" 
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" 
              : "border-border bg-secondary text-muted"
          )}>
            {app.status === "active" ? (
              <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <div className="size-1.5 rounded-full bg-muted" />
            )}
            {app.status}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm leading-6 text-muted line-clamp-2 min-h-[3rem]">
          {app.shortDescription}. {app.isInstalled ? "" : app.longDescription}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {app.isInstalled ? (
          <>
            <div className="rounded-sm border border-border bg-secondary p-2">
              <p className="text-[10px] tracking-[0.18em] text-muted uppercase font-mono">Version</p>
              <p className="mt-1 text-xs font-semibold text-foreground font-mono">{app.version}</p>
            </div>
            <div className="rounded-sm border border-border bg-secondary p-2 text-right">
              <p className="text-[10px] tracking-[0.18em] text-muted uppercase font-mono">Usage</p>
              <p className="mt-1 text-xs font-semibold text-foreground truncate">
                {app.metrics?.value.split(" ")[0] || "12"} txs
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-sm border border-border bg-secondary p-2">
              <p className="text-[10px] tracking-[0.18em] text-muted uppercase font-mono">Rating</p>
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-foreground">
                <Star className="size-3 text-yellow-500 fill-yellow-500" />
                {app.rating || "4.5"}
              </div>
            </div>
            <div className="rounded-sm border border-border bg-secondary p-2 text-right">
              <p className="text-[10px] tracking-[0.18em] text-muted uppercase font-mono">Installs</p>
              <div className="mt-1 flex items-center justify-end gap-1 text-xs font-semibold text-foreground">
                <Download className="size-3 text-primary" />
                {app.installCount || "1.2k"}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        {app.isInstalled ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-sm border-border bg-secondary text-xs font-semibold tracking-wider uppercase active:scale-95"
              onClick={() => onConfigure(app)}
            >
              <Settings className="size-3.5 mr-2" />
              Settings
            </Button>
            {app.status === "active" ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-sm border-border bg-secondary text-xs font-semibold tracking-wider uppercase text-red-400 hover:bg-red-400/5 active:scale-95"
                onClick={() => onDisable(app)}
              >
                Disable
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-sm border-border bg-secondary text-xs font-semibold tracking-wider uppercase text-emerald-400 hover:bg-emerald-400/5 active:scale-95"
                onClick={() => onEnable(app)}
              >
                <Play className="size-3.5 mr-2" />
                Enable
              </Button>
            )}
          </>
        ) : (
          <Button
            className="w-full rounded-sm text-xs font-semibold tracking-wider uppercase active:scale-95"
            onClick={() => onInstall(app)}
          >
            Install Extension
          </Button>
        )}
      </div>
    </div>
  );
}
