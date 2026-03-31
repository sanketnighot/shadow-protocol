import { motion } from "framer-motion";
import {
  Zap,
  Waves,
  HardDrive,
  Globe,
  Lock,
  ScanFace,
  LayoutGrid,
  ArrowRight,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAppsMarketplace } from "@/hooks/useApps";
import type { ShadowApp } from "@/types/apps";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  Waves,
  HardDrive,
  Globe,
  Lock,
  ScanFace,
};

export function InstalledAppsStrip() {
  const navigate = useNavigate();
  const { data: apps = [], isLoading } = useAppsMarketplace();
  const installedApps = apps.filter((a) => a.isInstalled);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-3.5 text-primary" />
          <p className="font-mono text-[10px] tracking-[0.28em] text-muted uppercase">
            Installed Apps
            {!isLoading && installedApps.length > 0 && (
              <span className="ml-2 text-primary">({installedApps.length})</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/apps")}
          className="flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] text-muted/60 uppercase hover:text-primary transition-colors"
        >
          Manage
          <ArrowRight className="size-3" />
        </button>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-sm bg-secondary animate-pulse" />
          ))}
        </div>
      ) : installedApps.length === 0 ? (
        <EmptyAppsState onNavigate={() => navigate("/apps")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {installedApps.map((app, i) => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <InstalledAppCard app={app} onManage={() => navigate("/apps")} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

type InstalledAppCardProps = {
  app: ShadowApp;
  onManage: () => void;
};

function InstalledAppCard({ app, onManage }: InstalledAppCardProps) {
  const Icon = ICON_MAP[app.icon] ?? Zap;

  return (
    <button
      type="button"
      onClick={onManage}
      className="w-full text-left glass-panel rounded-sm p-4 flex items-center gap-3 group transition-all hover:border-primary/20 active:scale-[0.99]"
    >
      {/* Icon */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
        <Icon className="size-4" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{app.name}</p>
          <StatusDot status={app.status} />
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-muted truncate">{app.healthStatus ?? app.version}</p>
      </div>

      {/* Settings hint */}
      <Settings className="size-3.5 text-muted/40 group-hover:text-muted transition-colors shrink-0" />
    </button>
  );
}

type StatusDotProps = { status: ShadowApp["status"] };

function StatusDot({ status }: StatusDotProps) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <div
        className={cn(
          "size-1.5 rounded-full",
          status === "active" ? "bg-emerald-400 animate-pulse" :
          status === "error" ? "bg-red-400" :
          "bg-muted",
        )}
      />
      <span
        className={cn(
          "font-mono text-[9px] uppercase tracking-wider",
          status === "active" ? "text-emerald-400" :
          status === "error" ? "text-red-400" :
          "text-muted",
        )}
      >
        {status}
      </span>
    </div>
  );
}

function EmptyAppsState({ onNavigate }: { onNavigate: () => void }) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="w-full glass-panel rounded-sm p-5 flex items-center justify-between group hover:border-primary/20 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-sm border border-border bg-secondary text-muted">
          <Zap className="size-4" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-foreground">No apps installed</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            Add Lit, Flow, or Filecoin to expand agent capabilities
          </p>
        </div>
      </div>
      <ArrowRight className="size-4 text-muted group-hover:text-primary transition-colors" />
    </button>
  );
}
