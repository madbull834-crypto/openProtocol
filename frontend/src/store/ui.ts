import { create } from "zustand";

type View = "overview" | "participate" | "referrals" | "mechanics";
type UiState = { view: View; setView: (view: View) => void };

const views: View[] = ["overview", "participate", "referrals", "mechanics"];
const initial = typeof location !== "undefined" ? location.hash.slice(1) : "";

export const useUi = create<UiState>((set) => ({
  view: views.includes(initial as View) ? (initial as View) : "overview",
  setView: (view) => { if (typeof history !== "undefined") history.replaceState(null, "", view === "overview" ? location.pathname + location.search : `#${view}`); set({ view }); },
}));
