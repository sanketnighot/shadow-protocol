import { motion } from "framer-motion";
import {
  BarChart3,
  Repeat2,
  Send,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { InstalledAppsStrip } from "@/components/home/InstalledAppsStrip";
import { OrchestratorStatusCard } from "@/components/home/OrchestratorStatusCard";
import { PortfolioStrip } from "@/components/home/PortfolioStrip";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useUiStore } from "@/store/useUiStore";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

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

      {/* Row 3: Installed Apps */}
      <motion.div variants={row}>
        <InstalledAppsStrip />
      </motion.div>
    </motion.div>
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
