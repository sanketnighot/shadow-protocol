import {
  ASSETS,
  PORTFOLIO_CHAINS,
  PORTFOLIO_SERIES,
  QUICK_ACTIONS,
} from "@/data/mock";

export function usePortfolio() {
  return {
    totalValueLabel: "$12,345.67",
    dailyChangeLabel: "+2.3% (24h)",
    chains: PORTFOLIO_CHAINS,
    series: PORTFOLIO_SERIES,
    quickActions: QUICK_ACTIONS,
    assets: ASSETS,
  };
}
