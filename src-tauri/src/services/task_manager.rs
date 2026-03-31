//! Task manager service for proactive task generation and management.
//!
//! Generates actionable tasks from portfolio health alerts, market opportunities,
//! and user behavior patterns. Manages task lifecycle from suggestion to completion.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::AppHandle;
use tracing::{info, warn};

use crate::commands::{self, TransferInput};
use super::local_db::{self, TaskRecord};
use super::guardrails::{self, ActionContext};
use super::behavior_learner;
use super::market_service;
use super::strategy_legacy;

/// Task priority levels.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Urgent,
}

/// Task status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Suggested,
    Approved,
    Rejected,
    Executing,
    Completed,
    Failed,
    Dismissed,
    Snoozed,
}

/// Task action definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskAction {
    pub action_type: String,
    pub chain: Option<String>,
    pub token_in: Option<String>,
    pub token_out: Option<String>,
    pub amount: Option<f64>,
    pub amount_usd: Option<f64>,
    pub target_address: Option<String>,
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Task with full context for API responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub category: String,
    pub priority: String,
    pub status: String,
    pub title: String,
    pub summary: String,
    pub reasoning: TaskReasoning,
    pub suggested_action: TaskAction,
    pub confidence_score: f64,
    pub source_trigger: String,
    pub expires_at: Option<i64>,
    pub created_at: i64,
}

/// Task reasoning breakdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskReasoning {
    pub trigger: String,
    pub analysis: String,
    pub recommendation: String,
    pub risk_factors: Vec<String>,
}

/// Task generation context.
#[derive(Debug, Clone)]
pub struct TaskContext {
    pub portfolio_value_usd: f64,
    pub health_alerts: Vec<super::health_monitor::HealthAlert>,
    pub drift_analysis: Vec<super::health_monitor::DriftAnalysis>,
    pub opportunities: Vec<market_service::MarketOpportunity>,
    #[allow(dead_code)]
    pub user_preferences: HashMap<String, f64>,
}

/// Task generation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedTask {
    pub task: Task,
    pub confidence: f64,
    pub source_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskApprovalResult {
    pub task: Task,
    pub execution_message: String,
    pub execution_status: String,
}

impl Task {
    /// Convert from database record.
    pub fn from_record(record: &TaskRecord) -> Result<Self, String> {
        let reasoning: TaskReasoning = serde_json::from_str(&record.reasoning_json)
            .unwrap_or(TaskReasoning {
                trigger: record.source_trigger.clone(),
                analysis: record.summary.clone(),
                recommendation: String::new(),
                risk_factors: vec![],
            });

        let suggested_action: TaskAction = serde_json::from_str(&record.suggested_action_json)
            .unwrap_or(TaskAction {
                action_type: "review".to_string(),
                chain: None,
                token_in: None,
                token_out: None,
                amount: None,
                amount_usd: None,
                target_address: None,
                parameters: HashMap::new(),
            });

        Ok(Task {
            id: record.id.clone(),
            category: record.category.clone(),
            priority: record.priority.clone(),
            status: record.status.clone(),
            title: record.title.clone(),
            summary: record.summary.clone(),
            reasoning,
            suggested_action,
            confidence_score: record.confidence_score,
            source_trigger: record.source_trigger.clone(),
            expires_at: record.expires_at,
            created_at: record.created_at,
        })
    }

    /// Convert to database record.
    pub fn to_record(&self) -> TaskRecord {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        TaskRecord {
            id: self.id.clone(),
            title: self.title.clone(),
            summary: self.summary.clone(),
            category: self.category.clone(),
            priority: self.priority.clone(),
            status: self.status.clone(),
            reasoning_json: serde_json::to_string(&self.reasoning).unwrap_or_else(|_| "{}".to_string()),
            related_entities_json: "{}".to_string(),
            source_trigger: self.source_trigger.clone(),
            suggested_action_json: serde_json::to_string(&self.suggested_action).unwrap_or_else(|_| "{}".to_string()),
            confidence_score: self.confidence_score,
            expires_at: self.expires_at,
            snoozed_until: None,
            created_at: self.created_at,
            updated_at: now,
        }
    }
}

