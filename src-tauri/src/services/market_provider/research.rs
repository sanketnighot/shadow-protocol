use serde::Deserialize;

use super::{CandidateSource, CatalystCandidate};
use crate::services::sonar_client;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResearchPayload {
    opportunities: Vec<ResearchOpportunity>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResearchOpportunity {
    title: String,
    summary: String,
    chain: String,
    protocol: Option<String>,
    symbols: Vec<String>,
    confidence: f64,
}

pub async fn fetch_catalyst_candidates(now: i64) -> Result<Vec<CatalystCandidate>, String> {
    let prompt = r#"Return JSON only with this exact shape:
{"opportunities":[
  {"title":"short title","summary":"one or two concise sentences","chain":"ethereum|base|polygon|multi_chain","protocol":null,"symbols":["ETH"],"confidence":0.0}
]}

Only include 0 to 3 high-signal catalysts relevant to supported DeFi activity on Ethereum, Base, Polygon, or cross-chain stablecoin rebalancing.
Do not include unsupported chains.
Do not include markdown."#;

    let raw = match sonar_client::search(prompt).await {
        Ok(value) => value,
        Err(_) => return Ok(Vec::new()),
    };

    let payload = match extract_json::<ResearchPayload>(&raw) {
        Some(value) => value,
        None => return Ok(Vec::new()),
    };

    let mut out = Vec::new();
    for item in payload.opportunities {
        let chain = normalize_chain(&item.chain).unwrap_or("multi_chain");
        let title = item.title.trim().to_string();
        let summary = item.summary.trim().to_string();
        if title.is_empty() || summary.is_empty() {
            continue;
        }

        out.push(CatalystCandidate {
            id_seed: format!("catalyst:{}:{}", chain, slugify(&title)),
            title,
            summary,
            chain: chain.to_string(),
            protocol: item.protocol.and_then(|p| {
                let trimmed = p.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            }),
            symbols: item
                .symbols
                .into_iter()
                .map(|symbol| symbol.trim().to_uppercase())
                .filter(|symbol| !symbol.is_empty())
                .collect(),
            confidence: item.confidence.clamp(0.0, 1.0),
            sources: vec![CandidateSource {
                label: "Sonar".to_string(),
                url: None,
                note: Some("Synthesized research catalyst".to_string()),
                captured_at: Some(now),
            }],
            fresh_until: now + 60 * 60,
        });
    }

    Ok(out)
}

fn normalize_chain(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "ethereum" => Some("ethereum"),
        "base" => Some("base"),
        "polygon" => Some("polygon"),
        "multi_chain" | "multichain" | "multi-chain" => Some("multi_chain"),
        _ => None,
    }
}

fn slugify(input: &str) -> String {
    input
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn extract_json<T: for<'de> Deserialize<'de>>(raw: &str) -> Option<T> {
    let trimmed = raw.trim();
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    serde_json::from_str(&trimmed[start..=end]).ok()
}
