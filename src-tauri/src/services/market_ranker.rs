use crate::services::market_provider::{
    CatalystCandidate, MarketCandidate, RebalanceCandidate, SpreadWatchCandidate, YieldCandidate,
};
use crate::services::market_service::{
    chain_symbol, display_chain, MarketContext, MarketOpportunity, MarketOpportunityCompactDetails,
    MarketOpportunityMetric, MarketOpportunitySource, MarketPortfolioFit, MarketPrimaryAction,
    MarketRankingBreakdown, MarketStoredDetailData,
};

#[derive(Debug, Clone)]
pub struct RankedMarketOpportunity {
    pub opportunity: MarketOpportunity,
    pub detail: MarketStoredDetailData,
    pub sources: Vec<MarketOpportunitySource>,
}

pub fn rank_candidates(
    candidates: Vec<MarketCandidate>,
    context: &MarketContext,
    now: i64,
) -> Vec<RankedMarketOpportunity> {
    let mut out = candidates
        .into_iter()
        .map(|candidate| rank_candidate(candidate, context, now))
        .collect::<Vec<_>>();

    out.sort_by(|a, b| {
        b.opportunity
            .score
            .partial_cmp(&a.opportunity.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    out.truncate(24);
    out
}

fn rank_candidate(
    candidate: MarketCandidate,
    context: &MarketContext,
    now: i64,
) -> RankedMarketOpportunity {
    match candidate {
        MarketCandidate::Yield(candidate) => rank_yield(candidate, context, now),
        MarketCandidate::SpreadWatch(candidate) => rank_spread_watch(candidate, context, now),
        MarketCandidate::Rebalance(candidate) => rank_rebalance(candidate, context, now),
        MarketCandidate::Catalyst(candidate) => rank_catalyst(candidate, context, now),
    }
}

fn rank_yield(candidate: YieldCandidate, context: &MarketContext, now: i64) -> RankedMarketOpportunity {
    let liquidity_score = normalize(candidate.tvl_usd, 5_000_000.0, 2_000_000_000.0);
    let apy_score = normalize(candidate.apy, 2.0, 18.0);
    let freshness_score = freshness_score(candidate.fresh_until, now);
    let protocol_score = if candidate.stablecoin { 0.85 } else { 0.72 };
    let global_score = weighted_score(&[
        (apy_score, 0.35),
        (liquidity_score, 0.30),
        (freshness_score, 0.20),
        (protocol_score, 0.15),
    ]);

    let has_asset = context.holdings_by_symbol.contains_key(&candidate.symbol);
    let chain_value = context
        .holdings_by_chain
        .get(&candidate.chain)
        .copied()
        .unwrap_or(0.0);
    let chain_coverage = if context.total_usd > 0.0 {
        (chain_value / context.total_usd).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let personal_score = weighted_score(&[
        (bool_score(has_asset), 0.45),
        (chain_coverage, 0.35),
        (bool_score(context.wallet_count > 0), 0.20),
    ]);

    let total = (global_score * 0.65 + personal_score * 0.35) * 100.0;
    let risk = if candidate.stablecoin && candidate.apy <= 12.0 && candidate.tvl_usd >= 100_000_000.0 {
        "low"
    } else if candidate.apy <= 20.0 {
        "medium"
    } else {
        "high"
    };

    let portfolio_fit = MarketPortfolioFit {
        has_required_asset: has_asset,
        wallet_coverage: format!("{}/{} wallets", usize::from(has_asset), context.wallet_count),
        guardrail_fit: candidate.apy <= 25.0,
        relevance_reasons: vec![
            format!("{} liquidity on {}", candidate.symbol, display_chain(&candidate.chain)),
            if has_asset {
                format!("You already hold {}", candidate.symbol)
            } else {
                format!("Agent can model a route into {}", candidate.symbol)
            },
        ],
    };

    let metrics = vec![
        MarketOpportunityMetric {
            label: "Net APY".to_string(),
            value: format!("{:.2}%", candidate.apy),
            kind: "apy".to_string(),
        },
        MarketOpportunityMetric {
            label: "TVL".to_string(),
            value: format_usd_short(candidate.tvl_usd),
            kind: "tvl_usd".to_string(),
        },
        MarketOpportunityMetric {
            label: "Asset".to_string(),
            value: candidate.symbol.clone(),
            kind: "asset".to_string(),
        },
    ];

    let sources = candidate
        .sources
        .into_iter()
        .map(candidate_source_to_detail)
        .collect::<Vec<_>>();

    RankedMarketOpportunity {
        opportunity: MarketOpportunity {
            id: sanitize_id(&candidate.id_seed),
            title: candidate.title.clone(),
            summary: candidate.summary.clone(),
            category: "yield".to_string(),
            chain: candidate.chain.clone(),
            protocol: Some(candidate.protocol.clone()),
            symbols: vec![candidate.symbol.clone()],
            risk: risk.to_string(),
            confidence: (global_score * 0.7 + personal_score * 0.3).clamp(0.0, 1.0),
            score: total,
            actionability: "agent_ready".to_string(),
            fresh_until: Some(candidate.fresh_until),
            stale: false,
            source_count: sources.len(),
            source_labels: sources.iter().map(|source| source.label.clone()).collect(),
            metrics,
            portfolio_fit,
            primary_action: MarketPrimaryAction {
                kind: "open_agent".to_string(),
                label: "Ask agent".to_string(),
                enabled: true,
                reason_disabled: None,
            },
            details: MarketOpportunityCompactDetails {
                thesis: vec![
                    format!("{} offers {:.2}% APY on {}", candidate.protocol, candidate.apy, display_chain(&candidate.chain)),
                    format!("Liquidity sits at {}", format_usd_short(candidate.tvl_usd)),
                ],
                notes: vec!["Execution remains agent-guided, not one-click protocol deposit.".to_string()],
            },
        },
        detail: MarketStoredDetailData {
            details: MarketOpportunityCompactDetails {
                thesis: vec![
                    format!("{} APY remains attractive relative to tracked pools.", candidate.symbol),
                    format!("{} has sufficient TVL for monitored deployment.", candidate.protocol),
                ],
                notes: vec![
                    format!("Wallet fit score reflects current {} exposure and chain availability.", candidate.symbol),
                ],
            },
            ranking_breakdown: MarketRankingBreakdown {
                global_score: round_two(global_score * 100.0),
                personal_score: round_two(personal_score * 100.0),
                total_score: round_two(total),
                reasons: vec![
                    "Yield ranking weights APY, TVL, freshness, and protocol safety.".to_string(),
                    "Personal score rewards owned assets and supported-chain presence.".to_string(),
                ],
            },
            guardrail_notes: vec![
                "Review slippage, lockup, and protocol-specific deposit limits with the agent before acting.".to_string(),
            ],
            execution_readiness_notes: vec![
                "This opportunity is agent-ready for analysis, not direct protocol execution.".to_string(),
            ],
        },
        sources,
    }
}

fn rank_spread_watch(candidate: SpreadWatchCandidate, context: &MarketContext, now: i64) -> RankedMarketOpportunity {
    let global_score = weighted_score(&[
        (normalize(candidate.spread_bps, 75.0, 400.0), 0.45),
        (freshness_score(candidate.fresh_until, now), 0.30),
        (0.55, 0.25),
    ]);
    let has_asset = candidate
        .symbols
        .iter()
        .any(|symbol| context.holdings_by_symbol.contains_key(symbol));
    let personal_score = weighted_score(&[
        (bool_score(has_asset), 0.55),
        (
            context
                .holdings_by_chain
                .get(&candidate.chain)
                .map(|value| (*value / context.total_usd.max(1.0)).clamp(0.0, 1.0))
                .unwrap_or(0.0),
            0.45,
        ),
    ]);
    let total = (global_score * 0.65 + personal_score * 0.35) * 100.0;
    let sources = candidate
        .sources
        .into_iter()
        .map(candidate_source_to_detail)
        .collect::<Vec<_>>();

    RankedMarketOpportunity {
        opportunity: MarketOpportunity {
            id: sanitize_id(&candidate.id_seed),
            title: candidate.title.clone(),
            summary: candidate.summary.clone(),
            category: "spread_watch".to_string(),
            chain: candidate.chain.clone(),
            protocol: candidate.protocol.clone(),
            symbols: candidate.symbols.clone(),
            risk: if candidate.spread_bps >= 250.0 { "high" } else { "medium" }.to_string(),
            confidence: (global_score * 0.75 + personal_score * 0.25).clamp(0.0, 1.0),
            score: total,
            actionability: "agent_ready".to_string(),
            fresh_until: Some(candidate.fresh_until),
            stale: false,
            source_count: sources.len(),
            source_labels: sources.iter().map(|source| source.label.clone()).collect(),
            metrics: vec![
                MarketOpportunityMetric {
                    label: "Spread".to_string(),
                    value: format!("{:.0} bps", candidate.spread_bps),
                    kind: "spread_bps".to_string(),
                },
                MarketOpportunityMetric {
                    label: "Best chain".to_string(),
                    value: display_chain(&candidate.chain).to_string(),
                    kind: "chain".to_string(),
                },
                MarketOpportunityMetric {
                    label: "Reference".to_string(),
                    value: display_chain(&candidate.reference_chain).to_string(),
                    kind: "reference_chain".to_string(),
                },
            ],
            portfolio_fit: MarketPortfolioFit {
                has_required_asset: has_asset,
                wallet_coverage: format!("{}/{} wallets", usize::from(has_asset), context.wallet_count),
                guardrail_fit: candidate.spread_bps < 400.0,
                relevance_reasons: vec![
                    format!("Spread detected between {} and {}", display_chain(&candidate.chain), display_chain(&candidate.reference_chain)),
                    "Requires manual review for routing and execution complexity.".to_string(),
                ],
            },
            primary_action: MarketPrimaryAction {
                kind: "open_agent".to_string(),
                label: "Review route".to_string(),
                enabled: true,
                reason_disabled: None,
            },
            details: MarketOpportunityCompactDetails {
                thesis: vec![
                    format!("Observed spread of {:.0} bps for {}", candidate.spread_bps, candidate.symbols.join("/")),
                    "Manual route validation is required before acting.".to_string(),
                ],
                notes: vec!["Displayed as agent-guided research, not auto-executable.".to_string()],
            },
        },
        detail: MarketStoredDetailData {
            details: MarketOpportunityCompactDetails {
                thesis: vec![
                    "Cross-chain pricing or yield dispersion may be exploitable, but execution complexity is high.".to_string(),
                ],
                notes: vec!["Use the agent to inspect route risk, gas, and approvals.".to_string()],
            },
            ranking_breakdown: MarketRankingBreakdown {
                global_score: round_two(global_score * 100.0),
                personal_score: round_two(personal_score * 100.0),
                total_score: round_two(total),
                reasons: vec![
                    "Spread-watch opportunities are scored for freshness and dispersion size.".to_string(),
                ],
            },
            guardrail_notes: vec!["Do not assume spread capture survives fees or slippage without a route review.".to_string()],
            execution_readiness_notes: vec!["Agent-ready only. Direct swap execution is not exposed from the Market page.".to_string()],
        },
        sources,
    }
}

fn rank_rebalance(candidate: RebalanceCandidate, context: &MarketContext, now: i64) -> RankedMarketOpportunity {
    let drift_score = normalize(candidate.drift_pct, 5.0, 35.0);
    let notional_score = normalize(candidate.estimated_notional_usd, 500.0, context.total_usd.max(2_500.0));
    let global_score = weighted_score(&[
        (drift_score, 0.55),
        (notional_score, 0.30),
        (freshness_score(candidate.fresh_until, now), 0.15),
    ]);
    let has_assets = candidate
        .symbols
        .iter()
        .any(|symbol| context.holdings_by_symbol.contains_key(symbol));
    let personal_score = weighted_score(&[
        (bool_score(has_assets), 0.60),
        (bool_score(context.wallet_count > 0), 0.40),
    ]);
    let total = (global_score * 0.65 + personal_score * 0.35) * 100.0;
    let sources = candidate
        .sources
        .into_iter()
        .map(candidate_source_to_detail)
        .collect::<Vec<_>>();
    let action_enabled = context.wallet_count > 0 && candidate.estimated_notional_usd > 50.0;

    RankedMarketOpportunity {
        opportunity: MarketOpportunity {
            id: sanitize_id(&candidate.id_seed),
            title: candidate.title.clone(),
            summary: candidate.summary.clone(),
            category: "rebalance".to_string(),
            chain: candidate.chain.clone(),
            protocol: None,
            symbols: candidate.symbols.clone(),
            risk: "low".to_string(),
            confidence: (global_score * 0.6 + personal_score * 0.4).clamp(0.0, 1.0),
            score: total,
            actionability: "approval_ready".to_string(),
            fresh_until: Some(candidate.fresh_until),
            stale: false,
            source_count: sources.len(),
            source_labels: sources.iter().map(|source| source.label.clone()).collect(),
            metrics: vec![
                MarketOpportunityMetric {
                    label: "Drift".to_string(),
                    value: format!("{:.1}%", candidate.drift_pct),
                    kind: "drift_pct".to_string(),
                },
                MarketOpportunityMetric {
                    label: "Notional".to_string(),
                    value: format_usd_short(candidate.estimated_notional_usd),
                    kind: "notional_usd".to_string(),
                },
                MarketOpportunityMetric {
                    label: "Target".to_string(),
                    value: "Reduce concentration".to_string(),
                    kind: "target".to_string(),
                },
            ],
            portfolio_fit: MarketPortfolioFit {
                has_required_asset: has_assets,
                wallet_coverage: format!("{}/{} wallets", context.wallet_count.min(1), context.wallet_count),
                guardrail_fit: action_enabled,
                relevance_reasons: vec![
                    "Derived directly from local portfolio concentration.".to_string(),
                    "Can be converted into an approval-gated strategy draft.".to_string(),
                ],
            },
            primary_action: MarketPrimaryAction {
                kind: "prepare_action".to_string(),
                label: "Queue strategy".to_string(),
                enabled: action_enabled,
                reason_disabled: if action_enabled {
                    None
                } else {
                    Some("Connect and sync a funded wallet to queue a rebalance strategy.".to_string())
                },
            },
            details: MarketOpportunityCompactDetails {
                thesis: vec![
                    format!("Current portfolio drift is {:.1}% beyond the baseline concentration band.", candidate.drift_pct),
                ],
                notes: vec!["Primary action creates an approval-gated strategy draft rather than executing capital movement.".to_string()],
            },
        },
        detail: MarketStoredDetailData {
            details: MarketOpportunityCompactDetails {
                thesis: vec!["This rebalance is fully portfolio-derived.".to_string()],
                notes: vec![
                    format!("Suggested notional: {}", format_usd_short(candidate.estimated_notional_usd)),
                    format!("Default destination asset bias uses {}", chain_symbol("ethereum")),
                ],
            },
            ranking_breakdown: MarketRankingBreakdown {
                global_score: round_two(global_score * 100.0),
                personal_score: round_two(personal_score * 100.0),
                total_score: round_two(total),
                reasons: vec![
                    "Rebalance scores prioritize drift severity and immediate portfolio relevance.".to_string(),
                ],
            },
            guardrail_notes: vec![
                "Queued action becomes an approval-required strategy draft and does not auto-execute.".to_string(),
            ],
            execution_readiness_notes: vec![
                "This is approval-ready because the backend can persist a guarded strategy proposal today.".to_string(),
            ],
        },
        sources,
    }
}

fn rank_catalyst(candidate: CatalystCandidate, context: &MarketContext, now: i64) -> RankedMarketOpportunity {
    let global_score = weighted_score(&[
        (candidate.confidence.clamp(0.0, 1.0), 0.60),
        (freshness_score(candidate.fresh_until, now), 0.40),
    ]);
    let has_overlap = candidate
        .symbols
        .iter()
        .any(|symbol| context.holdings_by_symbol.contains_key(symbol));
    let personal_score = weighted_score(&[
        (bool_score(has_overlap), 0.55),
        (bool_score(context.wallet_count > 0), 0.45),
    ]);
    let total = (global_score * 0.65 + personal_score * 0.35) * 100.0;
    let sources = candidate
        .sources
        .into_iter()
        .map(candidate_source_to_detail)
        .collect::<Vec<_>>();

    RankedMarketOpportunity {
        opportunity: MarketOpportunity {
            id: sanitize_id(&candidate.id_seed),
            title: candidate.title.clone(),
            summary: candidate.summary.clone(),
            category: "catalyst".to_string(),
            chain: candidate.chain.clone(),
            protocol: candidate.protocol.clone(),
            symbols: candidate.symbols.clone(),
            risk: if candidate.confidence >= 0.75 { "medium" } else { "high" }.to_string(),
            confidence: candidate.confidence.clamp(0.0, 1.0),
            score: total,
            actionability: "research_only".to_string(),
            fresh_until: Some(candidate.fresh_until),
            stale: false,
            source_count: sources.len(),
            source_labels: sources.iter().map(|source| source.label.clone()).collect(),
            metrics: vec![
                MarketOpportunityMetric {
                    label: "Confidence".to_string(),
                    value: format!("{:.0}%", candidate.confidence * 100.0),
                    kind: "confidence".to_string(),
                },
                MarketOpportunityMetric {
                    label: "Chain".to_string(),
                    value: display_chain(&candidate.chain).to_string(),
                    kind: "chain".to_string(),
                },
            ],
            portfolio_fit: MarketPortfolioFit {
                has_required_asset: has_overlap,
                wallet_coverage: format!("{}/{} wallets", usize::from(has_overlap), context.wallet_count),
                guardrail_fit: true,
                relevance_reasons: vec![
                    "Research-only catalyst surfaced from live market analysis.".to_string(),
                ],
            },
            primary_action: MarketPrimaryAction {
                kind: "open_detail".to_string(),
                label: "View detail".to_string(),
                enabled: true,
                reason_disabled: None,
            },
            details: MarketOpportunityCompactDetails {
                thesis: vec!["Research catalysts are informational and should be verified before action.".to_string()],
                notes: vec!["The Market page will not present this as executable.".to_string()],
            },
        },
        detail: MarketStoredDetailData {
            details: MarketOpportunityCompactDetails {
                thesis: vec![candidate.summary.clone()],
                notes: vec!["Use the agent for follow-up analysis and portfolio impact assessment.".to_string()],
            },
            ranking_breakdown: MarketRankingBreakdown {
                global_score: round_two(global_score * 100.0),
                personal_score: round_two(personal_score * 100.0),
                total_score: round_two(total),
                reasons: vec![
                    "Catalyst ranking reflects research confidence and overlap with held assets.".to_string(),
                ],
            },
            guardrail_notes: vec!["No direct execution path is exposed for research-only opportunities.".to_string()],
            execution_readiness_notes: vec!["Research-only. Route through the agent for any next-step planning.".to_string()],
        },
        sources,
    }
}

fn candidate_source_to_detail(source: crate::services::market_provider::CandidateSource) -> MarketOpportunitySource {
    MarketOpportunitySource {
        label: source.label,
        url: source.url,
        note: source.note,
        captured_at: source.captured_at,
    }
}

fn bool_score(value: bool) -> f64 {
    if value { 1.0 } else { 0.0 }
}

fn freshness_score(fresh_until: i64, now: i64) -> f64 {
    if fresh_until <= now {
        0.25
    } else {
        let remaining = (fresh_until - now) as f64;
        (remaining / 3600.0).clamp(0.25, 1.0)
    }
}

fn weighted_score(parts: &[(f64, f64)]) -> f64 {
    parts
        .iter()
        .map(|(score, weight)| score.clamp(0.0, 1.0) * weight)
        .sum::<f64>()
        .clamp(0.0, 1.0)
}

fn normalize(value: f64, floor: f64, ceiling: f64) -> f64 {
    if ceiling <= floor {
        return 0.0;
    }
    ((value - floor) / (ceiling - floor)).clamp(0.0, 1.0)
}

fn round_two(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn format_usd_short(value: f64) -> String {
    if value >= 1_000_000_000.0 {
        format!("${:.2}B", value / 1_000_000_000.0)
    } else if value >= 1_000_000.0 {
        format!("${:.2}M", value / 1_000_000.0)
    } else if value >= 1_000.0 {
        format!("${:.1}K", value / 1_000.0)
    } else {
        format!("${:.2}", value)
    }
}

fn sanitize_id(seed: &str) -> String {
    seed.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == ':' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}
