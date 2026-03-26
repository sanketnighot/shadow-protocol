//! Next-run scheduling for compiled strategy triggers.

use crate::services::strategy_types::StrategyTrigger;

const HOUR: i64 = 3600;
const DAY: i64 = 86400;

/// Computes the next evaluation timestamp after `now` (no backlog replay).
pub fn compute_next_run(trigger: &StrategyTrigger, now: i64) -> Option<i64> {
    match trigger {
        StrategyTrigger::TimeInterval { interval, .. } => {
            let secs = match interval.to_ascii_lowercase().as_str() {
                "hourly" => HOUR,
                "daily" => DAY,
                "weekly" => 7 * DAY,
                "monthly" => 30 * DAY,
                _ => DAY,
            };
            Some(now.saturating_add(secs))
        }
        StrategyTrigger::DriftThreshold {
            evaluation_interval_seconds,
            ..
        } => {
            let secs = evaluation_interval_seconds.unwrap_or(300).min(86_400) as i64;
            Some(now.saturating_add(secs.max(60)))
        }
        StrategyTrigger::Threshold {
            evaluation_interval_seconds,
            ..
        } => {
            let secs = evaluation_interval_seconds.unwrap_or(300).min(86_400) as i64;
            Some(now.saturating_add(secs.max(60)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::strategy_types::StrategyTrigger;

    #[test]
    fn time_interval_hourly_offsets_now() {
        let t = StrategyTrigger::TimeInterval {
            interval: "hourly".to_string(),
            anchor_timestamp: None,
            timezone: None,
        };
        assert_eq!(compute_next_run(&t, 1_000), Some(1_000 + 3_600));
    }

    #[test]
    fn threshold_uses_evaluation_interval_floor() {
        let t = StrategyTrigger::Threshold {
            metric: "x".to_string(),
            operator: "gt".to_string(),
            value: 1.0,
            evaluation_interval_seconds: Some(30),
        };
        assert_eq!(compute_next_run(&t, 0), Some(60));
    }
}
