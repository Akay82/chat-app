import { create } from "zustand";
type State = {
  theme: "light" | "dark" | "system";
  sound: boolean;
  notifications: boolean;
  toast: string;
  setTheme: (v: State["theme"]) => void;
  setSound: (v: boolean) => void;
  setNotifications: (v: boolean) => void;
  notify: (v: string) => void;
};
export const useSettings = create<State>((set) => ({
  theme: (localStorage.getItem("theme") as State["theme"]) || "system",
  sound: localStorage.getItem("sound") !== "false",
  notifications: localStorage.getItem("notifications") === "true",
  toast: "",
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  setSound: (sound) => {
    localStorage.setItem("sound", String(sound));
    set({ sound });
  },
  setNotifications: (notifications) => {
    localStorage.setItem("notifications", String(notifications));
    set({ notifications });
  },
  notify: (toast) => {
    set({ toast });
    setTimeout(
      () => set((s) => (s.toast === toast ? { toast: "" } : {})),
      5000,
    );
  },
}));
