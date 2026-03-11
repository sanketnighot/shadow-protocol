# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Portfolio / Real Balances

To show real token balances (Ethereum, Arbitrum, Base), add an [Alchemy](https://www.alchemy.com/) API key:

**Option 1 — `.env` file (recommended)**

1. Copy the example: `cp .env.example .env`
2. Open `.env` and set your key:
   ```
   ALCHEMY_API_KEY=your_key_here
   ```
3. Run `bun run tauri dev`

**Option 2 — Shell export**

```bash
export ALCHEMY_API_KEY=your_key_here
bun run tauri dev
```

Get a free key at [alchemy.com](https://www.alchemy.com/).

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
