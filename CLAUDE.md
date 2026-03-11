# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHADOW Protocol is a privacy-first, desktop-native DeFi automation platform built with Tauri 2.0. It combines local AI intelligence with multi-chain crypto infrastructure. All sensitive operations (private keys, AI analysis, automation logic) run entirely on-device.

## Architecture

**Tauri 2.0 hybrid app** with two layers:

- **Frontend** (`src/`): React 19 + TypeScript + Vite 7. Renders in the system WebView (not Electron/Chromium). Dev server runs on port 3000.
- **Backend** (`src-tauri/`): Rust. The lib crate is `shadow_protocol_lib` (see `src-tauri/src/lib.rs`). Tauri commands are exposed via `#[tauri::command]` and registered in `invoke_handler`. Entry point is `src-tauri/src/main.rs`.

Frontend-to-backend communication uses Tauri's IPC invoke system (`@tauri-apps/api`).

**Planned stack** (per `docs/shadow-protocol.md`): TailwindCSS, Framer Motion, shadcn/ui, Viem (web3), Zustand/TanStack Query for state, Tokio for background tasks, local AI via Ollama/llama.cpp.

## Build & Dev Commands

Package manager is **bun** (see `bun.lock` and `tauri.conf.json` `beforeDevCommand`).

```bash
# Frontend only (Vite dev server)
bun run dev

# Full Tauri app (starts Vite + Rust backend with hot reload)
bun run tauri:dev

# Build production app
bun run tauri:build

# macOS universal binary
bun run tauri:build:mac

# Windows build
bun run tauri:build:win

# TypeScript check
bun run build    # runs tsc && vite build

# Install frontend deps
bun install

# Rust-only commands (run from src-tauri/)
cargo build
cargo check
cargo test
```

## Key Configuration Files

- `src-tauri/tauri.conf.json` — Tauri app config (window size, security CSP, bundle settings, identifier `com.sanket.shadow`)
- `src-tauri/Cargo.toml` — Rust dependencies. Lib name is `shadow_protocol_lib` with crate-types `staticlib`, `cdylib`, `rlib`
- `vite.config.ts` — Vite config with Tauri-specific settings (fixed port 3000, ignores `src-tauri/` in watcher)
- `tsconfig.json` — Strict mode enabled, `noUnusedLocals` and `noUnusedParameters` enforced

## Conventions

- TypeScript strict mode is on — no unused locals or parameters allowed
- Tauri commands go in `src-tauri/src/lib.rs` and must be registered in `tauri::generate_handler![]`
- The Rust lib crate name (`shadow_protocol_lib`) differs from the package name (`Shadow`) — use the lib name when importing
- Vite dev server is hardcoded to port 3000 (`strictPort: true`)
- Design system: dark theme, privacy-first aesthetic with purple accent (#8b5cf6), Inter + JetBrains Mono fonts (see `docs/ui-ux.md`)
