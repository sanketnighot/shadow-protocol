use crate::services::audit;
use crate::services::local_db::{self, ApprovalRecord};
use crate::services::market_service::{
    get_cached_opportunity, MarketPrepareOpportunityActionInput,
    MarketPrepareOpportunityActionResult,
};

pub fn prepare_opportunity_action(
    input: MarketPrepareOpportunityActionInput,
) -> Result<MarketPrepareOpportunityActionResult, String> {
    let opportunity_id = input.opportunity_id.trim();
    if opportunity_id.is_empty() {
        return Err("Opportunity id is required".to_string());
    }

    let opportunity = get_cached_opportunity(opportunity_id)?;
    if !opportunity.primary_action.enabled {
        return Ok(MarketPrepareOpportunityActionResult::DetailOnly {
            reason: opportunity
                .primary_action
                .reason_disabled
                .unwrap_or_else(|| "This opportunity is not currently actionable.".to_string()),
        });
    }

    match opportunity.actionability.as_str() {
        "approval_ready" => create_strategy_approval(&opportunity),
        "agent_ready" => Ok(MarketPrepareOpportunityActionResult::AgentDraft {
            title: opportunity.title.clone(),
            prompt: build_agent_prompt(&opportunity),
        }),
        _ => Ok(MarketPrepareOpportunityActionResult::DetailOnly {
            reason: "This opportunity is research-only. Review the details before taking action.".to_string(),
        }),
    }
}

fn create_strategy_approval(
    opportunity: &crate::services::market_service::MarketOpportunity,
) -> Result<MarketPrepareOpportunityActionResult, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);

    let payload = serde_json::json!({
        "name": opportunity.title,
        "summary": opportunity.summary,
        "trigger": {
            "type": "manual_market_opportunity",
            "opportunityId": opportunity.id,
        },
        "action": {
            "type": "rebalance",
            "category": opportunity.category,
            "chain": opportunity.chain,
            "symbols": opportunity.symbols,
            "opportunityId": opportunity.id,
        },
        "guardrails": {
            "mode": "approval_required",
            "source": "market",
            "maxNotionalUsd": "1000",
            "reason": "Created from market opportunity queue"
        }
    });

    let approval = ApprovalRecord {
        id: uuid::Uuid::new_v4().to_string(),
        source: "market".to_string(),
        tool_name: "create_automation_strategy".to_string(),
        kind: "strategy_create".to_string(),
        status: "pending".to_string(),
        payload_json: payload.to_string(),
        simulation_json: Some(
            serde_json::json!({
                "validated": true,
                "actionability": opportunity.actionability,
                "marketOpportunityId": opportunity.id,
            })
            .to_string(),
        ),
        policy_json: Some(
            serde_json::json!({
                "mode": "always_require",
                "source": "market",
            })
            .to_string(),
        ),
        message: format!(
            "Queue '{}' as an approval-gated strategy draft? This does not move funds immediately.",
            opportunity.title
        ),
        expires_at: Some(now + 15 * 60),
        version: 1,
        strategy_id: None,
        created_at: now,
        updated_at: now,
    };
    local_db::insert_approval_request(&approval).map_err(|e| e.to_string())?;
    audit::record(
        "market_approval_created",
        "market_opportunity",
        Some(&opportunity.id),
        &serde_json::json!({
            "approvalId": approval.id,
            "toolName": approval.tool_name,
        }),
    );

    Ok(MarketPrepareOpportunityActionResult::ApprovalRequired {
        approval_id: approval.id,
        tool_name: approval.tool_name,
        message: approval.message,
        payload,
        expected_version: approval.version,
    })
}

fn build_agent_prompt(
    opportunity: &crate::services::market_service::MarketOpportunity,
) -> String {
    let metrics = opportunity
        .metrics
        .iter()
        .map(|metric| format!("{}: {}", metric.label, metric.value))
        .collect::<Vec<_>>()
        .join(", ");
    let reasons = opportunity.portfolio_fit.relevance_reasons.join("; ");

    format!(
        "Review this market opportunity and give a concise plan.\nTitle: {}\nCategory: {}\nChain: {}\nSummary: {}\nMetrics: {}\nPortfolio fit: {}\nIf execution is unsupported, say so and suggest the safest next step.",
        opportunity.title,
        opportunity.category,
        opportunity.chain,
        opportunity.summary,
        metrics,
        reasons
    )
}
