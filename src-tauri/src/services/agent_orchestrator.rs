//! Agent orchestrator service for coordinating autonomous agent operations.
//!
//! Coordinates health monitoring, opportunity scanning, task generation,
//! and behavior learning into a unified autonomous workflow.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::commands;
use super::local_db;
use super::behavior_learner;
use super::guardrails;
use super::health_monitor;
use super::market_service;
use super::task_manager;

/// Orchestrator state.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorState {
    pub is_running: bool,
    pub last_check: Option<i64>,
    pub next_check: Option<i64>,
    pub tasks_generated: u32,
    pub opportunities_found: u32,
    pub health_checks_run: u32,
    pub errors: Vec<String>,
}

/// Reasoning step for transparent decision-making.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningStep {
    pub step_number: u32,
    pub action: String,
    pub input: serde_json::Value,
    pub output: serde_json::Value,
    pub reasoning: String,
    pub confidence: f64,
    pub duration_ms: u64,
}

/// Complete reasoning chain for a decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningChain {
    pub id: String,
    pub trigger: String,
    pub steps: Vec<ReasoningStep>,
    pub conclusion: String,
    pub final_decision: String,
    pub created_at: i64,
}

/// Orchestrator configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorConfig {
    pub check_interval_secs: u64,
    pub health_check_interval_secs: u64,
    pub opportunity_scan_interval_secs: u64,
    pub task_expiry_secs: u64,
    pub max_pending_tasks: u32,
    pub enable_autonomous: bool,
}

impl Default for OrchestratorConfig {
    fn default() -> Self {
        Self {
            check_interval_secs: 300, // 5 minutes
            health_check_interval_secs: 3600, // 1 hour
            opportunity_scan_interval_secs: 1800, // 30 minutes
            task_expiry_secs: 900, // 15 minutes
            max_pending_tasks: 10,
            enable_autonomous: true,
        }
    }
}

/// Global orchestrator instance.
static ORCHESTRATOR_RUNNING: AtomicBool = AtomicBool::new(false);
static ORCHESTRATOR_STATE: Lazy<Arc<RwLock<OrchestratorState>>> =
    Lazy::new(|| Arc::new(RwLock::new(OrchestratorState::default())));
static ORCHESTRATOR_CONFIG: Lazy<Arc<RwLock<OrchestratorConfig>>> =
    Lazy::new(|| Arc::new(RwLock::new(OrchestratorConfig::default())));

/// Start the autonomous agent orchestrator.
pub async fn start_orchestrator(app: AppHandle) -> Result<(), String> {
    if ORCHESTRATOR_RUNNING.load(Ordering::SeqCst) {
        return Err("Orchestrator is already running".to_string());
    }

    // Check if autonomous mode is enabled in guardrails
    let config = guardrails::load_config();

    if config.emergency_kill_switch {
        return Err("Kill switch is active - cannot start orchestrator".to_string());
    }

    ORCHESTRATOR_RUNNING.store(true, Ordering::SeqCst);

    // Update state
    {
        let mut state = ORCHESTRATOR_STATE.write().await;
        state.is_running = true;
        state.errors.clear();
    }
    emit_orchestrator_state(&app).await;

    info!("orchestrator.started");

    // Spawn the main loop
    tokio::spawn(async move {
        run_orchestrator_loop(app).await;
    });

    Ok(())
}

/// Stop the orchestrator.
pub async fn stop_orchestrator(app: Option<&AppHandle>) -> Result<(), String> {
    ORCHESTRATOR_RUNNING.store(false, Ordering::SeqCst);

    {
        let mut state = ORCHESTRATOR_STATE.write().await;
        state.is_running = false;
    }

    if let Some(app) = app {
        emit_orchestrator_state(app).await;
    }

    info!("orchestrator.stopped");
    Ok(())
}

/// Get current orchestrator state.
pub async fn get_state() -> OrchestratorState {
    ORCHESTRATOR_STATE.read().await.clone()
}

