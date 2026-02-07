import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import { getUser } from "./utils/session";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";

type LatestRow = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  device_status: string | null;
  last_seen_at: string;
  status: "inside" | "outside" | "offline" | string;
  inside: number;
  fence_id: string | null;
  distance_outside_m: number | null;
  age_sec: number;
};

type HistoryPoint = {
  id: string;
  latitude: number;
  longitude: number;
  captured_at: string;
};

function MapAutoFit(props: {
  bounds: [number, number][];
  followCenter: [number, number] | null;
}) {
  const map = useMap();

  const boundsKey = useMemo(
    () => props.bounds.map((p) => `${p[0]},${p[1]}`).join(";"),
    [props.bounds],
  );
  const followKey = props.followCenter
    ? `${props.followCenter[0]},${props.followCenter[1]}`
    : "";

  useEffect(() => {
    if (!props.bounds.length) return;
    if (props.followCenter) return;

    if (props.bounds.length === 1) {
      map.setView(props.bounds[0], Math.max(map.getZoom(), 16));
      return;
    }

    const b = L.latLngBounds(props.bounds);
    map.fitBounds(b, { padding: [24, 24] });
  }, [boundsKey, map, props.followCenter]);

  useEffect(() => {
    if (!props.followCenter) return;
    map.setView(props.followCenter, Math.max(map.getZoom(), 16));
  }, [followKey, map, props.followCenter]);

  return null;
}

const statusColor = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s === "inside") return "#2e7d32";
  if (s === "outside") return "#d32f2f";
  return "#9e9e9e";
};

const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;

const toSqlDateTime = (v: string) => {
  const raw = String(v || "").trim();
  if (!raw) return "";
  if (raw.includes("T")) return raw.replace("T", " ") + ":00";
  return raw;
};

