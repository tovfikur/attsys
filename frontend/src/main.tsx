import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createAppTheme } from "./theme";

function getRootDomain(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ROOT_DOMAIN;
  return (v || "").toLowerCase();
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px)").matches;
}

const TWO_PART_PUBLIC_SUFFIXES = new Set<string>([
  "ac.in",
  "ac.jp",
  "ac.nz",
  "ac.uk",
  "co.in",
  "co.jp",
  "co.nz",
  "co.uk",
  "com.ar",
  "com.au",
  "com.bd",
  "com.br",
  "com.cn",
  "com.eg",
  "com.hk",
  "com.mx",
  "com.my",
  "com.ng",
  "com.pk",
  "com.sa",
  "com.sg",
  "com.tr",
  "com.tw",
  "com.ua",
  "edu.au",
  "gov.au",
  "gov.in",
  "gov.uk",
  "govt.nz",
  "net.au",
  "net.in",
  "ne.jp",
  "or.jp",
  "org.au",
  "org.in",
  "org.nz",
  "org.uk",
  "sch.uk",
]);

function isIpHost(host: string): boolean {
  const h = (host || "").trim();
  if (!h) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return h.includes(":");
}

function inferRootDomainFromHost(host: string): string {
  const h0 = (host || "").toLowerCase().replace(/\.$/, "");
  if (!h0) return "";
  if (h0 === "localhost" || isIpHost(h0)) return "";
  if (h0.endsWith(".localhost")) return "localhost";

  const h = h0.startsWith("www.") ? h0.slice(4) : h0;
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;

  const suffix2 = parts.slice(-2).join(".");
  if (TWO_PART_PUBLIC_SUFFIXES.has(suffix2) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return suffix2;
}

function getTenantFromHost(host: string): string | null {
  const h = (host || "").toLowerCase();
  if (!h) return null;

  if (h === "localhost" || isIpHost(h)) return null;

  if (h.endsWith(".localhost")) {
    const parts = h.split(".");
    const sub = parts[0] || "";
    if (!sub || sub === "www" || sub === "superadmin") return null;
    return sub;
  }

  const root = getRootDomain() || inferRootDomainFromHost(h);
  if (!root) return null;
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
        isMobileViewport()
          ? "tenant"
          : getTenantFromHost(window.location.hostname)
          ? "tenant"
          : "superadmin"
      )}
    >
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