/// Update orchestrator configuration.
#[allow(dead_code)]
pub async fn update_config(config: OrchestratorConfig) -> Result<(), String> {
    let mut current = ORCHESTRATOR_CONFIG.write().await;
    *current = config;
    Ok(())
}

/// Main orchestrator loop.
async fn run_orchestrator_loop(app: AppHandle) {
    let mut last_health_check: i64 = 0;
    let mut last_opportunity_scan: i64 = 0;

    while ORCHESTRATOR_RUNNING.load(Ordering::SeqCst) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let config = ORCHESTRATOR_CONFIG.read().await.clone();

        // Check if autonomous mode is enabled
        if !config.enable_autonomous {
            tokio::time::sleep(Duration::from_secs(60)).await;
            continue;
        }

        // Check for kill switch
        let guardrail_config = guardrails::load_config();
        if guardrail_config.emergency_kill_switch {
            warn!("orchestrator.kill_switch_detected");
            ORCHESTRATOR_RUNNING.store(false, Ordering::SeqCst);
            break;
        }

        // Run health check if interval elapsed
        if now - last_health_check > config.health_check_interval_secs as i64 {
            match run_health_check_cycle(&app).await {
                Ok(_) => {
                    last_health_check = now;
                    let mut state = ORCHESTRATOR_STATE.write().await;
                    state.health_checks_run += 1;
                }
                Err(e) => {
                    warn!(error = e.as_str(), "orchestrator.health_check_failed");
                    let mut state = ORCHESTRATOR_STATE.write().await;
                    state.errors.push(format!("Health check: {}", e));
                }
            }
        }

        // Run opportunity scan if interval elapsed
        if now - last_opportunity_scan > config.opportunity_scan_interval_secs as i64 {
            match run_opportunity_scan_cycle(&app).await {
                Ok(count) => {
                    last_opportunity_scan = now;
                    let mut state = ORCHESTRATOR_STATE.write().await;
                    state.opportunities_found += count;
                }
                Err(e) => {
                    warn!(error = e.as_str(), "orchestrator.opportunity_scan_failed");
                    let mut state = ORCHESTRATOR_STATE.write().await;
                    state.errors.push(format!("Opportunity scan: {}", e));
                }
            }
        }

        // Run task generation cycle
        match run_task_generation_cycle(&app).await {
            Ok(count) => {
                let mut state = ORCHESTRATOR_STATE.write().await;
                state.tasks_generated += count;
                state.last_check = Some(now);
                state.next_check = Some(now + config.check_interval_secs as i64);
            }
            Err(e) => {
                warn!(error = e.as_str(), "orchestrator.task_generation_failed");
                let mut state = ORCHESTRATOR_STATE.write().await;
                state.errors.push(format!("Task generation: {}", e));
            }
        }

        emit_orchestrator_state(&app).await;

        // Sleep until next cycle
        tokio::time::sleep(Duration::from_secs(config.check_interval_secs)).await;
    }

    // Clear running state on exit
    let mut state = ORCHESTRATOR_STATE.write().await;
    state.is_running = false;
    drop(state);
    emit_orchestrator_state(&app).await;
}

/// Run health check cycle.
async fn run_health_check_cycle(app: &AppHandle) -> Result<(), String> {
    info!("orchestrator.health_check_start");
    let context = load_portfolio_context(app).await?;
    let summary = health_monitor::run_health_check(
        &context.holdings,
        &context.targets,
        context.total_value_usd,
    )?;

    info!(
        overall_score = summary.overall_score,
        alert_count = summary.alerts.len(),
        "orchestrator.health_check_complete"
    );

    Ok(())
}

/// Run opportunity scan cycle.
async fn run_opportunity_scan_cycle(app: &AppHandle) -> Result<u32, String> {
    info!("orchestrator.opportunity_scan_start");
    let addresses = commands::get_addresses(app);
    let refresh = market_service::refresh_opportunities(
        Some(app),
        market_service::MarketRefreshInput {
            include_research: Some(true),
            wallet_addresses: Some(addresses.clone()),
            force: Some(true),
        },
    )
    .await?;

    let matches = market_service::fetch_opportunities(market_service::MarketFetchInput {
        category: None,
        chain: None,
        include_research: Some(true),
        wallet_addresses: Some(addresses),
        limit: Some(10),
    })
    .await?;

    info!(
        count = matches.items.len(),
        refreshed = refresh.item_count,
        "orchestrator.opportunities_found"
    );

    Ok(matches.items.len() as u32)
}

