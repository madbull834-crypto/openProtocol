import { create } from "zustand";

type View = "overview" | "participate" | "referrals" | "mechanics";
type UiState = { view: View; setView: (view: View) => void };

export const useUi = create<UiState>((set) => ({ view: "overview", setView: (view) => set({ view }) }));
