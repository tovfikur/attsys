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

const api = axios.create({ baseURL: "http://localhost:8000" });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const sub = host.split(".")[0];
  if (host.includes(".") && sub !== "superadmin") {
    if (
      typeof window !== "undefined" &&
      !localStorage.getItem("tenant") &&
      !sessionStorage.getItem("tenant")
    ) {
      sessionStorage.setItem("tenant", sub);
    }
    config.headers = config.headers || {};
    config.headers["X-Tenant-ID"] = sub;
  } else {
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
