export function explorerUrl(chain: string, txHash: string): string {
  const base = chainToExplorerBase(chain);
  return `${base}/tx/${txHash}`;
}

export function explorerUrlForAddress(chain: string, address: string): string {
  const base = chainToExplorerBase(chain);
  return `${base}/address/${address}`;
}

function chainToExplorerBase(chain: string): string {
  const map: Record<string, string> = {
    ETH: "https://etherscan.io",
    BASE: "https://basescan.org",
    POL: "https://polygonscan.com",
    FLOW: "https://evm.flowscan.io",
    "ETH-SEP": "https://sepolia.etherscan.io",
    "BASE-SEP": "https://sepolia.basescan.org",
    "POL-AMOY": "https://amoy.polygonscan.com",
    "FLOW-TEST": "https://evm-testnet.flowscan.io",
  };
  return map[chain] ?? "https://etherscan.io";
}
