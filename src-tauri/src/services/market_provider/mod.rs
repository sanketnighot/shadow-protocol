use serde::{Deserialize, Serialize};

pub mod defillama;
pub mod research;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateSource {
    pub label: String,
    pub url: Option<String>,
    pub note: Option<String>,
    pub captured_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YieldCandidate {
    pub id_seed: String,
    pub title: String,
    pub summary: String,
    pub chain: String,
    pub protocol: String,
    pub symbol: String,
    pub apy: f64,
    pub apy_base: Option<f64>,
    pub apy_reward: Option<f64>,
    pub tvl_usd: f64,
    pub stablecoin: bool,
    pub sources: Vec<CandidateSource>,
    pub fresh_until: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadWatchCandidate {
    pub id_seed: String,
    pub title: String,
    pub summary: String,
    pub chain: String,
    pub protocol: Option<String>,
    pub symbols: Vec<String>,
    pub spread_bps: f64,
    pub reference_chain: String,
    pub sources: Vec<CandidateSource>,
    pub fresh_until: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebalanceCandidate {
    pub id_seed: String,
    pub title: String,
    pub summary: String,
    pub chain: String,
    pub symbols: Vec<String>,
    pub drift_pct: f64,
    pub estimated_notional_usd: f64,
    pub sources: Vec<CandidateSource>,
    pub fresh_until: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalystCandidate {
    pub id_seed: String,
    pub title: String,
    pub summary: String,
    pub chain: String,
    pub protocol: Option<String>,
    pub symbols: Vec<String>,
    pub confidence: f64,
    pub sources: Vec<CandidateSource>,
    pub fresh_until: i64,
}

#[derive(Debug, Clone)]
pub enum MarketCandidate {
    Yield(YieldCandidate),
    SpreadWatch(SpreadWatchCandidate),
    Rebalance(RebalanceCandidate),
    Catalyst(CatalystCandidate),
}

pub fn derive_spread_watch_candidates(yields: &[YieldCandidate], now: i64) -> Vec<SpreadWatchCandidate> {
    use std::collections::HashMap;

    let mut by_symbol = HashMap::<String, Vec<&YieldCandidate>>::new();
    for candidate in yields {
        by_symbol
            .entry(candidate.symbol.clone())
            .or_default()
            .push(candidate);
    }

    let mut out = Vec::new();
    for (symbol, group) in by_symbol {
        if group.len() < 2 {
            continue;
        }

        let mut ranked = group;
        ranked.sort_by(|a, b| {
            b.apy
                .partial_cmp(&a.apy)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let Some(best) = ranked.first() else {
            continue;
        };
        let Some(next_best) = ranked.get(1) else {
            continue;
        };

        let apy_delta = best.apy - next_best.apy;
        if apy_delta < 0.75 {
            continue;
        }

        let spread_bps = apy_delta * 100.0;
        out.push(SpreadWatchCandidate {
            id_seed: format!("spread:{}:{}:{}", symbol.to_lowercase(), best.chain, next_best.chain),
            title: format!("{} spread watch on {}", symbol, capitalize_chain(&best.chain)),
            summary: format!(
                "{} on {} is yielding {:.2}% vs {:.2}% on {}. Review whether that spread is worth a manual route.",
                symbol,
                capitalize_chain(&best.chain),
                best.apy,
                next_best.apy,
                capitalize_chain(&next_best.chain),
            ),
            chain: best.chain.clone(),
            protocol: Some(best.protocol.clone()),
            symbols: vec![symbol.clone()],
            spread_bps,
            reference_chain: next_best.chain.clone(),
            sources: best.sources.clone(),
            fresh_until: now + 15 * 60,
        });
    }

    out
}

fn capitalize_chain(chain: &str) -> String {
    match chain {
        "ethereum" => "Ethereum".to_string(),
        "base" => "Base".to_string(),
        "polygon" => "Polygon".to_string(),
        "multi_chain" => "Multi-chain".to_string(),
        other => {
            let mut chars = other.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        }
    }
}
