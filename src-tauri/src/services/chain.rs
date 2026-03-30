//! Shared chain/network mapping for portfolio, transfer, and swap.

#[allow(dead_code)]
pub const SUPPORTED_CHAINS: &[&str] = &[
    "ETH", "BASE", "POL", "FLOW", "FLOW-EVM", "ETH-SEP", "BASE-SEP", "POL-AMOY", "FLOW-TEST",
    "FLOW-EVM-TEST",
];

pub fn chain_to_network(chain: &str) -> Option<&'static str> {
    match chain {
        "ETH" => Some("eth-mainnet"),
        "BASE" => Some("base-mainnet"),
        "POL" => Some("polygon-mainnet"),
        "FLOW" => Some("flow-mainnet"),
        "FLOW-EVM" => Some("flow-mainnet"),
        "ETH-SEP" => Some("eth-sepolia"),
        "BASE-SEP" => Some("base-sepolia"),
        "POL-AMOY" => Some("polygon-amoy"),
        "FLOW-TEST" => Some("flow-testnet"),
        "FLOW-EVM-TEST" => Some("flow-testnet"),
        _ => None,
    }
}

pub fn chain_code_to_display(chain: &str) -> &'static str {
    match chain {
        "ETH" => "Ethereum",
        "BASE" => "Base",
        "POL" => "Polygon",
        "FLOW" => "Flow (Cadence)",
        "FLOW-EVM" => "Flow EVM",
        "ETH-SEP" => "Ethereum Sepolia",
        "BASE-SEP" => "Base Sepolia",
        "POL-AMOY" => "Polygon Amoy",
        "FLOW-TEST" => "Flow Testnet (Cadence)",
        "FLOW-EVM-TEST" => "Flow EVM Testnet",
        _ => "Unknown",
    }
}

/// Block / transaction explorer base for **Cadence-native** Flow (not Flow EVM).
pub fn chain_to_cadence_explorer_base(chain: &str) -> &'static str {
    match chain {
        "FLOW" => "https://flowscan.org",
        "FLOW-TEST" => "https://testnet.flowscan.org",
        _ => "https://flowscan.org",
    }
}

/// EVM explorer base for **Flow EVM** (Alchemy `flow-mainnet` / `flow-testnet` assets).
pub fn chain_to_flow_evm_explorer_base(chain: &str) -> &'static str {
    match chain {
        "FLOW-EVM" => "https://evm.flowscan.io",
        "FLOW-EVM-TEST" => "https://evm-testnet.flowscan.io",
        _ => "https://evm.flowscan.io",
    }
}

pub fn chain_to_explorer_base(chain: &str) -> &'static str {
    match chain {
        "ETH" => "https://etherscan.io",
        "BASE" => "https://basescan.org",
        "POL" => "https://polygonscan.com",
        "FLOW" => chain_to_cadence_explorer_base("FLOW"),
        "FLOW-EVM" => chain_to_flow_evm_explorer_base("FLOW-EVM"),
        "ETH-SEP" => "https://sepolia.etherscan.io",
        "BASE-SEP" => "https://sepolia.basescan.org",
        "POL-AMOY" => "https://amoy.polygonscan.com",
        "FLOW-TEST" => chain_to_cadence_explorer_base("FLOW-TEST"),
        "FLOW-EVM-TEST" => chain_to_flow_evm_explorer_base("FLOW-EVM-TEST"),
        _ => "https://etherscan.io",
    }
}

pub fn network_to_chain_display(network: &str) -> (&'static str, &'static str) {
    let normalized = network
        .trim()
        .to_lowercase()
        .replace('_', "-")
        .replace(' ', "");
    match normalized.as_str() {
        "eth-mainnet" => ("Ethereum", "ETH"),
        "base-mainnet" => ("Base", "BASE"),
        "polygon-mainnet" | "matic-mainnet" => ("Polygon", "POL"),
        // Alchemy / portfolio APIs may use several slugs for Flow EVM.
        "flow-mainnet" | "flow-evm-mainnet" | "flowevm-mainnet" => ("Flow EVM", "FLOW-EVM"),
        "eth-sepolia" => ("Ethereum Sepolia", "ETH-SEP"),
        "base-sepolia" => ("Base Sepolia", "BASE-SEP"),
        "polygon-amoy" | "matic-amoy" => ("Polygon Amoy", "POL-AMOY"),
        "flow-testnet" | "flow-evm-testnet" | "flowevm-testnet" => {
            ("Flow EVM Testnet", "FLOW-EVM-TEST")
        }
        _ => ("Unknown", "Unknown"),
    }
}

#[cfg(test)]
mod tests {
    use super::network_to_chain_display;

    #[test]
    fn flow_evm_testnet_slug_variants() {
        for slug in [
            "flow-testnet",
            "flow-evm-testnet",
            "flowevm-testnet",
            "FLOW_TESTNET",
        ] {
            let (_, code) = network_to_chain_display(slug);
            assert_eq!(code, "FLOW-EVM-TEST", "slug={slug}");
        }
    }
}
