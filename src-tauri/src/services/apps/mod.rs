//! Bundled first-party apps: registry, SQLite state, sidecar runtime, protocol adapters.

pub mod filecoin;
pub mod flow;
pub mod flow_actions;
pub mod flow_bridge;
pub mod flow_scheduler;
pub mod integration_prompt;
pub mod payload;
pub mod lit;
pub mod permissions;
pub mod registry;
pub mod runtime;
pub mod scheduler;
pub mod state;

pub use integration_prompt::prompt_block;
