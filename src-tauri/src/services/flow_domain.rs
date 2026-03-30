//! Flow integration domain: **Cadence-native Flow** vs **Flow EVM** (Alchemy / COA / EOA).
//!
//! - Cadence accounts use an 8-byte address (16 hex digits, optional `0x`). They are not
//!   Ethereum-style EOAs and must not be sent through EVM-only portfolio or explorer paths.
//! - Flow EVM uses standard `0x` + 20-byte hex addresses and EVM explorers (e.g. evm.flowscan).
//!
//! Portfolio and tooling should tag holdings by surface (`FLOW` / `FLOW-TEST` for Cadence reads
//! from the sidecar; `FLOW-EVM` / `FLOW-EVM-TEST` for Alchemy Flow EVM token data).

/// True if `address` looks like a Cadence Flow account address (16 hex chars, optional `0x`).
pub fn is_cadence_flow_address(address: &str) -> bool {
    let addr = address.strip_prefix("0x").unwrap_or(address);
    addr.len() == 16 && addr.chars().all(|c| c.is_ascii_hexdigit())
}

/// True if `address` looks like an EVM-style 20-byte hex address (`0x` + 40 hex).
pub fn is_flow_evm_style_address(address: &str) -> bool {
    let a = address.trim();
    a.starts_with("0x") && a.len() == 42 && a[2..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Before `FLOW-EVM` / `FLOW-EVM-TEST` chain codes, Alchemy Flow EVM balances were stored as
/// `FLOW` / `FLOW-TEST` in SQLite. Remap using wallet shape so portfolio filters match.
/// Normalize for comparison: Cadence account key = 16 lowercase hex (no `0x`).
pub fn cadence_account_key(address: &str) -> Option<String> {
    let t = address.trim();
    if !is_cadence_flow_address(t) {
        return None;
    }
    let s = t.strip_prefix("0x").unwrap_or(t);
    Some(s.to_ascii_lowercase())
}

pub fn normalize_stored_wallet_token_chain(chain: &str, wallet_address: &str) -> String {
    let c = chain.trim();
    if is_flow_evm_style_address(wallet_address) {
        match c {
            "FLOW" => "FLOW-EVM".to_string(),
            "FLOW-TEST" => "FLOW-EVM-TEST".to_string(),
            _ => c.to_string(),
        }
    } else {
        c.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cadence_address_detection() {
        assert!(is_cadence_flow_address("0x1111111111111111"));
        assert!(is_cadence_flow_address("1111111111111111"));
        assert!(!is_cadence_flow_address(
            "0x1111111111111111111111111111111111111111"
        ));
        assert!(!is_cadence_flow_address(""));
    }

    #[test]
    fn flow_evm_address_detection() {
        assert!(is_flow_evm_style_address(
            "0x1111111111111111111111111111111111111111"
        ));
        assert!(!is_flow_evm_style_address("0x1111"));
    }

    #[test]
    fn legacy_sqlite_flow_evm_chain_remapped() {
        let w = "0x1111111111111111111111111111111111111111";
        assert_eq!(
            normalize_stored_wallet_token_chain("FLOW-TEST", w),
            "FLOW-EVM-TEST"
        );
        assert_eq!(normalize_stored_wallet_token_chain("FLOW", w), "FLOW-EVM");
        assert_eq!(
            normalize_stored_wallet_token_chain("FLOW-EVM-TEST", w),
            "FLOW-EVM-TEST"
        );
    }

    #[test]
    fn cadence_chain_not_remapped_for_evm_codes() {
        let cadence = "0x1111111111111111";
        assert_eq!(
            normalize_stored_wallet_token_chain("FLOW-TEST", cadence),
            "FLOW-TEST"
        );
    }

    #[test]
    fn cadence_account_key_normalizes() {
        assert_eq!(
            cadence_account_key("0xAbCdEf0123456789").as_deref(),
            Some("abcdef0123456789")
        );
        assert_eq!(cadence_account_key("0x1111111111111111111111111111111111111111"), None);
    }
}
