//! SHADOW-owned scheduler hooks for bundled apps (heartbeat).

use tauri::{AppHandle, Emitter};

use crate::services::audit;
use crate::services::local_db::{self, ApprovalRecord, DbError};

use super::filecoin;
use super::flow;
use super::state::{self, is_tool_app_ready, record_scheduler_job_run, AppSchedulerJobRow};

pub async fn run_due_jobs(app: &AppHandle, now: i64) {
    let jobs = match state::list_due_scheduler_jobs(now) {
        Ok(j) => j,
        Err(_) => return,
    };
    for job in jobs {
        let next = now.saturating_add(job.interval_secs);
        let res = run_single_job(app, &job).await;
        let _ = record_scheduler_job_run(&job.id, next);
        audit::record(
            "app_scheduler_job",
            "app_job",
            Some(&job.id),
            &serde_json::json!({
                "appId": job.app_id,
                "kind": job.kind,
                "ok": res.is_ok(),
                "message": res.as_ref().err().map(|s| s.as_str()).unwrap_or("ok"),
            }),
        );
    }
}

async fn run_single_job(app: &AppHandle, job: &AppSchedulerJobRow) -> Result<(), String> {
    match job.kind.as_str() {
        "filecoin_autobackup" => run_filecoin_autobackup(app, job).await,
        "flow_recurring_prepare" => run_flow_recurring(app, job, now_secs()).await,
        _ => Err("unknown job kind".to_string()),
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

async fn run_filecoin_autobackup(app: &AppHandle, job: &AppSchedulerJobRow) -> Result<(), String> {
    if !is_tool_app_ready("filecoin-storage").map_err(|e: DbError| e.to_string())? {
        return Err("Filecoin app not active".to_string());
    }
    let base_scope: serde_json::Value = serde_json::from_str(&job.payload_json)
        .unwrap_or_else(|_| serde_json::json!({ "agentMemory": true, "configs": true, "strategies": true }));
    let cfg_raw = state::get_app_config_json("filecoin-storage").unwrap_or_else(|_| "{}".to_string());
    let cfg: serde_json::Value = serde_json::from_str(&cfg_raw).unwrap_or_default();
    let scope = filecoin::merge_filecoin_backup_scope(base_scope, &cfg);
    let policy = cfg.get("policy").cloned();
    filecoin::upload_and_record_snapshot(app, scope, policy).await?;
    Ok(())
}

async fn run_flow_recurring(app: &AppHandle, job: &AppSchedulerJobRow, now: i64) -> Result<(), String> {
    if !is_tool_app_ready("flow").map_err(|e: DbError| e.to_string())? {
        return Err("Flow app not active".to_string());
    }
    let proposal: serde_json::Value = serde_json::from_str(&job.payload_json)
        .map_err(|_| "invalid job payload".to_string())?;
    let prepared = flow::prepare_sponsored_transaction(app, proposal.clone()).await?;
    let approval = ApprovalRecord {
        id: uuid::Uuid::new_v4().to_string(),
        source: "app_scheduler".to_string(),
        tool_name: "flow_protocol_prepare_sponsored_transaction".to_string(),
        kind: "flow_scheduled".to_string(),
        status: "pending".to_string(),
        payload_json: serde_json::json!({
            "jobId": job.id,
            "prepared": prepared,
            "original": proposal,
        })
        .to_string(),
        simulation_json: Some(r#"{"mode":"scheduler"}"#.to_string()),
        policy_json: None,
        message: "Scheduled Flow transaction is ready for your review.".to_string(),
        expires_at: Some(now + 24 * 3600),
        version: 1,
        strategy_id: None,
        created_at: now,
        updated_at: now,
    };
    local_db::insert_approval_request(&approval).map_err(|e| e.to_string())?;
    let _ = app.emit("approval_request_created", &approval);
    Ok(())
}
