use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiProfileId {
    ChatAssistant,
    ConversationSummary,
    AlphaBrief,
    RiskWatcher,
    AutonomousPlanner,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AiProfileConfig {
    pub profile: AiProfileId,
    pub default_num_ctx: u32,
    pub max_recent_messages: usize,
    pub temperature: Option<f32>,
    pub expects_structured_output: bool,
    pub task_directive: &'static str,
}

pub fn profile_config(profile: AiProfileId) -> AiProfileConfig {
    match profile {
        AiProfileId::ChatAssistant => AiProfileConfig {
            profile,
            default_num_ctx: 8192,
            max_recent_messages: 10,
            temperature: Some(0.1),
            expects_structured_output: false,
            task_directive: "Use the available tools automatically when needed. Keep replies concise, accurate, and grounded in current SHADOW wallet, app, and memory context.",
        },
        AiProfileId::ConversationSummary => AiProfileConfig {
            profile,
            default_num_ctx: 4096,
            max_recent_messages: 24,
            temperature: Some(0.0),
            expects_structured_output: false,
            task_directive: "Summarize the conversation concisely. Preserve key facts, decisions, tool results, user preferences, and unresolved follow-ups. Output only the summary.",
        },
        AiProfileId::AlphaBrief => AiProfileConfig {
            profile,
            default_num_ctx: 4096,
            max_recent_messages: 8,
            temperature: Some(0.0),
            expects_structured_output: true,
            task_directive: "Produce a compact DeFi market brief that respects the user's risk profile, preferred chains, and available SHADOW app capabilities.",
        },
        AiProfileId::RiskWatcher => AiProfileConfig {
            profile,
            default_num_ctx: 4096,
            max_recent_messages: 8,
            temperature: Some(0.0),
            expects_structured_output: true,
            task_directive: "Act as a conservative portfolio risk watcher. Only raise alerts when the evidence suggests material user impact.",
        },
        AiProfileId::AutonomousPlanner => AiProfileConfig {
            profile,
            default_num_ctx: 6144,
            max_recent_messages: 12,
            temperature: Some(0.0),
            expects_structured_output: true,
            task_directive: "Break tasks into explicit next steps, reflect current SHADOW capabilities, and never suggest actions that bypass approvals or guardrails.",
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{profile_config, AiProfileId};

    #[test]
    fn summary_profile_is_deterministic_and_structured_for_compression() {
        let profile = profile_config(AiProfileId::ConversationSummary);
        assert_eq!(profile.default_num_ctx, 4096);
        assert_eq!(profile.temperature, Some(0.0));
        assert!(!profile.expects_structured_output);
    }

    #[test]
    fn watcher_profile_prefers_structured_output() {
        let profile = profile_config(AiProfileId::RiskWatcher);
        assert!(profile.expects_structured_output);
        assert_eq!(profile.max_recent_messages, 8);
    }
}
