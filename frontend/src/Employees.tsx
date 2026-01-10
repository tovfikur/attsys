import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  Avatar,
  Stack,
  Tooltip,
  CircularProgress,
  Alert,
  useTheme,
  alpha,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ChevronLeft,
  ChevronRight,
  Close as CloseIcon,
} from "@mui/icons-material";

// --- Types ---
interface Employee {
  id: string;
  name: string;
  code: string;
  status: string;
  created_at: string;
}

interface Device {
  device_id: string;
  site_name: string;
  type: string;
  status: string;
}

interface AttendanceRecord {
  id?: string | number;
  date: string; // YYYY-MM-DD
  clock_in: string;
  clock_out: string | null;
  duration_minutes?: number;
}

interface LeaveRecord {
  date: string;
  reason: string;
  status: string;
}

// --- Main Component ---
export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/employees");
      setEmployees(res.data.employees);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this employee?"))
      return;
    try {
      await api.post("/api/employees/delete", { id });
      loadEmployees();
    } catch {
      alert("Failed to delete");
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <Box>
          <Typography
            variant="h4"
            gutterBottom
            sx={{ fontWeight: 800, color: "text.primary" }}
          >
            Employees
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your workforce, track attendance, and handle leaves
            efficiently.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ px: 4, py: 1.5, borderRadius: 2 }}
        >
          Add Employee
        </Button>
      </Box>

      {/* Employee List */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <TableContainer>
          <Table sx={{ minWidth: 650 }}>
            <TableHead sx={{ bgcolor: "background.default" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  NAME
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  CODE
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  STATUS
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  JOINED
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontWeight: 600, color: "text.secondary" }}
                >
                  ACTIONS
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <Typography color="text.secondary">
                      No employees found.
                    </Typography>
                    <Button
                      variant="text"
                      onClick={() => setCreateOpen(true)}
                      sx={{ mt: 1 }}
                    >
                      Create your first employee
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp) => (
                  <TableRow
                    key={emp.id}
                    hover
                    onClick={() => setSelectedEmployee(emp)}
                    sx={{
                      cursor: "pointer",
                      transition: "background-color 0.2s",
                    }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar
                          sx={{
                            bgcolor: "primary.light",
                            color: "primary.main",
                            fontWeight: "bold",
                          }}
                        >
                          {emp.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {emp.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {emp.code}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontFamily="monospace"
                        sx={{
                          bgcolor: "action.hover",
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          display: "inline-block",
                        }}
                      >
                        {emp.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={emp.status}
                        size="small"
                        color={emp.status === "active" ? "success" : "default"}
                        variant={
                          emp.status === "active" ? "filled" : "outlined"
                        }
                        sx={{ textTransform: "capitalize", fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(emp.created_at).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit Employee">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditEmployee(emp);
                          }}
                          sx={{
                            opacity: 0.6,
                            "&:hover": { opacity: 1, bgcolor: "action.hover" },
                            mr: 0.5,
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Employee">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => handleDelete(emp.id, e)}
                          sx={{
                            opacity: 0.6,
                            "&:hover": { opacity: 1, bgcolor: "error.lighter" },
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Modals */}
      <CreateEmployeeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          loadEmployees();
        }}
      />

      {selectedEmployee && (
        <AttendanceDialog
          open={!!selectedEmployee}
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}

      {editEmployee && (
        <EditEmployeeDialog
          open={!!editEmployee}
          employee={editEmployee}
          onClose={() => setEditEmployee(null)}
          onSuccess={() => {
            setEditEmployee(null);
            loadEmployees();
          }}
        />
      )}
    </Container>
  );
}

// --- Create Employee Dialog ---
function CreateEmployeeDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/employees", form);
      setForm({ name: "", code: "" });
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to create employee"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pb: 1,
          }}
        >
          <Typography variant="h6" fontWeight={700}>
            Add New Employee
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={3} pt={1}>
            {error && (
              <Paper
                sx={{
                  p: 2,
                  bgcolor: "error.light",
                  color: "error.contrastText",
                }}
              >
                <Typography variant="body2">{error}</Typography>
              </Paper>
            )}
            <TextField
              label="Full Name"
              placeholder="e.g. John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              variant="outlined"
            />
            <TextField
              label="Employee Code"
              placeholder="e.g. EMP-001"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
              variant="outlined"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={onClose} color="inherit" sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            size="large"
          >
            {busy ? "Creating..." : "Create Employee"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EditEmployeeDialog({
  open,
  employee,
  onClose,
  onSuccess,
}: {
  open: boolean;
  employee: Employee;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: employee.name,
    code: employee.code,
    status: employee.status,
  });
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceSyncIds, setDeviceSyncIds] = useState<Record<string, string>>(
    {}
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!open) return;

    setForm({
      name: employee.name,
      code: employee.code,
      status: employee.status,
    });
    setError("");
    setOk("");

    const run = async () => {
      setLoading(true);
      try {
        const [dRes, sRes] = await Promise.all([
          api.get("/api/devices"),
          api.get(
            `/api/employees/device_sync_ids?employee_id=${encodeURIComponent(
              employee.id
            )}`
          ),
        ]);

        const list = (dRes.data?.devices || []) as Device[];
        setDevices(list);

        const next: Record<string, string> = {};
        const existing = (sRes.data?.device_sync_ids || []) as {
          device_id: string;
          device_employee_id: string;
        }[];
        for (const row of existing) {
          if (row?.device_id)
            next[row.device_id] = row.device_employee_id || "";
        }
        setDeviceSyncIds(next);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load sync IDs"));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [employee.code, employee.id, employee.name, employee.status, open]);

  const submit = async () => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const device_sync_ids = Object.entries(deviceSyncIds)
        .map(([device_id, device_employee_id]) => ({
          device_id,
          device_employee_id: device_employee_id.trim(),
        }))
        .filter((x) => x.device_id && x.device_employee_id);

      await api.post("/api/employees/update", {
        id: employee.id,
        name: form.name,
        code: form.code,
        status: form.status,
        device_sync_ids,
      });

      setOk("Saved");
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save employee"));
    } finally {
      setBusy(false);
    }
  };

  const devicesSorted = [...devices].sort((a, b) =>
    String(a.device_id || "").localeCompare(String(b.device_id || ""))
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          Edit Employee
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          {ok && <Alert severity="success">{ok}</Alert>}
          <TextField
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="Employee Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            fullWidth
          />

          <Box sx={{ mt: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Per-device Sync IDs
            </Typography>
            {loading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Loading
                </Typography>
              </Stack>
            ) : devicesSorted.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No devices found.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {devicesSorted.map((d) => (
                  <Stack
                    key={d.device_id}
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "stretch", sm: "center" }}
                  >
                    <Box sx={{ minWidth: { sm: 260 } }}>
                      <Typography variant="body2" fontWeight={700}>
                        {d.site_name || d.device_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {d.device_id}
                      </Typography>
                    </Box>
                    <TextField
                      label="Device Employee ID"
                      value={deviceSyncIds[d.device_id] ?? ""}
                      onChange={(e) =>
                        setDeviceSyncIds((prev) => ({
                          ...prev,
                          [d.device_id]: e.target.value,
                        }))
                      }
                      fullWidth
                    />
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} color="inherit" sx={{ mr: 1 }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy || loading}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// --- Attendance Calendar Dialog ---
function AttendanceDialog({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee: Employee;
  onClose: () => void;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [records, setRecords] = useState<{
    attendance: AttendanceRecord[];
    leaves: LeaveRecord[];
  }>({ attendance: [], leaves: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const theme = useTheme();
  const lastRefreshAtRef = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
      const res = await api.get(
        `/api/attendance/employee?id=${employee.id}&month=${monthStr}`
      );
      setRecords(res.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load attendance"));
    } finally {
      setLoading(false);
    }
  }, [currentDate, employee.id]);

  useEffect(() => {
    if (open) fetchData();
  }, [fetchData, open]);

  useEffect(() => {
    if (!open) return;

    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 750) return;
      lastRefreshAtRef.current = now;
      fetchData();
    };

    const onVisibilityChange = () => {
      if (!document.hidden) triggerRefresh();
    };

    window.addEventListener("attendance:updated", triggerRefresh);
    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    let bc: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      bc = new BroadcastChannel("attendance");
      bc.onmessage = (ev) => {
        if (ev?.data?.type === "updated") triggerRefresh();
      };
    }

    const pollId = window.setInterval(triggerRefresh, 15_000);

    return () => {
      window.removeEventListener("attendance:updated", triggerRefresh);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (bc) bc.close();
      window.clearInterval(pollId);
    };
  }, [fetchData, open]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Calendar Logic
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const todayStr = new Date().toISOString().split("T")[0];

  const formatTime = (value: string | null | undefined): string => {
    if (!value) return "—";
    const spaceIdx = value.indexOf(" ");
    if (spaceIdx >= 0 && value.length >= spaceIdx + 6) {
      return value.slice(spaceIdx + 1, spaceIdx + 6);
    }
    const tIdx = value.indexOf("T");
    if (tIdx >= 0 && value.length >= tIdx + 6) {
      return value.slice(tIdx + 1, tIdx + 6);
    }
    return value;
  };

  const toMs = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
    const ms = Date.parse(normalized);
    return Number.isFinite(ms) ? ms : null;
  };

  const formatMinutes = (minutes: number): string => {
    const safe = Math.max(0, Math.floor(minutes));
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  };

  const formatDateLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map((v) => Number(v));
    if (!y || !m || !d) return dateStr;
    return new Date(y, m - 1, d).toLocaleDateString("default", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getAttendanceForDate = (dateStr: string) =>
    records.attendance
      .filter((r) => r.date === dateStr)
      .slice()
      .sort((a, b) => String(a.clock_in).localeCompare(String(b.clock_in)));

  const getDaySummary = (dayAttendance: AttendanceRecord[]) => {
    if (dayAttendance.length === 0) {
      return {
        firstIn: null as string | null,
        lastOut: null as string | null,
        totalMinutes: 0,
        spanMinutes: 0,
      };
    }

    const firstIn = dayAttendance[0]?.clock_in ?? null;

    let lastOut: string | null = null;
    for (const r of dayAttendance) {
      if (!r.clock_out) continue;
      if (!lastOut || String(r.clock_out) > String(lastOut))
        lastOut = r.clock_out;
    }

    const totalMinutes = dayAttendance.reduce((sum, r) => {
      if (typeof r.duration_minutes === "number")
        return sum + Math.max(0, r.duration_minutes);
      const inMs = toMs(r.clock_in);
      const outMs = toMs(r.clock_out);
      if (inMs == null || outMs == null) return sum;
      return sum + Math.max(0, Math.floor((outMs - inMs) / 60_000));
    }, 0);

    const firstMs = toMs(firstIn);
    const lastMs = toMs(lastOut);
    const spanMinutes =
      firstMs != null && lastMs != null
        ? Math.max(0, Math.floor((lastMs - firstMs) / 60_000))
        : 0;

    return { firstIn, lastOut, totalMinutes, spanMinutes };
  };

  const getDayStatus = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const dayAttendance = getAttendanceForDate(dateStr);
    if (dayAttendance.length > 0) {
      const summary = getDaySummary(dayAttendance);
      return {
        type: "present",
        label: "Present",
        attendance: dayAttendance[0],
        firstIn: summary.firstIn,
        lastOut: summary.lastOut,
        color: theme.palette.success.main,
        bg: alpha(theme.palette.success.main, 0.1),
      };
    }

    const leave = records.leaves.find((r) => r.date === dateStr);
    if (leave)
      return {
        type: "leave",
        label: "Leave",
        leave,
        color: theme.palette.warning.main,
        bg: alpha(theme.palette.warning.main, 0.1),
      };

    if (dateStr < todayStr)
      return {
        type: "absent",
        label: "Absent",
        color: theme.palette.error.main,
        bg: alpha(theme.palette.error.main, 0.1),
      };

    return {
      type: "neutral",
      label: "",
      color: theme.palette.text.disabled,
      bg: "transparent",
    };
  };

  const openDayDetails = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    setSelectedDate(dateStr);
  };

  const closeDayDetails = () => setSelectedDate(null);

  const selectedAttendance = selectedDate
    ? getAttendanceForDate(selectedDate)
    : [];
  const selectedLeave = selectedDate
    ? records.leaves.find((r) => r.date === selectedDate) || null
    : null;
  const selectedCheckoutCount = selectedAttendance.filter(
    (r) => !!r.clock_out
  ).length;
  const selectedSummary = getDaySummary(selectedAttendance);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, minHeight: "600px" } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: "primary.main",
              fontSize: "1.25rem",
            }}
          >
            {employee.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {employee.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Attendance & Leaves
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box p={3}>
          {/* Calendar Header */}
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={3}
            bgcolor="background.default"
            p={2}
            borderRadius={2}
          >
            <IconButton onClick={handlePrevMonth}>
              <ChevronLeft />
            </IconButton>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ textTransform: "capitalize" }}
            >
              {currentDate.toLocaleDateString("default", {
                month: "long",
                year: "numeric",
              })}
            </Typography>
            <IconButton onClick={handleNextMonth}>
              <ChevronRight />
            </IconButton>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {/* Loading State */}
          {loading ? (
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              height={300}
            >
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              {/* Days Header */}
              <Box
                display="grid"
                gridTemplateColumns="repeat(7, 1fr)"
                gap={1}
                mb={1}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <Box key={d} sx={{ textAlign: "center" }}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      sx={{ textTransform: "uppercase" }}
                    >
                      {d}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Days Grid */}
              <Box display="grid" gridTemplateColumns="repeat(7, 1fr)" gap={1}>
                {Array.from({ length: firstDay }).map((_, i) => (
                  <Box key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const status = getDayStatus(day);
                  return (
                    <Box key={day}>
                      <Paper
                        elevation={0}
                        onClick={() => openDayDetails(day)}
                        sx={{
                          height: 96,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: status.bg,
                          border: "1px solid",
                          borderColor:
                            status.type === "neutral"
                              ? "divider"
                              : status.color,
                          borderRadius: 2,
                          transition: "transform 0.2s",
                          cursor: "pointer",
                          "&:hover": { transform: "scale(1.05)", boxShadow: 2 },
                        }}
                      >
                        <Typography
                          variant="h6"
                          fontWeight={600}
                          color={
                            status.type === "neutral"
                              ? "text.primary"
                              : status.color
                          }
                        >
                          {day}
                        </Typography>
                        {status.type === "present" && status.attendance ? (
                          <Box
                            sx={{
                              mt: 0.5,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 0.25,
                            }}
                          >
                            <Typography
                              variant="caption"
                              fontWeight={700}
                              sx={{ color: theme.palette.success.main }}
                            >
                              In{" "}
                              {formatTime(
                                status.firstIn ?? status.attendance.clock_in
                              )}
                            </Typography>
                            {"lastOut" in status && status.lastOut ? (
                              <Typography
                                variant="caption"
                                fontWeight={700}
                                sx={{ color: theme.palette.success.main }}
                              >
                                Out {formatTime(status.lastOut)}
                              </Typography>
                            ) : (
                              <Typography
                                variant="caption"
                                fontWeight={700}
                                sx={{ color: theme.palette.warning.main }}
                              >
                                No Checkout
                              </Typography>
                            )}
                          </Box>
                        ) : status.label ? (
                          <Chip
                            label={status.label}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: "0.65rem",
                              bgcolor: status.color,
                              color: "#fff",
                              mt: 0.5,
                            }}
                          />
                        ) : null}
                      </Paper>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Legend */}
          <Stack direction="row" spacing={3} justifyContent="center" mt={4}>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                width={12}
                height={12}
                borderRadius="50%"
                bgcolor={theme.palette.success.main}
              />
              <Typography variant="caption" fontWeight={600}>
                Present
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                width={12}
                height={12}
                borderRadius="50%"
                bgcolor={theme.palette.warning.main}
              />
              <Typography variant="caption" fontWeight={600}>
                Leave
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                width={12}
                height={12}
                borderRadius="50%"
                bgcolor={theme.palette.error.main}
              />
              <Typography variant="caption" fontWeight={600}>
                Absent
              </Typography>
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <Dialog
        open={!!selectedDate}
        onClose={closeDayDetails}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {selectedDate ? formatDateLabel(selectedDate) : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {employee.name}
            </Typography>
          </Box>
          <IconButton onClick={closeDayDetails}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Chip
              label={`Check-ins: ${selectedAttendance.length}`}
              color="success"
              variant="outlined"
            />
            <Chip
              label={`Check-outs: ${selectedCheckoutCount}`}
              color="warning"
              variant="outlined"
            />
            <Chip
              label={`First In: ${formatTime(selectedSummary.firstIn)}`}
              variant="outlined"
            />
            <Chip
              label={`Last Out: ${formatTime(selectedSummary.lastOut)}`}
              variant="outlined"
            />
            <Chip
              label={`Worked: ${formatMinutes(selectedSummary.totalMinutes)}`}
              variant="outlined"
            />
            <Chip
              label={`Stay: ${formatMinutes(selectedSummary.spanMinutes)}`}
              variant="outlined"
            />
            {selectedLeave ? (
              <Chip
                label={`Leave: ${selectedLeave.reason || "—"}`}
                color="info"
                variant="outlined"
              />
            ) : null}
          </Stack>

          <Box mt={2}>
            {selectedAttendance.length === 0 ? (
              <Typography color="text.secondary">
                No check-in/check-out records for this day.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {selectedAttendance.map((r, idx) => (
                  <Paper
                    key={String(r.id ?? `${r.date}-${idx}`)}
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      p: 1.5,
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography fontWeight={700}>
                        Session {idx + 1}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {typeof r.duration_minutes === "number"
                          ? formatMinutes(r.duration_minutes)
                          : ""}
                      </Typography>
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={2}
                      mt={0.75}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Chip
                        size="small"
                        color="success"
                        label={`In ${formatTime(r.clock_in)}`}
                      />
                      <Chip
                        size="small"
                        color={r.clock_out ? "success" : "warning"}
                        label={
                          r.clock_out
                            ? `Out ${formatTime(r.clock_out)}`
                            : "No checkout"
                        }
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDayDetails}>Close</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
