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
  type: "token" | "stablecoin";
  tokenContract: string;
  decimals: number;
  walletAddress?: string | null;
};
