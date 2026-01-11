import axios from "axios";
import { clearSession } from "./utils/session";

function getToken(): string | null {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

function getTenantHint(): string | null {
  return (
    localStorage.getItem("tenant") || sessionStorage.getItem("tenant") || null
  );
}

function getRootDomain(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ROOT_DOMAIN;
  return (v || "khudroo.com").toLowerCase();
}

function getApiBaseUrl(): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL;
  return (v || "").trim();
}

function isRootHost(host: string): boolean {
  const h = (host || "").toLowerCase();
  const root = getRootDomain();
  return h === root || h === `www.${root}`;
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

const api = axios.create({ baseURL: getApiBaseUrl() || undefined });

api.interceptors.request.use((config) => {
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
    if (typeof window !== "undefined" && isRootHost(host)) {
      sessionStorage.removeItem("tenant");
      localStorage.removeItem("tenant");
      return config;
    }
    const tenantHint = getTenantHint();
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