/// Generate proactive tasks from portfolio context.
pub fn generate_tasks(ctx: &TaskContext) -> Result<Vec<GeneratedTask>, String> {
    let mut tasks = Vec::new();

    // Generate tasks from health alerts
    for alert in &ctx.health_alerts {
        if let Some(task) = generate_task_from_alert(alert, ctx) {
            tasks.push(task);
        }
    }

    // Generate tasks from drift analysis
    for drift in &ctx.drift_analysis {
        if drift.drift_pct >= 8.0 {
            if let Some(task) = generate_rebalance_task(drift, ctx) {
                tasks.push(task);
            }
        }
    }

    for opportunity in &ctx.opportunities {
        if let Some(task) = generate_task_from_opportunity(opportunity, ctx) {
            tasks.push(task);
        }
    }

    // Sort by confidence and priority
    tasks.sort_by(|a, b| {
        b.confidence.partial_cmp(&a.confidence).unwrap()
    });

    // Limit to top 5 tasks
    tasks.truncate(5);

    Ok(tasks)
}

/// Generate a task from a health alert.
fn generate_task_from_alert(
    alert: &super::health_monitor::HealthAlert,
    ctx: &TaskContext,
) -> Option<GeneratedTask> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let (category, priority, action) = match alert.alert_type.as_str() {
        "drift_exceeded" => {
            let mut parameters = HashMap::new();
            parameters.insert(
                "fingerprint".to_string(),
                serde_json::Value::String(format!("health:{}:{}", alert.alert_type, alert.title)),
            );
            let action = TaskAction {
                action_type: "rebalance".to_string(),
                chain: None,
                token_in: alert.affected_assets.first().cloned(),
                token_out: None,
                amount: None,
                amount_usd: Some(ctx.portfolio_value_usd * 0.1),
                target_address: None,
                parameters,
            };
            ("rebalance", "medium", action)
        }
        "concentration_high" => {
            let mut parameters = HashMap::new();
            parameters.insert(
                "fingerprint".to_string(),
                serde_json::Value::String(format!("health:{}:{}", alert.alert_type, alert.title)),
            );
            let action = TaskAction {
                action_type: "diversify".to_string(),
                chain: None,
                token_in: None,
                token_out: None,
                amount: None,
                amount_usd: Some(ctx.portfolio_value_usd * 0.1),
                target_address: None,
                parameters,
            };
            ("risk_mitigation", "medium", action)
        }
        "large_holding" => {
            let symbol = alert.affected_assets.first().cloned().unwrap_or_default();
            let mut parameters = HashMap::new();
            parameters.insert(
                "fingerprint".to_string(),
                serde_json::Value::String(format!("health:{}:{}", alert.alert_type, symbol)),
            );
            let action = TaskAction {
                action_type: "reduce_position".to_string(),
                chain: None,
                token_in: Some(symbol.clone()),
                token_out: None,
                amount: Some(alert.current_value.unwrap_or(0.0) - 30.0),
                amount_usd: None,
                target_address: None,
                parameters,
            };
            ("risk_mitigation", "high", action)
        }
        "risk_threshold" => {
            let mut parameters = HashMap::new();
            parameters.insert(
                "fingerprint".to_string(),
                serde_json::Value::String(format!("health:{}:{}", alert.alert_type, alert.title)),
            );
            let action = TaskAction {
                action_type: "add_stablecoins".to_string(),
                chain: None,
                token_in: None,
                token_out: Some("USDC".to_string()),
                amount: None,
                amount_usd: Some(ctx.portfolio_value_usd * 0.2),
                target_address: None,
                parameters,
            };
            ("risk_mitigation", "high", action)
        }
        _ => return None,
    };

    let reasoning = TaskReasoning {
        trigger: alert.alert_type.clone(),
        analysis: alert.message.clone(),
        recommendation: alert.recommended_action.clone().unwrap_or_default(),
        risk_factors: alert.affected_assets.clone(),
    };

    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        category: category.to_string(),
        priority: priority.to_string(),
        status: TaskStatus::Suggested.to_string(),
        title: alert.title.clone(),
        summary: alert.message.clone(),
        reasoning,
        suggested_action: action,
        confidence_score: match alert.severity.as_str() {
            "critical" => 0.9,
            "warning" => 0.7,
            "info" => 0.5,
            _ => 0.5,
        },
        source_trigger: "health_monitor".to_string(),
        expires_at: Some(now + 900), // 15 minutes
        created_at: now,
    };

    let confidence = match alert.severity.as_str() {
        "critical" => 0.9,
        "warning" => 0.7,
        "info" => 0.5,
        _ => 0.5,
    };

    Some(GeneratedTask {
        task,
        confidence,
        source_reason: format!("Generated from {} alert", alert.alert_type),
    })
}

