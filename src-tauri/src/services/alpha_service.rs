//! Background service for daily market synthesis and alpha generation.

use tauri::{AppHandle, Emitter};
use std::time::Duration;
use tokio::time::interval;
use serde::Serialize;
use reqwest::Client;
use tracing::error;

use super::sonar_client;
use super::ollama_client;

const ALPHA_INTERVAL_SECS: u64 = 86400; // 24 hours

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowBrief {
    pub headline: String,
    pub summary: String,
    pub opportunity_payload: Option<serde_json::Value>,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut timer = interval(Duration::from_secs(ALPHA_INTERVAL_SECS));
        let client = Client::new();

        loop {
            timer.tick().await;
            
            if let Err(e) = run_alpha_cycle(&app, &client).await {
                error!("alpha_service.cycle_failed: {}", e);
            }
        }
    });
}

async fn run_alpha_cycle(app: &AppHandle, client: &Client) -> Result<(), String> {
    // 1. Check Ollama status and get available models
    let status = crate::commands::check_ollama_status().await?;
    if !status.running || status.models.is_empty() {
        return Err("Ollama not running or no models installed".into());
    }

    // Use the first available model (ideally we would pull the user's preference from settings)
    let model = status.models.get(0).ok_or("No models available")?;

    // 2. Web research for general market alpha
    let query = "Top 3 DeFi yield opportunities and critical market catalysts today.";
    let news = match sonar_client::search(query).await {
        Ok(n) => n,
        Err(_) => "No market news available.".into(),
    };

    // 3. Synthesize using local LLM
    let prompt = format!(
        "System: You are an elite market strategist.
News:
{}

Task: Synthesize the news into a 2-sentence 'Daily Alpha Brief' for a high-net-worth user. 
If a specific trade is mentioned, generate a JSON opportunity.

Output format (JSON ONLY):
{{\"headline\": \"short title\", \"summary\": \"2 sentences\", \"opportunity\": null or {{\"type\": \"swap\", \"asset\": \"...\"}}}}",
        news
    );

    let messages = vec![("user".into(), prompt)];
    let resp = match ollama_client::chat(client, model, &messages, Some(2048)).await {
        Ok(r) => r,
        Err(e) => return Err(format!("LLM synthesis failed with model {}: {}", model, e)),
    };

    if let Some(brief) = parse_brief(&resp) {
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
