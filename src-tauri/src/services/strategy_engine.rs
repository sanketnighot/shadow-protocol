use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::audit;
use super::local_db::{self, ActiveStrategy, ApprovalRecord};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyEvaluationResult {
    pub strategy_id: String,
    pub action: String,
    pub status: String,
    pub message: String,
    pub approval_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalPolicy {
    pub mode: String,
    pub max_amount_usd: Option<f64>,
    pub require_above_amount_usd: Option<f64>,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn parse_amount_usd(action: &serde_json::Value) -> Option<f64> {
    action
        .get("amount")
        .and_then(|v| v.as_str())
        .and_then(|s| s.replace('$', "").parse::<f64>().ok())
}

fn load_policy(strategy: &ActiveStrategy) -> ApprovalPolicy {
    serde_json::from_str(&strategy.approval_policy_json).unwrap_or(ApprovalPolicy {
        mode: "always_require".to_string(),
        max_amount_usd: Some(5_000.0),
        require_above_amount_usd: Some(0.0),
    })
}

pub fn evaluate_strategy(app: &AppHandle, strategy: &mut ActiveStrategy) -> Result<StrategyEvaluationResult, String> {
    let now = now_secs();
    strategy.last_evaluation_at = Some(now);
    let action: serde_json::Value = serde_json::from_str(&strategy.action_json).unwrap_or_else(|_| serde_json::json!({}));
    let policy = load_policy(strategy);
    let amount_usd = parse_amount_usd(&action).unwrap_or(0.0);

    if let Some(max_amount) = policy.max_amount_usd {
        if amount_usd > max_amount {
            strategy.failure_count += 1;
            strategy.disabled_reason = Some("strategy_limit_exceeded".to_string());
            strategy.status = "paused".to_string();
            local_db::upsert_strategy(strategy).map_err(|e| e.to_string())?;
            audit::record("strategy_paused", "strategy", Some(&strategy.id), &serde_json::json!({
                "reason": "max_amount_exceeded",
                "amountUsd": amount_usd,
                "maxAmountUsd": max_amount,
            }));
            return Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "pause".to_string(),
                status: "paused".to_string(),
                message: "Strategy paused because it exceeded configured amount limits.".to_string(),
                approval_id: None,
            });
        }
    }

    let action_type = action.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
    let next_interval = 5 * 60;
    strategy.next_run_at = Some(now + next_interval);
    strategy.last_run_at = Some(now);

    if strategy.mode == "monitor_only" {
        local_db::upsert_strategy(strategy).map_err(|e| e.to_string())?;
        let payload = serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "title": format!("Automation: {}", strategy.name),
            "message": format!("Strategy evaluated in monitor-only mode. Action candidate: {}.", action_type),
            "timestamp": now,
        });
        let _ = app.emit("shadow_brief_ready", payload);
        return Ok(StrategyEvaluationResult {
            strategy_id: strategy.id.clone(),
            action: "monitor".to_string(),
            status: "ok".to_string(),
            message: "Strategy evaluated without execution.".to_string(),
            approval_id: None,
        });
    }

    let approval = ApprovalRecord {
        id: uuid::Uuid::new_v4().to_string(),
        source: "heartbeat".to_string(),
        tool_name: action_type.to_string(),
        kind: "strategy_action".to_string(),
        status: "pending".to_string(),
        payload_json: action.to_string(),
        simulation_json: Some(
            serde_json::json!({
                "validated": action_type != "unknown",
                "strategyId": strategy.id,
            })
            .to_string(),
        ),
        policy_json: Some(strategy.approval_policy_json.clone()),
        message: format!("Strategy '{}' is ready to run. Review the proposed action inline.", strategy.name),
        expires_at: Some(now + 15 * 60),
        version: 1,
        strategy_id: Some(strategy.id.clone()),
        created_at: now,
        updated_at: now,
    };
    local_db::insert_approval_request(&approval).map_err(|e| e.to_string())?;
    local_db::upsert_strategy(strategy).map_err(|e| e.to_string())?;
    audit::record("approval_created", "strategy", Some(&strategy.id), &approval);
    let _ = app.emit("approval_request_created", &approval);

    Ok(StrategyEvaluationResult {
        strategy_id: strategy.id.clone(),
        action: "approval_request".to_string(),
        status: "ok".to_string(),
        message: "Approval request created for strategy execution.".to_string(),
        approval_id: Some(approval.id),
    })
}
