import { create } from "zustand";
import { persist } from "zustand/middleware";

type OnboardingStore = {
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
    }),
    {
      name: "shadow-onboarding-store",
    },
  ),
);
