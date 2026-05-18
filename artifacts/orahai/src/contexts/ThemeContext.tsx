import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "amoled";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: "dark", setTheme: () => {} });

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "amoled");
  if (t === "dark") root.classList.add("dark");
  else if (t === "amoled") { root.classList.add("dark"); root.classList.add("amoled"); }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem("orahai_theme") as Theme) ?? "dark"; } catch { return "dark"; }
  });

  useLayoutEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = (t: Theme) => {
    try { localStorage.setItem("orahai_theme", t); } catch {}
    setThemeState(t);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
