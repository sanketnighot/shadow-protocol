//! Proactive background portfolio monitoring and risk alerting.

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
use super::anonymizer;
use super::tools;

const WATCHER_INTERVAL_SECS: u64 = 1800; // 30 minutes
const DEFAULT_OLLAMA_MODEL: &str = "llama3.2:3b";
const FIRST_RUN_LOG_DELAY_SECS: u64 = 5; // Delay first cycle to allow app to initialize

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
        // Delay first cycle to allow app initialization
        tokio::time::sleep(Duration::from_secs(FIRST_RUN_LOG_DELAY_SECS)).await;

        let mut timer = interval(Duration::from_secs(WATCHER_INTERVAL_SECS));
        let client = Client::new();
        let mut has_logged_skip = false;

        loop {
            timer.tick().await;

            match run_watcher_cycle(&app, &client).await {
                Ok(()) => {
                    has_logged_skip = false;
                }
                Err(e) => {
                    // Only log at error level for unexpected failures
                    // Use warn for expected failures (missing config, services unavailable)
                    if is_expected_failure(&e) {
                        if !has_logged_skip {
                            warn!("shadow_watcher skipped: {}", e);
                            has_logged_skip = true;
                        }
                    } else {
                        error!("shadow_watcher.cycle_failed: {}", e);
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
    lower.contains("missing perplexity api key")
        || lower.contains("missing api key")
        || lower.contains("not configured")
        || lower.contains("no wallet")
        || lower.contains("empty")
        || lower.contains("not running")
        || lower.contains("ollama not running")
        || lower.contains("connection refused")
        || lower.contains("timeout")
}

async fn run_watcher_cycle(app: &AppHandle, client: &Client) -> Result<(), String> {
    // 1. Get all wallet addresses
    let addresses = crate::commands::get_addresses(app);
    if addresses.is_empty() {
        return Err("No wallets configured".to_string());
    }

    // 2. Fetch current portfolio state from DB
    let addr_refs: Vec<&str> = addresses.iter().map(|s| s.as_str()).collect();
    let portfolio = tools::get_total_portfolio_value_multi(app, &addr_refs)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Identify top 3 assets to research
    let top_assets: Vec<String> = portfolio.breakdown.iter()
        .take(3)
        .map(|item| item.token.clone())
        .collect();

    if top_assets.is_empty() {
        return Err("Portfolio has no assets to monitor".to_string());
    }

    // 4. Anonymize portfolio for context
    let anon_context = anonymizer::sanitize_portfolio(&portfolio);

    for asset in top_assets {
        // 5. Query Sonar for recent news/risks (skip if API key not configured)
        let query = format!("Breaking news, exploits, or critical risk catalysts for {} in the last 24 hours.", asset);
        let news = match sonar_client::search(&query).await {
            Ok(n) => n,
            Err(e) => {
                // Don't fail the whole cycle for news - it's optional
                info!("shadow_watcher: Skipping news for {} - {}", asset, e);
                continue;
            }
        };

        // 6. Use Local Ollama to evaluate if this news warrants an alert
        let profile = profile_config(AiProfileId::RiskWatcher);
        let request = ai_kernel::AiKernelRequest {
            profile: AiProfileId::RiskWatcher,
            model: DEFAULT_OLLAMA_MODEL.to_string(),
            messages: vec![ai_kernel::AiKernelMessage {
                role: "user".to_string(),
                content: format!(
                    "Evaluate whether the following market news warrants an immediate portfolio alert.\n\nAnonymized portfolio:\n{}\n\nAsset: {}\n\nRecent news:\n{}",
                    anon_context, asset, news
                ),
            }],
            num_ctx: Some(profile.default_num_ctx),
            rolling_summary: None,
            structured_facts: None,
            agent_context: super::tool_router::AgentContext::default(),
        };
        let messages = ai_kernel::build_request_messages(app, &request);
        let eval_resp = match ollama_client::chat_with_settings(
            client,
            DEFAULT_OLLAMA_MODEL,
            &messages,
            ai_kernel::resolve_num_ctx(&request),
            profile.temperature,
            Some(risk_watcher_schema()),
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                // Don't fail the whole cycle for LLM errors - it's optional
                info!("shadow_watcher: Skipping LLM eval for {} - {}", asset, e);
                continue;
            }
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
    serde_json::from_str(text).ok()
}

fn risk_watcher_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "alert": { "type": "boolean" },
            "severity": { "type": "string" },
            "reason": { "type": "string" },
            "suggestion": { "type": "string" }
        },
        "required": ["alert", "severity", "reason", "suggestion"]
    })
}