export default function TrackingDashboard() {
  const user = getUser();
  const role = user?.role || "";
  const allowed =
    role === "tenant_owner" || role === "hr_admin" || role === "manager";

  const refreshMs = 30_000;
  const [rows, setRows] = useState<LatestRow[]>([]);
  const [offlineAfter, setOfflineAfter] = useState<number>(180);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState("");
  const [fullScreenMapOpen, setFullScreenMapOpen] = useState(false);
  const [followSelected, setFollowSelected] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const today = useMemo(() => {
    const d = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  const [from, setFrom] = useState(`${today}T00:00`);
  const [to, setTo] = useState(`${today}T23:59`);

  const loadLatest = useCallback(async () => {
    if (!allowed) return;
    try {
      const res = await api.get("/api/geo/location/latest", { timeout: 12000 });
      setRows((res.data?.rows || []) as LatestRow[]);
      setOfflineAfter(Number(res.data?.offline_after_sec || 180) || 180);
      setLastUpdatedAt(Date.now());
      setNextRefreshAt(Date.now() + refreshMs);
    } catch (err: unknown) {
      setRows([]);
      setError(getErrorMessage(err, "Failed to load live locations"));
    }
  }, [allowed, refreshMs]);

  const loadHistory = useCallback(
    async (employeeId: string) => {
      if (!allowed) return;
      if (!employeeId) {
        setHistory([]);
        return;
      }
      try {
        const res = await api.get(
          `/api/geo/location/history?employee_id=${encodeURIComponent(
            employeeId,
          )}&from=${encodeURIComponent(toSqlDateTime(from))}&to=${encodeURIComponent(
            toSqlDateTime(to),
          )}&limit=10000`,
          { timeout: 12000 },
        );
        setHistory((res.data?.rows || []) as HistoryPoint[]);
      } catch (err: unknown) {
        setHistory([]);
        setError(getErrorMessage(err, "Failed to load movement history"));
      }
    },
    [allowed, from, to],
  );

  useEffect(() => {
    setError("");
    void loadLatest();
  }, [loadLatest]);

  const refreshAll = useCallback(async () => {
    await loadLatest();
    if (selectedEmployeeId) await loadHistory(selectedEmployeeId);
  }, [loadHistory, loadLatest, selectedEmployeeId]);

  useEffect(() => {
    if (!allowed) return;
    setNextRefreshAt(Date.now() + refreshMs);
    const id = window.setInterval(() => {
      void refreshAll();
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [allowed, refreshAll, refreshMs]);

  useEffect(() => {
    void loadHistory(selectedEmployeeId);
  }, [loadHistory, selectedEmployeeId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const trail = useMemo<[number, number][]>(() => {
    return history.map((p) => [p.latitude, p.longitude]);
  }, [history]);

  const selectedRow = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return rows.find((r) => r.employee_id === selectedEmployeeId) || null;
  }, [rows, selectedEmployeeId]);

  const followCenter = useMemo<[number, number] | null>(() => {
    if (!followSelected) return null;
    if (!selectedRow) return null;
    return [selectedRow.latitude, selectedRow.longitude];
  }, [followSelected, selectedRow]);

  const mapBounds = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    for (const r of rows) pts.push([r.latitude, r.longitude]);
    for (const p of trail) pts.push(p);
    if (pts.length > 0) return pts;
    return [
      [23.75, 90.35],
      [23.87, 90.48],
    ];
  }, [rows, trail]);

  const refreshInSec = useMemo(() => {
    if (!nextRefreshAt) return null;
    const diff = nextRefreshAt - nowTick;
    return Math.max(0, Math.ceil(diff / 1000));
  }, [nextRefreshAt, nowTick]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "—";
    return new Date(lastUpdatedAt).toLocaleTimeString();
  }, [lastUpdatedAt]);

  const MapView = useCallback(
    (props: { height: number | string; borderRadius?: number }) => {
      const br = props.borderRadius ?? 2;
      return (
        <Box sx={{ height: props.height, borderRadius: br, overflow: "hidden" }}>
          <MapContainer bounds={mapBounds} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapAutoFit bounds={mapBounds} followCenter={followCenter} />
            {rows.map((r) => (
              <CircleMarker
                key={r.employee_id}
                center={[r.latitude, r.longitude]}
                radius={8}
                pathOptions={{
                  color: statusColor(r.status),
                  fillColor: statusColor(r.status),
                  fillOpacity: 0.9,
                }}
                eventHandlers={{
                  click: () => setSelectedEmployeeId(r.employee_id),
                }}
              />
            ))}
            {trail.length >= 2 && (
              <Polyline
                positions={trail}
                pathOptions={{ color: "#1976d2", weight: 4, opacity: 0.85 }}
              />
            )}
          </MapContainer>
        </Box>
      );
    },
    [followCenter, mapBounds, rows, trail],
  );

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
            Live Tracking
          </Typography>
          <Typography color="text.secondary">
            Auto-refreshes every 30 seconds. Offline after {offlineAfter}s. Last update:{" "}
            {lastUpdatedLabel}
            {refreshInSec !== null ? ` · Next refresh in ${refreshInSec}s` : ""}
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <Paper sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ md: "center" }}
            justifyContent="space-between"
            sx={{ mb: 2 }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="From"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="To"
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Button
                variant="outlined"
                onClick={() => void loadHistory(selectedEmployeeId)}
                disabled={!selectedEmployeeId}
              >
                Load Trail
              </Button>
              <FormControlLabel
                control={
                  <Switch
                    checked={followSelected}
                    onChange={(e) => setFollowSelected(e.target.checked)}
                  />
                }
                label="Follow selected"
              />
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button variant="outlined" onClick={() => setFullScreenMapOpen(true)}>
                Full Screen
              </Button>
              <Button variant="contained" onClick={() => void refreshAll()}>
                Refresh
              </Button>
            </Stack>
          </Stack>

          <MapView height={420} />
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 900, mb: 1.5 }}>Employees</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Seen</TableCell>
                  <TableCell>Outside (m)</TableCell>
                  <TableCell align="right">Map</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.employee_id}
                    hover
                    selected={r.employee_id === selectedEmployeeId}
                    onClick={() => setSelectedEmployeeId(r.employee_id)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell sx={{ fontWeight: 800 }}>
                      {r.employee_code} — {r.employee_name}
                    </TableCell>
                    <TableCell
                      sx={{ color: statusColor(r.status), fontWeight: 800 }}
                    >
                      {r.status}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {r.last_seen_at || "—"} ({r.age_sec}s)
                    </TableCell>
                    <TableCell>{r.distance_outside_m ?? "—"}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        component="a"
                        href={googleMapsUrl(r.latitude, r.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No live locations yet.
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
        open={fullScreenMapOpen}
        onClose={() => setFullScreenMapOpen(false)}
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle>Live Tracking Map</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ sm: "center" }}
              justifyContent="space-between"
            >
              <Typography color="text.secondary">
                Last update: {lastUpdatedLabel}
                {refreshInSec !== null ? ` · Next refresh in ${refreshInSec}s` : ""}
              </Typography>
              <Stack direction="row" spacing={1.5}>
                <Button variant="outlined" onClick={() => void refreshAll()}>
                  Refresh now
                </Button>
                <Button variant="contained" onClick={() => setFullScreenMapOpen(false)}>
                  Close
                </Button>
              </Stack>
            </Stack>
            <MapView height="80vh" borderRadius={2} />
          </Stack>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
