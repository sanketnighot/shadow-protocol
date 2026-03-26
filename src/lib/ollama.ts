import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const OLLAMA_HOST = "http://localhost:11434";
const OLLAMA_PROGRESS_EVENT = "ollama_progress";

export const DEFAULT_MODEL = "llama3.2:3b";

export type OllamaStatus = {
  installed: boolean;
  running: boolean;
  models: string[];
};

export type OllamaProgressPayload = [string, number];

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  return invoke<OllamaStatus>("check_ollama_status");
}

export async function installOllama(): Promise<void> {
  return invoke<void>("install_ollama");
}

export async function startOllamaService(): Promise<void> {
  return invoke<void>("start_ollama_service");
}

export async function pullModel(modelName: string): Promise<void> {
  return invoke<void>("pull_model", { modelName: modelName.trim() });
}

export type SystemInfo = {
  totalMemoryGb: number;
  cpuCount: number;
};

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("get_system_info");
}

export async function deleteModel(modelName: string): Promise<void> {
  return invoke<void>("delete_model", { modelName: modelName.trim() });
}

export function listenOllamaProgress(
  callback: (step: string, progress: number) => void,
): Promise<UnlistenFn> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return Promise.resolve(() => {});
  }
  return listen<OllamaProgressPayload>(OLLAMA_PROGRESS_EVENT, (event) => {
    const [step, progress] = event.payload;
    callback(step, progress ?? 0);
  });
}

/** Chat message role for Ollama /api/chat */
export type OllamaChatRole = "system" | "user" | "assistant";

export type OllamaChatMessage = {
  role: OllamaChatRole;
  content: string;
};

export type ChatOptions = {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
  options?: { num_ctx?: number };
};

export type ChatResponse = {
  message?: { role: string; content: string };
  done?: boolean;
};

export async function chat(options: ChatOptions): Promise<string> {
  const url = `${OLLAMA_HOST}/api/chat`;
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: options.stream ?? false,
  };
  if (options.options?.num_ctx != null) {
    body.options = options.options;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Ollama request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }

  const data = (await response.json()) as ChatResponse;
  return data.message?.content ?? "";
}

export type GenerateOptions = {
  model: string;
  prompt: string;
  stream?: boolean;
};

export type GenerateResponse = {
  model: string;
  response: string;
  done: boolean;
};

export async function generate(options: GenerateOptions): Promise<string> {
  const url = `${OLLAMA_HOST}/api/generate`;
  const body = {
    model: options.model,
    prompt: options.prompt,
    stream: options.stream ?? false,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Ollama request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }

  const data = (await response.json()) as GenerateResponse;
  return data.response ?? "";
}

export function isOllamaUnavailableError(error: unknown): boolean {
  const msg =
    error instanceof Error ? error.message : String(error);
  return (
    msg.includes("fetch") ||
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("model not found") ||
    msg.includes("connection refused") ||
    msg.toLowerCase().includes("unreachable")
  );
}
