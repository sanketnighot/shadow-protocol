//! Task manager service for proactive task generation and management.
//!
//! Generates actionable tasks from portfolio health alerts, market opportunities,
//! and user behavior patterns. Manages task lifecycle from suggestion to completion.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn};

use super::local_db::{self, TaskRecord};
use super::guardrails::{self, ActionContext};
use super::behavior_learner;

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
        if drift.drift_pct > 10.0 {
            if let Some(task) = generate_rebalance_task(drift, ctx) {
                tasks.push(task);
            }
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
            let action = TaskAction {
                action_type: "rebalance".to_string(),
                chain: None,
                token_in: alert.affected_assets.first().cloned(),
                token_out: None,
                amount: None,
                amount_usd: Some(ctx.portfolio_value_usd * 0.1),
                target_address: None,
                parameters: HashMap::new(),
            };
            ("rebalance", "medium", action)
        }
        "concentration_high" => {
            let action = TaskAction {
                action_type: "diversify".to_string(),
                chain: None,
                token_in: None,
                token_out: None,
                amount: None,
                amount_usd: Some(ctx.portfolio_value_usd * 0.1),
                target_address: None,
                parameters: HashMap::new(),
            };
            ("risk_mitigation", "medium", action)
        }
        "large_holding" => {
            let symbol = alert.affected_assets.first().cloned().unwrap_or_default();
            let action = TaskAction {
                action_type: "reduce_position".to_string(),
                chain: None,
                token_in: Some(symbol.clone()),
                token_out: None,
                amount: Some(alert.current_value.unwrap_or(0.0) - 30.0),
                amount_usd: None,
                target_address: None,
                parameters: HashMap::new(),
            };
            ("risk_mitigation", "high", action)
        }
        "risk_threshold" => {
            let action = TaskAction {
                action_type: "add_stablecoins".to_string(),
                chain: None,
                token_in: None,
                token_out: Some("USDC".to_string()),
                amount: None,
                amount_usd: Some(ctx.portfolio_value_usd * 0.2),
                target_address: None,
                parameters: HashMap::new(),
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
        parameters: HashMap::new(),
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

/// Create a new task.
pub fn create_task(task: &Task) -> Result<String, String> {
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

/// Get all pending tasks.
pub fn get_pending_tasks() -> Result<Vec<Task>, String> {
    let records = local_db::get_tasks(Some("suggested"), None, 50)
        .map_err(|e| format!("Failed to get tasks: {}", e))?;

    records
        .iter()
        .map(|r| Task::from_record(r))
        .collect()
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
pub fn approve_task(id: &str, _user_reason: Option<&str>) -> Result<Task, String> {
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

    // Update status
    task.status = TaskStatus::Approved.to_string();

    local_db::update_task_status(id, &TaskStatus::Approved.to_string())
        .map_err(|e| format!("Failed to update task: {}", e))?;

    // Record behavior using simple event wrapper
    behavior_learner::record_simple_event(
        behavior_learner::BehaviorEventType::Approval,
        id,
        serde_json::json!({
            "category": task.category,
        }),
    ).ok();

    info!(task_id = id, "task.approved");
    Ok(task)
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

/// Mark a task as executing.
#[allow(dead_code)]
pub fn start_execution(id: &str) -> Result<(), String> {
    update_task_status(id, &TaskStatus::Executing.to_string())
}

/// Mark a task as completed.
#[allow(dead_code)]
pub fn complete_task(id: &str, _result: Option<&serde_json::Value>) -> Result<(), String> {
    update_task_status(id, &TaskStatus::Completed.to_string())?;

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
#[allow(dead_code)]
pub fn fail_task(id: &str, error: &str) -> Result<(), String> {
    update_task_status(id, &TaskStatus::Failed.to_string())?;

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
}
