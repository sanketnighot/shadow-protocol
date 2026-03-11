import { createHashRouter } from "react-router-dom";

import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { AutomationCenter } from "@/components/automation/AutomationCenter";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { AppShell } from "@/components/layout/AppShell";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { StrategyBuilder } from "@/components/strategy/StrategyBuilder";

function ComingSoonPage() {
  return (
    <div className="glass-panel rounded-[32px] border border-white/10 p-8">
      <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
        Coming soon
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-foreground">
        This workspace is reserved for the next phase.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
        Strategy builder, automation center, and deeper market tooling are planned next. The navigation stays visible so the product structure remains clear while phase one focuses on the dashboard and agent experience.
      </p>
    </div>
  );
}

export function createAppRouter() {
  return createHashRouter([
    {
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, element: <HomeDashboard /> },
        { path: "agent", element: <AgentWorkspace /> },
        { path: "strategy", element: <StrategyBuilder /> },
        { path: "automation", element: <AutomationCenter /> },
        { path: "portfolio", element: <PortfolioView /> },
        { path: "settings", element: <ComingSoonPage /> },
      ],
    },
  ]);
}
