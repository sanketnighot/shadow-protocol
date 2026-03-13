//! Swap tool (WRITE — requires user approval). Phase 1: preview/prepare only.
//! Full execution depends on swap backend; this provides approval-ready payload.

use serde::{Deserialize, Serialize};

use crate::services::chain;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapPreview {
    pub from_token: String,
    pub to_token: String,
    pub amount: String,
    pub estimated_output: String,
    pub chain: String,
    pub slippage: String,
    pub gas_estimate: String,
}

/// Validate swap params and produce a preview. Does not execute.
/// Returns a struct suitable for approval UI.
pub fn prepare_swap_preview(
    from_token: &str,
    to_token: &str,
    amount: &str,
    chain_param: &str,
    slippage_pct: Option<f64>,
) -> Result<SwapPreview, String> {
    let from = from_token.trim().to_uppercase();
    let to = to_token.trim().to_uppercase();
    let amount_s = amount.trim();
    let chain_s = chain_param.trim().to_uppercase();

    if from.is_empty() || to.is_empty() {
        return Err("Missing token".to_string());
    }
    let amount_val: f64 = amount_s.parse().map_err(|_| "Invalid amount".to_string())?;
    if !amount_val.is_finite() || amount_val <= 0.0 {
        return Err("Amount must be positive".to_string());
    }

    let _ = chain::chain_to_network(&chain_s).ok_or_else(|| format!("Unsupported chain: {chain_s}"))?;

    let slippage = slippage_pct.unwrap_or(0.5);
    let slippage_s = format!("{:.1}%", slippage);

    Ok(SwapPreview {
        from_token: from.clone(),
        to_token: to.clone(),
        amount: format!("{} {}", amount_val, from),
        estimated_output: format!("~0 (quote needed) {}", to),
        chain: chain_s,
        slippage: slippage_s,
        gas_estimate: "~$0.50".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::prepare_swap_preview;

    #[test]
    fn prepare_swap_validates_chain() {
        let err = prepare_swap_preview("USDC", "ETH", "100", "INVALID", None);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Unsupported chain"));
    }

    #[test]
    fn prepare_swap_validates_amount() {
        let err = prepare_swap_preview("USDC", "ETH", "invalid", "ETH", None);
        assert!(err.is_err());
    }

    #[test]
    fn prepare_swap_returns_preview_for_valid_input() {
        let p = prepare_swap_preview("USDC", "ETH", "100", "ETH", Some(1.0)).unwrap();
        assert_eq!(p.from_token, "USDC");
        assert_eq!(p.to_token, "ETH");
        assert_eq!(p.chain, "ETH");
        assert_eq!(p.slippage, "1.0%");
    }
}
