# Ollama Auto Setup — Manual Verification (macOS)

## Prerequisites

- macOS machine
- Shadow app built: `npm run tauri build` (or `bun run tauri build`)

## Verification Flows

### 1. Ollama not installed

- Ensure Ollama is uninstalled (`which ollama` returns nothing).
- Launch the Shadow app.
- **Expected:** Setup modal appears and runs full setup:
  - Download installer
  - Make executable
  - Run installer (may prompt for OS auth)
  - Start `ollama serve`
  - Pull default model `llama3.2:3b`
- Modal is only dismissible after status is `ready`.

### 2. Ollama installed, service stopped

- Install Ollama (`brew install ollama` or via installer).
- Ensure service is not running: `pkill -f "ollama serve"` or restart machine.
- Launch the Shadow app.
- **Expected:** Setup modal appears, starts the service (no reinstall), pulls default model if missing.
- Modal dismisses when ready.

### 3. Default model missing

- Ollama installed and running, but `llama3.2:3b` not pulled.
- Launch the Shadow app.
- **Expected:** Modal appears, pulls `llama3.2:3b` automatically.
- Progress bar updates during pull.
- Modal dismisses when ready.

### 4. Switch to `qwen2.5:3b`

- Open Settings → AI Model.
- Select `qwen2.5:3b`.
- **Expected:** If not installed, pull starts; toast/store shows progress; model saved only on success.
- Send a chat message.
- **Expected:** Chat uses `qwen2.5:3b`.

### 5. Error and recovery

- Stop Ollama service (`pkill ollama`).
- Send a chat message.
- **Expected:** Useful error, setup modal reopens.
- Start Ollama again (or run setup).
- **Expected:** Chat works after setup completes.

## Build & Type-Check

```bash
# Rust build
cd src-tauri && cargo build

# Rust unit tests (ollama list parsing, progress parsing)
cargo test

# Frontend
bun run build
```
