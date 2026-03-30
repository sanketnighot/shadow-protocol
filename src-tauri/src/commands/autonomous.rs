//! Tauri commands for autonomous agent operations.
//!
//! Exposes guardrails, tasks, opportunities, health monitoring,
//! and orchestrator controls to the frontend.

use serde::{Deserialize, Serialize};

use crate::services::{
    agent_orchestrator, behavior_learner, guardrails, health_monitor,
    opportunity_scanner, task_manager,
};

// ============================================================================
// Guardrails Commands
// ============================================================================

#[derive(Debug, Serialize)]
pub struct GuardrailsResult {
    pub config: GuardrailsConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailsConfig {
    pub portfolio_floor_usd: Option<f64>,
    pub max_single_tx_usd: Option<f64>,
    pub daily_spend_limit_usd: Option<f64>,
    pub weekly_spend_limit_usd: Option<f64>,
    pub allowed_chains: Option<Vec<String>>,
    pub blocked_tokens: Option<Vec<String>>,
    pub blocked_protocols: Option<Vec<String>>,
    pub require_approval_above_usd: Option<f64>,
    pub max_slippage_bps: Option<u32>,
    pub emergency_kill_switch: bool,
}

impl From<guardrails::GuardrailConfig> for GuardrailsConfig {
    fn from(config: guardrails::GuardrailConfig) -> Self {
        Self {
            portfolio_floor_usd: config.portfolio_floor_usd,
            max_single_tx_usd: config.max_single_tx_usd,
            daily_spend_limit_usd: config.daily_spend_limit_usd,
            weekly_spend_limit_usd: config.weekly_spend_limit_usd,
            allowed_chains: config.allowed_chains,
            blocked_tokens: config.blocked_tokens,
            blocked_protocols: config.blocked_protocols,
            require_approval_above_usd: config.require_approval_above_usd,
            max_slippage_bps: config.max_slippage_bps,
            emergency_kill_switch: config.emergency_kill_switch,
        }
    }
}

impl From<GuardrailsConfig> for guardrails::GuardrailConfig {
    fn from(config: GuardrailsConfig) -> Self {
        Self {
            portfolio_floor_usd: config.portfolio_floor_usd,
            max_single_tx_usd: config.max_single_tx_usd,
            daily_spend_limit_usd: config.daily_spend_limit_usd,
            weekly_spend_limit_usd: config.weekly_spend_limit_usd,
            allowed_chains: config.allowed_chains,
            blocked_tokens: config.blocked_tokens,
            blocked_protocols: config.blocked_protocols,
            execution_time_windows: None,
            require_approval_above_usd: config.require_approval_above_usd,
            max_slippage_bps: config.max_slippage_bps,
            emergency_kill_switch: config.emergency_kill_switch,
        }
    }
}

#[tauri::command]
pub async fn get_guardrails() -> GuardrailsResult {
    let config = guardrails::load_config();
    GuardrailsResult {
        config: config.into(),
        error: None,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetGuardrailsInput {
    pub config: GuardrailsConfig,
}

#[derive(Debug, Serialize)]
pub struct SetGuardrailsResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub async fn set_guardrails(input: SetGuardrailsInput) -> SetGuardrailsResult {
    let config: guardrails::GuardrailConfig = input.config.into();
    match guardrails::save_config(&config) {
        Ok(_) => SetGuardrailsResult {
            success: true,
            error: None,
        },
        Err(e) => SetGuardrailsResult {
            success: false,
            error: Some(e),
        },
    }
}

#[derive(Debug, Serialize)]
pub struct KillSwitchResult {
    pub success: bool,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub async fn activate_kill_switch() -> KillSwitchResult {
    match guardrails::activate_kill_switch() {
        Ok(_) => KillSwitchResult {
            success: true,
            active: true,
            error: None,
        },
        Err(e) => KillSwitchResult {
            success: false,
            active: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn deactivate_kill_switch() -> KillSwitchResult {
    match guardrails::deactivate_kill_switch() {
        Ok(_) => KillSwitchResult {
            success: true,
            active: false,
            error: None,
        },
        Err(e) => KillSwitchResult {
            success: false,
            active: true,
            error: Some(e),
        },
    }
}

// ============================================================================
// Task Commands
// ============================================================================

#[derive(Debug, Serialize)]
pub struct TasksResult {
    pub tasks: Vec<TaskResponse>,
    pub stats: TaskStatsResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResponse {
    pub id: String,
    pub category: String,
    pub priority: String,
    pub status: String,
    pub title: String,
    pub summary: String,
    pub reasoning: TaskReasoningResponse,
    pub suggested_action: TaskActionResponse,
    pub confidence_score: f64,
    pub source_trigger: String,
    pub created_at: i64,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskReasoningResponse {
    pub trigger: String,
    pub analysis: String,
    pub recommendation: String,
    pub risk_factors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskActionResponse {
    pub action_type: String,
    pub chain: Option<String>,
    pub token_in: Option<String>,
    pub token_out: Option<String>,
    pub amount: Option<f64>,
    pub amount_usd: Option<f64>,
    pub target_address: Option<String>,
}

impl From<task_manager::Task> for TaskResponse {
    fn from(task: task_manager::Task) -> Self {
        Self {
            id: task.id,
            category: task.category,
            priority: task.priority,
            status: task.status,
            title: task.title,
            summary: task.summary,
            reasoning: TaskReasoningResponse {
                trigger: task.reasoning.trigger,
                analysis: task.reasoning.analysis,
                recommendation: task.reasoning.recommendation,
                risk_factors: task.reasoning.risk_factors,
            },
            suggested_action: TaskActionResponse {
                action_type: task.suggested_action.action_type,
                chain: task.suggested_action.chain,
                token_in: task.suggested_action.token_in,
                token_out: task.suggested_action.token_out,
                amount: task.suggested_action.amount,
                amount_usd: task.suggested_action.amount_usd,
                target_address: task.suggested_action.target_address,
            },
            confidence_score: task.confidence_score,
            source_trigger: task.source_trigger,
            created_at: task.created_at,
            expires_at: task.expires_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TaskStatsResponse {
    pub total: u32,
    pub pending: u32,
    pub approved: u32,
    pub rejected: u32,
    pub executing: u32,
    pub completed: u32,
    pub failed: u32,
    pub expired: u32,
}

impl From<task_manager::TaskStats> for TaskStatsResponse {
    fn from(stats: task_manager::TaskStats) -> Self {
        Self {
            total: stats.total,
            pending: stats.pending,
            approved: stats.approved,
            rejected: stats.rejected,
            executing: stats.executing,
            completed: stats.completed,
            failed: stats.failed,
            expired: stats.expired,
        }
    }
}

#[tauri::command]
pub async fn get_pending_tasks() -> TasksResult {
    let tasks = match task_manager::get_pending_tasks() {
        Ok(t) => t,
        Err(e) => {
            return TasksResult {
                tasks: vec![],
                stats: TaskStatsResponse::from(task_manager::TaskStats::default()),
                error: Some(e),
            }
        }
    };

    let stats = match task_manager::get_task_stats() {
        Ok(s) => s,
        Err(_) => task_manager::TaskStats::default(),
    };

    TasksResult {
        tasks: tasks.into_iter().map(TaskResponse::from).collect(),
        stats: TaskStatsResponse::from(stats),
        error: None,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskIdInput {
    pub task_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveTaskInput {
    pub task_id: String,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskActionResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<TaskResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub async fn approve_task(input: ApproveTaskInput) -> TaskActionResult {
    match task_manager::approve_task(&input.task_id, input.reason.as_deref()) {
        Ok(task) => TaskActionResult {
            success: true,
            task: Some(TaskResponse::from(task)),
            error: None,
        },
        Err(e) => TaskActionResult {
            success: false,
            task: None,
            error: Some(e),
        },
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectTaskInput {
    pub task_id: String,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn reject_task(input: RejectTaskInput) -> TaskActionResult {
    match task_manager::reject_task(&input.task_id, input.reason.as_deref()) {
        Ok(()) => TaskActionResult {
            success: true,
            task: None,
            error: None,
        },
        Err(e) => TaskActionResult {
            success: false,
            task: None,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn get_task_reasoning(input: TaskIdInput) -> ReasoningChainResult {
    match agent_orchestrator::get_reasoning_chain(&input.task_id) {
        Ok(Some(chain)) => ReasoningChainResult {
            chain: Some(ReasoningChainResponse::from(chain)),
            error: None,
        },
        Ok(None) => ReasoningChainResult {
            chain: None,
            error: None,
        },
        Err(e) => ReasoningChainResult {
            chain: None,
            error: Some(e),
        },
    }
}

// ============================================================================
// Health Monitoring Commands
// ============================================================================

#[derive(Debug, Serialize)]
pub struct HealthResult {
    pub health: Option<HealthSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSummary {
    pub overall_score: f64,
    pub drift_score: f64,
    pub concentration_score: f64,
    pub performance_score: f64,
    pub risk_score: f64,
    pub component_scores: Vec<ComponentScoreResponse>,
    pub alerts: Vec<HealthAlertResponse>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentScoreResponse {
    pub name: String,
    pub score: f64,
    pub weight: f64,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthAlertResponse {
    pub alert_type: String,
    pub severity: String,
    pub title: String,
    pub message: String,
    pub affected_assets: Vec<String>,
    pub recommended_action: Option<String>,
}

impl From<health_monitor::PortfolioHealthSummary> for HealthSummary {
    fn from(summary: health_monitor::PortfolioHealthSummary) -> Self {
        Self {
            overall_score: summary.overall_score,
            drift_score: summary.drift_score,
            concentration_score: summary.concentration_score,
            performance_score: summary.performance_score,
            risk_score: summary.risk_score,
            component_scores: summary.component_scores.into_iter().map(|c| ComponentScoreResponse {
                name: c.name,
                score: c.score,
                weight: c.weight,
                details: c.details,
            }).collect(),
            alerts: summary.alerts.into_iter().map(|a| HealthAlertResponse {
                alert_type: a.alert_type,
                severity: a.severity,
                title: a.title,
                message: a.message,
                affected_assets: a.affected_assets,
                recommended_action: a.recommended_action,
            }).collect(),
            recommendations: summary.recommendations,
        }
    }
}

#[tauri::command]
pub async fn get_portfolio_health() -> HealthResult {
    match health_monitor::get_latest_health() {
        Ok(Some(record)) => {
            let component_scores: Vec<health_monitor::ComponentScore> =
                serde_json::from_str(&record.component_scores_json).unwrap_or_default();
            let alerts: Vec<health_monitor::HealthAlert> =
                serde_json::from_str(&record.alerts_json).unwrap_or_default();
            let recommendations: Vec<String> =
                serde_json::from_str(&record.recommendations_json).unwrap_or_default();

            HealthResult {
                health: Some(HealthSummary {
                    overall_score: record.overall_score,
                    drift_score: record.drift_score,
                    concentration_score: record.concentration_score,
                    performance_score: record.performance_score,
                    risk_score: record.risk_score,
                    component_scores: component_scores.into_iter().map(|c| ComponentScoreResponse {
                        name: c.name,
                        score: c.score,
                        weight: c.weight,
                        details: c.details,
                    }).collect(),
                    alerts: alerts.into_iter().map(|a| HealthAlertResponse {
                        alert_type: a.alert_type,
                        severity: a.severity,
                        title: a.title,
                        message: a.message,
                        affected_assets: a.affected_assets,
                        recommended_action: a.recommended_action,
                    }).collect(),
                    recommendations,
                }),
                error: None,
            }
        }
        Ok(None) => HealthResult {
            health: None,
            error: Some("No health data available".to_string()),
        },
        Err(e) => HealthResult {
            health: None,
            error: Some(e),
        },
    }
}

// ============================================================================
// Opportunity Commands
// ============================================================================

#[derive(Debug, Serialize)]
pub struct OpportunitiesResult {
    pub opportunities: Vec<OpportunityMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpportunityMatch {
    pub id: String,
    pub opportunity_type: String,
    pub title: String,
    pub description: String,
    pub protocol: String,
    pub chain: String,
    pub tokens: Vec<String>,
    pub apy: Option<f64>,
    pub tvl_usd: Option<f64>,
    pub risk_level: String,
    pub match_score: f64,
    pub match_reasons: Vec<String>,
    pub recommended_action: Option<String>,
}

impl From<opportunity_scanner::MatchedOpportunity> for OpportunityMatch {
    fn from(m: opportunity_scanner::MatchedOpportunity) -> Self {
        Self {
            id: m.opportunity.id,
            opportunity_type: m.opportunity.opportunity_type,
            title: m.opportunity.title,
            description: m.opportunity.description,
            protocol: m.opportunity.protocol,
            chain: m.opportunity.chain,
            tokens: m.opportunity.tokens,
            apy: m.opportunity.apy,
            tvl_usd: m.opportunity.tvl_usd,
            risk_level: m.opportunity.risk_level,
            match_score: m.match_score,
            match_reasons: m.match_reasons,
            recommended_action: m.recommended_action,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct GetOpportunitiesInput {
    pub limit: Option<u32>,
}

#[tauri::command]
pub async fn get_opportunities(input: GetOpportunitiesInput) -> OpportunitiesResult {
    let limit = input.limit.unwrap_or(10);
    match opportunity_scanner::get_recent_matches(limit) {
        Ok(matches) => OpportunitiesResult {
            opportunities: matches.into_iter().map(OpportunityMatch::from).collect(),
            error: None,
        },
        Err(e) => OpportunitiesResult {
            opportunities: vec![],
            error: Some(e),
        },
    }
}

// ============================================================================
// Orchestrator Commands
// ============================================================================

#[derive(Debug, Serialize)]
pub struct OrchestratorStateResult {
    pub state: OrchestratorStateResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorStateResponse {
    pub is_running: bool,
    pub last_check: Option<i64>,
    pub next_check: Option<i64>,
    pub tasks_generated: u32,
    pub opportunities_found: u32,
    pub health_checks_run: u32,
    pub errors: Vec<String>,
}

impl From<agent_orchestrator::OrchestratorState> for OrchestratorStateResponse {
    fn from(state: agent_orchestrator::OrchestratorState) -> Self {
        Self {
            is_running: state.is_running,
            last_check: state.last_check,
            next_check: state.next_check,
            tasks_generated: state.tasks_generated,
            opportunities_found: state.opportunities_found,
            health_checks_run: state.health_checks_run,
            errors: state.errors,
        }
    }
}

#[tauri::command]
pub async fn get_orchestrator_state() -> OrchestratorStateResult {
    let state = agent_orchestrator::get_state().await;
    OrchestratorStateResult {
        state: OrchestratorStateResponse::from(state),
        error: None,
    }
}

#[derive(Debug, Serialize)]
pub struct OrchestratorControlResult {
    pub success: bool,
    pub is_running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub async fn start_autonomous() -> OrchestratorControlResult {
    match agent_orchestrator::start_orchestrator().await {
        Ok(_) => OrchestratorControlResult {
            success: true,
            is_running: true,
            error: None,
        },
        Err(e) => OrchestratorControlResult {
            success: false,
            is_running: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn stop_autonomous() -> OrchestratorControlResult {
    match agent_orchestrator::stop_orchestrator().await {
        Ok(_) => OrchestratorControlResult {
            success: true,
            is_running: false,
            error: None,
        },
        Err(e) => OrchestratorControlResult {
            success: false,
            is_running: true,
            error: Some(e),
        },
    }
}

#[derive(Debug, Serialize)]
pub struct AnalysisResult {
    pub health_check_completed: bool,
    pub health_score: Option<f64>,
    pub alert_count: usize,
    pub opportunity_scan_completed: bool,
    pub opportunities_found: u32,
    pub pending_tasks: u32,
    pub errors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl From<agent_orchestrator::AnalysisResult> for AnalysisResult {
    fn from(result: agent_orchestrator::AnalysisResult) -> Self {
        Self {
            health_check_completed: result.health_check_completed,
            health_score: result.health_score,
            alert_count: result.alert_count,
            opportunity_scan_completed: result.opportunity_scan_completed,
            opportunities_found: result.opportunities_found,
            pending_tasks: result.pending_tasks,
            errors: result.errors,
            error: None,
        }
    }
}

#[tauri::command]
pub async fn run_analysis_now() -> AnalysisResult {
    match agent_orchestrator::analyze_now().await {
        Ok(result) => AnalysisResult::from(result),
        Err(e) => AnalysisResult {
            health_check_completed: false,
            health_score: None,
            alert_count: 0,
            opportunity_scan_completed: false,
            opportunities_found: 0,
            pending_tasks: 0,
            errors: vec![],
            error: Some(e),
        },
    }
}

// ============================================================================
// Reasoning Chain
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ReasoningChainResult {
    pub chain: Option<ReasoningChainResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningChainResponse {
    pub id: String,
    pub trigger: String,
    pub steps: Vec<ReasoningStepResponse>,
    pub conclusion: String,
    pub final_decision: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningStepResponse {
    pub step_number: u32,
    pub action: String,
    pub input: serde_json::Value,
    pub output: serde_json::Value,
    pub reasoning: String,
    pub confidence: f64,
    pub duration_ms: u64,
}

impl From<agent_orchestrator::ReasoningChain> for ReasoningChainResponse {
    fn from(chain: agent_orchestrator::ReasoningChain) -> Self {
        Self {
            id: chain.id,
            trigger: chain.trigger,
            steps: chain.steps.into_iter().map(|s| ReasoningStepResponse {
                step_number: s.step_number,
                action: s.action,
                input: s.input,
                output: s.output,
                reasoning: s.reasoning,
                confidence: s.confidence,
                duration_ms: s.duration_ms,
            }).collect(),
            conclusion: chain.conclusion,
            final_decision: chain.final_decision,
            created_at: chain.created_at,
        }
    }
}

// ============================================================================
// Behavior Preferences
// ============================================================================

#[derive(Debug, Serialize)]
pub struct PreferencesResult {
    pub preferences: Vec<PreferenceResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferenceResponse {
    pub category: String,
    pub key: String,
    pub value: f64,
    pub confidence: f64,
    pub evidence_count: u32,
}

#[tauri::command]
pub async fn get_learned_preferences() -> PreferencesResult {
    // Get all preferences from behavior learner
    let prefs = match behavior_learner::get_all_preferences() {
        Ok(p) => p,
        Err(_) => return PreferencesResult {
            preferences: vec![],
            error: None,
        },
    };

    let preferences: Vec<PreferenceResponse> = prefs
        .iter()
        .map(|pref| PreferenceResponse {
            category: pref.category.clone(),
            key: pref.preference_key.clone(),
            value: pref.confidence,
            confidence: pref.confidence,
            evidence_count: pref.sample_count as u32,
        })
        .collect();

    PreferencesResult {
        preferences,
        error: None,
    }
}
