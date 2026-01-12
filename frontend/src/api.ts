import axios from "axios";
import { clearSession } from "./utils/session";

function getToken(): string | null {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

function isNativeRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.protocol === "capacitor:" ||
    window.location.protocol === "file:" ||
    "Capacitor" in (window as unknown as Record<string, unknown>)
  );
}

function getDefaultNativeRootDomain(): string {
  return "khudroo.com";
}

function getTenantHint(): string | null {
  return (
    localStorage.getItem("tenant") || sessionStorage.getItem("tenant") || null
  );
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px)").matches;
}

function getRootDomain(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ROOT_DOMAIN;
  return (v || "").toLowerCase();
}

function normalizeTenantSubdomain(raw: string | null | undefined): string {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (!v) return "";
  if (!/^[a-z0-9-]+$/.test(v)) return "";
  return v;
}

function getApiBaseUrl(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL;
  const raw = (v || "").trim();
  if (!raw) return "";
  if (typeof window === "undefined") return raw;

  const currentHost = (window.location.hostname || "").toLowerCase();
  const currentIsLocal =
    currentHost === "localhost" ||
    isIpHost(currentHost) ||
    currentHost.endsWith(".localhost");

  try {
    const u = new URL(raw);
    const envHost = (u.hostname || "").toLowerCase();
    const envIsLocal =
      envHost === "localhost" || envHost === "127.0.0.1" || envHost === "::1";
    if (envIsLocal && !currentIsLocal) return "";
    return raw;
  } catch {
    return raw;
  }
}

function getEffectiveRootDomain(): string {
  const d = getRootDomain();
  if (d) return d;
  if (isNativeRuntime()) return getDefaultNativeRootDomain();
  return "";
}

function getRequestBaseUrl(): string | undefined {
  if (typeof window === "undefined") return getApiBaseUrl() || undefined;

  if (isNativeRuntime()) {
    const root = getEffectiveRootDomain() || getDefaultNativeRootDomain();
    const tenant = normalizeTenantSubdomain(getTenantHint());
    if (tenant) return `https://${tenant}.${root}`;
    return `https://${root}`;
  }

  return getApiBaseUrl() || undefined;
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

  return null;
}

const api = axios.create();

api.interceptors.request.use((config) => {
  if (!config.baseURL) config.baseURL = getRequestBaseUrl();

  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const tenantFromHost = getTenantFromHost(host);
  if (tenantFromHost) {
    if (typeof window !== "undefined" && !getTenantHint()) {
      sessionStorage.setItem("tenant", tenantFromHost);
    }
    config.headers = config.headers || {};
    config.headers["X-Tenant-ID"] = tenantFromHost;
  } else {
    const tenantHint =
      isNativeRuntime() || isMobileViewport() ? getTenantHint() : null;
    if (tenantHint) {
      config.headers = config.headers || {};
      config.headers["X-Tenant-ID"] = tenantHint;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Auto logout on 401
      clearSession();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
