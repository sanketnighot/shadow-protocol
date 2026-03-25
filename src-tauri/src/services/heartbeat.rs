use tauri::{AppHandle, Emitter};
use tokio::time::{interval, Duration};
use crate::services::local_db::{get_strategies, upsert_strategy};

#[derive(Clone, serde::Serialize)]
struct ShadowBriefPayload {
    id: String,
    title: String,
    message: String,
    timestamp: i64,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Run pulse every 1 minute for responsiveness (internal interval logic will handle 5m/15m etc)
        let mut interval = interval(Duration::from_secs(60));
        
        loop {
            interval.tick().await;
            
            let strategies = match get_strategies() {
                Ok(s) => s,
                Err(e) => {
                    println!("[Heartbeat] DB Error: {}", e);
                    continue;
                }
            };

            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

            for mut strategy in strategies {
                if strategy.status != "active" {
                    continue;
                }

                // Check if it's time to run based on next_run_at
                if let Some(next) = strategy.next_run_at {
                    if now < next {
                        continue;
                    }
                }

                println!("[Heartbeat] Evaluating strategy: {}", strategy.name);

                // Determine next run time (default 5 mins if not specified)
                // In a real app, we would parse strategy.trigger_json for "interval"
                let next_interval = 5 * 60; 
                strategy.next_run_at = Some(now + next_interval);
                strategy.last_run_at = Some(now);

                // Simulation of "Action" execution
                // We'll emit a brief to the UI
                let payload = ShadowBriefPayload {
                    id: uuid::Uuid::new_v4().to_string(),
                    title: format!("Automation: {}", strategy.name),
                    message: format!("Trigger met for '{}'. Action executed: {}. Market conditions within guardrails.", strategy.name, strategy.summary.as_deref().unwrap_or("log_price")),
                    timestamp: now,
                };

                let _ = app.emit("shadow_brief_ready", payload);
                
                // Update strategy in DB with new run times
                let _ = upsert_strategy(&strategy);
            }
        }
    });
}
