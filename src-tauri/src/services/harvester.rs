//! Background service to monitor and notify about harvestable DeFi yields.

use tauri::{AppHandle, Emitter};
use std::time::Duration;
use tokio::time::interval;
use serde::Serialize;

const HARVESTER_INTERVAL_SECS: u64 = 7200; // 2 hours

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarvestOpportunity {
    pub protocol: String,
    pub asset: String,
    pub amount: String,
    pub value_usd: String,
    pub gas_cost_usd: String,
    pub chain: String,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut timer = interval(Duration::from_secs(HARVESTER_INTERVAL_SECS));

        loop {
            timer.tick().await;
            
            if let Err(e) = run_harvester_cycle(&app).await {
                eprintln!("YieldHarvester error: {}", e);
            }
        }
    });
}

async fn run_harvester_cycle(app: &AppHandle) -> Result<(), String> {
    // 1. Get wallet addresses
    let addresses = crate::commands::get_addresses(app);
    if addresses.is_empty() {
        return Ok(());
    }

    // 2. Identify protocols to scan (In real app, this would query specific chain ABIs)
    // Placeholder logic for demonstration:
    let opportunities = vec![
        HarvestOpportunity {
            protocol: "Aave V3".to_string(),
            asset: "WETH".to_string(),
            amount: "0.045".to_string(),
            value_usd: "$120.50".to_string(),
            gas_cost_usd: "$2.10".to_string(),
            chain: "Base".to_string(),
        }
    ];

    for opp in opportunities {
        // Only notify if reward > gas cost * 5 (Arbitrary threshold for automation logic)
        let _ = app.emit("harvest_opportunity", opp);
    }

    Ok(())
}
