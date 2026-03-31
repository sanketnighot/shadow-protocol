use serde::{Deserialize, Serialize};

use super::ai_profiles::AiProfileId;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEvaluationCase {
    pub id: String,
    pub profile: AiProfileId,
    pub description: String,
    pub expected_keywords: Vec<String>,
    pub expected_tool_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEvaluationReport {
    pub schema_valid_rate: f32,
    pub tool_success_rate: f32,
    pub context_retention_rate: f32,
    pub utility_rate: f32,
}

pub fn production_eval_cases() -> Vec<AiEvaluationCase> {
    vec![
        AiEvaluationCase {
            id: "chat-portfolio-follow-up".to_string(),
            profile: AiProfileId::ChatAssistant,
            description: "Follow up on a prior portfolio analysis using structured facts and rolling summary.".to_string(),
            expected_keywords: vec!["portfolio".to_string(), "follow-up".to_string()],
            expected_tool_names: vec!["get_total_portfolio_value".to_string()],
        },
        AiEvaluationCase {
            id: "summary-long-thread".to_string(),
            profile: AiProfileId::ConversationSummary,
            description: "Compress a long wallet-and-strategy conversation without losing decisions.".to_string(),
            expected_keywords: vec!["decision".to_string(), "strategy".to_string()],
            expected_tool_names: vec![],
        },
        AiEvaluationCase {
            id: "alpha-personalized-brief".to_string(),
            profile: AiProfileId::AlphaBrief,
            description: "Generate a daily alpha brief that respects risk appetite and installed apps.".to_string(),
            expected_keywords: vec!["risk".to_string(), "chains".to_string()],
            expected_tool_names: vec![],
        },
        AiEvaluationCase {
            id: "watcher-critical-alert".to_string(),
            profile: AiProfileId::RiskWatcher,
            description: "Raise a risk alert only when the news is materially relevant to held assets.".to_string(),
            expected_keywords: vec!["alert".to_string(), "severity".to_string()],
            expected_tool_names: vec![],
        },
    ]
}

pub fn summarize_metrics(
    schema_valid_rate: f32,
    tool_success_rate: f32,
    context_retention_rate: f32,
    utility_rate: f32,
) -> AiEvaluationReport {
    AiEvaluationReport {
        schema_valid_rate,
        tool_success_rate,
        context_retention_rate,
        utility_rate,
    }
}

#[cfg(test)]
mod tests {
    use super::{production_eval_cases, summarize_metrics};

    #[test]
    fn evaluation_cases_cover_all_primary_profiles() {
        let cases = production_eval_cases();
        assert!(cases.iter().any(|case| case.id == "chat-portfolio-follow-up"));
        assert!(cases.iter().any(|case| case.id == "alpha-personalized-brief"));
        assert!(cases.iter().any(|case| case.id == "watcher-critical-alert"));
    }

    #[test]
    fn report_keeps_metric_values() {
        let report = summarize_metrics(0.9, 0.8, 0.75, 0.85);
        assert_eq!(report.schema_valid_rate, 0.9);
        assert_eq!(report.tool_success_rate, 0.8);
        assert_eq!(report.context_retention_rate, 0.75);
        assert_eq!(report.utility_rate, 0.85);
    }
}
