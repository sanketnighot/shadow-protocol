import { invoke } from "@tauri-apps/api/core";

import type {
  MarketFetchInput,
  MarketOpportunitiesResponse,
  MarketOpportunity,
  MarketOpportunityDetail,
  MarketPrepareOpportunityActionInput,
  MarketPrepareOpportunityActionResult,
  MarketRefreshInput,
  MarketRefreshResult,
} from "@/types/market";
import { useAgentThreadStore } from "@/store/useAgentThreadStore";
export { hasTauriRuntime } from "@/lib/tauri";

export async function fetchMarketOpportunities(
  input: MarketFetchInput,
): Promise<MarketOpportunitiesResponse> {
  return invoke<MarketOpportunitiesResponse>("market_fetch_opportunities", {
    input: {
      category: input.category ?? null,
      chain: input.chain ?? null,
      includeResearch: input.includeResearch ?? true,
      walletAddresses: input.walletAddresses ?? [],
      limit: input.limit ?? 24,
    },
  });
}

export async function refreshMarketOpportunities(
  input: MarketRefreshInput,
): Promise<MarketRefreshResult> {
  return invoke<MarketRefreshResult>("market_refresh_opportunities", {
    input: {
      includeResearch: input.includeResearch ?? true,
      walletAddresses: input.walletAddresses ?? [],
      force: input.force ?? true,
    },
  });
}

export async function getMarketOpportunityDetail(
  opportunityId: string,
): Promise<MarketOpportunityDetail> {
  return invoke<MarketOpportunityDetail>("market_get_opportunity_detail", {
    input: { opportunityId },
  });
}

export async function prepareMarketOpportunityAction(
  input: MarketPrepareOpportunityActionInput,
): Promise<MarketPrepareOpportunityActionResult> {
  return invoke<MarketPrepareOpportunityActionResult>(
    "market_prepare_opportunity_action",
    {
      input,
    },
  );
}

export function marketChainLabel(chain: string): string {
  switch (chain) {
    case "all":
      return "All";
    case "ethereum":
      return "Ethereum";
    case "base":
      return "Base";
    case "polygon":
      return "Polygon";
    case "multi_chain":
      return "Multi-chain";
    default:
      return chain;
  }
}

export function marketCategoryLabel(category: string): string {
  switch (category) {
    case "all":
      return "All";
    case "yield":
      return "Yield";
    case "spread_watch":
      return "Spread Watch";
    case "rebalance":
      return "Rebalance";
    case "catalyst":
      return "Catalyst";
    default:
      return category;
  }
}

export function marketActionabilityLabel(actionability: string): string {
  switch (actionability) {
    case "approval_ready":
      return "Approval Ready";
    case "agent_ready":
      return "Agent Ready";
    case "research_only":
      return "Research Only";
    default:
      return actionability;
  }
}

export function launchPreparedMarketAction(
  opportunity: MarketOpportunity,
  result: MarketPrepareOpportunityActionResult,
): string | null {
  if (result.kind === "approvalRequired") {
    useAgentThreadStore.getState().openMarketApprovalThread({
      title: opportunity.title,
      message: result.message,
      toolName: result.toolName,
      payload: result.payload,
      approvalId: result.approvalId,
      expectedVersion: result.expectedVersion,
    });
    return "/agent";
  }

  if (result.kind === "agentDraft") {
    useAgentThreadStore
      .getState()
      .startThreadWithDraft(result.title, result.prompt);
    return "/agent";
  }

  return null;
}
