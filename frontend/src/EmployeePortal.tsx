import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Alert,
  alpha,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import {
  AccessTimeRounded,
  ChevronLeft,
  ChevronRight,
  ExitToAppRounded,
  LoginRounded,
  RefreshRounded,
} from "@mui/icons-material";

type MeResponse = {
  user: {
    id: number | string;
    name?: string;
    email?: string;
    role?: string;
    tenant_id?: number | string | null;
    employee_id?: number | string | null;
  };
  employee: {
    id: string;
    tenant_id: string;
    shift_id: string;
    shift_name: string;
    working_days: string;
    name: string;
    code: string;
    status: string;
    created_at: string;
  } | null;
};

type AttendanceRow = {
  date: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes?: number;
};

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

type HolidayRecord = {
  id: string | number;
  date: string;
  name: string;
  created_at?: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const formatMonth = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function minutesToHM(mins: number) {
  const m = Math.max(0, Math.floor(mins || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export default function EmployeePortal() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [statsLoading, setStatsLoading] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [workingDays, setWorkingDays] = useState<string>("");
  const [leaveTotals, setLeaveTotals] = useState<{
    paid: number;
    unpaid: number;
    total: number;
  } | null>(null);
  const [tab, setTab] = useState(0);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");

  const [openShift, setOpenShift] = useState<boolean | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockMsg, setClockMsg] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applyOk, setApplyOk] = useState("");
  const [applyForm, setApplyForm] = useState<{
    start_date: string;
    end_date: string;
    leave_type: string;
    day_part: string;
    reason: string;
  }>({
    start_date: "",
    end_date: "",
    leave_type: "casual",
    day_part: "full",
    reason: "",
  });

  const lastRefreshAtRef = useRef(0);

  const employeeId = useMemo(() => {
    const raw = me?.employee?.id || me?.user?.employee_id;
    const v = raw === null || raw === undefined ? "" : String(raw);
    return v.trim();
  }, [me]);

  const monthStr = useMemo(() => formatMonth(month), [month]);

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  }, []);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/me");
      setMe(res.data as MeResponse);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load profile"));
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployeeMonth = useCallback(async () => {
    if (!employeeId) return;
    setStatsLoading(true);
    try {
      const res = await api.get(
        `/api/attendance/employee?id=${encodeURIComponent(
          employeeId
        )}&month=${encodeURIComponent(monthStr)}`
      );
      setAttendance(
        Array.isArray(res.data?.attendance) ? res.data.attendance : []
      );
      setLeaves(Array.isArray(res.data?.leaves) ? res.data.leaves : []);
      setHolidays(Array.isArray(res.data?.holidays) ? res.data.holidays : []);
      setWorkingDays(String(res.data?.working_days || ""));
      setLeaveTotals(res.data?.leave_totals || null);
    } catch (err: unknown) {
      setClockMsg(null);
      setApplyOk("");
      setApplyError(getErrorMessage(err, "Failed to load monthly data"));
    } finally {
      setStatsLoading(false);
    }
  }, [employeeId, monthStr]);

  const refreshOpenShift = useCallback(async () => {
    if (!employeeId) {
      setOpenShift(null);
      return;
    }
    try {
      const res = await api.get(
        `/api/attendance/open?employee_id=${encodeURIComponent(employeeId)}`,
        { timeout: 8000 }
      );
      setOpenShift(Boolean(res.data?.open));
    } catch {
      setOpenShift(null);
    }
  }, [employeeId]);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (!employeeId) return;
    void fetchEmployeeMonth();
    void refreshOpenShift();
  }, [employeeId, fetchEmployeeMonth, refreshOpenShift]);

  useEffect(() => {
    if (!employeeId) return;
    void fetchEmployeeMonth();
  }, [employeeId, fetchEmployeeMonth, monthStr]);

  useEffect(() => {
    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 750) return;
      lastRefreshAtRef.current = now;
      void fetchEmployeeMonth();
      void refreshOpenShift();
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

    const pollId = window.setInterval(triggerRefresh, 20_000);
    return () => {
      window.removeEventListener("attendance:updated", triggerRefresh);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (bc) bc.close();
      window.clearInterval(pollId);
    };
  }, [fetchEmployeeMonth, refreshOpenShift]);

  const attendanceByDate = useMemo(() => {
    const m = new Map<
      string,
      { firstIn: string | null; lastOut: string | null; minutes: number }
    >();
    for (const r of attendance) {
      const d = String(r.date || "");
      if (!d) continue;
      const cur = m.get(d) || { firstIn: null, lastOut: null, minutes: 0 };
      const inTs = r.clock_in ? String(r.clock_in) : null;
      const outTs = r.clock_out ? String(r.clock_out) : null;
      if (inTs && (!cur.firstIn || inTs < cur.firstIn)) cur.firstIn = inTs;
      if (outTs && (!cur.lastOut || outTs > cur.lastOut)) cur.lastOut = outTs;
      cur.minutes += Math.max(0, Number(r.duration_minutes || 0));
      m.set(d, cur);
    }
    return m;
  }, [attendance]);

  const holidaysByDate = useMemo(() => {
    const m = new Map<string, HolidayRecord>();
    for (const h of holidays) {
      const d = String(h.date || "");
      if (!d) continue;
      m.set(d, h);
    }
    return m;
  }, [holidays]);

  const leavesByDate = useMemo(() => {
    const m = new Map<string, LeaveRecord[]>();
    for (const l of leaves) {
      const d = String(l.date || "");
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(l);
      else m.set(d, [l]);
    }
    return m;
  }, [leaves]);

  const calendarGrid = useMemo(() => {
    const y = month.getFullYear();
    const m0 = month.getMonth();
    const firstDow = new Date(y, m0, 1).getDay();
    const daysInMonth = new Date(y, m0 + 1, 0).getDate();
    const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    const cells: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < totalCells; i++) {
      const day = i - firstDow + 1;
      if (day < 1 || day > daysInMonth) {
        cells.push(null);
        continue;
      }
      const date = `${y}-${pad2(m0 + 1)}-${pad2(day)}`;
      cells.push({ day, date });
    }
    return { y, m0, firstDow, daysInMonth, cells };
  }, [month]);

  const monthLabel = useMemo(() => {
    return month.toLocaleDateString("default", {
      year: "numeric",
      month: "long",
    });
  }, [month]);

  const notifyAttendanceUpdated = useCallback(() => {
    window.dispatchEvent(new Event("attendance:updated"));
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const bc = new BroadcastChannel("attendance");
      bc.postMessage({ type: "updated" });
      bc.close();
    }
  }, []);

  const clock = useCallback(
    async (type: "in" | "out") => {
      if (!employeeId) return;
      setClockBusy(true);
      setClockMsg(null);
      try {
        const url =
          type === "in"
            ? "/api/attendance/clockin"
            : "/api/attendance/clockout";
        const res = await api.post(url, { employee_id: employeeId });
        const record = res.data?.record;
        let msg = `${type === "in" ? "Clock In" : "Clock Out"} successful`;
        if (record?.status && record.status !== "Present")
          msg += ` (${record.status})`;
        if (record?.late_minutes > 0) msg += ` • Late ${record.late_minutes}m`;
        if (record?.early_leave_minutes > 0)
          msg += ` • Early leave ${record.early_leave_minutes}m`;
        setClockMsg({ type: "success", message: msg });
        setOpenShift(type === "in");
        notifyAttendanceUpdated();
      } catch (err: unknown) {
        const message = getErrorMessage(err, "Failed to record attendance");
        if (message.includes("Open shift exists")) setOpenShift(true);
        if (message.includes("No open shift")) setOpenShift(false);
        setClockMsg({ type: "error", message });
      } finally {
        setClockBusy(false);
      }
    },
    [employeeId, notifyAttendanceUpdated]
  );

  const applyLeave = useCallback(async () => {
    if (!employeeId) return;
    setApplyBusy(true);
    setApplyError("");
    setApplyOk("");
    try {
      const payload = {
        employee_id: employeeId,
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        leave_type: applyForm.leave_type,
        day_part: applyForm.day_part,
        reason: applyForm.reason,
      };
      const res = await api.post("/api/leaves/apply", payload);
      const created = Number(res.data?.created || 0);
      const skipped = Number(res.data?.skipped || 0);
      if (created > 0)
        setApplyOk(`Submitted (${created} day${created > 1 ? "s" : ""})`);
      else setApplyOk(`No changes (skipped ${skipped})`);
      void fetchEmployeeMonth();
      notifyAttendanceUpdated();
    } catch (err: unknown) {
      setApplyError(getErrorMessage(err, "Failed to apply leave"));
    } finally {
      setApplyBusy(false);
    }
  }, [applyForm, employeeId, fetchEmployeeMonth, notifyAttendanceUpdated]);

  const openApplyForDate = useCallback((date: string) => {
    setApplyError("");
    setApplyOk("");
    setApplyForm((p) => ({ ...p, start_date: date, end_date: date }));
    setApplyOpen(true);
  }, []);

  const chipSx = useMemo(() => {
    const base = { fontWeight: 900, border: "1px solid" } as const;
    return {
      ok: {
        ...base,
        bgcolor: alpha(theme.palette.success.main, 0.14),
        borderColor: alpha(theme.palette.success.main, 0.28),
        color: theme.palette.success.dark,
      },
      warn: {
        ...base,
        bgcolor: alpha(theme.palette.warning.main, 0.16),
        borderColor: alpha(theme.palette.warning.main, 0.32),
        color: theme.palette.warning.dark,
      },
      neutral: {
        ...base,
        bgcolor: alpha(theme.palette.text.primary, 0.06),
        borderColor: alpha(theme.palette.text.primary, 0.12),
        color: theme.palette.text.secondary,
      },
      error: {
        ...base,
        bgcolor: alpha(theme.palette.error.main, 0.14),
        borderColor: alpha(theme.palette.error.main, 0.26),
        color: theme.palette.error.dark,
      },
    };
  }, [theme]);

  const leaveStatusCounts = useMemo(() => {
    const c = { approved: 0, pending: 0, rejected: 0 };
    for (const l of leaves) {
      const s = String(l.status || "pending")
        .toLowerCase()
        .trim();
      if (s === "approved") c.approved++;
      else if (s === "rejected") c.rejected++;
      else c.pending++;
    }
    return c;
  }, [leaves]);

  const filteredLeaves = useMemo(() => {
    const list =
      leaveStatusFilter === "all"
        ? leaves
        : leaves.filter(
            (l) =>
              String(l.status || "pending")
                .toLowerCase()
                .trim() === leaveStatusFilter
          );
    return list
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }, [leaveStatusFilter, leaves]);

  const leavesUpcoming = useMemo(() => {
    return filteredLeaves.filter((l) => String(l.date || "") >= todayStr);
  }, [filteredLeaves, todayStr]);

  const leavesPast = useMemo(() => {
    return filteredLeaves.filter((l) => String(l.date || "") < todayStr);
  }, [filteredLeaves, todayStr]);

  const displayName = useMemo(() => {
    return me?.employee?.name || me?.user?.name || "Employee";
  }, [me]);

  const initials = useMemo(() => {
    const parts = String(displayName)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    const s = parts.map((p) => p[0]?.toUpperCase() || "").join("");
    return s || "E";
  }, [displayName]);

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          py: 6,
          background: `radial-gradient(1200px 500px at 20% 0%, ${alpha(
            theme.palette.primary.main,
            0.12
          )} 0%, transparent 60%), radial-gradient(900px 420px at 90% 10%, ${alpha(
            theme.palette.secondary.main,
            0.1
          )} 0%, transparent 55%), linear-gradient(180deg, ${alpha(
            theme.palette.text.primary,
            0.02
          )} 0%, transparent 40%)`,
        }}
      >
        <Container maxWidth="lg" sx={{ pb: 4 }}>
          <Paper variant="outlined" sx={{ borderRadius: 5, p: 4 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <CircularProgress size={22} />
              <Typography sx={{ fontWeight: 900 }}>Loading portal…</Typography>
            </Stack>
          </Paper>
        </Container>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          py: 6,
          background: `radial-gradient(1200px 500px at 20% 0%, ${alpha(
            theme.palette.primary.main,
            0.12
          )} 0%, transparent 60%), radial-gradient(900px 420px at 90% 10%, ${alpha(
            theme.palette.secondary.main,
            0.1
          )} 0%, transparent 55%), linear-gradient(180deg, ${alpha(
            theme.palette.text.primary,
            0.02
          )} 0%, transparent 40%)`,
        }}
      >
        <Container maxWidth="lg" sx={{ pb: 4 }}>
          <Alert severity="error" sx={{ borderRadius: 4 }}>
            {error}
          </Alert>
        </Container>
      </Box>
    );
  }

  if (!employeeId) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          py: 6,
          background: `radial-gradient(1200px 500px at 20% 0%, ${alpha(
            theme.palette.primary.main,
            0.12
          )} 0%, transparent 60%), radial-gradient(900px 420px at 90% 10%, ${alpha(
            theme.palette.secondary.main,
            0.1
          )} 0%, transparent 55%), linear-gradient(180deg, ${alpha(
            theme.palette.text.primary,
            0.02
          )} 0%, transparent 40%)`,
        }}
      >
        <Container maxWidth="lg" sx={{ pb: 4 }}>
          <Alert severity="warning" sx={{ borderRadius: 4 }}>
            Employee account is not linked to an employee record.
          </Alert>
        </Container>
      </Box>
    );
  }

  const showClockIn = openShift === null ? true : openShift === false;
  const showClockOut = openShift === null ? true : openShift === true;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 2, sm: 3 },
        background: `radial-gradient(1200px 500px at 20% 0%, ${alpha(
          theme.palette.primary.main,
          0.12
        )} 0%, transparent 60%), radial-gradient(900px 420px at 90% 10%, ${alpha(
          theme.palette.secondary.main,
          0.1
        )} 0%, transparent 55%), linear-gradient(180deg, ${alpha(
          theme.palette.text.primary,
          0.02
        )} 0%, transparent 40%)`,
      }}
    >
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Stack spacing={2.5}>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 5,
              p: { xs: 2, sm: 2.75 },
              boxShadow: "0 24px 60px rgba(0,0,0,0.10)",
              bgcolor: alpha(theme.palette.background.paper, 0.92),
              backdropFilter: "blur(10px)",
              borderColor: alpha(theme.palette.text.primary, 0.1),
              backgroundImage: `linear-gradient(135deg, ${alpha(
                theme.palette.primary.main,
                0.14
              )} 0%, transparent 60%)`,
            }}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ sm: "center" }}
            >
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ flex: 1, minWidth: 0 }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    color: theme.palette.primary.contrastText,
                    backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                    boxShadow: `0 12px 30px ${alpha(
                      theme.palette.primary.main,
                      0.28
                    )}`,
                    flex: "0 0 auto",
                  }}
                >
                  <Typography sx={{ fontWeight: 900, letterSpacing: 0.5 }}>
                    {initials}
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 950, fontSize: 18 }} noWrap>
                    {displayName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {me?.employee?.code ? `Code: ${me.employee.code} • ` : ""}
                    {me?.employee?.shift_name
                      ? `Shift: ${me.employee.shift_name}`
                      : ""}
                  </Typography>
                  {workingDays && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      Working days: {workingDays}
                    </Typography>
                  )}
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="small"
                  startIcon={<RefreshRounded />}
                  onClick={() => {
                    void fetchEmployeeMonth();
                    void refreshOpenShift();
                  }}
                  disabled={statsLoading || clockBusy}
                  sx={{ borderRadius: 2, fontWeight: 900 }}
                >
                  Refresh
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setApplyOpen(true)}
                  disabled={applyBusy || statsLoading}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 900,
                    backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                    boxShadow: `0 14px 30px ${alpha(
                      theme.palette.primary.main,
                      0.3
                    )}`,
                  }}
                >
                  Apply Leave
                </Button>
              </Stack>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ sm: "center" }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <AccessTimeRounded fontSize="small" />
                <Typography sx={{ fontWeight: 800 }}>
                  {openShift === null
                    ? "Shift status: unknown"
                    : openShift
                    ? "Shift status: open"
                    : "Shift status: closed"}
                </Typography>
              </Stack>
              <Box sx={{ flex: 1 }} />
              <Stack direction="row" spacing={1}>
                {showClockIn && (
                  <Button
                    size="small"
                    color="success"
                    variant="contained"
                    startIcon={<LoginRounded />}
                    onClick={() => void clock("in")}
                    disabled={clockBusy}
                    sx={{
                      borderRadius: 2,
                      fontWeight: 900,
                      boxShadow: `0 14px 30px ${alpha(
                        theme.palette.success.main,
                        0.25
                      )}`,
                    }}
                  >
                    Clock In
                  </Button>
                )}
                {showClockOut && (
                  <Button
                    size="small"
                    color="warning"
                    variant="contained"
                    startIcon={<ExitToAppRounded />}
                    onClick={() => void clock("out")}
                    disabled={clockBusy}
                    sx={{
                      borderRadius: 2,
                      fontWeight: 900,
                      boxShadow: `0 14px 30px ${alpha(
                        theme.palette.warning.main,
                        0.22
                      )}`,
                    }}
                  >
                    Clock Out
                  </Button>
                )}
              </Stack>
            </Stack>
            {clockMsg && (
              <Alert severity={clockMsg.type} sx={{ mt: 2, borderRadius: 2 }}>
                {clockMsg.message}
              </Alert>
            )}
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              borderRadius: 5,
              overflow: "hidden",
              boxShadow: "0 24px 70px rgba(0,0,0,0.10)",
              bgcolor: alpha(theme.palette.background.paper, 0.92),
              backdropFilter: "blur(10px)",
              borderColor: alpha(theme.palette.text.primary, 0.1),
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="fullWidth"
              sx={{
                px: 1.25,
                pt: 1.25,
                pb: 0.25,
                "& .MuiTab-root": {
                  textTransform: "none",
                  fontWeight: 900,
                  minHeight: 44,
                },
              }}
              TabIndicatorProps={{ style: { height: 3, borderRadius: 99 } }}
            >
              <Tab label="Calendar" />
              <Tab label="Leaves" />
              <Tab label="Overview" />
            </Tabs>
            <Divider />
            <Box sx={{ p: 2.5 }}>
              {statsLoading && (
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ mb: 2 }}
                >
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    Loading…
                  </Typography>
                </Stack>
              )}

              {tab === 2 && (
                <Stack spacing={2}>
                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 4,
                      p: 2,
                      bgcolor: alpha(theme.palette.background.paper, 0.72),
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Typography sx={{ fontWeight: 900, mb: 1 }}>
                      This Month
                    </Typography>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Leave totals
                        </Typography>
                        <Typography sx={{ fontWeight: 900 }}>
                          {leaveTotals
                            ? `${leaveTotals.total} total • ${leaveTotals.paid} paid • ${leaveTotals.unpaid} unpaid`
                            : "—"}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Month
                        </Typography>
                        <Typography sx={{ fontWeight: 900 }}>
                          {monthLabel}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 4,
                      p: 2,
                      bgcolor: alpha(theme.palette.background.paper, 0.72),
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Typography sx={{ fontWeight: 900, mb: 1 }}>
                      Quick Summary
                    </Typography>
                    <Stack spacing={1}>
                      <Typography variant="body2" color="text.secondary">
                        Days with punches: {attendanceByDate.size}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Leave days (records): {leaves.length}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Holidays: {holidays.length}
                      </Typography>
                    </Stack>
                  </Paper>
                </Stack>
              )}

              {tab === 0 && (
                <Stack spacing={2}>
                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 4,
                      p: 1.5,
                      bgcolor: alpha(theme.palette.background.paper, 0.72),
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ChevronLeft />}
                        onClick={() =>
                          setMonth(
                            (d) =>
                              new Date(d.getFullYear(), d.getMonth() - 1, 1)
                          )
                        }
                        sx={{ borderRadius: 2, fontWeight: 900 }}
                      >
                        Prev
                      </Button>
                      <Box sx={{ flex: 1, textAlign: "center" }}>
                        <Typography sx={{ fontWeight: 950, lineHeight: 1.1 }}>
                          {monthLabel}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {monthStr}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<ChevronRight />}
                        onClick={() =>
                          setMonth(
                            (d) =>
                              new Date(d.getFullYear(), d.getMonth() + 1, 1)
                          )
                        }
                        sx={{ borderRadius: 2, fontWeight: 900 }}
                      >
                        Next
                      </Button>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 4,
                      p: 1.5,
                      bgcolor: alpha(theme.palette.background.paper, 0.72),
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        gap: 1,
                        px: 0.5,
                        pb: 1,
                      }}
                    >
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (w) => (
                          <Box
                            key={w}
                            sx={{
                              py: 0.75,
                              textAlign: "center",
                              fontWeight: 900,
                              color: "text.secondary",
                              letterSpacing: 0.6,
                              textTransform: "uppercase",
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 900 }}
                            >
                              {w}
                            </Typography>
                          </Box>
                        )
                      )}
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        gap: 1,
                        p: 0.5,
                      }}
                    >
                      {calendarGrid.cells.map((cell, idx) => {
                        if (!cell) {
                          return (
                            <Box
                              key={`empty-${idx}`}
                              sx={{
                                minHeight: 98,
                                borderRadius: 3,
                                bgcolor: alpha(
                                  theme.palette.text.primary,
                                  0.02
                                ),
                              }}
                            />
                          );
                        }

                        const d = cell.date;
                        const dayOfWeek = new Date(`${d}T00:00:00`).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const punch = attendanceByDate.get(d) || null;
                        const holiday = holidaysByDate.get(d) || null;
                        const leaveList = leavesByDate.get(d) || [];
                        const approvedLeave = leaveList.find(
                          (l) =>
                            String(l.status || "").toLowerCase() === "approved"
                        );
                        const pendingLeave = leaveList.find(
                          (l) =>
                            String(l.status || "").toLowerCase() === "pending"
                        );
                        const rejectedLeave = leaveList.find(
                          (l) =>
                            String(l.status || "").toLowerCase() === "rejected"
                        );

                        const badge = holiday
                          ? { label: "Holiday", sx: chipSx.neutral }
                          : approvedLeave
                          ? { label: "Leave", sx: chipSx.warn }
                          : pendingLeave
                          ? { label: "Pending", sx: chipSx.neutral }
                          : rejectedLeave
                          ? { label: "Rejected", sx: chipSx.error }
                          : punch
                          ? { label: "Present", sx: chipSx.ok }
                          : d < todayStr
                          ? { label: "Absent", sx: chipSx.error }
                          : { label: "—", sx: chipSx.neutral };

                        const isToday = d === todayStr;
                        const subtitle = holiday
                          ? holiday.name
                          : punch
                          ? minutesToHM(punch.minutes)
                          : leaveList.length > 0
                          ? `${String(
                              leaveList[0]?.leave_type || "leave"
                            )} • ${String(leaveList[0]?.day_part || "full")}`
                          : "";
                        const isAbsent =
                          badge.label === "Absent" &&
                          !holiday &&
                          !punch &&
                          leaveList.length === 0;
                        const isEmptyDay =
                          !holiday &&
                          !punch &&
                          leaveList.length === 0 &&
                          !isAbsent;
                        const isPresent = badge.label === "Present";
                        const isLeave =
                          badge.label === "Leave" ||
                          badge.label === "Pending" ||
                          badge.label === "Rejected";
                        const isHoliday = badge.label === "Holiday";
                        const showCenteredStatus =
                          isPresent || isLeave || isAbsent || isHoliday;
                        const centeredPrimary = isPresent
                          ? subtitle
                          : isLeave
                          ? badge.label
                          : isHoliday
                          ? "Holiday"
                          : isAbsent
                          ? "Absent"
                          : "";
                        const centeredSecondary = isPresent
                          ? ""
                          : isHoliday
                          ? holiday?.name || ""
                          : isLeave
                          ? subtitle
                          : "";

                        return (
                          <ButtonBase
                            key={d}
                            onClick={() => openApplyForDate(d)}
                            aria-label={`Apply leave for ${d}`}
                            title={`Apply leave for ${d}`}
                            sx={{
                              width: "100%",
                              display: "block",
                              textAlign: "left",
                              borderRadius: 3,
                              overflow: "hidden",
                              border: "1px solid",
                              borderColor: alpha(
                                theme.palette.text.primary,
                                0.08
                              ),
                              bgcolor: alpha(
                                theme.palette.background.paper,
                                0.92
                              ),
                              boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
                              transform: "translateY(0px)",
                              transition:
                                "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
                              "&:hover": {
                                transform: "translateY(-2px)",
                                boxShadow: "0 16px 36px rgba(0,0,0,0.10)",
                                borderColor: alpha(
                                  theme.palette.primary.main,
                                  0.26
                                ),
                              },
                            }}
                          >
                            <Box
                              sx={{
                                minHeight: 98,
                                p: 1.25,
                                bgcolor: isToday
                                  ? alpha(theme.palette.primary.main, 0.07)
                                  : isWeekend
                                  ? alpha(theme.palette.text.primary, 0.02)
                                  : "transparent",
                              }}
                            >
                              {isEmptyDay ? (
                                <Box
                                  sx={{
                                    height: "100%",
                                    minHeight: 98,
                                    display: "grid",
                                    placeItems: "center",
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      fontWeight: 950,
                                      fontSize: 28,
                                      letterSpacing: -0.5,
                                      color: isToday
                                        ? theme.palette.primary.main
                                        : theme.palette.text.primary,
                                    }}
                                  >
                                    {cell.day}
                                  </Typography>
                                </Box>
                              ) : showCenteredStatus ? (
                                <Box
                                  sx={{
                                    position: "relative",
                                    height: "100%",
                                    minHeight: 98,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      position: "absolute",
                                      top: 10,
                                      left: 10,
                                      width: 26,
                                      height: 26,
                                      borderRadius: 999,
                                      display: "grid",
                                      placeItems: "center",
                                      bgcolor: isToday
                                        ? theme.palette.primary.main
                                        : alpha(
                                            theme.palette.text.primary,
                                            0.06
                                          ),
                                      color: isToday
                                        ? theme.palette.primary.contrastText
                                        : theme.palette.text.primary,
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 900, lineHeight: 1 }}
                                    >
                                      {cell.day}
                                    </Typography>
                                  </Box>

                                  {isPresent ? (
                                    <Box
                                      sx={{
                                        position: "absolute",
                                        top: 10,
                                        right: 10,
                                        px: 0.9,
                                        py: 0.2,
                                        borderRadius: 999,
                                        ...badge.sx,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 900 }}
                                      >
                                        {badge.label}
                                      </Typography>
                                    </Box>
                                  ) : null}

                                  <Box
                                    sx={{
                                      height: "100%",
                                      textAlign: "center",
                                      px: 1,
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        position: "absolute",
                                        inset: 0,
                                        display: "grid",
                                        placeItems: "center",
                                        px: 1,
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontWeight: 950,
                                          fontSize: isPresent ? 18 : 16,
                                          letterSpacing: -0.3,
                                          transform: isPresent
                                            ? "translateY(15px)"
                                            : "none",
                                          color: isPresent
                                            ? theme.palette.text.primary
                                            : isAbsent
                                            ? theme.palette.error.main
                                            : isLeave
                                            ? theme.palette.warning.dark
                                            : theme.palette.text.primary,
                                        }}
                                      >
                                        {centeredPrimary}
                                      </Typography>
                                    </Box>

                                    {centeredSecondary ? (
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          position: "absolute",
                                          top: "calc(50% + 16px)",
                                          left: "50%",
                                          transform: "translateX(-50%)",
                                          fontWeight: 900,
                                          color: isPresent
                                            ? theme.palette.success.dark
                                            : "text.secondary",
                                          maxWidth: "calc(100% - 16px)",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {centeredSecondary}
                                      </Typography>
                                    ) : null}
                                  </Box>
                                </Box>
                              ) : (
                                <Stack spacing={0.75} sx={{ height: "100%" }}>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    justifyContent="space-between"
                                  >
                                    <Box
                                      sx={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 999,
                                        display: "grid",
                                        placeItems: "center",
                                        bgcolor: isToday
                                          ? theme.palette.primary.main
                                          : alpha(
                                              theme.palette.text.primary,
                                              0.06
                                            ),
                                        color: isToday
                                          ? theme.palette.primary.contrastText
                                          : theme.palette.text.primary,
                                        fontWeight: 900,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 900, lineHeight: 1 }}
                                      >
                                        {cell.day}
                                      </Typography>
                                    </Box>
                                    <Box
                                      sx={{
                                        px: 0.9,
                                        py: 0.2,
                                        borderRadius: 999,
                                        ...badge.sx,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 900 }}
                                      >
                                        {badge.label}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                  {subtitle ? (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                      }}
                                    >
                                      {subtitle}
                                    </Typography>
                                  ) : (
                                    <Box sx={{ flex: 1 }} />
                                  )}
                                </Stack>
                              )}
                            </Box>
                          </ButtonBase>
                        );
                      })}
                    </Box>
                  </Paper>
                </Stack>
              )}

              {tab === 1 && (
                <Stack spacing={2}>
                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 4,
                      p: 1.5,
                      bgcolor: alpha(theme.palette.background.paper, 0.72),
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ChevronLeft />}
                        onClick={() =>
                          setMonth(
                            (d) =>
                              new Date(d.getFullYear(), d.getMonth() - 1, 1)
                          )
                        }
                        sx={{ borderRadius: 2, fontWeight: 900 }}
                      >
                        Prev
                      </Button>
                      <Box sx={{ flex: 1, textAlign: "center" }}>
                        <Typography sx={{ fontWeight: 950, lineHeight: 1.1 }}>
                          {monthLabel}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {monthStr}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<ChevronRight />}
                        onClick={() =>
                          setMonth(
                            (d) =>
                              new Date(d.getFullYear(), d.getMonth() + 1, 1)
                          )
                        }
                        sx={{ borderRadius: 2, fontWeight: 900 }}
                      >
                        Next
                      </Button>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 4,
                      p: 2,
                      bgcolor: alpha(theme.palette.background.paper, 0.72),
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Typography sx={{ fontWeight: 900, mb: 1 }}>
                      Totals
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {leaveTotals
                        ? `${leaveTotals.total} total • ${leaveTotals.paid} paid • ${leaveTotals.unpaid} unpaid`
                        : "—"}
                    </Typography>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 4,
                      p: 2,
                      bgcolor: alpha(theme.palette.background.paper, 0.72),
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Typography sx={{ fontWeight: 900, mb: 1 }}>
                      Overview
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      {(
                        [
                          { key: "all", label: `All (${leaves.length})` },
                          {
                            key: "pending",
                            label: `Pending (${leaveStatusCounts.pending})`,
                          },
                          {
                            key: "approved",
                            label: `Approved (${leaveStatusCounts.approved})`,
                          },
                          {
                            key: "rejected",
                            label: `Rejected (${leaveStatusCounts.rejected})`,
                          },
                        ] as const
                      ).map((b) => (
                        <Button
                          key={b.key}
                          size="small"
                          variant={
                            leaveStatusFilter === b.key
                              ? "contained"
                              : "outlined"
                          }
                          onClick={() => setLeaveStatusFilter(b.key)}
                          sx={{ borderRadius: 2, fontWeight: 900 }}
                        >
                          {b.label}
                        </Button>
                      ))}
                    </Stack>
                  </Paper>

                  {filteredLeaves.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No leaves to show.
                    </Typography>
                  ) : (
                    <Stack spacing={2}>
                      <Box>
                        <Typography sx={{ fontWeight: 900, mb: 1 }}>
                          Upcoming ({leavesUpcoming.length})
                        </Typography>
                        <Stack spacing={1}>
                          {leavesUpcoming.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No upcoming leaves.
                            </Typography>
                          ) : (
                            leavesUpcoming.map((l) => {
                              const status = String(l.status || "pending")
                                .toLowerCase()
                                .trim();
                              const dayName = new Date(
                                `${l.date}T00:00:00`
                              ).toLocaleDateString("default", {
                                weekday: "short",
                              });
                              return (
                                <Paper
                                  key={String(l.id)}
                                  elevation={0}
                                  sx={{
                                    border: "1px solid",
                                    borderColor: alpha(
                                      theme.palette.text.primary,
                                      0.1
                                    ),
                                    borderRadius: 4,
                                    p: 1.5,
                                    bgcolor: alpha(
                                      theme.palette.background.paper,
                                      0.78
                                    ),
                                  }}
                                >
                                  <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1.5}
                                    alignItems={{ sm: "center" }}
                                  >
                                    <Box sx={{ flex: 1 }}>
                                      <Typography sx={{ fontWeight: 900 }}>
                                        {l.date} • {dayName}
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                      >
                                        {String(l.leave_type || "leave")} •{" "}
                                        {String(l.day_part || "full")}
                                        {l.reason ? ` • ${l.reason}` : ""}
                                      </Typography>
                                    </Box>
                                    <Box
                                      sx={{
                                        px: 1.25,
                                        py: 0.5,
                                        borderRadius: 999,
                                        ...(status === "approved"
                                          ? chipSx.warn
                                          : status === "rejected"
                                          ? chipSx.error
                                          : chipSx.neutral),
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 900 }}
                                      >
                                        {String(l.status || "pending")}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                </Paper>
                              );
                            })
                          )}
                        </Stack>
                      </Box>

                      <Box>
                        <Typography sx={{ fontWeight: 900, mb: 1 }}>
                          Past ({leavesPast.length})
                        </Typography>
                        <Stack spacing={1}>
                          {leavesPast.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No past leaves.
                            </Typography>
                          ) : (
                            leavesPast
                              .slice()
                              .reverse()
                              .map((l) => {
                                const status = String(l.status || "pending")
                                  .toLowerCase()
                                  .trim();
                                const dayName = new Date(
                                  `${l.date}T00:00:00`
                                ).toLocaleDateString("default", {
                                  weekday: "short",
                                });
                                return (
                                  <Paper
                                    key={String(l.id)}
                                    elevation={0}
                                    sx={{
                                      border: "1px solid",
                                      borderColor: alpha(
                                        theme.palette.text.primary,
                                        0.1
                                      ),
                                      borderRadius: 4,
                                      p: 1.5,
                                      bgcolor: alpha(
                                        theme.palette.background.paper,
                                        0.78
                                      ),
                                    }}
                                  >
                                    <Stack
                                      direction={{ xs: "column", sm: "row" }}
                                      spacing={1.5}
                                      alignItems={{ sm: "center" }}
                                    >
                                      <Box sx={{ flex: 1 }}>
                                        <Typography sx={{ fontWeight: 900 }}>
                                          {l.date} • {dayName}
                                        </Typography>
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                        >
                                          {String(l.leave_type || "leave")} •{" "}
                                          {String(l.day_part || "full")}
                                          {l.reason ? ` • ${l.reason}` : ""}
                                        </Typography>
                                      </Box>
                                      <Box
                                        sx={{
                                          px: 1.25,
                                          py: 0.5,
                                          borderRadius: 999,
                                          ...(status === "approved"
                                            ? chipSx.warn
                                            : status === "rejected"
                                            ? chipSx.error
                                            : chipSx.neutral),
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          sx={{ fontWeight: 900 }}
                                        >
                                          {String(l.status || "pending")}
                                        </Typography>
                                      </Box>
                                    </Stack>
                                  </Paper>
                                );
                              })
                          )}
                        </Stack>
                      </Box>
                    </Stack>
                  )}
                </Stack>
              )}
            </Box>
          </Paper>
        </Stack>
      </Container>
      <Dialog
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Apply Leave</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {applyError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {applyError}
              </Alert>
            )}
            {applyOk && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {applyOk}
              </Alert>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Start date"
                type="date"
                value={applyForm.start_date}
                onChange={(e) =>
                  setApplyForm((p) => ({ ...p, start_date: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End date"
                type="date"
                value={applyForm.end_date}
                onChange={(e) =>
                  setApplyForm((p) => ({ ...p, end_date: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Leave type"
                value={applyForm.leave_type}
                onChange={(e) =>
                  setApplyForm((p) => ({ ...p, leave_type: e.target.value }))
                }
              >
                <MenuItem value="casual">Casual</MenuItem>
                <MenuItem value="sick">Sick</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
                <MenuItem value="unpaid">Unpaid</MenuItem>
              </TextField>
              <TextField
                select
                label="Day part"
                value={applyForm.day_part}
                onChange={(e) =>
                  setApplyForm((p) => ({ ...p, day_part: e.target.value }))
                }
              >
                <MenuItem value="full">Full day</MenuItem>
                <MenuItem value="am">AM</MenuItem>
                <MenuItem value="pm">PM</MenuItem>
              </TextField>
            </Stack>
            <TextField
              label="Reason (optional)"
              value={applyForm.reason}
              onChange={(e) =>
                setApplyForm((p) => ({ ...p, reason: e.target.value }))
              }
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApplyOpen(false)} disabled={applyBusy}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={() => void applyLeave()}
            disabled={
              applyBusy ||
              !applyForm.start_date ||
              !applyForm.end_date ||
              !applyForm.leave_type ||
              !applyForm.day_part
            }
          >
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