/// Generate a rebalance task from drift analysis.
fn generate_rebalance_task(
    drift: &super::health_monitor::DriftAnalysis,
    ctx: &TaskContext,
) -> Option<GeneratedTask> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let action_type = if drift.drift_direction == "overweight" {
        "sell"
    } else {
        "buy"
    };

    let amount_usd = ctx.portfolio_value_usd * (drift.drift_pct / 100.0);

    let mut parameters = HashMap::new();
    parameters.insert(
        "fingerprint".to_string(),
        serde_json::Value::String(format!("drift:{}:{:.1}", drift.symbol, drift.drift_pct)),
    );

    let action = TaskAction {
        action_type: action_type.to_string(),
        chain: None,
        token_in: if drift.drift_direction == "overweight" {
            Some(drift.symbol.clone())
        } else {
            None
        },
        token_out: if drift.drift_direction == "underweight" {
            Some(drift.symbol.clone())
        } else {
            None
        },
        amount: None,
        amount_usd: Some(amount_usd),
        target_address: None,
        parameters,
    };

    let reasoning = TaskReasoning {
        trigger: "drift_analysis".to_string(),
        analysis: format!(
            "{} is {} by {:.1}%",
            drift.symbol,
            drift.drift_direction,
            drift.drift_pct
        ),
        recommendation: drift.suggested_action.clone().unwrap_or_default(),
        risk_factors: vec![drift.symbol.clone()],
    };

    let priority = if drift.drift_pct > 20.0 {
        "high"
    } else {
        "medium"
    };

    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        category: "rebalance".to_string(),
        priority: priority.to_string(),
        status: TaskStatus::Suggested.to_string(),
        title: format!("Rebalance {}", drift.symbol),
        summary: format!(
            "{} is {} by {:.1}%",
            drift.symbol,
            drift.drift_direction,
            drift.drift_pct
        ),
        reasoning,
        suggested_action: action,
        confidence_score: 0.6 + (drift.drift_pct / 100.0).min(0.3),
        source_trigger: "drift_analysis".to_string(),
        expires_at: Some(now + 900),
        created_at: now,
    };

    let confidence = 0.6 + (drift.drift_pct / 100.0).min(0.3);

    Some(GeneratedTask {
        task,
        confidence,
        source_reason: format!("{} drift of {:.1}%", drift.drift_direction, drift.drift_pct),
    })
}

