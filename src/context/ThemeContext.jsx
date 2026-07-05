import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppAuth } from "./AuthContext";

export const THEME_STORAGE_KEY = "enrollgen_theme_mode_v1";

const VALID_THEMES = new Set(["light", "dark"]);
const ThemeContext = createContext(null);

function normalizeTheme(value) {
  return VALID_THEMES.has(value) ? value : null;
}

function readLocalTheme() {
  if (typeof window === "undefined") return null;
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme() {
  if (typeof document !== "undefined") {
    const htmlTheme = normalizeTheme(document.documentElement.dataset.theme);
    if (htmlTheme) return htmlTheme;
    if (document.documentElement.classList.contains("dark")) return "dark";
  }
  return readLocalTheme() || getSystemTheme();
}

function ensureThemeColorMeta() {
  if (typeof document === "undefined") return null;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  return meta;
}

function syncThemeColorMeta(root) {
  const bgPrimary = window.getComputedStyle(root).getPropertyValue("--bg-primary").trim();
  if (bgPrimary) {
    ensureThemeColorMeta()?.setAttribute("content", bgPrimary);
  }
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  syncThemeColorMeta(root);
}

function decodeJwtPayload(token) {
  try {
    const payload = token?.split(".")?.[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return {};
  }
}

async function getSupabaseToken(getToken) {
  try {
    const token = await getToken({ template: "supabase" });
    if (token) return token;
  } catch {
    // Fall back to default Clerk tokens in local/dev JWT setups.
  }

  try {
    return (await getToken()) || null;
  } catch {
    return null;
  }
}

async function saveRemoteTheme(client, clerkUserId, theme) {
  if (!client || !clerkUserId || !theme) return;
  const { error } = await client
    .from("user_preferences")
    .upsert(
      {
        clerk_user_id: clerkUserId,
        theme_preference: theme,
      },
      { onConflict: "clerk_user_id" }
    );

  if (error) throw error;
}

export function ThemeProvider({ children }) {
  const { getToken } = useAppAuth();
  const [theme, setTheme] = useState(getInitialTheme);
  const [remoteSession, setRemoteSession] = useState(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore blocked storage. The class has already been applied.
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const frame = window.requestAnimationFrame(() => {
      root.classList.remove("theme-initializing");
      root.classList.add("theme-ready");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncRemotePreference() {
      const token = await getSupabaseToken(getToken);
      const clerkUserId = decodeJwtPayload(token).sub;
      if (!token || !clerkUserId) return;

      const { getAuthSupabase } = await import("../lib/supabase");
      const client = getAuthSupabase(token);
      if (!cancelled) {
        setRemoteSession({ clerkUserId, client });
      }

      try {
        const { data, error } = await client
          .from("user_preferences")
          .select("theme_preference")
          .eq("clerk_user_id", clerkUserId)
          .maybeSingle();

        if (error) throw error;
        const remoteTheme = normalizeTheme(data?.theme_preference);
        if (!cancelled && remoteTheme && !userInteractedRef.current) {
          setTheme(remoteTheme);
        }
      } catch (error) {
        console.warn("[ThemeProvider] Supabase theme preference unavailable:", error);
      }
    }

    syncRemotePreference();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    if (!remoteSession?.clerkUserId || !remoteSession?.client) return;

    saveRemoteTheme(remoteSession.client, remoteSession.clerkUserId, theme)
      .catch((error) => {
        console.warn("[ThemeProvider] Failed to save theme preference:", error);
      });
  }, [remoteSession, theme]);

  const setThemePreference = useCallback((nextTheme) => {
    const normalized = normalizeTheme(nextTheme);
    if (!normalized) return;
    userInteractedRef.current = true;
    setTheme(normalized);
  }, []);

  const toggleTheme = useCallback(() => {
    userInteractedRef.current = true;
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme: theme,
      isDark: theme === "dark",
      setTheme: setThemePreference,
      toggleTheme,
    }),
    [setThemePreference, theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return context;
}
