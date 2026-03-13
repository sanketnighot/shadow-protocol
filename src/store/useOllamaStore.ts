import { create } from "zustand";
import { persist } from "zustand/middleware";


export type OllamaSetupStatus =
  | "idle"
  | "checking"
  | "installing"
  | "choosing_model"
  | "pulling"
  | "ready"
  | "error";

export type OllamaStatus = {
  installed: boolean;
  running: boolean;
  models: string[];
};

type OllamaStore = {
  selectedModel: string;
  setupStatus: OllamaSetupStatus;
  setupComplete: boolean;
  progressStep: string;
  progressPct: number;
  lastStatus: OllamaStatus | null;
  errorMessage: string | null;
  setSelectedModel: (model: string) => void;
  setSetupStatus: (status: OllamaSetupStatus) => void;
  setSetupComplete: (complete: boolean) => void;
  setProgress: (step: string, pct: number) => void;
  setLastStatus: (status: OllamaStatus | null) => void;
  setError: (message: string | null) => void;
  openSetupModal: () => void;
  closeSetupModal: () => void;
  showSetupModal: boolean;
};

export const useOllamaStore = create<OllamaStore>()(
  persist(
    (set) => ({
      selectedModel: "",
      setupStatus: "idle",
      setupComplete: false,
      progressStep: "",
      progressPct: 0,
      lastStatus: null,
      errorMessage: null,
      showSetupModal: false,

      setSelectedModel: (model) => set({ selectedModel: model }),
      setSetupStatus: (status) =>
        set({
          setupStatus: status,
          errorMessage: status === "error" ? undefined : null,
        }),
      setSetupComplete: (complete) => set({ setupComplete: complete }),
      setProgress: (step, pct) =>
        set({ progressStep: step, progressPct: pct }),
      setLastStatus: (status) => set({ lastStatus: status }),
      setError: (message) => set({ errorMessage: message }),
      openSetupModal: () => set({ showSetupModal: true }),
      closeSetupModal: () =>
        set({
          showSetupModal: false,
          setupStatus: "idle",
          progressStep: "",
          progressPct: 0,
          errorMessage: null,
        }),
    }),
    {
      name: "shadow-ollama-store",
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        setupComplete: state.setupComplete,
      }),
    },
  ),
);

