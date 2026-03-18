import { create } from "zustand";
import { persist } from "zustand/middleware";

type OnboardingStore = {
  hasCompletedOnboarding: boolean;
  currentStep: number;
  completeOnboarding: () => void;
  nextStep: () => void;
  prevStep: () => void;
  setStep: (step: number) => void;
  resetOnboarding: () => void;
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      currentStep: 0,
      completeOnboarding: () => set({ hasCompletedOnboarding: true, currentStep: 0 }),
      nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
      prevStep: () => set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),
      setStep: (step) => set({ currentStep: step }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false, currentStep: 0 }),
    }),
    {
      name: "shadow-onboarding-store",
    },
  ),
);
