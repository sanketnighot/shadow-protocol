use reqwest::Client;
use serde::Deserialize;

use super::{CandidateSource, YieldCandidate};

const DEFILLAMA_POOLS_URL: &str = "https://yields.llama.fi/pools";

#[derive(Debug, Deserialize)]
struct DefiLlamaResponse {
    data: Vec<DefiLlamaPool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DefiLlamaPool {
    chain: Option<String>,
    project: Option<String>,
    symbol: Option<String>,
    apy: Option<f64>,
    apy_base: Option<f64>,
    apy_reward: Option<f64>,
    tvl_usd: Option<f64>,
    stablecoin: Option<bool>,
    pool: Option<String>,
}

pub async fn fetch_yield_candidates(now: i64) -> Result<Vec<YieldCandidate>, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("failed to build market client: {e}"))?;

    let response = client
        .get(DEFILLAMA_POOLS_URL)
        .send()
        .await
        .map_err(|e| format!("failed to fetch DefiLlama pools: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("DefiLlama returned {}", response.status()));
    }

    let body: DefiLlamaResponse = response
        .json()
        .await
        .map_err(|e| format!("failed to parse DefiLlama response: {e}"))?;

    let mut out = Vec::new();
    for pool in body.data {
        let Some(chain) = pool.chain.as_deref().and_then(normalize_chain) else {
            continue;
        };

        let Some(symbol) = pool.symbol.as_ref().map(|s| normalize_symbol(s)) else {
            continue;
        };
        if symbol.is_empty() {
            continue;
        }

        let apy = pool.apy.unwrap_or(0.0);
        let tvl_usd = pool.tvl_usd.unwrap_or(0.0);
        if apy <= 0.0 || tvl_usd < 1_000_000.0 {
            continue;
        }

        let protocol = pool
            .project
            .as_deref()
            .map(normalize_protocol)
            .unwrap_or_else(|| "Unknown".to_string());
        let stablecoin = pool.stablecoin.unwrap_or(false);

        out.push(YieldCandidate {
            id_seed: format!(
                "yield:{}:{}:{}",
                chain,
                protocol.to_lowercase(),
                pool.pool.unwrap_or_else(|| symbol.to_lowercase())
            ),
            title: format!("{} on {}", protocol, display_chain(chain)),
            summary: format!(
                "{} exposure with {:.2}% net APY and ${:.1}M TVL.",
                symbol,
                apy,
                tvl_usd / 1_000_000.0
            ),
            chain: chain.to_string(),
            protocol,
            symbol,
            apy,
            apy_base: pool.apy_base,
            apy_reward: pool.apy_reward,
            tvl_usd,
            stablecoin,
            sources: vec![CandidateSource {
                label: "DefiLlama".to_string(),
                url: Some(DEFILLAMA_POOLS_URL.to_string()),
                note: None,
                captured_at: Some(now),
            }],
            fresh_until: now + 15 * 60,
        });
    }

    out.sort_by(|a, b| {
        let b_score = b.apy * 0.6 + (b.tvl_usd.min(2_000_000_000.0) / 2_000_000_000.0) * 40.0;
        let a_score = a.apy * 0.6 + (a.tvl_usd.min(2_000_000_000.0) / 2_000_000_000.0) * 40.0;
        b_score
            .partial_cmp(&a_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    out.truncate(24);

    Ok(out)
}

fn normalize_chain(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "ethereum" => Some("ethereum"),
        "base" => Some("base"),
        "polygon" => Some("polygon"),
        _ => None,
    }
}

fn display_chain(chain: &str) -> &'static str {
    match chain {
        "ethereum" => "Ethereum",
        "base" => "Base",
        "polygon" => "Polygon",
        _ => "Unknown",
    }
}

fn normalize_symbol(raw: &str) -> String {
    raw.split(['-', '/'])
        .next()
        .unwrap_or(raw)
        .trim()
        .to_uppercase()
}

fn normalize_protocol(raw: &str) -> String {
    let mut chars = raw.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => "Unknown".to_string(),
    }
}
