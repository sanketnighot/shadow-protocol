# CLAUDE.md

Instructions for Claude Code working in this repository.

`AGENTS.md` is the canonical cross-agent instruction file for this project. Read it first and treat it as the primary source of truth. This file adds Claude-specific guidance and mirrors the current codebase state.

## Project Summary

SHADOW Protocol is a privacy-first desktop DeFi workstation built with:

- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4, Zustand, TanStack Query, shadcn/ui
- Backend: Tauri 2 + Rust
- AI: Local Ollama integration with Rust-owned tool execution
- Data: Alchemy for chain data, SQLite local cache, OS keychain for secrets

This is a security-critical financial application. Treat wallet, key, strategy, and transaction code as high risk by default.

## Canonical Architecture

- Frontend lives in `src/`
- Rust/Tauri code lives in `src-tauri/`
- Tauri entrypoint is `src-tauri/src/main.rs`
- Tauri app bootstrap and command registration live in `src-tauri/src/lib.rs`
- Rust services live in `src-tauri/src/services/`
- Tauri commands live in `src-tauri/src/commands/`

## Current Product Reality

Prefer code over docs when they conflict. Current implemented reality:

- Supported chains in code: Ethereum, Base, Polygon, plus `eth-sepolia`, `base-sepolia`, `polygon-amoy`
- Wallet addresses are stored in `{appDataDir}/wallets.json`
- Private keys remain in OS keychain and optional biometric storage
- Session unlock caches the private key in RAM for 30 minutes
- Portfolio balances, NFTs, and transactions are fetched via Alchemy and cached in SQLite
- Agent chat is backend-owned and routes tool calls through Rust
- Transfers are implemented
- Swaps are approval-preview only and not fully executed onchain yet
- Market/apps surfaces still contain mock data in places

Do not assume Arbitrum, Solana, FHE, background execution, or strategy automation are fully implemented unless you confirm them in code first.

## Development Rules

- Use `bun`, not npm or yarn
- Prefer minimal, shared fixes over page-specific patches
- Keep the UI compact and avoid adding unnecessary elements
- Theme controls belong in Settings only
- Keep the command palette fixed near the top
- Keep the agent input fixed at the bottom; only the messages area should scroll
- For wallet unlock flows, prefer biometric prompts over passive unlock behavior
- Never move secret handling into the frontend
- Never add direct localhost fetch-based backend communication; use Tauri `invoke`

## Security Rules

- Never log private keys, seed phrases, mnemonics, or raw signed payloads
- Never store secrets in localStorage, sessionStorage, IndexedDB, or cookies
- Validate all frontend input again in Rust
- Treat all transaction amounts, slippage, gas, addresses, chain ids, and token metadata as untrusted input
- Keep CSP restrictive in production; do not normalize `csp: null` as acceptable
- Avoid introducing commands that can read arbitrary files, execute arbitrary shell commands, or leak machine information

## Coding Conventions

- TypeScript strict mode is enabled
- Avoid `any`; use proper types or `unknown` with guards
- Use typed request/response payloads for Tauri invokes
- Prefer Zustand for UI state and TanStack Query for async/server state
- In Rust, use `Result<T, E>` and avoid `unwrap()` in production paths
- Prefer `thiserror` for custom error types
- Add tests for new state logic, parsing, validation, and security-sensitive behavior

## Recommended Validation

- Frontend: `bun run build`
- Frontend tests: `bun run test:run`
- Rust: run from `src-tauri/`
- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`

If you change Tauri commands, wallet/session flows, or transfer logic, validate both TS and Rust sides before finishing.