fn generate_task_from_opportunity(
    opportunity: &market_service::MarketOpportunity,
    ctx: &TaskContext,
) -> Option<GeneratedTask> {
    if !opportunity.primary_action.enabled {
        return None;
    }

    let actionable = opportunity.actionability.as_str();
    if actionable != "approval_ready" && actionable != "agent_ready" {
        return None;
    }

    let now = now_secs();
    let mut parameters = HashMap::new();
    parameters.insert(
        "opportunityId".to_string(),
        serde_json::Value::String(opportunity.id.clone()),
    );
    parameters.insert(
        "actionability".to_string(),
        serde_json::Value::String(opportunity.actionability.clone()),
    );
    parameters.insert(
        "fingerprint".to_string(),
        serde_json::Value::String(format!("market:{}", opportunity.id)),
    );
    if let Some(protocol) = &opportunity.protocol {
        parameters.insert(
            "protocol".to_string(),
            serde_json::Value::String(protocol.clone()),
        );
    }

    let estimated_usd = opportunity
        .metrics
        .iter()
        .find(|metric| metric.kind == "estimated_notional_usd")
        .and_then(|metric| parse_metric_money(&metric.value))
        .or_else(|| {
            opportunity
                .metrics
                .iter()
                .find(|metric| metric.kind == "tvl_usd")
                .and_then(|metric| parse_metric_money(&metric.value).map(|value| value.min(1_000.0)))
        })
        .or_else(|| {
            if ctx.portfolio_value_usd > 0.0 {
                Some((ctx.portfolio_value_usd * 0.1).min(1_000.0))
            } else {
                None
            }
        });

    let action_type = if actionable == "approval_ready" {
        "create_strategy"
    } else {
        "agent_draft"
    };

    let action = TaskAction {
        action_type: action_type.to_string(),
        chain: Some(opportunity.chain.clone()),
        token_in: opportunity.symbols.first().cloned(),
        token_out: opportunity.symbols.get(1).cloned(),
        amount: None,
        amount_usd: estimated_usd,
        target_address: opportunity.protocol.clone(),
        parameters,
    };

    let recommendation = opportunity
        .portfolio_fit
        .relevance_reasons
        .first()
        .cloned()
        .unwrap_or_else(|| opportunity.summary.clone());

    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        category: opportunity.category.clone(),
        priority: priority_from_score(opportunity.score).to_string(),
        status: TaskStatus::Suggested.to_string(),
        title: opportunity.title.clone(),
        summary: opportunity.summary.clone(),
        reasoning: TaskReasoning {
            trigger: "market_opportunity".to_string(),
            analysis: opportunity.summary.clone(),
            recommendation,
            risk_factors: opportunity.symbols.clone(),
        },
        suggested_action: action,
        confidence_score: opportunity.confidence,
        source_trigger: "market_service".to_string(),
        expires_at: opportunity.fresh_until.or(Some(now + 900)),
        created_at: now,
    };

    Some(GeneratedTask {
        task,
        confidence: opportunity.confidence,
        source_reason: format!("Generated from market opportunity {}", opportunity.id),
    })
}

fn priority_from_score(score: f64) -> TaskPriority {
    if score >= 85.0 {
        TaskPriority::High
    } else if score >= 70.0 {
        TaskPriority::Medium
    } else {
        TaskPriority::Low
    }
}

/// Create a new task.
pub fn create_task(task: &Task) -> Result<String, String> {
    if task_exists(task)? {
        return Ok(task.id.clone());
    }

    let record = task.to_record();
    local_db::insert_task(&record)
        .map_err(|e| format!("Failed to create task: {}", e))?;

    // Record behavior event using simple wrapper
    let _ = behavior_learner::record_simple_event(
        behavior_learner::BehaviorEventType::Approval,
        &format!("task:{}", task.id),
        serde_json::json!({
            "category": task.category,
            "priority": task.priority,
        }),
    );

    info!(task_id = task.id.as_str(), "task.created");
    Ok(task.id.clone())
}

fn task_exists(task: &Task) -> Result<bool, String> {
    let existing = local_db::get_tasks(None, None, 200)
        .map_err(|e| format!("Failed to inspect existing tasks: {}", e))?;
    let fingerprint = task_fingerprint(task);
    Ok(existing.iter().any(|record| {
        if !matches!(record.status.as_str(), "suggested" | "approved" | "executing") {
            return false;
        }
        task_fingerprint_from_record(record).as_deref() == Some(fingerprint.as_str())
    }))
}

fn task_fingerprint(task: &Task) -> String {
    task.suggested_action
        .parameters
        .get("fingerprint")
        .and_then(|value| value.as_str())
        .map(std::string::ToString::to_string)
        .unwrap_or_else(|| format!("{}:{}:{}", task.source_trigger, task.category, task.title))
}

fn task_fingerprint_from_record(record: &TaskRecord) -> Option<String> {
    serde_json::from_str::<TaskAction>(&record.suggested_action_json)
        .ok()
        .and_then(|action| {
            action
                .parameters
                .get("fingerprint")
                .and_then(|value| value.as_str())
                .map(std::string::ToString::to_string)
        })
        .or_else(|| Some(format!("{}:{}:{}", record.source_trigger, record.category, record.title)))
}

