use tauri::AppHandle;
use tokio::time::{Duration, interval};
use tracing::{error, info};

use crate::services::apps::{flow_scheduler, scheduler};
use crate::services::audit;
use crate::services::local_db::{expire_stale_approvals, get_due_strategies, upsert_strategy};
use crate::services::strategy_engine;

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = interval(Duration::from_secs(60));

        loop {
            interval.tick().await;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            if let Err(err) = expire_stale_approvals(now) {
                error!("heartbeat.expire_stale_approvals: {}", err);
            }

            let strategies = match get_due_strategies(now) {
                Ok(items) => items,
                Err(err) => {
                    error!("heartbeat.load_due_strategies: {}", err);
                    continue;
                }
            };

            for mut strategy in strategies {
                match strategy_engine::evaluate_strategy(&app, &mut strategy) {
                    Ok(result) => {
                        let _ = upsert_strategy(&strategy);
                        info!(
                            strategy_id = %result.strategy_id,
                            action = %result.action,
                            status = %result.status,
                            "heartbeat.strategy_evaluated"
                        );
                    }
                    Err(err) => {
                        strategy.failure_count += 1;
                        if strategy.failure_count >= 3 {
                            strategy.status = "paused".to_string();
                            strategy.disabled_reason =
                                Some("consecutive_evaluation_failures".to_string());
                            audit::record(
                                "strategy_paused",
                                "strategy",
                                Some(&strategy.id),
                                &serde_json::json!({
                                    "reason": "auto_pause_failures",
                                    "failureCount": strategy.failure_count,
                                }),
                            );
                        }
                        let _ = upsert_strategy(&strategy);
                        error!(
                            strategy_id = %strategy.id,
                            failure_count = strategy.failure_count,
                            "heartbeat.strategy_failed: {}",
                            err
                        );
                    }
                }
            }

            scheduler::run_due_jobs(&app, now).await;

            flow_scheduler::sync_submitted_flow_rows(&app).await;
        }
    });
}
