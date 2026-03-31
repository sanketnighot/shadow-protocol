//! Background service for daily market synthesis and alpha generation.

use tauri::{AppHandle, Emitter};
use std::time::Duration;
use tokio::time::interval;
use serde::Serialize;
use reqwest::Client;
use tracing::{error, warn, info};

use super::ai_kernel;
use super::ai_profiles::{profile_config, AiProfileId};
use super::sonar_client;
use super::ollama_client;
use super::market_service::MarketOpportunity;

const ALPHA_INTERVAL_SECS: u64 = 86400; // 24 hours
const FIRST_RUN_LOG_DELAY_SECS: u64 = 10; // Delay first cycle

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowBrief {
    pub headline: String,
    pub summary: String,
    pub opportunity_id: Option<String>,
    pub opportunity: Option<MarketOpportunity>,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Delay first cycle to allow app initialization
        tokio::time::sleep(Duration::from_secs(FIRST_RUN_LOG_DELAY_SECS)).await;

        let mut timer = interval(Duration::from_secs(ALPHA_INTERVAL_SECS));
        let client = Client::new();
        let mut has_logged_skip = false;

        loop {
            timer.tick().await;

            match run_alpha_cycle(&app, &client).await {
                Ok(()) => {
                    has_logged_skip = false;
                }
                Err(e) => {
                    if is_expected_failure(&e) {
                        if !has_logged_skip {
                            warn!("alpha_service skipped: {}", e);
                            has_logged_skip = true;
                        }
                    } else {
                        error!("alpha_service.cycle_failed: {}", e);
                        has_logged_skip = false;
                    }
                }
            }
        }
    });
}

/// Check if an error is an "expected" failure that doesn't need ERROR level logging
fn is_expected_failure(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("not running")
        || lower.contains("no models")
        || lower.contains("missing perplexity api key")
        || lower.contains("missing api key")
        || lower.contains("not configured")
        || lower.contains("connection refused")
        || lower.contains("timeout")
}

async fn run_alpha_cycle(app: &AppHandle, client: &Client) -> Result<(), String> {
    // 1. Check Ollama status and get available models
    let status = crate::commands::check_ollama_status().await?;
    if !status.running || status.models.is_empty() {
        return Err("Ollama not running or no models installed".to_string());
    }

    // Use the first available model (ideally we would pull the user's preference from settings)
    let model = status.models.first().ok_or("No models available")?;

    // 2. Web research for general market alpha
    let query = "Top 3 DeFi yield opportunities and critical market catalysts today.";
    let news = match sonar_client::search(query).await {
        Ok(n) => n,
        Err(e) => {
            info!("alpha_service: Skipping market research - {}", e);
            // Continue without news - it's optional for the brief
            String::new()
        }
    };

    let profile = profile_config(AiProfileId::AlphaBrief);
    let request = ai_kernel::AiKernelRequest {
        profile: AiProfileId::AlphaBrief,
        model: model.to_string(),
        messages: vec![ai_kernel::AiKernelMessage {
            role: "user".to_string(),
            content: format!(
                "Synthesize today's market research into a concise daily alpha brief.\n\nMarket research:\n{}",
                news
            ),
        }],
        num_ctx: Some(profile.default_num_ctx.min(4096)),
        rolling_summary: None,
        structured_facts: None,
        agent_context: super::tool_router::AgentContext::default(),
    };
    let messages = ai_kernel::build_request_messages(app, &request);
    let resp = match ollama_client::chat_with_settings(
        client,
        model,
        &messages,
        ai_kernel::resolve_num_ctx(&request),
        profile.temperature,
        Some(alpha_brief_schema()),
    )
    .await
    {
        Ok(r) => r,
        Err(e) => return Err(format!("LLM synthesis failed with model {}: {}", model, e)),
    };

    let mut brief = parse_brief(&resp).ok_or_else(|| "Invalid alpha brief JSON".to_string())?;
    if let Ok(opportunity) = super::market_service::top_cached_opportunity() {
        brief.opportunity_id = opportunity.as_ref().map(|item| item.id.clone());
        brief.opportunity = opportunity;
    }
    let _ = app.emit("shadow_brief", brief);

    Ok(())
}

fn parse_brief(text: &str) -> Option<ShadowBrief> {
    serde_json::from_str(text).ok()
}

fn alpha_brief_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "headline": { "type": "string" },
            "summary": { "type": "string" }
        },
        "required": ["headline", "summary"]
    })
}