/// Run task generation cycle.
async fn run_task_generation_cycle(app: &AppHandle) -> Result<u32, String> {
    info!("orchestrator.task_generation_start");

    // Check pending tasks limit
    let stats = task_manager::get_task_stats()?;
    let config = ORCHESTRATOR_CONFIG.read().await.clone();

    if stats.pending >= config.max_pending_tasks {
        info!(
            pending = stats.pending,
            max = config.max_pending_tasks,
            "orchestrator.task_limit_reached"
        );
        return Ok(0);
    }

    let addresses = commands::get_addresses(app);
    let context = load_portfolio_context(app).await?;

    let health = health_monitor::get_latest_health()?;

    // Build task context
    let (health_alerts, drift_analysis) = if let Some(ref h) = health {
        let alerts: Vec<health_monitor::HealthAlert> = serde_json::from_str(&h.alerts_json)
            .unwrap_or_default();
        let drift: Vec<health_monitor::DriftAnalysis> =
            serde_json::from_str(&h.drift_analysis_json).unwrap_or_default();
        (alerts, drift)
    } else {
        (vec![], vec![])
    };

    let opportunities = market_service::fetch_opportunities(market_service::MarketFetchInput {
        category: None,
        chain: None,
        include_research: Some(true),
        wallet_addresses: Some(addresses),
        limit: Some(10),
    })
    .await
    .map(|response| response.items)
    .unwrap_or_default();

    let ctx = task_manager::TaskContext {
        portfolio_value_usd: context.total_value_usd,
        health_alerts,
        drift_analysis,
        opportunities,
        user_preferences: behavior_learner::get_preferences_map(),
    };

    // Generate tasks
    let generated = task_manager::generate_tasks(&ctx)?;

    // Persist new tasks
    let mut created = 0;
    for gen in &generated {
        if stats.pending + created >= config.max_pending_tasks {
            break;
        }

        if let Err(e) = task_manager::create_task(&gen.task) {
            warn!(task_id = gen.task.id.as_str(), error = e.as_str(), "orchestrator.task_create_failed");
        } else {
            created += 1;

            // Store reasoning chain
            store_reasoning_chain(gen).await;
            let _ = app.emit("autonomous_task_created", serde_json::json!({
                "taskId": gen.task.id,
                "title": gen.task.title,
            }));
        }
    }

    info!(created, "orchestrator.tasks_generated");

    Ok(created)
}

#[derive(Debug, Clone)]
struct LivePortfolioContext {
    total_value_usd: f64,
    holdings: Vec<health_monitor::AssetHolding>,
    targets: Vec<health_monitor::TargetAllocation>,
}

async fn load_portfolio_context(app: &AppHandle) -> Result<LivePortfolioContext, String> {
    let addresses = commands::get_addresses(app);
    if addresses.is_empty() {
        return Err("No wallets are connected".to_string());
    }

    let assets = commands::portfolio_fetch_balances_multi(addresses, app.clone())
        .await
        .map_err(|e| e.to_string())?;

    let mut by_symbol_chain: HashMap<(String, String), f64> = HashMap::new();
    let mut total_value_usd = 0.0;

    for asset in assets {
        let value = parse_money(&asset.value_usd);
        if value <= 0.0 {
            continue;
        }
        total_value_usd += value;
        *by_symbol_chain
            .entry((asset.symbol.clone(), normalize_market_chain(&asset.chain).to_string()))
            .or_insert(0.0) += value;
    }

    if total_value_usd <= 0.0 {
        return Err("No portfolio value available for orchestrator analysis".to_string());
    }

    let holdings = by_symbol_chain
        .into_iter()
        .map(|((symbol, chain), value_usd)| health_monitor::AssetHolding {
            symbol: symbol.clone(),
            value_usd,
            percentage: (value_usd / total_value_usd) * 100.0,
            chain,
            is_stablecoin: is_stable_symbol(&symbol),
        })
        .collect::<Vec<_>>();
    let targets = derive_target_allocations(&holdings);

    Ok(LivePortfolioContext {
        total_value_usd,
        holdings,
        targets,
    })
}

