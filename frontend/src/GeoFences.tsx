import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import { getUser } from "./utils/session";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

type FenceVertex = {
  seq: number;
  latitude: number;
  longitude: number;
};

type Fence = {
  id: string;
  name: string;
  type: "circle" | "polygon";
  active: number;
  is_default: number;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  time_start: string | null;
  time_end: string | null;
  vertices: FenceVertex[];
};

type Employee = {
  id: string;
  name: string;
  code: string;
  status?: string;
};

type Assignment = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  fence_id: string;
  fence_name: string;
  fence_type: string;
  updated_at: string;
};

type GeoSettings = {
  enabled: number;
  update_interval_sec: number;
  min_accuracy_m: number | null;
  offline_after_sec: number;
  require_fence: number;
};

const parsePolygonText = (text: string): FenceVertex[] => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: FenceVertex[] = [];
  for (const [idx, line] of lines.entries()) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 2) continue;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ seq: idx, latitude: lat, longitude: lng });
  }
  return out;
};

const polygonTextFromVertices = (vertices: FenceVertex[]) =>
  vertices.map((v) => `${v.latitude},${v.longitude}`).join("\n");

export default function GeoFences() {
  const user = getUser();
  const role = user?.role || "";
  const allowed = role === "tenant_owner" || role === "hr_admin";

  const [fences, setFences] = useState<Fence[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<GeoSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"circle" | "polygon">("circle");
  const [editActive, setEditActive] = useState(true);
  const [editDefault, setEditDefault] = useState(false);
  const [editCenterLat, setEditCenterLat] = useState("");
  const [editCenterLng, setEditCenterLng] = useState("");
  const [editRadiusM, setEditRadiusM] = useState("");
  const [editTimeStart, setEditTimeStart] = useState("");
  const [editTimeEnd, setEditTimeEnd] = useState("");
  const [editPolygonText, setEditPolygonText] = useState("");

  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignFenceId, setAssignFenceId] = useState("");

  const load = useCallback(async () => {
    if (!allowed) return;
    setError("");
    try {
      const [fRes, aRes, eRes, sRes] = await Promise.all([
        api.get("/api/geo/fences", { timeout: 12000 }),
        api.get("/api/geo/assignments", { timeout: 12000 }),
        api.get("/api/employees", { timeout: 12000 }),
        api.get("/api/geo/settings", { timeout: 12000 }),
      ]);
      setFences((fRes.data?.fences || []) as Fence[]);
      setAssignments((aRes.data?.assignments || []) as Assignment[]);
      setEmployees((eRes.data?.employees || []) as Employee[]);
      setSettings((sRes.data?.settings || null) as GeoSettings | null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load geo settings"));
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setEditName("");
    setEditType("circle");
    setEditActive(true);
    setEditDefault(false);
    setEditCenterLat("");
    setEditCenterLng("");
    setEditRadiusM("");
    setEditTimeStart("");
    setEditTimeEnd("");
    setEditPolygonText("");
    setEditOpen(true);
  };

  const openEdit = (f: Fence) => {
    setEditId(f.id);
    setEditName(f.name);
    setEditType(f.type);
    setEditActive(Boolean(f.active));
    setEditDefault(Boolean(f.is_default));
    setEditCenterLat(f.center_lat == null ? "" : String(f.center_lat));
    setEditCenterLng(f.center_lng == null ? "" : String(f.center_lng));
    setEditRadiusM(f.radius_m == null ? "" : String(f.radius_m));
    setEditTimeStart(f.time_start || "");
    setEditTimeEnd(f.time_end || "");
    setEditPolygonText(polygonTextFromVertices(f.vertices || []));
    setEditOpen(true);
  };

  const saveFence = async () => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const payload: Record<string, unknown> = {
        name: editName.trim(),
        type: editType,
        active: editActive ? 1 : 0,
        is_default: editDefault ? 1 : 0,
        time_start: editTimeStart.trim() || null,
        time_end: editTimeEnd.trim() || null,
      };
      if (editType === "circle") {
        payload.center_lat = Number(editCenterLat);
        payload.center_lng = Number(editCenterLng);
        payload.radius_m = Math.max(1, Math.round(Number(editRadiusM)));
      } else {
        payload.vertices = parsePolygonText(editPolygonText);
      }
      if (editId) {
        await api.post(
          "/api/geo/fences/update",
          { ...payload, id: editId },
          { timeout: 12000 },
        );
      } else {
        await api.post("/api/geo/fences", payload, { timeout: 12000 });
      }
      setEditOpen(false);
      setOk("Saved");
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save fence"));
    } finally {
      setBusy(false);
    }
  };

  const deleteFence = async (id: string) => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.post("/api/geo/fences/delete", { id }, { timeout: 12000 });
      setOk("Deleted");
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to delete fence"));
    } finally {
      setBusy(false);
    }
  };

  const setDefaultFence = async (id: string) => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.post("/api/geo/fences/set_default", { id }, { timeout: 12000 });
      setOk("Default updated");
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to set default fence"));
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.post(
        "/api/geo/assignments",
        {
          employee_id: assignEmployeeId,
          fence_id: assignFenceId ? assignFenceId : 0,
        },
        { timeout: 12000 },
      );
      setOk("Assignment saved");
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to set assignment"));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.post("/api/geo/settings", settings, { timeout: 12000 });
      setOk("Settings saved");
      void load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save settings"));
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Not authorized</Alert>
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>
            Geo-Fencing
          </Typography>
          <Typography color="text.secondary">
            Create fences, set defaults, assign per employee, and enable tracking.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {ok && <Alert severity="success">{ok}</Alert>}

        <Paper sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ sm: "center" }}
            justifyContent="space-between"
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            <Typography sx={{ fontWeight: 900 }}>Fences</Typography>
            <Button variant="contained" onClick={openCreate} disabled={busy}>
              Create Fence
            </Button>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Default</TableCell>
                  <TableCell>Active</TableCell>
                  <TableCell>Time Window</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fences.map((f) => (
                  <TableRow key={f.id} hover>
                    <TableCell sx={{ fontWeight: 800 }}>{f.name}</TableCell>
                    <TableCell>{f.type}</TableCell>
                    <TableCell>{f.is_default ? "Yes" : "No"}</TableCell>
                    <TableCell>{f.active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      {f.time_start && f.time_end
                        ? `${f.time_start} - ${f.time_end}`
                        : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button
                        size="small"
                        onClick={() => openEdit(f)}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setDefaultFence(f.id)}
                        disabled={busy || Boolean(f.is_default)}
                      >
                        Set Default
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => deleteFence(f.id)}
                        disabled={busy}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {fences.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No fences yet.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 900, mb: 1.5 }}>Assignments</Typography>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            <TextField
              select
              label="Employee"
              value={assignEmployeeId}
              onChange={(e) => setAssignEmployeeId(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Select…</MenuItem>
              {employees.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.code} — {e.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Fence"
              value={assignFenceId}
              onChange={(e) => setAssignFenceId(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Use Default / Clear Custom</MenuItem>
              {fences.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name} ({f.type})
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              disabled={busy || !assignEmployeeId}
              onClick={saveAssignment}
            >
              Save Assignment
            </Button>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Fence</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={`${a.employee_id}-${a.fence_id}`}>
                    <TableCell sx={{ fontWeight: 800 }}>
                      {a.employee_code} — {a.employee_name}
                    </TableCell>
                    <TableCell>
                      {a.fence_name} ({a.fence_type})
                    </TableCell>
                    <TableCell>{a.updated_at || "—"}</TableCell>
                  </TableRow>
                ))}
                {assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No custom assignments yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 900, mb: 1.5 }}>Settings</Typography>
          {!settings ? (
            <Alert severity="info">Loading settings…</Alert>
          ) : (
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(settings.enabled)}
                      onChange={(e) =>
                        setSettings((s) =>
                          s ? { ...s, enabled: e.target.checked ? 1 : 0 } : s,
                        )
                      }
                    />
                  }
                  label="Enable Tracking & Geo-Fencing"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(settings.require_fence)}
                      onChange={(e) =>
                        setSettings((s) =>
                          s
                            ? { ...s, require_fence: e.target.checked ? 1 : 0 }
                            : s,
                        )
                      }
                    />
                  }
                  label="Require Fence (block if none configured)"
                />
              </Stack>

              <Divider />

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="Update interval (sec)"
                  type="number"
                  value={settings.update_interval_sec}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            update_interval_sec: Number(e.target.value || 0),
                          }
                        : s,
                    )
                  }
                  sx={{ maxWidth: 260 }}
                />
                <TextField
                  label="Min accuracy (m)"
                  type="number"
                  value={settings.min_accuracy_m ?? ""}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            min_accuracy_m: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                        : s,
                    )
                  }
                  sx={{ maxWidth: 260 }}
                />
                <TextField
                  label="Offline after (sec)"
                  type="number"
                  value={settings.offline_after_sec}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? { ...s, offline_after_sec: Number(e.target.value || 0) }
                        : s,
                    )
                  }
                  sx={{ maxWidth: 260 }}
                />
              </Stack>

              <Box>
                <Button variant="contained" onClick={saveSettings} disabled={busy}>
                  Save Settings
                </Button>
              </Box>
            </Stack>
          )}
        </Paper>
      </Stack>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? "Edit Fence" : "Create Fence"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Type"
              value={editType}
              onChange={(e) => setEditType(e.target.value as "circle" | "polygon")}
            >
              <MenuItem value="circle">Radius (Circle)</MenuItem>
              <MenuItem value="polygon">Polygon</MenuItem>
            </TextField>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                }
                label="Active"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editDefault}
                    onChange={(e) => setEditDefault(e.target.checked)}
                  />
                }
                label="Default"
              />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Time start (HH:MM:SS)"
                value={editTimeStart}
                onChange={(e) => setEditTimeStart(e.target.value)}
                placeholder="09:00:00"
                fullWidth
              />
              <TextField
                label="Time end (HH:MM:SS)"
                value={editTimeEnd}
                onChange={(e) => setEditTimeEnd(e.target.value)}
                placeholder="17:00:00"
                fullWidth
              />
            </Stack>

            {editType === "circle" ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Center lat"
                  value={editCenterLat}
                  onChange={(e) => setEditCenterLat(e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Center lng"
                  value={editCenterLng}
                  onChange={(e) => setEditCenterLng(e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Radius (m)"
                  value={editRadiusM}
                  onChange={(e) => setEditRadiusM(e.target.value)}
                  fullWidth
                />
              </Stack>
            ) : (
              <TextField
                label="Polygon vertices (one per line: lat,lng)"
                value={editPolygonText}
                onChange={(e) => setEditPolygonText(e.target.value)}
                multiline
                minRows={6}
                fullWidth
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={saveFence} variant="contained" disabled={busy}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
