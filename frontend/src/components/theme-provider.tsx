"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import api from "@/lib/api";

interface SystemSettings {
  theme: "light" | "dark";
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  language: string;
}

const DEFAULTS: SystemSettings = {
  theme: "dark",
  primaryColor: "#3b82f6",
  accentColor: "#8b5cf6",
  fontFamily: "Geist",
  language: "en",
};

interface ThemeContextValue {
  settings: SystemSettings;
  loading: boolean;
  updateSettings: (partial: Partial<SystemSettings>) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  settings: DEFAULTS,
  loading: true,
  updateSettings: async () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  // Fetch settings on mount
  useEffect(() => {
    api
      .get("/settings/system")
      .then(({ data }) => {
        setSettings({
          theme: data.theme ?? DEFAULTS.theme,
          primaryColor: data.primaryColor ?? DEFAULTS.primaryColor,
          accentColor: data.accentColor ?? DEFAULTS.accentColor,
          fontFamily: data.fontFamily ?? DEFAULTS.fontFamily,
          language: data.language ?? DEFAULTS.language,
        });
      })
      .catch(() => {
        // keep defaults
      })
      .finally(() => setLoading(false));
  }, []);

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [settings.theme]);

  // Apply language
  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  // Load Google Font
  useEffect(() => {
    const existingLink = document.getElementById("theme-font-link");
    if (settings.fontFamily === "Geist") {
      // Remove custom font, use built-in
      existingLink?.remove();
      document.documentElement.style.removeProperty("--font-geist-sans");
      return;
    }

    const href = `https://fonts.googleapis.com/css2?family=${settings.fontFamily.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;

    if (existingLink) {
      existingLink.setAttribute("href", href);
    } else {
      const link = document.createElement("link");
      link.id = "theme-font-link";
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }

    document.documentElement.style.setProperty(
      "--font-geist-sans",
      `"${settings.fontFamily}", sans-serif`
    );
  }, [settings.fontFamily]);

  // Apply custom colors as CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--primary-hex",
      settings.primaryColor
    );
    document.documentElement.style.setProperty(
      "--accent-hex",
      settings.accentColor
    );
  }, [settings.primaryColor, settings.accentColor]);

  const updateSettings = useCallback(
    async (partial: Partial<SystemSettings>) => {
      const next = { ...settings, ...partial };
      setSettings(next);
      await api.patch("/settings/system", partial);
    },
    [settings]
  );

  return (
    <ThemeContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}
