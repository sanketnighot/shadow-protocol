//! Shared chain/network mapping for portfolio, transfer, and swap.

#[allow(dead_code)]
pub const SUPPORTED_CHAINS: &[&str] = &["ETH", "BASE", "POL", "ETH-SEP", "BASE-SEP", "POL-AMOY"];

pub fn chain_to_network(chain: &str) -> Option<&'static str> {
    match chain {
        "ETH" => Some("eth-mainnet"),
        "BASE" => Some("base-mainnet"),
        "POL" => Some("polygon-mainnet"),
        "ETH-SEP" => Some("eth-sepolia"),
        "BASE-SEP" => Some("base-sepolia"),
        "POL-AMOY" => Some("polygon-amoy"),
        _ => None,
    }
}

pub fn network_to_chain_display(network: &str) -> (&'static str, &'static str) {
    let normalized = network.trim().to_lowercase().replace('_', "-");
    match normalized.as_str() {
        "eth-mainnet" => ("Ethereum", "ETH"),
        "base-mainnet" => ("Base", "BASE"),
        "polygon-mainnet" | "matic-mainnet" => ("Polygon", "POL"),
        "eth-sepolia" => ("Ethereum Sepolia", "ETH-SEP"),
        "base-sepolia" => ("Base Sepolia", "BASE-SEP"),
        "polygon-amoy" | "matic-amoy" => ("Polygon Amoy", "POL-AMOY"),
        _ => ("Unknown", "Unknown"),
    }
}
