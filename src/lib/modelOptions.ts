/**
 * Model options with metadata for recommendations.
 * minRamGb: minimum RAM (GB) recommended for this model.
 * contextTokens: context window size in tokens for chat assembly.
 */

export type ModelOption = {
  id: string;
  label: string;
  sizeGb: number;
  minRamGb: number;
  desc: string;
  contextTokens: number;
};

/** Default context budget for models not in MODEL_OPTIONS (e.g. custom pulls). */
export const DEFAULT_CONTEXT_TOKENS = 8192;

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "llama3.2:1b",
    label: "llama3.2:1b",
    sizeGb: 1,
    minRamGb: 4,
    desc: "Smallest, fastest",
    contextTokens: 8192,
  },
  {
    id: "llama3.2:3b",
    label: "llama3.2:3b",
    sizeGb: 2,
    minRamGb: 8,
    desc: "Balanced, 2GB",
    contextTokens: 8192,
  },
  {
    id: "qwen2.5:3b",
    label: "qwen2.5:3b",
    sizeGb: 2,
    minRamGb: 8,
    desc: "Alternative, 2GB",
    contextTokens: 8192,
  },
];

/** Returns context window size (tokens) for a model. Uses default for unknown models. */
export function getContextBudget(modelId: string): number {
  const opt = MODEL_OPTIONS.find((o) => o.id === modelId);
  return opt?.contextTokens ?? DEFAULT_CONTEXT_TOKENS;
}

export function getRecommendedModels(totalMemoryGb: number): string[] {
  if (totalMemoryGb < 6) {
    return ["llama3.2:1b"];
  }
  if (totalMemoryGb < 10) {
    return ["llama3.2:1b", "llama3.2:3b"];
  }
  return ["llama3.2:3b", "qwen2.5:3b", "llama3.2:1b"];
}

export function isRecommended(modelId: string, totalMemoryGb: number): boolean {
  return getRecommendedModels(totalMemoryGb).includes(modelId);
}