fn derive_target_allocations(
    holdings: &[health_monitor::AssetHolding],
) -> Vec<health_monitor::TargetAllocation> {
    if holdings.is_empty() {
        return Vec::new();
    }

    let stablecoin_symbols = holdings
        .iter()
        .filter(|holding| holding.is_stablecoin)
        .map(|holding| holding.symbol.clone())
        .collect::<Vec<_>>();
    let non_stable_symbols = holdings
        .iter()
        .filter(|holding| !holding.is_stablecoin)
        .map(|holding| holding.symbol.clone())
        .collect::<Vec<_>>();

    let stable_target_total = if stablecoin_symbols.is_empty() {
        0.0
    } else {
        30.0
    };
    let non_stable_total = 100.0 - stable_target_total;

    let stable_each = if stablecoin_symbols.is_empty() {
        0.0
    } else {
        stable_target_total / stablecoin_symbols.len() as f64
    };
    let non_stable_each = if non_stable_symbols.is_empty() {
        0.0
    } else {
        non_stable_total / non_stable_symbols.len() as f64
    };

    holdings
        .iter()
        .map(|holding| health_monitor::TargetAllocation {
            symbol: holding.symbol.clone(),
            target_pct: if holding.is_stablecoin {
                stable_each
            } else {
                non_stable_each
            },
        })
        .collect()
}

fn normalize_market_chain(chain_code: &str) -> &'static str {
    match chain_code {
        "ETH" | "ETH-SEP" => "ethereum",
        "BASE" | "BASE-SEP" => "base",
        "POL" | "POL-AMOY" => "polygon",
        "FLOW" | "FLOW-EVM" | "FLOW-TEST" | "FLOW-EVM-TEST" => "flow",
        _ => "multi_chain",
    }
}

fn is_stable_symbol(symbol: &str) -> bool {
    matches!(
        symbol.to_ascii_uppercase().as_str(),
        "USDC" | "USDT" | "DAI" | "USDE" | "FDUSD" | "USDBC"
    )
}

fn parse_money(raw: &str) -> f64 {
    raw.chars()
        .filter(|ch| ch.is_ascii_digit() || *ch == '.' || *ch == '-')
        .collect::<String>()
        .parse::<f64>()
        .unwrap_or(0.0)
}

async fn emit_orchestrator_state(app: &AppHandle) {
    let state = get_state().await;
    let _ = app.emit("autonomous_orchestrator_updated", state);
}

/// Store reasoning chain for a generated task.
async fn store_reasoning_chain(generated: &task_manager::GeneratedTask) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let steps = vec![
        ReasoningStep {
            step_number: 1,
            action: "analyze_portfolio".to_string(),
            input: serde_json::json!({}),
            output: serde_json::json!({ "source": generated.source_reason }),
            reasoning: "Analyzed portfolio state and identified potential actions".to_string(),
            confidence: generated.confidence,
            duration_ms: 0,
        },
        ReasoningStep {
            step_number: 2,
            action: "match_preferences".to_string(),
            input: serde_json::json!({}),
            output: serde_json::json!({
                "category": generated.task.category,
                "priority": generated.task.priority,
            }),
            reasoning: format!(
                "Matched against user preferences with {:.0}% confidence",
                generated.confidence * 100.0
            ),
            confidence: generated.confidence,
            duration_ms: 0,
        },
        ReasoningStep {
            step_number: 3,
            action: "generate_task".to_string(),
            input: serde_json::json!({}),
            output: serde_json::json!({
                "title": generated.task.title,
            }),
            reasoning: generated.task.reasoning.recommendation.clone(),
            confidence: generated.confidence,
            duration_ms: 0,
        },
    ];

    let chain = ReasoningChain {
        id: uuid::Uuid::new_v4().to_string(),
        trigger: generated.source_reason.clone(),
        steps,
        conclusion: generated.task.summary.clone(),
        final_decision: format!(
            "Generated {} priority task: {}",
            generated.task.priority,
            generated.task.title
        ),
        created_at: now,
    };

    // Store in database using existing schema
    let record = local_db::ReasoningChainRecord {
        id: chain.id.clone(),
        source_type: "task".to_string(),
        source_id: generated.task.id.clone(),
        trigger: chain.trigger.clone(),
        data_sources_json: serde_json::to_string(&chain.steps).unwrap_or_else(|_| "[]".to_string()),
        rules_applied_json: "{}".to_string(),
        confidence: generated.confidence,
        alternatives_json: "[]".to_string(),
        final_recommendation: chain.final_decision.clone(),
        created_at: now,
    };

    if let Err(e) = local_db::insert_reasoning_chain(&record) {
        warn!(error = %e, "orchestrator.reasoning_chain_failed");
    }
}

