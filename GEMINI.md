# Shadow Protocol

Shadow Protocol is a Tauri-based crypto/wallet application with integrated AI capabilities, utilizing Ollama for local LLM execution. It allows users to manage multiple wallets, view cross-chain portfolios (Ethereum, Arbitrum, Base), and execute transactions with the assistance of an AI agent.

## Project Overview

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4.
- **Backend**: Rust + Tauri 2.
- **AI Orchestration**: Integrated AI agent capable of assisting with wallet actions and strategies using local Ollama models (e.g., `llama3.2:3b`).
- **Web3 Integration**: Uses `viem` and Alchemy API for blockchain interactions.
- **State Management**: Zustand (for global state and persistence) and TanStack Query (for data fetching).
- **UI/UX**: Radix UI primitives, Framer Motion for animations, and Recharts for portfolio visualization.
- **Security**: Session locking/unlocking, secure wallet storage (via Rust backend).

## Core Architecture

- `src/`: React frontend source code.
  - `components/`: UI components, including specialized modules for agent, automation, market, and portfolio.
  - `lib/`: Core logic for agent orchestration, Ollama interaction, and utility functions.
  - `store/`: Zustand stores for managing wallet state, agent threads, session, and UI.
  - `types/`: TypeScript definitions for agent, wallet, and system types.
- `src-tauri/`: Rust backend source code.
  - `src/commands/`: Implementation of Tauri commands exposed to the frontend.
  - `src/services/`: Backend services for local DB, wallet sync, and Ollama management.
  - `src/session.rs`: Session and security management.

## Building and Running

Ensure you have [Bun](https://bun.sh/) and [Rust](https://www.rust-lang.org/) installed.

### Setup
1. Install dependencies:
   ```bash
   bun install
   ```
2. Configure environment variables (Alchemy API key required for real balances):
   ```bash
   cp .env.example .env
   # Edit .env with your ALCHEMY_API_KEY
   ```

### Development
- **Run the full Tauri app**:
  ```bash
  bun run tauri:dev
  ```
- **Run only the frontend (web mode)**:
  ```bash
  bun run dev
  ```

### Testing
- **Run all tests**:
  ```bash
  bun run test
  ```
- **Run tests in CI mode**:
  ```bash
  bun run test:run
  ```

### Production Build
- **Build the desktop application**:
  ```bash
  bun run tauri:build
  ```

## Development Conventions

- **UI Style**: Follow the "glass-panel" theme using Tailwind 4 utility classes. Components are largely based on Radix UI.
- **Tauri Commands**: All backend interactions must be defined in `src-tauri/src/commands` and registered in `src-tauri/src/lib.rs`.
- **State Persistence**: Sensitive wallet metadata and UI preferences are persisted via Zustand's `persist` middleware.
- **Local AI**: The agent defaults to `llama3.2:3b` via Ollama. Check `src/lib/ollama.ts` for interaction logic.
- **Testing**: New UI components or complex state logic should include Vitest tests (`.test.tsx` or `.test.ts`).
- **Safety**: Never log private keys or mnemonic phrases. Wallet sensitive operations are handled in the Rust backend.
