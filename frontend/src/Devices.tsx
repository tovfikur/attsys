import { useCallback, useEffect, useMemo, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import { getUser } from "./utils/session";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent as MuiDialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  EditRounded,
  RefreshRounded,
  SettingsRounded,
  SyncRounded,
  VisibilityRounded,
} from "@mui/icons-material";

interface Device {
  id: string;
  device_id: string;
  status: string;
  type: string;
  site_name: string;
  created_at: string;
  hik_device_name?: string | null;
  hik_api_url?: string | null;
  hik_token_expire_time?: string | null;
  hik_configured?: number | boolean | null;
}

type HikConfigState = {
  hik_device_name: string;
  hik_app_key: string;
  hik_secret_key: string;
  hik_api_url: string;
  busy: boolean;
  message: string;
  error: string;
  unknown_employee_codes?: { code: string; count: number }[];
  unknown_employee_codes_truncated?: boolean;
};

export default function Devices() {
  const user = getUser();
  const [devices, setDevices] = useState<Device[]>([]);
  const [siteName, setSiteName] = useState("HQ");
  const [type, setType] = useState("terminal");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creds, setCreds] = useState<{
    device_id: string;
    secret: string;
  } | null>(null);
  const [hik, setHik] = useState<Record<string, HikConfigState>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [editOk, setEditOk] = useState("");
  const [editDeviceId, setEditDeviceId] = useState<string>("");
  const [editForm, setEditForm] = useState<{
    new_device_id: string;
    site_name: string;
    type: string;
  }>({ new_device_id: "", site_name: "", type: "" });

  const [hikOpen, setHikOpen] = useState(false);
  const [hikDeviceId, setHikDeviceId] = useState<string>("");

  const allowed =
    user && (user.role === "tenant_owner" || user.role === "hr_admin");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get("/api/devices");
      const list: Device[] = r.data.devices || [];
      setDevices(list);
      setHik((prev) => {
        const next: Record<string, HikConfigState> = { ...prev };
        for (const d of list) {
          if (!next[d.device_id]) {
            next[d.device_id] = {
              hik_device_name: (d.hik_device_name || "").toString(),
              hik_app_key: "",
              hik_secret_key: "",
              hik_api_url: (
                d.hik_api_url ||
                "/api/hccgw/acs/v1/event/certificaterecords/search"
              ).toString(),
              busy: false,
              message: "",
              error: "",
            };
          } else {
            next[d.device_id] = {
              ...next[d.device_id],
              hik_device_name: (
                d.hik_device_name ||
                next[d.device_id].hik_device_name ||
                ""
              ).toString(),
              hik_api_url: (
                d.hik_api_url ||
                next[d.device_id].hik_api_url ||
                "/api/hccgw/acs/v1/event/certificaterecords/search"
              ).toString(),
            };
          }
        }
        return next;
      });
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreds(null);
    try {
      const r = await api.post("/api/devices/register", {
        site_name: siteName,
        type,
      });
      setCreds(r.data);
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed"));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (device_id: string, status: string) => {
    try {
      await api.post("/api/devices/status", {
        device_id,
        status: status === "active" ? "disabled" : "active",
      });
      void load();
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const updateHik = (deviceId: string, patch: Partial<HikConfigState>) => {
    setHik((prev) => ({
      ...prev,
      [deviceId]: {
        ...(prev[deviceId] || {
          hik_device_name: "",
          hik_app_key: "",
          hik_secret_key: "",
          hik_api_url: "/api/hccgw/acs/v1/event/certificaterecords/search",
          busy: false,
          message: "",
          error: "",
          unknown_employee_codes: [],
          unknown_employee_codes_truncated: false,
        }),
        ...patch,
      },
    }));
  };

  const saveHikConfig = async (deviceId: string) => {
    const st = hik[deviceId];
    if (!st) return;
    updateHik(deviceId, { busy: true, message: "", error: "" });
    try {
      const payload: Record<string, unknown> = {
        device_id: deviceId,
        hik_device_name: st.hik_device_name,
        hik_api_url: st.hik_api_url,
      };
      if (st.hik_app_key.trim() !== "")
        payload.hik_app_key = st.hik_app_key.trim();
      if (st.hik_secret_key.trim() !== "")
        payload.hik_secret_key = st.hik_secret_key.trim();
      await api.post("/api/devices/hik/config", payload);
      updateHik(deviceId, {
        message: "Saved",
      });
      void load();
    } catch (err: unknown) {
      updateHik(deviceId, { error: getErrorMessage(err, "Failed") });
    } finally {
      updateHik(deviceId, { busy: false });
    }
  };

  const loadHikConfig = async (deviceId: string) => {
    if (!deviceId) return;
    updateHik(deviceId, { busy: true, message: "", error: "" });
    try {
      const r = await api.get(
        `/api/devices/hik/config?device_id=${encodeURIComponent(deviceId)}`
      );
      updateHik(deviceId, {
        hik_device_name: (r.data?.hik_device_name || "").toString(),
        hik_api_url: (
          r.data?.hik_api_url ||
          "/api/hccgw/acs/v1/event/certificaterecords/search"
        ).toString(),
        hik_app_key: (r.data?.hik_app_key || "").toString(),
        hik_secret_key: (r.data?.hik_secret_key || "").toString(),
      });
    } catch (err: unknown) {
      updateHik(deviceId, { error: getErrorMessage(err, "Failed") });
    } finally {
      updateHik(deviceId, { busy: false });
    }
  };

  const testHik = async (deviceId: string) => {
    updateHik(deviceId, { busy: true, message: "", error: "" });
    try {
      const r = await api.post("/api/devices/hik/test", {
        device_id: deviceId,
      });
      updateHik(deviceId, {
        message: r.data?.device_found
          ? "Connection OK, device found"
          : "Connection OK, device not found",
      });
    } catch (err: unknown) {
      updateHik(deviceId, { error: getErrorMessage(err, "Failed") });
    } finally {
      updateHik(deviceId, { busy: false });
    }
  };

  const syncHik = async (deviceId: string, mode: "last2days" | "all") => {
    updateHik(deviceId, { busy: true, message: "", error: "" });
    try {
      const r = await api.post("/api/devices/hik/sync", {
        device_id: deviceId,
        mode,
      });
      const d = r.data || {};
      updateHik(deviceId, {
        message: `Added: ${d.added ?? 0}, Duplicates: ${
          d.duplicates ?? 0
        }, Unknown employees: ${d.skipped_unknown_employee ?? 0}`,
        unknown_employee_codes: Array.isArray(d.unknown_employee_codes)
          ? (d.unknown_employee_codes as { code: string; count: number }[])
          : [],
        unknown_employee_codes_truncated: !!d.unknown_employee_codes_truncated,
      });
    } catch (err: unknown) {
      updateHik(deviceId, { error: getErrorMessage(err, "Failed") });
    } finally {
      updateHik(deviceId, { busy: false });
    }
  };

  const openEdit = (d: Device) => {
    setEditError("");
    setEditOk("");
    setEditDeviceId(d.device_id);
    setEditForm({
      new_device_id: d.device_id,
      site_name: d.site_name || "",
      type: d.type || "",
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    setEditBusy(true);
    setEditError("");
    setEditOk("");
    try {
      const payload: Record<string, unknown> = {
        device_id: editDeviceId,
        new_device_id: editForm.new_device_id.trim(),
        site_name: editForm.site_name.trim(),
        type: editForm.type.trim(),
      };
      const r = await api.post("/api/devices/update", payload);
      const newId = (r.data?.device_id || editForm.new_device_id.trim()) as
        | string
        | undefined;
      if (newId && newId !== editDeviceId) {
        setHik((prev) => {
          const next = { ...prev };
          const existing = next[editDeviceId];
          if (existing) {
            delete next[editDeviceId];
            next[newId] = existing;
          }
          return next;
        });
      }
      setEditOk("Updated");
      void load();
      setEditOpen(false);
    } catch (err: unknown) {
      setEditError(getErrorMessage(err, "Failed to update device"));
    } finally {
      setEditBusy(false);
    }
  };

  const statusChip = useCallback((status: string) => {
    const v = String(status || "").toLowerCase();
    if (v === "active")
      return <Chip size="small" color="success" label="active" />;
    if (v === "disabled")
      return <Chip size="small" color="default" label="disabled" />;
    return <Chip size="small" color="warning" label={status || "-"} />;
  }, []);

  const devicesSorted = useMemo(() => {
    const list = [...devices];
    list.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    return list;
  }, [devices]);

  if (!allowed) return <div style={{ padding: 16 }}>Not authorized</div>;
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>
              Devices
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage device registration, status, and Hik-Connect sync.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="outlined" href="/devices/ingest">
              Test Ingest
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshRounded />}
              onClick={() => void load()}
              disabled={loading}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack spacing={0.25}>
                <Typography sx={{ fontWeight: 800 }}>
                  Register Device
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Creates a new device_id and secret for ingestion.
                </Typography>
              </Stack>
              {error && <Alert severity="error">{error}</Alert>}
              {creds && (
                <Alert severity="success">
                  Device ID: {creds.device_id} · Secret: {creds.secret}
                </Alert>
              )}
              <Box
                component="form"
                onSubmit={register}
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" },
                  alignItems: "end",
                }}
              >
                <TextField
                  label="Site Name"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="Type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  required
                  fullWidth
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={busy}
                  sx={{ height: 56 }}
                >
                  {busy ? "Registering..." : "Register"}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Paper sx={{ overflow: "hidden" }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
            justifyContent="space-between"
            sx={{ p: 2 }}
          >
            <Box>
              <Typography sx={{ fontWeight: 800 }}>
                Registered Devices
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Status is shown from the database.
              </Typography>
            </Box>
            {loading && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Loading
                </Typography>
              </Stack>
            )}
          </Stack>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>Site</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Device ID</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Hik-Connect</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Token Expire</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devicesSorted.map((d) => (
                  <TableRow key={d.device_id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {d.site_name}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>
                      {d.device_id}
                    </TableCell>
                    <TableCell>{d.type || "-"}</TableCell>
                    <TableCell>{statusChip(d.status)}</TableCell>
                    <TableCell>
                      {d.hik_configured ? (
                        <Chip size="small" color="success" label="configured" />
                      ) : (
                        <Chip size="small" label="not configured" />
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {d.hik_token_expire_time || "-"}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <IconButton
                        size="small"
                        onClick={() => openEdit(d)}
                        aria-label="Edit device"
                      >
                        <EditRounded fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setHikDeviceId(d.device_id);
                          setHikOpen(true);
                          void loadHikConfig(d.device_id);
                        }}
                        aria-label="Hik-Connect settings"
                      >
                        <SettingsRounded fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ ml: 1 }}
                        onClick={() => void toggle(d.device_id, d.status)}
                      >
                        {String(d.status).toLowerCase() === "active"
                          ? "Disable"
                          : "Activate"}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<VisibilityRounded />}
                        sx={{ ml: 1 }}
                        href={`/devices/events?device_id=${encodeURIComponent(
                          d.device_id
                        )}`}
                      >
                        Events
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {devicesSorted.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ p: 3 }}>
                      <Typography
                        align="center"
                        color="text.secondary"
                        variant="body2"
                      >
                        No devices yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>

      <Dialog
        open={editOpen}
        onClose={() => {
          if (editBusy) return;
          setEditOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit Device</DialogTitle>
        <MuiDialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {editError && <Alert severity="error">{editError}</Alert>}
            {editOk && <Alert severity="success">{editOk}</Alert>}
            <TextField
              label="Device ID"
              value={editForm.new_device_id}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, new_device_id: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Site Name"
              value={editForm.site_name}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, site_name: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Type"
              value={editForm.type}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, type: e.target.value }))
              }
              fullWidth
            />
          </Stack>
        </MuiDialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditOpen(false)}
            disabled={editBusy}
            variant="text"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void submitEdit()}
            disabled={editBusy}
            variant="contained"
          >
            {editBusy ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={hikOpen}
        onClose={() => {
          if (hik[hikDeviceId]?.busy) return;
          setHikOpen(false);
          setHikDeviceId("");
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Hik-Connect</DialogTitle>
        <MuiDialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {hik[hikDeviceId]?.error && (
              <Alert severity="error">{hik[hikDeviceId].error}</Alert>
            )}
            {hik[hikDeviceId]?.message && (
              <Alert severity="success">{hik[hikDeviceId].message}</Alert>
            )}
            <TextField
              label="Device Name"
              value={hik[hikDeviceId]?.hik_device_name || ""}
              onChange={(e) =>
                updateHik(hikDeviceId, { hik_device_name: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="API URL"
              value={hik[hikDeviceId]?.hik_api_url || ""}
              onChange={(e) =>
                updateHik(hikDeviceId, { hik_api_url: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="App Key"
              value={hik[hikDeviceId]?.hik_app_key || ""}
              onChange={(e) =>
                updateHik(hikDeviceId, { hik_app_key: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="Secret Key"
              type="password"
              value={hik[hikDeviceId]?.hik_secret_key || ""}
              onChange={(e) =>
                updateHik(hikDeviceId, { hik_secret_key: e.target.value })
              }
              fullWidth
            />
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ pt: 0.5 }}
            >
              <Button
                variant="contained"
                onClick={() => void saveHikConfig(hikDeviceId)}
                disabled={!!hik[hikDeviceId]?.busy}
              >
                {hik[hikDeviceId]?.busy ? "Working..." : "Save"}
              </Button>
              <Button
                variant="outlined"
                onClick={() => void testHik(hikDeviceId)}
                disabled={!!hik[hikDeviceId]?.busy}
              >
                Test
              </Button>
              <Button
                variant="outlined"
                startIcon={<SyncRounded />}
                onClick={() => void syncHik(hikDeviceId, "last2days")}
                disabled={!!hik[hikDeviceId]?.busy}
              >
                Sync 2 Days
              </Button>
              <Button
                variant="outlined"
                startIcon={<SyncRounded />}
                onClick={() => void syncHik(hikDeviceId, "all")}
                disabled={!!hik[hikDeviceId]?.busy}
              >
                Sync All
              </Button>
            </Stack>
            {!!hik[hikDeviceId]?.unknown_employee_codes?.length && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Typography sx={{ fontWeight: 800 }}>
                      Unknown Employees
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        const rows =
                          hik[hikDeviceId]?.unknown_employee_codes || [];
                        const text = rows
                          .map((x) => `${x.code}\t${x.count}`)
                          .join("\n");
                        void navigator.clipboard?.writeText(text);
                      }}
                    >
                      Copy
                    </Button>
                  </Stack>
                  <TextField
                    value={(hik[hikDeviceId]?.unknown_employee_codes || [])
                      .map((x) => `${x.code} (${x.count})`)
                      .join("\n")}
                    multiline
                    minRows={4}
                    fullWidth
                    InputProps={{ readOnly: true }}
                  />
                  {hik[hikDeviceId]?.unknown_employee_codes_truncated && (
                    <Alert severity="warning">
                      List truncated (showing first 200 unique codes).
                    </Alert>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </MuiDialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setHikOpen(false);
              setHikDeviceId("");
            }}
            disabled={!!hik[hikDeviceId]?.busy}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