/// Get reasoning chain for a task.
pub fn get_reasoning_chain(task_id: &str) -> Result<Option<ReasoningChain>, String> {
    let record = local_db::get_reasoning_chain("task", task_id)
        .map_err(|e| format!("Failed to get reasoning chain: {}", e))?;

    match record {
        Some(r) => {
            let steps: Vec<ReasoningStep> = serde_json::from_str(&r.data_sources_json)
                .unwrap_or_default();

            Ok(Some(ReasoningChain {
                id: r.id,
                trigger: r.trigger,
                steps,
                conclusion: String::new(),
                final_decision: r.final_recommendation,
                created_at: r.created_at,
            }))
        }
        None => Ok(None),
    }
}

/// Generate a one-time analysis on demand.
pub async fn analyze_now(app: &AppHandle) -> Result<AnalysisResult, String> {
    let mut result = AnalysisResult::default();

    // Run health check
    match run_health_check_cycle(app).await {
        Ok(_) => {
            result.health_check_completed = true;
            if let Some(summary) = health_monitor::get_latest_health()? {
                result.health_score = Some(summary.overall_score);
                let alerts: Vec<health_monitor::HealthAlert> =
                    serde_json::from_str(&summary.alerts_json).unwrap_or_default();
                result.alert_count = alerts.len();
            }
        }
        Err(e) => {
            result.errors.push(format!("Health check: {}", e));
        }
    }

    // Run opportunity scan
    match run_opportunity_scan_cycle(app).await {
        Ok(count) => {
            result.opportunity_scan_completed = true;
            result.opportunities_found = count;
        }
        Err(e) => {
            result.errors.push(format!("Opportunity scan: {}", e));
        }
    }

    match run_task_generation_cycle(app).await {
        Ok(_) => {}
        Err(e) => {
            result.errors.push(format!("Task generation: {}", e));
        }
    }

    // Get pending tasks
    match task_manager::get_pending_tasks() {
        Ok(tasks) => {
            result.pending_tasks = tasks.len() as u32;
        }
        Err(e) => {
            result.errors.push(format!("Get tasks: {}", e));
        }
    }

    Ok(result)
}

/// On-demand analysis result.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub health_check_completed: bool,
    pub health_score: Option<f64>,
    pub alert_count: usize,
    pub opportunity_scan_completed: bool,
    pub opportunities_found: u32,
    pub pending_tasks: u32,
    pub errors: Vec<String>,
}

/// Check if the orchestrator is running.
#[allow(dead_code)]
pub fn is_running() -> bool {
    ORCHESTRATOR_RUNNING.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = OrchestratorConfig::default();
        assert!(config.check_interval_secs > 0);
        assert!(config.enable_autonomous);
    }

    #[test]
    fn test_analysis_result_default() {
        let result = AnalysisResult::default();
        assert!(!result.health_check_completed);
        assert_eq!(result.opportunities_found, 0);
    }
}
