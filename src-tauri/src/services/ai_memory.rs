use serde::{Deserialize, Serialize};

use super::agent_state::{AgentMemory, AgentSoul};

const MAX_SEMANTIC_FACTS: usize = 8;
const MAX_STRUCTURED_FACTS: usize = 6;
const MAX_CUSTOM_RULES: usize = 6;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundedSoul {
    pub persona: String,
    pub risk_appetite: String,
    pub preferred_chains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SemanticMemory {
    pub facts: Vec<String>,
    pub structured_facts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpisodicMemory {
    pub rolling_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProceduralMemory {
    pub custom_rules: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMemoryContext {
    pub soul: BoundedSoul,
    pub semantic: SemanticMemory,
    pub episodic: EpisodicMemory,
    pub procedural: ProceduralMemory,
}

impl AiMemoryContext {
    pub fn from_state(
        soul: AgentSoul,
        memory: AgentMemory,
        rolling_summary: Option<&str>,
        structured_facts: Option<&str>,
    ) -> Self {
        let preferred_chains = soul
            .preferred_chains
            .iter()
            .map(|chain| chain.trim().to_string())
            .filter(|chain| !chain.is_empty())
            .take(MAX_CUSTOM_RULES)
            .collect();
        let custom_rules = soul
            .custom_rules
            .iter()
            .map(|rule| rule.trim().to_string())
            .filter(|rule| !rule.is_empty())
            .take(MAX_CUSTOM_RULES)
            .collect();
        let bounded_soul = BoundedSoul {
            persona: soul.persona.trim().to_string(),
            risk_appetite: soul.risk_appetite.trim().to_string(),
            preferred_chains,
        };
        let semantic_facts = memory
            .facts
            .into_iter()
            .map(|item| item.fact.trim().to_string())
            .filter(|fact| !fact.is_empty())
            .take(MAX_SEMANTIC_FACTS)
            .collect();
        let structured_facts = split_lines(structured_facts, MAX_STRUCTURED_FACTS);

        Self {
            soul: bounded_soul,
            semantic: SemanticMemory {
                facts: semantic_facts,
                structured_facts,
            },
            episodic: EpisodicMemory {
                rolling_summary: rolling_summary
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned),
            },
            procedural: ProceduralMemory { custom_rules },
        }
    }

    pub fn to_prompt_block(&self) -> String {
        let mut sections = vec![
            "## Agent persona".to_string(),
            format!("- Persona: {}", self.soul.persona),
            format!("- Risk appetite: {}", self.soul.risk_appetite),
            format!(
                "- Preferred chains: {}",
                if self.soul.preferred_chains.is_empty() {
                    "None specified".to_string()
                } else {
                    self.soul.preferred_chains.join(", ")
                }
            ),
        ];

        if !self.procedural.custom_rules.is_empty() {
            sections.push("\n## Standing rules".to_string());
            for rule in &self.procedural.custom_rules {
                sections.push(format!("- {}", rule));
            }
        }

        if let Some(summary) = &self.episodic.rolling_summary {
            sections.push("\n## Recent conversation summary".to_string());
            sections.push(summary.clone());
        }

        if !self.semantic.facts.is_empty() {
            sections.push("\n## Semantic memory".to_string());
            for fact in &self.semantic.facts {
                sections.push(format!("- {}", fact));
            }
        }

        if !self.semantic.structured_facts.is_empty() {
            sections.push("\n## Structured recent facts".to_string());
            for fact in &self.semantic.structured_facts {
                sections.push(format!("- {}", fact));
            }
        }

        sections.join("\n")
    }
}

fn split_lines(input: Option<&str>, limit: usize) -> Vec<String> {
    input
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(limit)
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::AiMemoryContext;
    use crate::services::agent_state::{AgentMemory, AgentMemoryItem, AgentSoul};

    #[test]
    fn prompt_block_includes_summary_rules_and_facts() {
        let soul = AgentSoul {
            risk_appetite: "Conservative".to_string(),
            preferred_chains: vec!["Base".to_string()],
            persona: "Helpful DeFi operator".to_string(),
            custom_rules: vec!["Never suggest leverage".to_string()],
        };
        let memory = AgentMemory {
            facts: vec![AgentMemoryItem {
                id: "1".to_string(),
                fact: "User prefers stablecoin income.".to_string(),
                created_at: 0,
            }],
        };

        let context = AiMemoryContext::from_state(
            soul,
            memory,
            Some("The user just reviewed ETH exposure."),
            Some("Portfolio total: $1000\nETH concentration: 42%"),
        );
        let prompt = context.to_prompt_block();

        assert!(prompt.contains("Helpful DeFi operator"));
        assert!(prompt.contains("Never suggest leverage"));
        assert!(prompt.contains("The user just reviewed ETH exposure."));
        assert!(prompt.contains("User prefers stablecoin income."));
        assert!(prompt.contains("Portfolio total: $1000"));
    }
}
