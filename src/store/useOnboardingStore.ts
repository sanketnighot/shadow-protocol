import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AgentConfig = {
  persona: string; // "analyst" | "strategist" | "guardian" | "ghost"
  personaText: string;
  riskAppetite: string; // "Conservative" | "Moderate" | "Aggressive" | "Degen"
  preferredChains: string[];
  experienceLevel: string; // "new" | "active" | "native"
  goals: string[];
  constraints: {
    avoidUnaudited: boolean;
    noLeverage: boolean;
    maxTxAmount: number | null;
    custom: string[];
  };
};

type OnboardingStore = {
  hasCompletedOnboarding: boolean;
  currentStep: number;
  // Replay mode state
  isReplay: boolean;
  existingSoul: {
    risk_appetite: string;
    preferred_chains: string[];
    persona: string;
    custom_rules: string[];
  } | null;
  existingMemories: string[];
  // Agent configuration collected during onboarding
  agentConfig: AgentConfig | null;
  // Actions
  setAgentConfig: (config: AgentConfig) => void;
  clearAgentConfig: () => void;
  completeOnboarding: () => void;
  nextStep: () => void;
  prevStep: () => void;
  setStep: (step: number) => void;
  resetOnboarding: () => void;
  // Replay actions
  startReplay: (
    soul: {
      risk_appetite: string;
      preferred_chains: string[];
      persona: string;
      custom_rules: string[];
    } | null,
    memories: string[]
  ) => void;
  cancelReplay: () => void;
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      currentStep: 0,
      isReplay: false,
      existingSoul: null,
      existingMemories: [],
      agentConfig: null,
      setAgentConfig: (config) => set({ agentConfig: config }),
      clearAgentConfig: () => set({ agentConfig: null }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true, currentStep: 0, isReplay: false, existingSoul: null, existingMemories: [], agentConfig: null }),
      nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
      prevStep: () => set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),
      setStep: (step) => set({ currentStep: step }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false, currentStep: 0, isReplay: false, existingSoul: null, existingMemories: [], agentConfig: null }),
      startReplay: (soul, memories) =>
        set({
          isReplay: true,
          existingSoul: soul,
          existingMemories: memories,
          currentStep: 0,
          agentConfig: soul
            ? {
                persona: "custom",
                personaText: soul.persona,
                riskAppetite: soul.risk_appetite,
                preferredChains: soul.preferred_chains,
                experienceLevel: "active",
                goals: [],
                constraints: {
                  avoidUnaudited: false,
                  noLeverage: false,
                  maxTxAmount: null,
                  custom: memories,
                },
              }
            : null,
        }),
      cancelReplay: () =>
        set({
          isReplay: false,
          existingSoul: null,
          existingMemories: [],
          agentConfig: null,
        }),
    }),
    {
      name: "shadow-onboarding-store",
    },
  ),
);
