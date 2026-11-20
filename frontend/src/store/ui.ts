import { create } from "zustand";

type View = "landing" | "overview" | "participate" | "referrals" | "mechanics";
type UiState = { view: View; setView: (view: View) => void };

const views: View[] = ["landing", "overview", "participate", "referrals", "mechanics"];
const initial = typeof location !== "undefined" ? location.hash.slice(1) : "";

export const useUi = create<UiState>((set) => ({
  view: views.includes(initial as View) ? (initial as View) : "landing",
  setView: (view) => {
    if (typeof history !== "undefined") history.replaceState(null, "", view === "landing" ? location.pathname + location.search : `#${view}`);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    set({ view });
  },
}));
