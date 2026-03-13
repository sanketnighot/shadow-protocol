//! Portfolio balance fetching via Alchemy API. Requires ALCHEMY_API_KEY env var.

use crate::services::portfolio_service::{self, PortfolioAsset, PortfolioError};

#[tauri::command]
pub async fn portfolio_fetch_balances(address: String) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    portfolio_service::fetch_balances(&address).await
}

#[tauri::command]
pub async fn portfolio_fetch_balances_multi(
    addresses: Vec<String>,
) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    portfolio_service::fetch_balances_multi(&addresses).await
}
