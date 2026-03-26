# GitHub Copilot Instructions

Follow `AGENTS.md` as the canonical instruction file for this repository.

## Repository Summary

SHADOW Protocol is a privacy-first desktop DeFi workstation built with Tauri 2, Rust, React, and TypeScript. It handles wallets, portfolio data, agent-assisted workflows, and future automation. This is a security-critical financial app.

## Core Rules

- Never log, serialize, or expose private keys, seed phrases, or mnemonics
- Never store secrets in localStorage, sessionStorage, IndexedDB, or cookies
- Keep secret handling in Rust and OS secure storage
- Validate all user input at both the frontend and Rust boundaries
- Use Tauri `invoke` for backend calls; do not introduce localhost HTTP backends
- Prefer minimal dependencies and production-grade fixes
- Use `bun` for frontend/package commands
- Keep UI compact and aligned with the existing dark privacy-first design system

## Current Codebase Facts

- Frontend is in `src/`
- Rust/Tauri is in `src-tauri/`
- Command registration is in `src-tauri/src/lib.rs`
- Wallet commands are in `src-tauri/src/commands/wallet.rs`
- Session commands are in `src-tauri/src/commands/session.rs`
- Portfolio commands are in `src-tauri/src/commands/portfolio.rs`
- Transfers are implemented in `src-tauri/src/commands/transfer.rs`
- Agent orchestration is in `src-tauri/src/services/agent_chat.rs`
- Supported chains in code: Ethereum, Base, Polygon, plus configured testnets

## Implementation Preferences

- Prefer shared root-cause fixes over one-off patches
- Keep theme controls in Settings only
- Keep the command palette fixed near the top
- Keep the agent input fixed to the bottom of the viewport
- Preserve the bottom dock navigation pattern
- Use skeletons instead of spinners when consistent with existing UI

## Validation

Before finishing meaningful code changes, run the relevant checks:

- `bun run build`
- `bun run test:run`
- `cd src-tauri && cargo check`
- `cd src-tauri && cargo clippy -- -D warnings`
- `cd src-tauri && cargo test`
