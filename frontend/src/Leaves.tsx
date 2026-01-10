import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import { getUser } from "./utils/session";
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { ChevronLeft, ChevronRight, RefreshRounded } from "@mui/icons-material";

type LeaveRecord = {
  id: string | number;
  employee_id: string | number;
  date: string;
  leave_type?: string | null;
  day_part?: string | null;
  reason?: string | null;
  status?: string | null;
  created_at?: string;
};

type Employee = {
  id: string;
  name: string;
  code: string;
  status: string;
  created_at: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatMonth = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const formatDate = (y: number, m0: number, day: number) =>
  `${y}-${pad2(m0 + 1)}-${pad2(day)}`;

export default function Leaves() {
  const theme = useTheme();
  const role = getUser()?.role || "";
  const canApprove =
    role === "manager" || role === "hr_admin" || role === "tenant_owner";
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>("");
  const [actionOk, setActionOk] = useState<string>("");
  const lastRefreshAtRef = useRef(0);

  const monthStr = useMemo(() => formatMonth(currentDate), [currentDate]);

  const employeesById = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(String(e.id), e);
    return m;
  }, [employees]);

  const filteredLeaves = useMemo(() => {
    const statusNeedle = statusFilter.trim().toLowerCase();
    if (statusNeedle === "all") return leaves;
    return leaves.filter(
      (l) => String(l.status || "").toLowerCase() === statusNeedle
    );
  }, [leaves, statusFilter]);

  const leavesByDate = useMemo(() => {
    const m = new Map<string, LeaveRecord[]>();
    for (const l of filteredLeaves) {
      const d = String(l.date || "");
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(l);
      else m.set(d, [l]);
    }
    for (const list of m.values()) {
      list.sort((a, b) =>
        String(a.employee_id).localeCompare(String(b.employee_id))
      );
    }
    return m;
  }, [filteredLeaves]);

  const fetchEmployees = useCallback(async () => {
    if (role === "employee") return;
    try {
      const res = await api.get("/api/employees");
      setEmployees(
        Array.isArray(res.data?.employees) ? res.data.employees : []
      );
    } catch {
      setEmployees([]);
    }
  }, [role]);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("month", monthStr);
      if (employeeId && role !== "employee") qs.set("employee_id", employeeId);
      const res = await api.get(`/api/leaves?${qs.toString()}`);
      setLeaves(Array.isArray(res.data?.leaves) ? res.data.leaves : []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load leaves"));
    } finally {
      setLoading(false);
    }
  }, [employeeId, monthStr, role]);

  const notifyAttendanceUpdated = useCallback(() => {
    window.dispatchEvent(new Event("attendance:updated"));
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const bc = new BroadcastChannel("attendance");
      bc.postMessage({ type: "updated" });
      bc.close();
    }
  }, []);

  const updateLeaveStatus = useCallback(
    async (leaveId: string | number, nextStatus: "approved" | "rejected") => {
      setActionBusyId(String(leaveId));
      setActionError("");
      setActionOk("");
      try {
        await api.post("/api/leaves/update", { id: leaveId, status: nextStatus });
        setActionOk("Updated");
        await fetchLeaves();
        notifyAttendanceUpdated();
      } catch (err: unknown) {
        setActionError(getErrorMessage(err, "Failed to update leave status"));
      } finally {
        setActionBusyId(null);
      }
    },
    [fetchLeaves, notifyAttendanceUpdated]
  );

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    void fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 750) return;
      lastRefreshAtRef.current = now;
      void fetchLeaves();
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
  }, [fetchLeaves]);

  const year = currentDate.getFullYear();
  const month0 = currentDate.getMonth();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstDay = new Date(year, month0, 1).getDay();

  const monthLabel = useMemo(() => {
    return new Date(year, month0, 1).toLocaleDateString("default", {
      year: "numeric",
      month: "long",
    });
  }, [month0, year]);

  const selectedLeaves = useMemo(() => {
    if (!selectedDate) return [];
    return leavesByDate.get(selectedDate) || [];
  }, [leavesByDate, selectedDate]);

  const getStatusChipSx = useCallback(
    (status: string | null | undefined) => {
      const s = String(status || "")
        .trim()
        .toLowerCase();
      if (s === "approved") {
        return {
          fontWeight: 900,
          bgcolor: alpha(theme.palette.warning.main, 0.16),
          border: "1px solid",
          borderColor: alpha(theme.palette.warning.main, 0.32),
          color: theme.palette.warning.dark,
        } as const;
      }
      if (s === "rejected") {
        return {
          fontWeight: 900,
          bgcolor: alpha(theme.palette.error.main, 0.14),
          border: "1px solid",
          borderColor: alpha(theme.palette.error.main, 0.26),
          color: theme.palette.error.dark,
        } as const;
      }
      return {
        fontWeight: 900,
        bgcolor: alpha(theme.palette.text.primary, 0.06),
        border: "1px solid",
        borderColor: alpha(theme.palette.text.primary, 0.12),
        color: theme.palette.text.secondary,
      } as const;
    },
    [theme]
  );

  const dayCellSx = {
    border: "1px solid",
    borderColor: "divider",
    borderRadius: 2,
    p: 1.25,
    bgcolor: "background.default",
    cursor: "pointer",
    minHeight: 108,
    display: "flex",
    flexDirection: "column",
    gap: 0.75,
    transition: "transform 120ms ease, box-shadow 120ms ease",
    "&:hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
    },
  } as const;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems={{ xs: "stretch", md: "center" }}
        gap={2}
        flexWrap="wrap"
        mb={2.5}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>
            {role === "employee" ? "My Leaves" : "Leaves"}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monthly calendar view of leave requests and approvals.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            startIcon={<RefreshRounded />}
            onClick={() => void fetchLeaves()}
            disabled={loading}
            sx={{ borderRadius: 2 }}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper
        elevation={0}
        sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider" }}
      >
        <Box sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            alignItems={{ xs: "stretch", md: "center" }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="outlined"
                onClick={() => setCurrentDate(new Date(year, month0 - 1, 1))}
                sx={{ borderRadius: 2, minWidth: 42 }}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outlined"
                onClick={() => setCurrentDate(new Date(year, month0 + 1, 1))}
                sx={{ borderRadius: 2, minWidth: 42 }}
              >
                <ChevronRight />
              </Button>
              <Typography sx={{ fontWeight: 900 }}>{monthLabel}</Typography>
            </Stack>

            <Box sx={{ flex: 1 }} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              {role !== "employee" ? (
                <TextField
                  label="Employee"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  size="small"
                  sx={{ minWidth: 220 }}
                  select
                >
                  <MenuItem value="">All employees</MenuItem>
                  {employees.map((e) => (
                    <MenuItem key={String(e.id)} value={String(e.id)}>
                      {e.name} ({e.code})
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              <TextField
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
                select
              >
                {[
                  { label: "All", value: "all" },
                  { label: "Pending", value: "pending" },
                  { label: "Approved", value: "approved" },
                  { label: "Rejected", value: "rejected" },
                ].map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>
        </Box>

        <Divider />

        <Box sx={{ p: 2.5 }}>
          {loading ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 1.25,
              }}
            >
              {Array.from({ length: firstDay }).map((_, i) => (
                <Box key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = formatDate(year, month0, day);
                const list = leavesByDate.get(dateStr) || [];
                const show = list.slice(0, 3);
                const extra = Math.max(0, list.length - show.length);
                const hasLeaves = list.length > 0;

                return (
                  <Box
                    key={dateStr}
                    component="button"
                    type="button"
                    onClick={() => setSelectedDate(dateStr)}
                    sx={{
                      ...dayCellSx,
                      textAlign: "left",
                      outline: "none",
                      borderColor: hasLeaves
                        ? alpha(theme.palette.primary.main, 0.35)
                        : "divider",
                      bgcolor: hasLeaves
                        ? alpha(theme.palette.primary.main, 0.04)
                        : "background.default",
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography sx={{ fontWeight: 900 }}>{day}</Typography>
                      {hasLeaves ? (
                        <Chip
                          size="small"
                          label={list.length}
                          sx={{
                            fontWeight: 900,
                            bgcolor: alpha(theme.palette.primary.main, 0.16),
                            border: "1px solid",
                            borderColor: alpha(
                              theme.palette.primary.main,
                              0.26
                            ),
                          }}
                        />
                      ) : null}
                    </Stack>

                    {show.map((l) => {
                      const emp = employeesById.get(String(l.employee_id));
                      const name = emp?.name || `#${String(l.employee_id)}`;
                      const dayPart = String(
                        l.day_part || "full"
                      ).toLowerCase();
                      const label = `${name} • ${dayPart}`;
                      return (
                        <Chip
                          key={String(l.id)}
                          size="small"
                          label={label}
                          sx={{
                            width: "100%",
                            justifyContent: "flex-start",
                            ...getStatusChipSx(l.status),
                          }}
                        />
                      );
                    })}
                    {extra > 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        +{extra} more
                      </Typography>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Paper>

      <Dialog
        open={!!selectedDate}
        onClose={() => {
          setSelectedDate(null);
          setActionBusyId(null);
          setActionError("");
          setActionOk("");
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {selectedDate ? `Leaves on ${selectedDate}` : "Leaves"}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          {actionError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {actionError}
            </Alert>
          ) : null}
          {actionOk ? (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {actionOk}
            </Alert>
          ) : null}
          {selectedLeaves.length === 0 ? (
            <Typography color="text.secondary">
              No leaves for this day.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {selectedLeaves.map((l) => {
                const emp = employeesById.get(String(l.employee_id));
                const name = emp?.name || `Employee #${String(l.employee_id)}`;
                const code = emp?.code ? ` (${emp.code})` : "";
                const type = (l.leave_type || "leave").toString();
                const part = (l.day_part || "full").toString();
                const status = (l.status || "pending").toString();
                const statusLower = status.trim().toLowerCase();
                const canAct = canApprove && statusLower === "pending";
                const isBusy = actionBusyId === String(l.id);
                return (
                  <Paper
                    key={String(l.id)}
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      p: 2,
                      bgcolor: "background.default",
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      alignItems={{ sm: "center" }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900 }} noWrap>
                          {name}
                          {code}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {type} • {part}
                          {l.reason ? ` • ${l.reason}` : ""}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {canAct ? (
                          <>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={!!actionBusyId}
                              onClick={() =>
                                void updateLeaveStatus(l.id, "approved")
                              }
                            >
                              {isBusy ? "Working..." : "Approve"}
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              disabled={!!actionBusyId}
                              onClick={() =>
                                void updateLeaveStatus(l.id, "rejected")
                              }
                            >
                              {isBusy ? "Working..." : "Reject"}
                            </Button>
                          </>
                        ) : null}
                        <Chip label={status} sx={getStatusChipSx(l.status)} />
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
