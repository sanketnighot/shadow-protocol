export type NavItem = {
  href: string;
  label: string;
  description: string;
};

export type ChainBalance = {
  symbol: string;
  name: string;
  valueLabel: string;
  allocation: number;
};

export type PortfolioPoint = {
  day: string;
  value: number;
};

export type QuickAction = {
  label: string;
  description: string;
};

export type AgentSuggestion = {
  title: string;
  summary: string;
  actionLabel: string;
};

export type AgentMessageBlock =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "opportunity";
      title: string;
      apy: string;
      tvl: string;
      risk: string;
      actionLabel: string;
    };

export type AgentMessage = {
  id: string;
  role: "user" | "agent";
  blocks: AgentMessageBlock[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", description: "Portfolio pulse" },
  { href: "/agent", label: "Agent", description: "DeFi intelligence" },
  { href: "/automation", label: "Auto", description: "Coming soon" },
  { href: "/market", label: "Market", description: "Coming soon" },
  { href: "/settings", label: "Settings", description: "Coming soon" },
];

export const PORTFOLIO_CHAINS: ChainBalance[] = [
  { symbol: "ETH", name: "Ethereum", valueLabel: "$4.2k", allocation: 33 },
  { symbol: "ARB", name: "Arbitrum", valueLabel: "$3.1k", allocation: 24 },
  { symbol: "BASE", name: "Base", valueLabel: "$2.9k", allocation: 22 },
  { symbol: "SOL", name: "Solana", valueLabel: "$2.1k", allocation: 21 },
];

export const PORTFOLIO_SERIES: PortfolioPoint[] = [
  { day: "Mon", value: 10840 },
  { day: "Tue", value: 11150 },
  { day: "Wed", value: 11010 },
  { day: "Thu", value: 11440 },
  { day: "Fri", value: 11860 },
  { day: "Sat", value: 12180 },
  { day: "Sun", value: 12345 },
];

export const QUICK_ACTIONS: QuickAction[] = [
  { label: "Send", description: "Move assets fast" },
  { label: "Swap", description: "Route best execution" },
  { label: "Strategy", description: "Deploy guardrails" },
  { label: "Report", description: "Review performance" },
];

export const AGENT_SUGGESTION: AgentSuggestion = {
  title: "Arbitrage opportunity on Base",
  summary: "Base WETH pricing diverged 1.8% from Arbitrum with enough liquidity to act safely.",
  actionLabel: "Review details",
};

export const AGENT_MESSAGES: AgentMessage[] = [
  {
    id: "user-1",
    role: "user",
    blocks: [{ type: "text", content: "Find me the best yield for USDC" }],
  },
  {
    id: "agent-1",
    role: "agent",
    blocks: [
      {
        type: "text",
        content: "Analyzing 127 pools across 8 chains with your risk guardrails applied.",
      },
      {
        type: "opportunity",
        title: "Aave V3 on Arbitrum",
        apy: "4.2%",
        tvl: "$1.2B",
        risk: "Low",
        actionLabel: "Deploy $500",
      },
      {
        type: "text",
        content: "Would you like me to execute option 1 or surface two higher-risk alternatives?",
      },
    ],
  },
];
