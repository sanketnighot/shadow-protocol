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
use tokio::sync::RwLock;
use tracing::{info, warn};

use super::local_db;
use super::behavior_learner;
use super::guardrails;
use super::health_monitor;
use super::opportunity_scanner;
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
pub async fn start_orchestrator() -> Result<(), String> {
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

    info!("orchestrator.started");

    // Spawn the main loop
    tokio::spawn(async move {
        run_orchestrator_loop().await;
    });

    Ok(())
}

/// Stop the orchestrator.
pub async fn stop_orchestrator() -> Result<(), String> {
    ORCHESTRATOR_RUNNING.store(false, Ordering::SeqCst);

    {
        let mut state = ORCHESTRATOR_STATE.write().await;
        state.is_running = false;
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
async fn run_orchestrator_loop() {
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
            match run_health_check_cycle().await {
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
            match run_opportunity_scan_cycle().await {
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
        match run_task_generation_cycle().await {
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

        // Sleep until next cycle
        tokio::time::sleep(Duration::from_secs(config.check_interval_secs)).await;
    }

    // Clear running state on exit
    let mut state = ORCHESTRATOR_STATE.write().await;
    state.is_running = false;
}

/// Run health check cycle.
async fn run_health_check_cycle() -> Result<(), String> {
    info!("orchestrator.health_check_start");

    // In production, this would fetch actual portfolio data
    // For now, use placeholder data
    let holdings = vec![
        health_monitor::AssetHolding {
            symbol: "ETH".to_string(),
            value_usd: 5000.0,
            percentage: 50.0,
            chain: "ethereum".to_string(),
            is_stablecoin: false,
        },
        health_monitor::AssetHolding {
            symbol: "USDC".to_string(),
            value_usd: 3000.0,
            percentage: 30.0,
            chain: "ethereum".to_string(),
            is_stablecoin: true,
        },
        health_monitor::AssetHolding {
            symbol: "POL".to_string(),
            value_usd: 2000.0,
            percentage: 20.0,
            chain: "polygon".to_string(),
            is_stablecoin: false,
        },
    ];

    let targets = vec![
        health_monitor::TargetAllocation {
            symbol: "ETH".to_string(),
            target_pct: 40.0,
        },
        health_monitor::TargetAllocation {
            symbol: "USDC".to_string(),
            target_pct: 40.0,
        },
        health_monitor::TargetAllocation {
            symbol: "POL".to_string(),
            target_pct: 20.0,
        },
    ];

    let summary = health_monitor::run_health_check(&holdings, &targets, 10000.0)?;

    info!(
        overall_score = summary.overall_score,
        alert_count = summary.alerts.len(),
        "orchestrator.health_check_complete"
    );

    Ok(())
}

/// Run opportunity scan cycle.
async fn run_opportunity_scan_cycle() -> Result<u32, String> {
    info!("orchestrator.opportunity_scan_start");

    let config = opportunity_scanner::ScannerConfig::default();

    let portfolio = opportunity_scanner::PortfolioContext {
        total_value_usd: 10000.0,
        holdings: vec![
            opportunity_scanner::HoldingInfo {
                symbol: "ETH".to_string(),
                value_usd: 5000.0,
                chain: "ethereum".to_string(),
            },
            opportunity_scanner::HoldingInfo {
                symbol: "USDC".to_string(),
                value_usd: 3000.0,
                chain: "ethereum".to_string(),
            },
            opportunity_scanner::HoldingInfo {
                symbol: "POL".to_string(),
                value_usd: 2000.0,
                chain: "polygon".to_string(),
            },
        ],
        chain_distribution: {
            let mut map = HashMap::new();
            map.insert("ethereum".to_string(), 80.0);
            map.insert("polygon".to_string(), 20.0);
            map
        },
        stablecoin_pct: 30.0,
    };

    let matches = opportunity_scanner::scan_opportunities(&portfolio, &config)?;

    info!(count = matches.len(), "orchestrator.opportunities_found");

    Ok(matches.len() as u32)
}

/// Run task generation cycle.
async fn run_task_generation_cycle() -> Result<u32, String> {
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

    // Get latest health check
    let health = health_monitor::get_latest_health()?;

    // Build task context
    let (health_alerts, drift_analysis) = if let Some(ref h) = health {
        let alerts: Vec<health_monitor::HealthAlert> = serde_json::from_str(&h.alerts_json)
            .unwrap_or_default();
        let _recommendations = &h.recommendations_json;
        (alerts, vec![]) // Would parse drift from recommendations
    } else {
        (vec![], vec![])
    };

    let ctx = task_manager::TaskContext {
        portfolio_value_usd: 10000.0,
        health_alerts,
        drift_analysis,
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
        }
    }

    info!(created, "orchestrator.tasks_generated");

    Ok(created)
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
pub async fn analyze_now() -> Result<AnalysisResult, String> {
    let mut result = AnalysisResult::default();

    // Run health check
    match run_health_check_cycle().await {
        Ok(_) => {
            result.health_check_completed = true;
            if let Some(summary) = health_monitor::get_latest_health()? {
                result.health_score = Some(summary.overall_score);
                result.alert_count = summary.alerts_json.matches("\"").count() / 2;
            }
        }
        Err(e) => {
            result.errors.push(format!("Health check: {}", e));
        }
    }

    // Run opportunity scan
    match run_opportunity_scan_cycle().await {
        Ok(count) => {
            result.opportunity_scan_completed = true;
            result.opportunities_found = count;
        }
        Err(e) => {
            result.errors.push(format!("Opportunity scan: {}", e));
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
