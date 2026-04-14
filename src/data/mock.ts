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
      type: "strategyProposal";
      proposal: {
        name: string;
        summary: string;
        trigger: any;
        action: any;
        guardrails: any;
      };
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
  metadata?: {
    hidden?: boolean;
  };
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

export type Asset = {
  id: string;
  symbol: string;
  chain: string;
  chainName: string;
  balance: string;
  valueUsd: string;
  type: "token" | "stablecoin" | "native";
  /** Address of wallet that holds this asset (for filtering by wallet). */
  walletAddress?: string;
  /** Empty for native token, contract address for ERC20. */
  tokenContract?: string;
  decimals?: number;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", description: "Portfolio pulse" },
  { href: "/agent", label: "Agent", description: "DeFi intelligence" },
  { href: "/strategy", label: "Build", description: "Strategy canvas" },
  { href: "/automation", label: "Automate", description: "Running systems" },
  { href: "/market", label: "Market", description: "Opportunities & yields" },
  { href: "/portfolio", label: "Portfolio", description: "Cross-chain assets" },
  { href: "/settings", label: "Account", description: "Profile & preferences" },
];

export const QUICK_ACTIONS: QuickAction[] = [
  { label: "Send", description: "Move assets fast" },
  { label: "Swap", description: "Route best execution" },
  { label: "Strategy", description: "Deploy guardrails" },
  { label: "Report", description: "Review performance" },
];
