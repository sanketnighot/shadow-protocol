export function explorerUrl(chain: string, txHash: string): string {
  const base = chainToExplorerBase(chain);
  if (chain === "FIL-CAL") {
    return `${base}/message/${txHash}`;
  }
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
    /** Cadence-native Flow (portfolio sidecar) */
    FLOW: "https://flowscan.org",
    /** Flow EVM (Alchemy `flow-mainnet`) */
    "FLOW-EVM": "https://evm.flowscan.io",
    "ETH-SEP": "https://sepolia.etherscan.io",
    "BASE-SEP": "https://sepolia.basescan.org",
    "POL-AMOY": "https://amoy.polygonscan.com",
    "FLOW-TEST": "https://testnet.flowscan.org",
    "FLOW-EVM-TEST": "https://evm-testnet.flowscan.io",
    "FIL-CAL": "https://calibration.filfox.info/en",
  };
  return map[chain] ?? "https://etherscan.io";
}