/// Get all pending tasks.
pub fn get_pending_tasks() -> Result<Vec<Task>, String> {
    let records = local_db::get_tasks(Some("suggested"), None, 50)
        .map_err(|e| format!("Failed to get tasks: {}", e))?;

    records.iter().map(Task::from_record).collect()
}

/// Get a task by ID.
pub fn get_task(id: &str) -> Result<Option<Task>, String> {
    let record = local_db::get_task(id)
        .map_err(|e| format!("Failed to get task: {}", e))?;

    match record {
        Some(r) => Ok(Some(Task::from_record(&r)?)),
        None => Ok(None),
    }
}

/// Approve a task for execution.
pub async fn approve_task(
    app: &AppHandle,
    id: &str,
    _user_reason: Option<&str>,
) -> Result<TaskApprovalResult, String> {
    let mut task = get_task(id)?.ok_or("Task not found")?;

    // Check if expired
    if let Some(expires_at) = task.expires_at {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        if now > expires_at {
            update_task_status(id, &TaskStatus::Dismissed.to_string())?;
            return Err("Task has expired".to_string());
        }
    }

    // Validate against guardrails
    let action = &task.suggested_action;
    let mut token_addresses = Vec::new();
    if let Some(token_in) = &action.token_in {
        token_addresses.push(token_in.clone());
    }
    if let Some(token_out) = &action.token_out {
        token_addresses.push(token_out.clone());
    }

    let action_ctx = ActionContext {
        action_type: action.action_type.clone(),
        chain: action.chain.clone(),
        token_addresses: Some(token_addresses),
        protocol: action.target_address.clone(),
        value_usd: action.amount_usd,
        portfolio_total_usd: None,
        portfolio_after_usd: None,
    };

    let validation = guardrails::validate_action(&action_ctx);

    // Check kill switch via global state
    if guardrails::is_kill_switch_active() {
        return Err("Kill switch is active - no actions allowed".to_string());
    }

    if !validation.allowed {
        let violation_reasons: Vec<String> = validation.violations.iter()
            .map(|v| v.reason.clone())
            .collect();
        return Err(format!(
            "Action blocked by guardrails: {}",
            violation_reasons.join(", ")
        ));
    }

    update_task_status(id, &TaskStatus::Approved.to_string())?;
    task.status = TaskStatus::Approved.to_string();

    // Record behavior using simple event wrapper
    behavior_learner::record_simple_event(
        behavior_learner::BehaviorEventType::Approval,
        id,
        serde_json::json!({
            "category": task.category,
        }),
    ).ok();

    info!(task_id = id, "task.approved");
    let (execution_status, execution_message) = execute_approved_task(app, &task).await?;
    let refreshed = get_task(id)?.unwrap_or(task);
    Ok(TaskApprovalResult {
        task: refreshed,
        execution_message,
        execution_status,
    })
}

/// Reject a task.
pub fn reject_task(id: &str, _user_reason: Option<&str>) -> Result<(), String> {
    update_task_status(id, &TaskStatus::Rejected.to_string())?;

    // Record behavior for learning
    let task = get_task(id)?;
    if let Some(task) = task {
        behavior_learner::record_simple_event(
            behavior_learner::BehaviorEventType::Rejection,
            id,
            serde_json::json!({
                "category": task.category,
                "priority": task.priority,
            }),
        ).ok();
    }

    info!(task_id = id, "task.rejected");
    Ok(())
}

async fn execute_approved_task(
    app: &AppHandle,
    task: &Task,
) -> Result<(String, String), String> {
    update_task_status(&task.id, &TaskStatus::Executing.to_string())?;

    let outcome = match task.suggested_action.action_type.as_str() {
        "transfer" => execute_transfer_task(app, task).await,
        "create_strategy"
        | "rebalance"
        | "diversify"
        | "reduce_position"
        | "add_stablecoins"
        | "sell"
        | "buy" => execute_strategy_creation(task),
        "agent_draft" => complete_as_draft(task),
        other => complete_as_preview(task, other),
    };

    match outcome {
        Ok((status, message, payload)) => {
            complete_task(&task.id, Some(&payload))?;
            Ok((status, message))
        }
        Err(error) => {
            fail_task(&task.id, &error)?;
            Err(error)
        }
    }
}

