import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createAppTheme } from "./theme";

function getRootDomain(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ROOT_DOMAIN;
  return (v || "khudroo.com").toLowerCase();
}

function getTenantFromHost(host: string): string | null {
  const h = (host || "").toLowerCase();
  if (!h) return null;

  const root = getRootDomain();
  if (h === root || h === `www.${root}`) return null;

  const suffix = `.${root}`;
  if (h.endsWith(suffix)) {
    const prefix = h.slice(0, -suffix.length);
    if (!prefix || prefix.includes(".")) return null;
    if (prefix === "www") return null;
    return prefix;
  }

  const parts = h.split(".");
  if (parts.length >= 2) {
    const sub = parts[0];
    if (!sub || sub === "www" || sub === "superadmin") return null;
    return sub;
  }

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      theme={createAppTheme(
        getTenantFromHost(window.location.hostname) ? "tenant" : "superadmin"
      )}
    >
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
