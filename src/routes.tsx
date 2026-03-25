import { createHashRouter } from "react-router-dom";

import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { AutomationCenter } from "@/components/automation/AutomationCenter";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { AppShell } from "@/components/layout/AppShell";
import { MarketView } from "@/components/market/MarketView";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { StrategyBuilder } from "@/components/strategy/StrategyBuilder";
import { AppsMarketplace } from "@/components/apps/AppsMarketplace";

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
        { path: "market", element: <MarketView /> },
        { path: "portfolio", element: <PortfolioView /> },
        { path: "apps", element: <AppsMarketplace /> },
        { path: "settings", element: <SettingsPage /> },
      ],
    },
  ]);
}