fn execute_strategy_creation(
    task: &Task,
) -> Result<(String, String, serde_json::Value), String> {
    let strategy_id = uuid::Uuid::new_v4().to_string();
    let trigger = if let Some(opportunity_id) = task
        .suggested_action
        .parameters
        .get("opportunityId")
        .and_then(|value| value.as_str())
    {
        serde_json::json!({
            "type": "manual_market_opportunity",
            "opportunityId": opportunity_id,
        })
    } else {
        serde_json::json!({
            "type": "manual_autonomous_task",
            "taskId": task.id,
        })
    };

    let action = serde_json::json!({
        "type": task.suggested_action.action_type,
        "chain": task.suggested_action.chain,
        "tokenIn": task.suggested_action.token_in,
        "tokenOut": task.suggested_action.token_out,
        "amountUsd": task.suggested_action.amount_usd,
        "amount": task.suggested_action.amount,
        "targetAddress": task.suggested_action.target_address,
        "parameters": task.suggested_action.parameters,
    });

    let guardrails = serde_json::json!({
        "mode": "approval_required",
        "source": "autonomous",
        "maxNotionalUsd": task.suggested_action.amount_usd.unwrap_or(1000.0).to_string(),
        "reason": task.summary,
    });

    let mut strategy = strategy_legacy::infer_strategy_fields_for_legacy(
        &strategy_id,
        &task.title,
        Some(task.summary.clone()),
        "approval_required",
        &trigger.to_string(),
        &action.to_string(),
        &guardrails.to_string(),
        &serde_json::json!({"mode": "always_require"}).to_string(),
        &serde_json::json!({"enabled": false, "fallbackToApproval": true, "killSwitch": false}).to_string(),
    );
    strategy.status = "active".to_string();
    strategy.next_run_at = Some(now_secs());
    local_db::upsert_strategy(&strategy).map_err(|e| e.to_string())?;

    let message = format!("Strategy '{}' created from autonomous task.", strategy.name);
    Ok((
        "strategy_created".to_string(),
        message.clone(),
        serde_json::json!({
            "status": "strategy_created",
            "strategyId": strategy.id,
            "message": message,
        }),
    ))
}

