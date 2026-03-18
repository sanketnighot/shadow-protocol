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
    }
  | {
      type: "toolResult";
      toolName: string;
      content: string;
    }
  | {
      type: "decisionResult";
      insights: Record<string, unknown>;
      decision: Record<string, unknown>;
      simulated: boolean;
    }
  | {
      type: "approvalRequest";
      toolName: string;
      payload: unknown;
      message: string;
    };

export type AgentMessage = {
  id: string;
  role: "user" | "agent";
  blocks: AgentMessageBlock[];
};

export type ApprovalTransaction = {
  id: string;
  strategyId: string;
  action: string;
  amount: string;
  chain: string;
  slippage: string;
  gas: string;
  reason: string;
  executionWindow: string;
};

export type MarketOpportunity = {
  id: string;
  title: string;
  summary: string;
  apy: string;
  tvl: string;
  risk: string;
  chain: string;
  category: "yield" | "arbitrage" | "rebalance";
  actionLabel: string;
};

export type ActiveStrategy = {
  id: string;
  name: string;
  summary: string;
  nextRun: string;
  executedCount: number;
  progress: number;
  status: "running" | "monitoring" | "paused";
};

export type Asset = {
  id: string;
  symbol: string;
  chain: string;
  chainName: string;
  balance: string;
  valueUsd: string;
  type: "token" | "stablecoin";
  /** Address of wallet that holds this asset (for filtering by wallet). */
  walletAddress?: string;
  /** Empty for native token, contract address for ERC20. */
  tokenContract?: string;
  decimals?: number;
};

export type StrategyTemplateNode = {
  id: string;
  type: "trigger" | "condition" | "action";
  title: string;
  subtitle: string;
  position: { x: number; y: number };
};

export type StrategyTemplateEdge = {
  id: string;
  source: string;
  target: string;
};

export type GuardrailDefaults = {
  maxTradeUsd: string;
  stopBelowPortfolioUsd: string;
  requireApprovalAboveUsd: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", description: "Portfolio pulse" },
  { href: "/agent", label: "Agent", description: "DeFi intelligence" },
  // { href: "/strategy", label: "Strategy", description: "Builder canvas" },
  { href: "/automation", label: "Auto", description: "Running systems" },
  { href: "/market", label: "Market", description: "Opportunities & yields" },
  { href: "/portfolio", label: "Portfolio", description: "Cross-chain assets" },
  { href: "/settings", label: "Account", description: "Profile & preferences" },
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

export const PENDING_APPROVAL_TX: ApprovalTransaction = {
  id: "approval-1",
  strategyId: "weekly-dca",
  action: "Swap USDC → ETH",
  amount: "500 USDC (~0.175 ETH)",
  chain: "Arbitrum",
  slippage: "0.5%",
  gas: "~$0.42",
  reason: "ETH price dipped below your target $2,850. Executing DCA strategy as planned.",
  executionWindow: "30 seconds",
};

export const ACTIVE_STRATEGIES: ActiveStrategy[] = [
  {
    id: "weekly-dca",
    name: "Weekly DCA",
    summary: "Buys ETH every Monday at 9:00 AM when risk posture stays green.",
    nextRun: "Today 9:00 AM",
    executedCount: 12,
    progress: 67,
    status: "running",
  },
  {
    id: "arb-hunter",
    name: "Arbitrage Hunter",
    summary: "Monitors Base and Arbitrum routing for spread-based opportunities.",
    nextRun: "Live monitoring",
    executedCount: 3,
    progress: 42,
    status: "monitoring",
  },
  {
    id: "privacy-rebalance",
    name: "Privacy Rebalance",
    summary: "Keeps stablecoin exposure between 35% and 45% with approval guardrails.",
    nextRun: "Tomorrow 8:30 AM",
    executedCount: 8,
    progress: 81,
    status: "paused",
  },
];

export const MARKET_OPPORTUNITIES: MarketOpportunity[] = [
  {
    id: "market-aave-arb",
    title: "Aave V3 on Arbitrum",
    summary: "Low-risk USDC lending with strong liquidity and stable utilization.",
    apy: "4.2%",
    tvl: "$1.2B",
    risk: "Low",
    chain: "Arbitrum",
    category: "yield",
    actionLabel: "Deploy $500",
  },
  {
    id: "market-base-spread",
    title: "WETH spread on Base",
    summary: "Temporary 1.8% divergence versus Arbitrum routing with room to execute privately.",
    apy: "1.8%",
    tvl: "$82M",
    risk: "Medium",
    chain: "Base",
    category: "arbitrage",
    actionLabel: "Review route",
  },
  {
    id: "market-stable-rebalance",
    title: "Stablecoin rebalance",
    summary: "Reduce Solana USDC concentration and restore your 40% stablecoin target.",
    apy: "Policy",
    tvl: "$12.3k",
    risk: "Low",
    chain: "Multi-chain",
    category: "rebalance",
    actionLabel: "Preview plan",
  },
];

export const STRATEGY_TEMPLATE_NODES: StrategyTemplateNode[] = [
  {
    id: "trigger-1",
    type: "trigger",
    title: "Every Monday",
    subtitle: "09:00 UTC",
    position: { x: 0, y: 60 },
  },
  {
    id: "condition-1",
    type: "condition",
    title: "If ETH < $3,000",
    subtitle: "Trend and spread check",
    position: { x: 280, y: 60 },
  },
  {
    id: "action-1",
    type: "action",
    title: "Buy $100 ETH",
    subtitle: "Private execution",
    position: { x: 560, y: 60 },
  },
];

export const STRATEGY_TEMPLATE_EDGES: StrategyTemplateEdge[] = [
  { id: "edge-1", source: "trigger-1", target: "condition-1" },
  { id: "edge-2", source: "condition-1", target: "action-1" },
];

export const GUARDRAIL_DEFAULTS: GuardrailDefaults = {
  maxTradeUsd: "1000",
  stopBelowPortfolioUsd: "5000",
  requireApprovalAboveUsd: "500",
};
