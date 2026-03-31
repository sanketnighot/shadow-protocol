/** Mirrors Rust command payloads/responses */

export type CreateWalletResult = {
  address: string;
  mnemonic: string;
};

export type ImportWalletResult = {
  address: string;
};

export type WalletListResult = {
  addresses: string[];
};

export type RemoveWalletResult = {
  success: boolean;
};

export type PortfolioAsset = {
  id: string;
  symbol: string;
  chain: string;
  chainName: string;
  balance: string;
  valueUsd: string;
  type: "token" | "stablecoin" | "native";
  tokenContract: string;
  decimals: number;
  walletAddress?: string | null;
  unifiedBalanceNote?: string | null;
  flowCrossVmBridgeEligible?: boolean | null;
};

export type PortfolioSnapshotPoint = {
  timestamp: number;
  totalUsd: string;
  netFlowUsd: string;
  performanceUsd: string;
  walletBreakdown: Array<{ wallet: string; valueUsd: string }>;
  chainBreakdown: Array<{ chain: string; valueUsd: string }>;
  topAssets: Array<{ symbol: string; valueUsd: string }>;
};

export type PortfolioPerformanceSummary = {
  currentTotalUsd: string;
  changeUsd: string;
  changePct: string;
  netFlowUsd: string;
  performanceUsd: string;
};

export type PortfolioPerformanceRange = {
  range: "1D" | "7D" | "30D" | "90D" | "1Y" | "ALL";
  points: PortfolioSnapshotPoint[];
  summary: PortfolioPerformanceSummary;
  allocationActual: Array<{ symbol: string; percentage: string; valueUsd: string }>;
  allocationTarget: Array<{ symbol: string; percentage: string }>;
  walletAttribution: Array<{ wallet: string; valueUsd: string; percentage: string }>;
};
