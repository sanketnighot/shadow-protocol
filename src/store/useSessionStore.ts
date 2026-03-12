import { create } from "zustand";

type SessionStore = {
  locked: boolean;
  expiresAt: number | null;
  activeAddress: string | null;
  showUnlockDialog: boolean;
  setLocked: () => void;
  setUnlocked: (expiresAt: number) => void;
  refreshExpiry: (expiresAt: number) => void;
  setActiveAddress: (address: string | null) => void;
  openUnlockDialog: () => void;
  closeUnlockDialog: () => void;
};

export const useSessionStore = create<SessionStore>()((set) => ({
  locked: true,
  expiresAt: null,
  activeAddress: null,
  showUnlockDialog: false,
  setLocked: () => set({ locked: true, expiresAt: null }),
  setUnlocked: (expiresAt) => set({ locked: false, expiresAt }),
  refreshExpiry: (expiresAt) => set({ expiresAt }),
  setActiveAddress: (address) => set({ activeAddress: address }),
  openUnlockDialog: () => set({ showUnlockDialog: true }),
  closeUnlockDialog: () => set({ showUnlockDialog: false }),
}));
