use crate::services::market_actions;
use crate::services::market_service::{
    self, MarketFetchInput, MarketOpportunitiesResponse, MarketOpportunityDetail,
    MarketOpportunityDetailInput, MarketPrepareOpportunityActionInput,
    MarketPrepareOpportunityActionResult, MarketRefreshInput, MarketRefreshResult,
};

#[tauri::command]
pub async fn market_fetch_opportunities(
    input: MarketFetchInput,
) -> Result<MarketOpportunitiesResponse, String> {
    market_service::fetch_opportunities(input).await
}

#[tauri::command]
pub async fn market_refresh_opportunities(
    app: tauri::AppHandle,
    input: MarketRefreshInput,
) -> Result<MarketRefreshResult, String> {
    market_service::refresh_opportunities(Some(&app), input).await
}

#[tauri::command]
pub async fn market_get_opportunity_detail(
    input: MarketOpportunityDetailInput,
) -> Result<MarketOpportunityDetail, String> {
    market_service::get_opportunity_detail(input)
}

#[tauri::command]
pub async fn market_prepare_opportunity_action(
    input: MarketPrepareOpportunityActionInput,
) -> Result<MarketPrepareOpportunityActionResult, String> {
    market_actions::prepare_opportunity_action(input)
}
