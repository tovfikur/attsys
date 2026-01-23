import { useMemo, useState, useEffect } from "react";
import api from "./api";
import {
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  ApartmentRounded,
  BoltRounded,
  SecurityRounded,
  OpenInNewRounded,
  VisibilityRounded,
  VisibilityOffRounded,
} from "@mui/icons-material";
import Tooltip from "@mui/material/Tooltip";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import { getUser } from "./utils/session";
import { getErrorMessage } from "./utils/errors";

interface TenantData {
  tenant: {
    id: string;
    name: string;
    type: string;
  } | null;
  message: string;
}

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  created_at: string;
  note?: string | null;
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

const isIpHost = (host: string): boolean => {
  const h = (host || "").trim();
  if (!h) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return h.includes(":");
};

const inferRootDomainFromHost = (host: string): string => {
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
};

const getRootDomain = (): string => {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ROOT_DOMAIN;
  const fromEnv = (v || "").toLowerCase();
  if (fromEnv) return fromEnv;

  const h0 =
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  return inferRootDomainFromHost(h0) || h0;
};

export default function Dashboard() {
  const [tenantInfo, setTenantInfo] = useState<TenantData | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [menu, setMenu] = useState<"tenants" | "create" | "password">(
    "tenants"
  );
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState("");
  const [resetForm, setResetForm] = useState<{
    subdomain: string;
    email: string;
    new_password: string;
  }>({
    subdomain: "",
    email: "",
    new_password: "",
  });
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetOk, setResetOk] = useState("");

  const [newTenant, setNewTenant] = useState<{
    name: string;
    subdomain: string;
    email: string;
    password: string;
    note: string;
  }>({ name: "", subdomain: "", email: "", password: "", note: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createOk, setCreateOk] = useState("");

  // Password visibility toggles (OBS-003)
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);

  const user = getUser();
  const userName = user?.name || "Admin";
  const isSuperadmin = user?.role === "superadmin";
  const rootDomain = getRootDomain();
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : "https:";

  useEffect(() => {
    fetchStatus();
    fetchTenants();
  }, []);

  const fetchStatus = async () => {
    try {
      const tenantRes = await api.get("/api/tenant");
      setTenantInfo(tenantRes.data);
    } catch (error) {
      console.error("Error fetching status", error);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await api.get("/api/tenants");
      setTenants(res.data.tenants);
    } catch (error) {
      console.error("Error fetching tenants", error);
    }
  };

  const handleToggleTenantStatus = async (t: Tenant) => {
    const next =
      (t.status || "").toLowerCase() === "active" ? "inactive" : "active";
    setStatusError("");
    setStatusBusyId(t.id);
    try {
      await api.post("/api/tenants/status", { id: t.id, status: next });
      await fetchTenants();
    } catch (err: unknown) {
      setStatusError(getErrorMessage(err, "Failed to update tenant status"));
    } finally {
      setStatusBusyId(null);
    }
  };

  const handleCreateTenant = async () => {
    setCreating(true);
    setCreateError("");
    setCreateOk("");

    // Validate subdomain client-side
    if (!/^[a-z0-9-]+$/.test(newTenant.subdomain)) {
      setCreateError(
        "Invalid subdomain. Use lowercase letters, numbers, or hyphens."
      );
      setCreating(false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newTenant.email.trim())) {
      setCreateError("Invalid tenant email.");
      setCreating(false);
      return;
    }
    if (newTenant.password.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      setCreating(false);
      return;
    }
    try {
      await api.post("/api/tenants", {
        name: newTenant.name,
        subdomain: newTenant.subdomain,
        email: newTenant.email.trim().toLowerCase(),
        password: newTenant.password,
        note: newTenant.note.trim() ? newTenant.note.trim() : null,
      });
      setNewTenant({
        name: "",
        subdomain: "",
        email: "",
        password: "",
        note: "",
      });
      setCreateOk("Tenant created.");
      fetchTenants(); // Refresh list
      setMenu("tenants");
    } catch (err: unknown) {
      setCreateError(getErrorMessage(err, "Failed to create tenant"));
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async () => {
    setResetBusy(true);
    setResetError("");
    setResetOk("");
    try {
      await api.post("/api/tenant_users/reset_password", resetForm);
      setResetForm({ subdomain: "", email: "", new_password: "" });
      setResetOk("Password updated.");
    } catch (err: unknown) {
      setResetError(getErrorMessage(err, "Failed to update password"));
    } finally {
      setResetBusy(false);
    }
  };

  const formatCreatedAt = useMemo(() => {
    return (raw: string) => {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return raw || "—";
      return d.toLocaleString();
    };
  }, []);

  const summary = useMemo(() => {
    const activeCount = tenants.filter((t) => t.status === "active").length;
    return {
      activeCount,
      totalCount: tenants.length,
      currentTenant: tenantInfo?.tenant?.name || "Super Admin Portal",
    };
  }, [tenants, tenantInfo]);

  return (
    <Box>
      <Box
        sx={{
          mb: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              Welcome, {userName}
            </Typography>
            <Chip
              label={isSuperadmin ? "Super Admin" : "Tenant"}
              color={isSuperadmin ? "primary" : "default"}
              variant="filled"
              size="small"
              sx={{ fontWeight: 700 }}
            />
          </Stack>
          <Typography color="text.secondary">
            {isSuperadmin
              ? "System oversight and tenant provisioning."
              : "Manage your workforce and attendance."}
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(12, 1fr)" },
          gap: 2,
          alignItems: "stretch",
        }}
      >
        <Card
          sx={{
            gridColumn: { xs: "1 / -1", md: "span 4" },
            p: 2.5,
            borderRadius: 4,
            boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <BoltRounded color="primary" />
              <Typography sx={{ fontWeight: 800 }}>System</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label="Online" color="success" />
              <Typography variant="body2" color="text.secondary">
                Backend responding normally
              </Typography>
            </Stack>
          </Stack>
        </Card>

        <Card
          sx={{
            gridColumn: { xs: "1 / -1", md: "span 4" },
            p: 2.5,
            borderRadius: 4,
            boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ApartmentRounded color="primary" />
              <Typography sx={{ fontWeight: 800 }}>Current Tenant</Typography>
            </Stack>
            <Typography sx={{ fontWeight: 900, fontSize: 22 }}>
              {summary.currentTenant}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isSuperadmin ? "Viewing platform context" : "Tenant workspace"}
            </Typography>
          </Stack>
        </Card>

        {isSuperadmin && (
          <Card
            sx={{
              gridColumn: { xs: "1 / -1", md: "span 4" },
              p: 2.5,
              borderRadius: 4,
              boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
            }}
          >
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} alignItems="center">
                <SecurityRounded color="primary" />
                <Typography sx={{ fontWeight: 800 }}>Tenants</Typography>
              </Stack>
              <Typography sx={{ fontWeight: 900, fontSize: 22 }}>
                {summary.activeCount} active
                <Typography
                  component="span"
                  color="text.secondary"
                  sx={{ fontWeight: 700, ml: 1 }}
                >
                  / {summary.totalCount} total
                </Typography>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use the tabs below to create tenants or manage passwords.
              </Typography>
            </Stack>
          </Card>
        )}
      </Box>

      {isSuperadmin && (
        <Box sx={{ mt: 3 }}>
          <Card
            sx={{
              borderRadius: 4,
              boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
              overflow: "hidden",
            }}
          >
            <Tabs
              value={menu}
              onChange={(_, v) => setMenu(v)}
              variant="fullWidth"
              sx={{
                px: 2,
                pt: 1,
                "& .MuiTab-root": { textTransform: "none", fontWeight: 800 },
              }}
              TabIndicatorProps={{ style: { height: 2 } }}
            >
              <Tab value="tenants" label="Tenants" />
              <Tab value="create" label="Create Tenant" />
              <Tab value="password" label="Set Password" />
            </Tabs>
            <Divider />

            <Box sx={{ p: 2.5 }}>
              {menu === "tenants" && (
                <Box>
                  <Stack
                    direction="row"
                    alignItems="baseline"
                    justifyContent="space-between"
                    sx={{ mb: 1.5 }}
                  >
                    <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
                      Tenants
                    </Typography>
                  </Stack>
                  {statusError ? (
                    <Typography color="error" sx={{ mb: 1.5 }}>
                      {statusError}
                    </Typography>
                  ) : null}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        lg: "repeat(3, 1fr)",
                      },
                      gap: 2,
                    }}
                  >
                    {tenants.map((t) => (
                      <Card
                        key={t.id}
                        sx={{
                          p: 2.25,
                          borderRadius: 4,
                          boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
                          transition:
                            "transform 200ms ease, box-shadow 200ms ease",
                          "&:hover": {
                            transform: "translateY(-2px)",
                            boxShadow: "0 40px 120px rgba(0,0,0,0.16)",
                          },
                        }}
                      >
                        <Stack spacing={1.25}>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Typography sx={{ fontWeight: 900 }}>
                              {t.name}
                            </Typography>
                            <Chip
                              size="small"
                              label={t.status}
                              color={
                                t.status === "active" ? "success" : "default"
                              }
                            />
                          </Stack>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontFamily: "monospace" }}
                          >
                            {t.subdomain}.{rootDomain}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Created: {formatCreatedAt(t.created_at)}
                          </Typography>
                          {t.note ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Note: {t.note}
                            </Typography>
                          ) : null}
                          <Divider />
                          <Stack direction="row" spacing={1}>
                            <Tooltip title="Opens tenant portal in a new tab" arrow>
                              <Button
                                variant="contained"
                                href={`${protocol}//${t.subdomain}.${rootDomain}`}
                                target="_blank"
                                rel="noreferrer"
                                sx={{ borderRadius: 3, flex: 1 }}
                                endIcon={<OpenInNewRounded fontSize="small" />}
                              >
                                Visit portal
                              </Button>
                            </Tooltip>
                            <Button
                              variant={
                                t.status === "active" ? "outlined" : "contained"
                              }
                              color={
                                t.status === "active" ? "error" : "success"
                              }
                              onClick={() => void handleToggleTenantStatus(t)}
                              disabled={statusBusyId === t.id}
                              sx={{ borderRadius: 3, flex: 1 }}
                            >
                              {statusBusyId === t.id
                                ? "Updating…"
                                : t.status === "active"
                                ? "Deactivate"
                                : "Activate"}
                            </Button>
                          </Stack>
                        </Stack>
                      </Card>
                    ))}
                    {tenants.length === 0 && (
                      <Card sx={{ p: 3, borderRadius: 4 }}>
                        <Typography color="text.secondary">
                          No tenants found.
                        </Typography>
                      </Card>
                    )}
                  </Box>
                </Box>
              )}

              {menu === "create" && (
                <Box sx={{ maxWidth: 820 }}>
                  <Stack spacing={2}>
                    <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
                      Create Tenant
                    </Typography>
                    {createError ? (
                      <Typography color="error">{createError}</Typography>
                    ) : null}
                    {createOk ? (
                      <Typography color="success.main" sx={{ fontWeight: 800 }}>
                        {createOk}
                      </Typography>
                    ) : null}
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField
                        label="Company name"
                        value={newTenant.name}
                        onChange={(e) =>
                          setNewTenant({ ...newTenant, name: e.target.value })
                        }
                        required
                      />
                      <TextField
                        label="Subdomain"
                        value={newTenant.subdomain}
                        onChange={(e) =>
                          setNewTenant({
                            ...newTenant,
                            subdomain: e.target.value.toLowerCase(),
                          })
                        }
                        required
                        helperText="Lowercase letters, numbers, and hyphens only."
                      />
                    </Stack>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField
                        label="Tenant Email"
                        type="email"
                        value={newTenant.email}
                        onChange={(e) =>
                          setNewTenant({ ...newTenant, email: e.target.value })
                        }
                        required
                      />
                      <TextField
                        label="Tenant Password"
                        type={showCreatePwd ? "text" : "password"}
                        value={newTenant.password}
                        onChange={(e) =>
                          setNewTenant({
                            ...newTenant,
                            password: e.target.value,
                          })
                        }
                        required
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                aria-label="toggle password visibility"
                                onClick={() => setShowCreatePwd(!showCreatePwd)}
                                edge="end"
                                size="small"
                              >
                                {showCreatePwd ? (
                                  <VisibilityOffRounded />
                                ) : (
                                  <VisibilityRounded />
                                )}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Stack>
                    <TextField
                      label="Note"
                      value={newTenant.note}
                      onChange={(e) =>
                        setNewTenant({ ...newTenant, note: e.target.value })
                      }
                      multiline
                      minRows={2}
                      placeholder="Optional note for this tenant"
                    />
                    <Box>
                      <Button
                        variant="contained"
                        onClick={handleCreateTenant}
                        disabled={creating}
                        sx={{ borderRadius: 3 }}
                      >
                        {creating ? "Provisioning…" : "Create tenant"}
                      </Button>
                    </Box>
                  </Stack>
                </Box>
              )}

              {menu === "password" && (
                <Box sx={{ maxWidth: 820 }}>
                  <Stack spacing={2}>
                    <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
                      Set Tenant Password
                    </Typography>
                    {resetError ? (
                      <Typography color="error">{resetError}</Typography>
                    ) : null}
                    {resetOk ? (
                      <Typography color="success.main" sx={{ fontWeight: 800 }}>
                        {resetOk}
                      </Typography>
                    ) : null}
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField
                        label="Subdomain"
                        value={resetForm.subdomain}
                        onChange={(e) =>
                          setResetForm({
                            ...resetForm,
                            subdomain: e.target.value.toLowerCase(),
                          })
                        }
                        required
                      />
                      <TextField
                        label="Tenant Email"
                        type="email"
                        value={resetForm.email}
                        onChange={(e) =>
                          setResetForm({ ...resetForm, email: e.target.value })
                        }
                        required
                      />
                      <TextField
                        label="New Password"
                        type={showResetPwd ? "text" : "password"}
                        value={resetForm.new_password}
                        onChange={(e) =>
                          setResetForm({
                            ...resetForm,
                            new_password: e.target.value,
                          })
                        }
                        required
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                aria-label="toggle password visibility"
                                onClick={() => setShowResetPwd(!showResetPwd)}
                                edge="end"
                                size="small"
                              >
                                {showResetPwd ? (
                                  <VisibilityOffRounded />
                                ) : (
                                  <VisibilityRounded />
                                )}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Stack>
                    <Box>
                      <Button
                        variant="outlined"
                        onClick={handleResetPassword}
                        disabled={resetBusy}
                        sx={{ borderRadius: 3 }}
                      >
                        {resetBusy ? "Updating…" : "Set tenant password"}
                      </Button>
                    </Box>
                  </Stack>
                </Box>
              )}
            </Box>
          </Card>
        </Box>
      )}
    </Box>
  );
}
