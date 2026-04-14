import { motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Repeat2,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { OrchestratorStatusCard } from "@/components/home/OrchestratorStatusCard";
import { PortfolioStrip } from "@/components/home/PortfolioStrip";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useUiStore } from "@/store/useUiStore";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { StrategyExecutionRecord } from "@/types/strategy";

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const row = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

export function HomeDashboard() {
  return (
    <motion.div
      className="flex flex-col gap-5"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* Row 1: Portfolio */}
      <motion.div variants={row}>
        <PortfolioStrip />
      </motion.div>

      {/* Row 2: Orchestrator + Quick Actions */}
      <motion.div
        className="grid gap-5 xl:grid-cols-[1.25fr_1fr]"
        variants={row}
      >
        <OrchestratorStatusCard />
        <QuickActionsPanel />
      </motion.div>

      {/* Row 3: Recent Activity */}
      <motion.div variants={row}>
        <RecentActivityStrip />
      </motion.div>
    </motion.div>
  );
}

/* ─── Recent Activity strip ───────────────────────────────────── */

function RecentActivityStrip() {
  const [records, setRecords] = useState<StrategyExecutionRecord[]>([]);

  useEffect(() => {
    invoke<StrategyExecutionRecord[]>("strategy_get_execution_history", { limit: 3 })
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  if (records.length === 0) return null;

  return (
    <div className="glass-panel rounded-sm p-5 sm:p-6">
      <p className="font-mono text-[10px] tracking-[0.28em] text-muted uppercase mb-3">
        Recent Activity
      </p>
      <div className="flex flex-col gap-2">
        {records.map((rec) => {
          const isOk = rec.status === "executed" || rec.status === "approved";
          const Icon = isOk ? CheckCircle2 : rec.status === "pending" ? Clock : XCircle;
          const color = isOk ? "text-emerald-400" : rec.status === "pending" ? "text-amber-400" : "text-red-400";
          const ts = new Date(rec.createdAt * 1000).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div key={rec.id} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
              <Icon className={cn("size-4 shrink-0", color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{rec.reason ?? rec.status}</p>
                <p className="font-mono text-[10px] text-muted">{ts}</p>
              </div>
              <span className={cn("font-mono text-[10px] uppercase px-1.5 py-0.5 rounded-sm", isOk ? "bg-emerald-500/10 text-emerald-400" : "bg-surface-elevated text-muted")}>
                {rec.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Quick Actions panel ─────────────────────────────────────── */

const ACTIONS = [
  {
    label: "Send",
    description: "Transfer tokens",
    icon: Send,
    color: "text-blue-400",
    bg: "bg-blue-500/8 border-blue-500/15",
  },
  {
    label: "Swap",
    description: "Exchange assets",
    icon: Repeat2,
    color: "text-purple-400",
    bg: "bg-purple-500/8 border-purple-500/15",
  },
  {
    label: "Strategy",
    description: "Build automation",
    icon: Sparkles,
    color: "text-amber-400",
    bg: "bg-amber-500/8 border-amber-500/15",
  },
  {
    label: "Analyze",
    description: "Portfolio insight",
    icon: BarChart3,
    color: "text-emerald-400",
    bg: "bg-emerald-500/8 border-emerald-500/15",
  },
] as const;

function QuickActionsPanel() {
  const navigate = useNavigate();
  const { addresses, activeAddress } = useWalletStore();
  const { assets } = usePortfolio({ addresses, activeAddress });
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);

  const handleAction = (label: string) => {
    switch (label) {
      case "Send":
        navigate("/portfolio");
        if (assets.length > 0) openPortfolioAction("send", assets[0].id);
        break;
      case "Swap":
        navigate("/portfolio");
        if (assets.length > 0) openPortfolioAction("swap", assets[0].id);
        break;
      case "Strategy":
        navigate("/strategy");
        break;
      default:
        navigate("/portfolio");
        break;
    }
  };

  return (
    <div className="glass-panel rounded-sm p-5 sm:p-6 flex flex-col gap-4">
      <p className="font-mono text-[10px] tracking-[0.28em] text-muted uppercase">
        Quick Actions
      </p>
      <div className="grid grid-cols-2 gap-2.5 flex-1">
        {ACTIONS.map(({ label, description, icon: Icon, color, bg }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleAction(label)}
            className={cn(
              "group flex flex-col gap-2.5 rounded-sm border p-3.5 text-left transition-all",
              "hover:-translate-y-0.5 active:scale-[0.98]",
              bg,
            )}
          >
            <Icon className={cn("size-4", color)} />
            <div>
              <p className="text-sm font-semibold text-foreground leading-none">{label}</p>
              <p className="mt-1 font-mono text-[10px] text-muted">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
