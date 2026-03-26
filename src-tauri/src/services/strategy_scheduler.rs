use super::strategy_types::StrategyTrigger;

pub fn interval_to_secs(interval: &str) -> Option<i64> {
    match interval {
        "hourly" => Some(60 * 60),
        "daily" => Some(24 * 60 * 60),
        "weekly" => Some(7 * 24 * 60 * 60),
        "monthly" => Some(30 * 24 * 60 * 60),
        _ => None,
    }
}

pub fn compute_next_run(trigger: &StrategyTrigger, now: i64) -> Option<i64> {
    match trigger {
        StrategyTrigger::TimeInterval { interval, .. } => {
            interval_to_secs(interval).map(|secs| now + secs)
        }
        StrategyTrigger::DriftThreshold {
            evaluation_interval_seconds,
            ..
        }
        | StrategyTrigger::Threshold {
            evaluation_interval_seconds,
            ..
        } => Some(now + evaluation_interval_seconds.unwrap_or(300)),
    }
}

