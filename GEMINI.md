# GEMINI.md

Instructions for Gemini and Gemini-based coding agents working in this repository.

`AGENTS.md` is the primary shared instruction file for all coding agents. Read that first. This file is a Gemini-focused companion with the current codebase facts and practical development rules.

## Project Summary

SHADOW Protocol is a privacy-first Tauri desktop app for DeFi portfolio management, agent-assisted workflows, and future automation.

Stack:

- React 19 + TypeScript + Vite 7
- Tailwind CSS 4 + shadcn/ui + Framer Motion
- Zustand + TanStack Query
- Tauri 2 + Rust
- Ollama for local model execution
- Alchemy for onchain data
- SQLite local cache
- OS keychain + biometrics for secrets and wallet unlock

## Treat These As Canonical

- `AGENTS.md`
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/`
- `src-tauri/src/services/`
- `src/routes.tsx`
- `src/components/layout/AppShell.tsx`

Prefer code over docs if there is a mismatch.

## Current Codebase Facts

- Supported chains in code are Ethereum, Base, Polygon, and their configured testnets
- Polygon Amoy native ticker is `POL`
- Main app navigation is in the bottom dock
- Theme settings live in Settings, not in the sidebar
- Agent input is fixed at the bottom of the viewport
- Wallet addresses are persisted in `wallets.json`
- Private keys remain in keychain/biometric storage
- Session unlock uses biometric auth when available and caches the key in RAM temporarily
- Portfolio and transaction data are fetched through Alchemy and cached in SQLite
- Transfers are implemented
- Swaps are not fully implemented as real execution yet
- Some market and apps UI still uses mock data

## Required Engineering Behavior

- Use `bun` commands, not npm or yarn
- Use Tauri `invoke` for backend calls
- Keep sensitive logic in Rust
- Re-validate all user input in Rust even if the frontend validates it
- Never log or persist secrets outside approved secure storage
- Keep changes minimal, shared, and production-oriented
- For UI work, preserve the existing compact dark privacy-first visual language

## Security Requirements

- Never expose private keys, mnemonics, seed phrases, or raw wallet secrets
- Never store secrets in browser storage
- Avoid adding unsafe Tauri commands
- Do not weaken approval flows for transactions or automations
- Simulate and validate financial actions before execution

## Validation Commands

- `bun run build`
- `bun run test:run`
- `cd src-tauri && cargo check`
- `cd src-tauri && cargo clippy -- -D warnings`
- `cd src-tauri && cargo test`

If you touch wallet, session, transfer, or agent tooling code, validate those paths carefully before considering the task complete.
