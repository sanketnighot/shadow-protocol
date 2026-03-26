//! Proactive background portfolio monitoring and risk alerting.

use tauri::{AppHandle, Emitter};
use std::time::Duration;
use tokio::time::interval;
use serde::Serialize;
use reqwest::Client;
use tracing::error;

use super::sonar_client;
use super::ollama_client;
use super::anonymizer;
use super::tools;

const WATCHER_INTERVAL_SECS: u64 = 1800; // 30 minutes
const DEFAULT_OLLAMA_MODEL: &str = "llama3.2:3b";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAlert {
    pub title: String,
    pub message: String,
    pub severity: String, // "info", "warning", "critical"
    pub asset: Option<String>,
    pub suggestion: Option<String>,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut timer = interval(Duration::from_secs(WATCHER_INTERVAL_SECS));
        let client = Client::new();

        loop {
            timer.tick().await;
            
            if let Err(e) = run_watcher_cycle(&app, &client).await {
                error!("shadow_watcher.cycle_failed: {}", e);
            }
        }
    });
}

async fn run_watcher_cycle(app: &AppHandle, client: &Client) -> Result<(), String> {
    // 1. Get all wallet addresses
    let addresses = crate::commands::get_addresses(app);
    if addresses.is_empty() {
        return Ok(());
    }

    // 2. Fetch current portfolio state from DB
    let addr_refs: Vec<&str> = addresses.iter().map(|s| s.as_str()).collect();
    let portfolio = tools::get_total_portfolio_value_multi(&addr_refs)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Identify top 3 assets to research
    let top_assets: Vec<String> = portfolio.breakdown.iter()
        .take(3)
        .map(|item| item.token.clone())
        .collect();

    if top_assets.is_empty() {
        return Ok(());
    }

    // 4. Anonymize portfolio for context
    let anon_context = anonymizer::sanitize_portfolio(&portfolio);

    for asset in top_assets {
        // 5. Query Sonar for recent news/risks
        let query = format!("Breaking news, exploits, or critical risk catalysts for {} in the last 24 hours.", asset);
        let news = match sonar_client::search(&query).await {
            Ok(n) => n,
            Err(_) => continue, // Skip if news fails
        };

        // 6. Use Local Ollama to evaluate if this news warrants an alert
        let eval_prompt = format!(
            "System: You are an autonomous risk evaluator.
Context:
User Portfolio:
{}

Recent News for {}:
{}

Task: Determine if this news represents a significant risk to the user's position that requires an immediate alert.
Rules:
- If news is minor or positive, do NOT alert.
- If news involves exploits, major liquidations, or critical bearish catalysts, output an ALERT.
- Be concise.

Output format (JSON ONLY):
{{\"alert\": true/false, \"severity\": \"warning/critical\", \"reason\": \"short reason\", \"suggestion\": \"short action\"}}"
        , anon_context, asset, news);

        let messages = vec![("user".into(), eval_prompt)];
        let eval_resp = match ollama_client::chat(client, DEFAULT_OLLAMA_MODEL, &messages, Some(4096)).await {
            Ok(r) => r,
            Err(_) => continue,
        };

        // Parse local LLM decision
        if let Some(decision) = parse_eval_decision(&eval_resp) {
            if decision.alert {
                let _ = app.emit("shadow_alert", ShadowAlert {
                    title: format!("Shadow Alert: {}", asset),
                    message: decision.reason,
                    severity: decision.severity,
                    asset: Some(asset),
                    suggestion: Some(decision.suggestion),
                });
            }
        }
    }

    Ok(())
}

#[derive(serde::Deserialize)]
struct EvalDecision {
    alert: bool,
    severity: String,
    reason: String,
    suggestion: String,
}

fn parse_eval_decision(text: &str) -> Option<EvalDecision> {
    let cleaned = if let Some(start) = text.find('{') {
        let end = text.rfind('}')?;
        &text[start..=end]
    } else {
        text
    };
    serde_json::from_str(cleaned).ok()
}
