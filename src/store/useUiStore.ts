import { create } from "zustand";

type UiStore = {
  privacyModeEnabled: boolean;
  togglePrivacyMode: () => void;
};

export const useUiStore = create<UiStore>((set) => ({
  privacyModeEnabled: true,
  togglePrivacyMode: () =>
    set((state) => ({ privacyModeEnabled: !state.privacyModeEnabled })),
}));
