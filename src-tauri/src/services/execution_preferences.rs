//! Manages user execution preferences for strategy automation.
//!
//! Handles execution mode preferences, auto-execution thresholds,
//! and integration with the app state to determine when strategies
//! should be evaluated and executed.

use std::sync::Arc;
use tokio::sync::RwLock;

use super::strategy_types::{ExecutionPreference, StrategyExecutionPreferences};

#[derive(Debug, Clone)]
pub struct ExecutionPreferencesService {
    preferences: Arc<RwLock<StrategyExecutionPreferences>>,
}

impl ExecutionPreferencesService {
    pub fn new() -> Self {
        Self {
            preferences: Arc::new(RwLock::new(StrategyExecutionPreferences::default())),
        }
    }

    /// Get current execution preferences
    pub async fn get_preferences(&self) -> StrategyExecutionPreferences {
        self.preferences.read().await.clone()
    }

    /// Update execution preferences
    pub async fn set_preferences(&self, prefs: StrategyExecutionPreferences) {
        *self.preferences.write().await = prefs;
    }

    /// Check if strategies should be evaluated based on current preferences and app state
    pub async fn should_evaluate_strategies(&self, app_state: AppState) -> bool {
        let prefs = self.preferences.read().await;
        
        match &prefs.execution_mode {
            ExecutionPreference::ContinuousBackground => {
                // Always evaluate in continuous mode
                true
            }
            ExecutionPreference::AppActiveOnly => {
                // Only evaluate when app is active/foreground
                app_state.is_foreground()
            }
            ExecutionPreference::Scheduled { start_time, end_time } => {
                // Evaluate only during scheduled time window
                let now = chrono::Utc::now().timestamp();
                now >= *start_time && now <= *end_time
            }
        }
    }

    /// Determine approval level for a trade based on amount and preferences
    pub async fn determine_approval_level(&self, trade_amount_usd: f64) -> ApprovalLevel {
        let prefs = self.preferences.read().await;
        
        if prefs.auto_execute_small_trades && trade_amount_usd <= prefs.auto_execute_threshold_usd {
            ApprovalLevel::AutoExecute
        } else if let Some(threshold) = prefs.require_approval_above_usd {
            if trade_amount_usd >= threshold {
                ApprovalLevel::ExplicitApproval
            } else {
                ApprovalLevel::StrategyApproved
            }
        } else {
            ApprovalLevel::StrategyApproved
        }
    }
}

/// Represents the current state of the application
#[derive(Debug, Clone)]
pub struct AppState {
    foreground: bool,
    // Add other relevant app state fields as needed
}

impl AppState {
    pub fn new() -> Self {
        Self {
            foreground: true, // Default to foreground for MVP
        }
    }

    pub fn is_foreground(&self) -> bool {
        self.foreground
    }

    pub fn set_foreground(&mut self, foreground: bool) {
        self.foreground = foreground;
    }
}

/// Approval levels for strategy execution
#[derive(Debug, Clone, PartialEq)]
pub enum ApprovalLevel {
    /// Execute immediately without approval
    AutoExecute,
    /// Execute based on strategy-level approval settings
    StrategyApproved,
    /// Require explicit user approval
    ExplicitApproval,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_continuous_execution_mode() {
        let service = ExecutionPreferencesService::new();
        let mut prefs = service.get_preferences().await;
        prefs.execution_mode = ExecutionPreference::ContinuousBackground;
        service.set_preferences(prefs).await;

        let app_state = AppState::new();
        assert!(service.should_evaluate_strategies(app_state).await);
    }

    #[tokio::test]
    async fn test_app_active_execution_mode() {
        let service = ExecutionPreferencesService::new();
        let mut prefs = service.get_preferences().await;
        prefs.execution_mode = ExecutionPreference::AppActiveOnly;
        service.set_preferences(prefs).await;

        let mut app_state = AppState::new();
        
        // Should evaluate when app is foreground
        app_state.set_foreground(true);
        assert!(service.should_evaluate_strategies(app_state.clone()).await);
        
        // Should not evaluate when app is background
        app_state.set_foreground(false);
        assert!(!service.should_evaluate_strategies(app_state).await);
    }

    #[tokio::test]
    async fn test_approval_level_determination() {
        let service = ExecutionPreferencesService::new();
        
        // Small trades should auto-execute
        assert_eq!(service.determine_approval_level(50.0).await, ApprovalLevel::AutoExecute);
        
        // Medium trades should use strategy approval
        assert_eq!(service.determine_approval_level(500.0).await, ApprovalLevel::StrategyApproved);
        
        // Large trades should require explicit approval
        assert_eq!(service.determine_approval_level(1500.0).await, ApprovalLevel::ExplicitApproval);
    }
}