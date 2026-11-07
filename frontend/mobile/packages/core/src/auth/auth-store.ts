import { create } from "zustand";

import { deleteSessionToken, readSessionToken, writeSessionToken } from "./token-store";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  token: string | null;
  hydrate: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  token: null,
  async hydrate() {
    const token = await readSessionToken();
    set({ token, status: token ? "signedIn" : "signedOut" });
  },
  async signIn(token: string) {
    await writeSessionToken(token);
    set({ token, status: "signedIn" });
  },
  async signOut() {
    await deleteSessionToken();
    set({ token: null, status: "signedOut" });
  },
}));