async fn execute_transfer_task(
    app: &AppHandle,
    task: &Task,
) -> Result<(String, String, serde_json::Value), String> {
    let params = &task.suggested_action.parameters;
    let from_address = params
        .get("fromAddress")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Transfer task missing fromAddress".to_string())?;
    let to_address = task
        .suggested_action
        .target_address
        .as_deref()
        .or_else(|| params.get("toAddress").and_then(|value| value.as_str()))
        .ok_or_else(|| "Transfer task missing toAddress".to_string())?;
    let amount = task
        .suggested_action
        .amount
        .or(task.suggested_action.amount_usd)
        .ok_or_else(|| "Transfer task missing amount".to_string())?;
    let chain = task
        .suggested_action
        .chain
        .clone()
        .or_else(|| params.get("chain").and_then(|value| value.as_str()).map(str::to_string))
        .ok_or_else(|| "Transfer task missing chain".to_string())?;
    let token_contract = params
        .get("tokenContract")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let decimals = params
        .get("decimals")
        .and_then(|value| value.as_u64())
        .map(|value| value as u8);

    let result = commands::portfolio_transfer_background(
        app.clone(),
        TransferInput {
            from_address: from_address.to_string(),
            to_address: to_address.to_string(),
            amount: amount.to_string(),
            chain,
            token_contract,
            decimals,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    let message = format!("Transfer submitted: {}", result.tx_hash);
    Ok((
        "submitted".to_string(),
        message.clone(),
        serde_json::json!({
            "status": "submitted",
            "txHash": result.tx_hash,
            "message": message,
        }),
    ))
}

fn complete_as_draft(
    task: &Task,
) -> Result<(String, String, serde_json::Value), String> {
    let message = format!("Draft prepared for '{}'. Continue in Agent to refine execution.", task.title);
    Ok((
        "draft_ready".to_string(),
        message.clone(),
        serde_json::json!({
            "status": "draft_ready",
            "message": message,
            "taskId": task.id,
        }),
    ))
}

fn complete_as_preview(
    task: &Task,
    action_type: &str,
) -> Result<(String, String, serde_json::Value), String> {
    let message = format!(
        "Action '{}' is not directly executable yet. Preview or manual review required for '{}'.",
        action_type, task.title
    );
    Ok((
        "preview_only".to_string(),
        message.clone(),
        serde_json::json!({
            "status": "preview_only",
            "message": message,
            "actionType": action_type,
        }),
    ))
}

/// Mark a task as executing.
#[allow(dead_code)]
pub fn start_execution(id: &str) -> Result<(), String> {
    update_task_status(id, &TaskStatus::Executing.to_string())
}

/// Mark a task as completed.
pub fn complete_task(id: &str, result: Option<&serde_json::Value>) -> Result<(), String> {
    update_task_status(id, &TaskStatus::Completed.to_string())?;
    if let Some(result) = result {
        let _ = local_db::update_task_related_entities(id, &result.to_string())
            .map_err(|e| format!("Failed to update task metadata: {}", e))?;
    }

    // Record success
    behavior_learner::record_simple_event(
        behavior_learner::BehaviorEventType::TaskCompleted,
        id,
        serde_json::json!({}),
    ).ok();

    info!(task_id = id, "task.completed");
    Ok(())
}

/// Mark a task as failed.
pub fn fail_task(id: &str, error: &str) -> Result<(), String> {
    update_task_status(id, &TaskStatus::Failed.to_string())?;
    let payload = serde_json::json!({
        "status": "failed",
        "error": error,
    });
    let _ = local_db::update_task_related_entities(id, &payload.to_string())
        .map_err(|e| format!("Failed to update task metadata: {}", e))?;

    warn!(task_id = id, error, "task.failed");
    Ok(())
}

/// Update task status helper.
fn update_task_status(id: &str, status: &str) -> Result<(), String> {
    let _updated = local_db::update_task_status(id, status)
        .map_err(|e| format!("Failed to update task status: {}", e))?;
    Ok(())
}

/// Get task statistics.
pub fn get_task_stats() -> Result<TaskStats, String> {
    let all_tasks = local_db::get_tasks(None, None, 1000)
        .map_err(|e| format!("Failed to get tasks: {}", e))?;

    let mut stats = TaskStats::default();

    for task in &all_tasks {
        stats.total += 1;
        match task.status.as_str() {
            "suggested" => stats.pending += 1,
            "approved" => stats.approved += 1,
            "rejected" => stats.rejected += 1,
            "executing" => stats.executing += 1,
            "completed" => stats.completed += 1,
            "failed" => stats.failed += 1,
            "dismissed" => stats.expired += 1,
            _ => {}
        }
    }

    Ok(stats)
}

/// Task statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStats {
    pub total: u32,
    pub pending: u32,
    pub approved: u32,
    pub rejected: u32,
    pub executing: u32,
    pub completed: u32,
    pub failed: u32,
    pub expired: u32,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn parse_metric_money(raw: &str) -> Option<f64> {
    let filtered = raw
        .chars()
        .filter(|ch| ch.is_ascii_digit() || *ch == '.' || *ch == '-')
        .collect::<String>();
    filtered.parse::<f64>().ok()
}

impl std::fmt::Display for TaskPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPriority::Low => write!(f, "low"),
            TaskPriority::Medium => write!(f, "medium"),
            TaskPriority::High => write!(f, "high"),
            TaskPriority::Urgent => write!(f, "urgent"),
        }
    }
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Suggested => write!(f, "suggested"),
            TaskStatus::Approved => write!(f, "approved"),
            TaskStatus::Rejected => write!(f, "rejected"),
            TaskStatus::Executing => write!(f, "executing"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Failed => write!(f, "failed"),
            TaskStatus::Dismissed => write!(f, "dismissed"),
            TaskStatus::Snoozed => write!(f, "snoozed"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::health_monitor::{DriftAnalysis, HealthAlert};
    use crate::services::market_service::{
        MarketOpportunity, MarketOpportunityCompactDetails, MarketOpportunityMetric,
        MarketPortfolioFit, MarketPrimaryAction,
    };

    #[test]
    fn test_task_status_display() {
        assert_eq!(TaskStatus::Suggested.to_string(), "suggested");
        assert_eq!(TaskStatus::Approved.to_string(), "approved");
    }

    #[test]
    fn test_task_priority_ordering() {
        assert!(TaskPriority::Urgent > TaskPriority::High);
        assert!(TaskPriority::High > TaskPriority::Medium);
        assert!(TaskPriority::Medium > TaskPriority::Low);
    }

    fn sample_context(opportunities: Vec<MarketOpportunity>) -> TaskContext {
        TaskContext {
            portfolio_value_usd: 2_500.0,
            health_alerts: vec![HealthAlert {
                alert_type: "risk_threshold".to_string(),
                severity: "warning".to_string(),
                title: "Reduce volatile exposure".to_string(),
                message: "Stablecoin allocation has fallen below the configured band.".to_string(),
                affected_assets: vec!["ETH".to_string()],
                recommended_action: Some("Add stablecoin exposure.".to_string()),
                threshold_value: Some(30.0),
                current_value: Some(12.0),
            }],
            drift_analysis: vec![DriftAnalysis {
                symbol: "ETH".to_string(),
                target_pct: 35.0,
                current_pct: 48.0,
                drift_pct: 13.0,
                drift_direction: "overweight".to_string(),
                usd_value: 1_200.0,
                suggested_action: Some("Trim ETH back toward target.".to_string()),
            }],
            opportunities,
            user_preferences: HashMap::new(),
        }
    }

    fn sample_opportunity(actionability: &str, enabled: bool) -> MarketOpportunity {
        MarketOpportunity {
            id: "opp-1".to_string(),
            title: "USDC yield on Base".to_string(),
            summary: "Deploy idle USDC into a supported Base yield venue.".to_string(),
            category: "yield".to_string(),
            chain: "base".to_string(),
            protocol: Some("aave".to_string()),
            symbols: vec!["USDC".to_string()],
            risk: "medium".to_string(),
            confidence: 0.82,
            score: 88.0,
            actionability: actionability.to_string(),
            fresh_until: Some(now_secs() + 900),
            stale: false,
            source_count: 2,
            source_labels: vec!["defillama".to_string()],
            metrics: vec![MarketOpportunityMetric {
                label: "Estimated notional".to_string(),
                value: "$250".to_string(),
                kind: "estimated_notional_usd".to_string(),
            }],
            portfolio_fit: MarketPortfolioFit {
                has_required_asset: true,
                wallet_coverage: "sufficient".to_string(),
                guardrail_fit: true,
                relevance_reasons: vec!["Idle USDC is available to deploy.".to_string()],
            },
            primary_action: MarketPrimaryAction {
                kind: "deposit".to_string(),
                label: "Create strategy".to_string(),
                enabled,
                reason_disabled: None,
            },
            details: MarketOpportunityCompactDetails::default(),
        }
    }

    #[test]
    fn generate_tasks_includes_drift_and_market_signals() {
        let tasks = generate_tasks(&sample_context(vec![sample_opportunity(
            "approval_ready",
            true,
        )]))
        .expect("task generation should succeed");

        assert!(tasks.iter().any(|item| item.task.source_trigger == "drift_analysis"));
        assert!(tasks.iter().any(|item| item.task.source_trigger == "market_service"));

        let market_task = tasks
            .iter()
            .find(|item| item.task.source_trigger == "market_service")
            .expect("expected market task");
        assert_eq!(market_task.task.suggested_action.action_type, "create_strategy");
        assert_eq!(
            market_task
                .task
                .suggested_action
                .parameters
                .get("fingerprint")
                .and_then(|value| value.as_str()),
            Some("market:opp-1")
        );
    }

    #[test]
    fn generate_tasks_skips_non_actionable_market_opportunities() {
        let tasks = generate_tasks(&TaskContext {
            opportunities: vec![
                sample_opportunity("research_only", true),
                sample_opportunity("approval_ready", false),
            ],
            ..sample_context(vec![])
        })
        .expect("task generation should succeed");

        assert!(
            tasks.iter().all(|item| item.task.source_trigger != "market_service"),
            "non-actionable opportunities should not create tasks"
        );
    }
}
