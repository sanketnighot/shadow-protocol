import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import { PrivacyToggle } from "@/components/shared/PrivacyToggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useUiStore } from "@/store/useUiStore";

const HEALTH_LABELS = {
  healthy: "Healthy",
  degraded: "Degraded",
  error: "Error",
};

export function AgentStatusCard() {
  const setPendingApproval = useUiStore((state) => state.setPendingApproval);
  const { latestActivityLabel, suggestion } = useAgentChat();
  const { runningCount, lastActivityLabel, healthStatus, isLoading } = useAgentStatus();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      <Card className="glass-panel h-full rounded-sm text-foreground transition-colors sm:rounded-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardDescription className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                AI agent status
              </CardDescription>
              <CardTitle className="mt-2 text-2xl font-bold tracking-[-0.03em]">
                Active and inside all guardrails
              </CardTitle>
            </div>
            <PrivacyToggle enabled />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-sm border border-border bg-secondary p-4 transition-transform hover:scale-[1.02]">
              <p className="text-xs tracking-[0.18em] text-muted uppercase">Strategies</p>
              <p className="mt-2 text-lg font-semibold">
                {isLoading ? "—" : `${runningCount} running`}
              </p>
            </div>
            <div className="rounded-sm border border-border bg-secondary p-4 transition-transform hover:scale-[1.02]">
              <p className="text-xs tracking-[0.18em] text-muted uppercase">Last action</p>
              <p className="mt-2 text-lg font-semibold">{lastActivityLabel}</p>
            </div>
            <div className="rounded-sm border border-border bg-secondary p-4 transition-transform hover:scale-[1.02]">
              <p className="text-xs tracking-[0.18em] text-muted uppercase">Watch status</p>
              <p className="mt-2 text-lg font-semibold">{HEALTH_LABELS[healthStatus]}</p>
            </div>
          </div>

          <div className="rounded-sm border border-primary/15 bg-primary/8 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="size-4" />
              {suggestion.title}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              {suggestion.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button className="rounded-sm px-5">{suggestion.actionLabel}</Button>
              <Button
                variant="outline"
                className="rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated"
                onClick={() => setPendingApproval("approval-1")}
              >
                Approve path
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-sm border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="size-5 text-emerald-300" />
              <p className="text-sm text-muted">{latestActivityLabel}</p>
            </div>
            <Button variant="ghost" className="rounded-sm text-foreground hover:bg-surface-elevated">
              View activity
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
