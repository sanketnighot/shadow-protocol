export type MarketOpportunityCategory =
  | "yield"
  | "spread_watch"
  | "rebalance"
  | "catalyst";

export type MarketOpportunityActionability =
  | "approval_ready"
  | "agent_ready"
  | "research_only";

export type MarketOpportunityRisk = "low" | "medium" | "high";

export type MarketOpportunityMetric = {
  label: string;
  value: string;
  kind: string;
};

export type MarketPortfolioFit = {
  hasRequiredAsset: boolean;
  walletCoverage: string;
  guardrailFit: boolean;
  relevanceReasons: string[];
};

export type MarketPrimaryAction = {
  kind: "open_detail" | "prepare_action" | "open_agent";
  label: string;
  enabled: boolean;
  reasonDisabled?: string | null;
};

export type MarketOpportunityCompactDetails = {
  thesis: string[];
  notes: string[];
};

export type MarketOpportunity = {
  id: string;
  title: string;
  summary: string;
  category: MarketOpportunityCategory;
  chain: string;
  protocol?: string | null;
  symbols: string[];
  risk: MarketOpportunityRisk;
  confidence: number;
  score: number;
  actionability: MarketOpportunityActionability;
  freshUntil?: number | null;
  stale: boolean;
  sourceCount: number;
  sourceLabels: string[];
  metrics: MarketOpportunityMetric[];
  portfolioFit: MarketPortfolioFit;
  primaryAction: MarketPrimaryAction;
  details: MarketOpportunityCompactDetails;
};

export type MarketFetchInput = {
  category?: string;
  chain?: string;
  includeResearch?: boolean;
  walletAddresses?: string[];
  limit?: number;
};

export type MarketOpportunitiesResponse = {
  items: MarketOpportunity[];
  generatedAt: number;
  nextRefreshAt: number;
  stale: boolean;
  availableChains: string[];
  availableCategories: string[];
};

export type MarketOpportunitySource = {
  label: string;
  url?: string | null;
  note?: string | null;
  capturedAt?: number | null;
};

export type MarketRankingBreakdown = {
  globalScore: number;
  personalScore: number;
  totalScore: number;
  reasons: string[];
};

export type MarketOpportunityDetail = {
  opportunity: MarketOpportunity;
  sources: MarketOpportunitySource[];
  rankingBreakdown: MarketRankingBreakdown;
  guardrailNotes: string[];
  executionReadinessNotes: string[];
};

export type MarketPrepareOpportunityActionInput = {
  opportunityId: string;
};

export type MarketPrepareOpportunityActionResult =
  | {
      kind: "approvalRequired";
      approvalId: string;
      toolName: string;
      message: string;
      payload: Record<string, unknown>;
      expectedVersion: number;
    }
  | {
      kind: "agentDraft";
      title: string;
      prompt: string;
    }
  | {
      kind: "detailOnly";
      reason: string;
    };

export type MarketRefreshInput = {
  includeResearch?: boolean;
  walletAddresses?: string[];
  force?: boolean;
};

export type MarketRefreshResult = {
  itemCount: number;
  generatedAt: number;
  stale: boolean;
};
