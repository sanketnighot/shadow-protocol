use tauri::{AppHandle, Emitter};
use tokio::time::{interval, Duration};

#[derive(Clone, serde::Serialize)]
struct ShadowBriefPayload {
    message: String,
    timestamp: i64,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Run every 15 minutes
        let mut interval = interval(Duration::from_secs(15 * 60));
        
        loop {
            interval.tick().await;
            
            println!("[Heartbeat] Checking triggers...");
            
            // TODO: Here we would deterministically fetch prices from Alchemy/CoinGecko.
            // For now, we simulate a trigger if the user has specific memories.
            
            let memory = crate::services::agent_state::read_memory(&app).unwrap_or_default();
            
            // Simple mock trigger: if we have facts, send a brief.
            if !memory.facts.is_empty() {
                // We could query Ollama here:
                // let prompt = format!("Based on these facts: {:?}, draft a brief update.", memory.facts);
                // let brief = ollama_client::chat(...).await;
                
                let mock_brief = format!("Shadow Protocol has processed {} memory facts. Your DeFi portfolio is stable. Gas is optimal.", memory.facts.len());
                
                let payload = ShadowBriefPayload {
                    message: mock_brief,
                    timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64,
                };
                
                println!("[Heartbeat] Emitting shadow_brief_ready");
                let _ = app.emit("shadow_brief_ready", payload);
            }
        }
    });
}
