//! Background service for daily market synthesis and alpha generation.

use tauri::{AppHandle, Emitter};
use std::time::Duration;
use tokio::time::interval;
use serde::Serialize;
use reqwest::Client;
use tracing::{error, warn, info};

use super::sonar_client;
use super::ollama_client;
use super::market_service::MarketOpportunity;
use crate::services::agent_state::{read_soul, read_memory};

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

    // 3. Read soul and memory for personalized context
    let soul = read_soul(app).unwrap_or_default();
    let memory = read_memory(app).unwrap_or_default();

    let memory_facts = if memory.facts.is_empty() {
        String::new()
    } else {
        let facts: Vec<String> = memory.facts.iter()
            .map(|f| format!("- {}", f.fact))
            .collect();
        format!("\n\nUser Profile & Memory Facts:\n{}", facts.join("\n"))
    };

    // 4. Synthesize using local LLM with personalized context
    let prompt = format!(
        "System: {}\n\nRisk Appetite: {}\nPreferred Chains: {}{}\n\nTask: Synthesize the news into a 2-sentence 'Daily Alpha Brief' for a user with the above profile and context.\nIf a specific trade is mentioned, generate a JSON opportunity.\n\nToday's Market News:\n{}\n\nOutput format (JSON ONLY):\n{{\"headline\": \"short title\", \"summary\": \"2 sentences\", \"opportunity\": null or {{\"type\": \"swap\", \"asset\": \"...\"}}}}",
        soul.persona,
        soul.risk_appetite,
        soul.preferred_chains.join(", "),
        memory_facts,
        news
    );

    let messages = vec![("user".into(), prompt)];
    let resp = match ollama_client::chat(client, model, &messages, Some(2048)).await {
        Ok(r) => r,
        Err(e) => return Err(format!("LLM synthesis failed with model {}: {}", model, e)),
    };

    if let Some(mut brief) = parse_brief(&resp) {
        if let Ok(opportunity) = super::market_service::top_cached_opportunity() {
            brief.opportunity_id = opportunity.as_ref().map(|item| item.id.clone());
            brief.opportunity = opportunity;
        }
        let _ = app.emit("shadow_brief", brief);
    }

    Ok(())
}

fn parse_brief(text: &str) -> Option<ShadowBrief> {
    let cleaned = if let Some(start) = text.find('{') {
        let end = text.rfind('}')?;
        &text[start..=end]
    } else {
        text
    };

    // In a real app, we'd map this to ShadowBrief properly
    serde_json::from_str(cleaned).ok()
}
