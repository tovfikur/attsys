import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
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
  Drawer,
  IconButton,
  InputAdornment,
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
  useTheme,
} from "@mui/material";
import {
  CloseRounded,
  RefreshRounded,
  SearchRounded,
  VisibilityRounded,
} from "@mui/icons-material";

interface Employee {
  id: string;
  name: string;
  code: string;
  status: string;
  created_at: string;
}

interface AttendanceRow {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number;
  date: string;
  status?: string;
  late_minutes?: number;
  early_leave_minutes?: number;
}

interface Day {
  employee_id: number;
  date: string;
  in_time: string | null;
  out_time: string | null;
  worked_minutes: number;
  status: string;
  late_minutes?: number;
  early_leave_minutes?: number;
  overtime_minutes?: number;
}

interface LeaveRecord {
  id: string | number;
  employee_id: string | number;
  date: string;
  reason: string | null;
  status: string | null;
  created_at?: string;
}

type DayKey = `${string}-${string}-${string}`;

type DaySummary = {
  date: DayKey;
  firstIn: string | null;
  lastOut: string | null;
  checkins: number;
  checkouts: number;
  workedMinutes: number;
  stayMinutes: number;
  lateCount: number;
  earlyLeaveCount: number;
  openShift: boolean;
  leave?: LeaveRecord;
};

type EmployeeSummary = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  daysPresent: number;
  workedMinutes: number;
  avgMinutesPerDay: number;
  lateEvents: number;
  earlyLeaveEvents: number;
  openShift: boolean;
  lastSeen: string | null;
};

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

const normalizeDayKey = (raw: string): DayKey | "" => {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value as DayKey;

  const ymdSlash = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymdSlash) return `${ymdSlash[1]}-${ymdSlash[2]}-${ymdSlash[3]}` as DayKey;

  const dmySlash = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2]}-${dmySlash[1]}` as DayKey;

  const dmyDash = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}` as DayKey;

  return "";
};

const getDhakaToday = (): DayKey => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}` as DayKey;
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

const isLate = (r: AttendanceRow): boolean => {
  if (typeof r.late_minutes === "number" && r.late_minutes > 0) return true;
  if (typeof r.status === "string" && r.status.toLowerCase().includes("late"))
    return true;
  return false;
};

const isEarlyLeave = (r: AttendanceRow): boolean => {
  if (typeof r.early_leave_minutes === "number" && r.early_leave_minutes > 0)
    return true;
  if (
    typeof r.status === "string" &&
    r.status.toLowerCase().includes("early leave")
  )
    return true;
  return false;
};

export default function Attendance() {
  const theme = useTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);

  const chipSx = useMemo(() => {
    const base = {
      fontWeight: 900,
      border: "1px solid",
    } as const;
    return {
      openShift: {
        ...base,
        bgcolor: alpha(theme.palette.info.main, 0.22),
        borderColor: alpha(theme.palette.info.main, 0.35),
        color: theme.palette.info.dark,
      },
      closedShift: {
        ...base,
        bgcolor: alpha(theme.palette.success.main, 0.14),
        borderColor: alpha(theme.palette.success.main, 0.28),
        color: theme.palette.success.dark,
      },
      warning: {
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
      present: {
        ...base,
        bgcolor: alpha(theme.palette.success.main, 0.14),
        borderColor: alpha(theme.palette.success.main, 0.28),
        color: theme.palette.success.dark,
      },
    };
  }, [theme]);

  const getDayStatusChipSx = useCallback(
    (status: string) => {
      const s = status.trim().toLowerCase();
      if (!s) return chipSx.neutral;
      if (s.includes("absent")) return chipSx.neutral;
      if (s.includes("incomplete") || s.includes("open"))
        return chipSx.openShift;
      if (s.includes("late") || s.includes("early")) return chipSx.warning;
      if (s.includes("overtime")) return chipSx.openShift;
      if (s.includes("present")) return chipSx.present;
      return chipSx.neutral;
    },
    [chipSx]
  );

  const today = useMemo(() => getDhakaToday(), []);
  const [start, setStart] = useState<DayKey>(today);
  const [end, setEnd] = useState<DayKey>(today);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setRangeStart = useCallback(
    (raw: string) => {
      const next = normalizeDayKey(raw);
      if (!next) return;
      setStart(next);
      setEnd((prevEnd) => (prevEnd && prevEnd < next ? next : prevEnd));
    },
    [setStart, setEnd]
  );

  const setRangeEnd = useCallback(
    (raw: string) => {
      const next = normalizeDayKey(raw);
      if (!next) return;
      setEnd(next);
      setStart((prevStart) =>
        prevStart && prevStart > next ? next : prevStart
      );
    },
    [setStart, setEnd]
  );

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );
  const [selectedDay, setSelectedDay] = useState<{
    employee_id: string;
    date: DayKey;
  } | null>(null);

  const lastRefreshAtRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const dashRes = await api.get(
        `/api/attendance/dashboard?start=${encodeURIComponent(
          start
        )}&end=${encodeURIComponent(end)}&limit=10000&ensure_days=1`
      );
      setEmployees(dashRes.data.employees || []);
      setRows(dashRes.data.attendance || []);
      setDays(dashRes.data.days || []);
      setLeaves(dashRes.data.leaves || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load attendance"));
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 750) return;
      lastRefreshAtRef.current = now;
      void load();
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

    return () => {
      window.removeEventListener("attendance:updated", triggerRefresh);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (bc) bc.close();
    };
  }, [load]);

  const processDays = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/attendance/process", {
        start_date: start,
        end_date: end,
      });
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to process"));
    } finally {
      setBusy(false);
    }
  };

  const employeesById = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(String(e.id), e);
    return m;
  }, [employees]);

  const daysByEmployee = useMemo(() => {
    const m = new Map<string, Day[]>();
    for (const d of days) {
      const id = String(d.employee_id);
      const list = m.get(id);
      if (list) list.push(d);
      else m.set(id, [d]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }
    return m;
  }, [days]);

  const leavesByEmployee = useMemo(() => {
    const m = new Map<string, LeaveRecord[]>();
    for (const l of leaves) {
      const id = String(l.employee_id);
      const list = m.get(id);
      if (list) list.push(l);
      else m.set(id, [l]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }
    return m;
  }, [leaves]);

  const combinedRows = useMemo(() => {
    const base = Array.isArray(rows) ? rows.slice() : [];
    if (!Array.isArray(days) || days.length === 0) return base;

    const existingDayKeys = new Set<string>();
    for (const r of base) {
      existingDayKeys.add(`${String(r.employee_id)}::${String(r.date)}`);
    }

    const synthetic: AttendanceRow[] = [];
    for (const d of days) {
      const dayKey = `${String(d.employee_id)}::${String(d.date)}`;
      if (existingDayKeys.has(dayKey)) continue;
      const workedMinutes = Math.max(0, d.worked_minutes || 0);
      const hasSignal =
        !!d.in_time ||
        !!d.out_time ||
        workedMinutes > 0 ||
        d.status !== "Absent";
      if (!hasSignal) continue;

      const employee = employeesById.get(String(d.employee_id));
      const clockIn = d.in_time || (d.out_time ? `${d.date} 00:00:00` : "");
      if (!clockIn) continue;

      synthetic.push({
        id: `day-${d.employee_id}-${d.date}`,
        employee_id: String(d.employee_id),
        employee_name: employee?.name,
        employee_code: employee?.code,
        clock_in: clockIn,
        clock_out: d.out_time || null,
        duration_minutes: workedMinutes,
        date: d.date,
        status: d.status,
        late_minutes:
          typeof d.late_minutes === "number" ? d.late_minutes : undefined,
        early_leave_minutes:
          typeof d.early_leave_minutes === "number"
            ? d.early_leave_minutes
            : undefined,
      });
    }

    return base.concat(synthetic);
  }, [rows, days, employeesById]);

  const rowsByEmployee = useMemo(() => {
    const m = new Map<string, AttendanceRow[]>();
    for (const r of combinedRows) {
      const id = String(r.employee_id);
      const list = m.get(id);
      if (list) list.push(r);
      else m.set(id, [r]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => String(a.clock_in).localeCompare(String(b.clock_in)));
    }
    return m;
  }, [combinedRows]);

  const summaries = useMemo((): EmployeeSummary[] => {
    const needle = search.trim().toLowerCase();
    const getNameCode = (employeeId: string) => {
      const e = employeesById.get(employeeId);
      const name =
        e?.name || rowsByEmployee.get(employeeId)?.[0]?.employee_name;
      const code =
        e?.code || rowsByEmployee.get(employeeId)?.[0]?.employee_code;
      return {
        name: name || `Employee #${employeeId}`,
        code: code || "—",
      };
    };

    const allEmployeeIds = new Set<string>();
    for (const e of employees) allEmployeeIds.add(String(e.id));
    for (const id of rowsByEmployee.keys()) allEmployeeIds.add(String(id));

    const list: EmployeeSummary[] = [];
    for (const employeeId of allEmployeeIds) {
      const { name, code } = getNameCode(employeeId);
      if (needle) {
        if (
          !name.toLowerCase().includes(needle) &&
          !code.toLowerCase().includes(needle) &&
          !employeeId.toLowerCase().includes(needle)
        ) {
          continue;
        }
      }

      const r = rowsByEmployee.get(employeeId) || [];
      const d = daysByEmployee.get(employeeId) || [];
      const hasProcessedDays = d.length > 0;
      const coveredPairs = new Set<string>();
      const daysPresent = new Set<string>();
      let workedMinutes = 0;
      let lateEvents = 0;
      let earlyLeaveEvents = 0;
      let openShift = false;
      let lastSeen: string | null = null;

      if (hasProcessedDays) {
        for (const day of d) {
          coveredPairs.add(`${day.employee_id}::${day.date}`);
          if (day.status !== "Absent") daysPresent.add(day.date);
          workedMinutes += Math.max(0, day.worked_minutes || 0);
          if (day.in_time && !day.out_time) openShift = true;
          const candidate = day.out_time || day.in_time;
          if (
            candidate &&
            (!lastSeen || String(candidate) > String(lastSeen))
          ) {
            lastSeen = candidate;
          }
        }
      }

      for (const row of r) {
        const pairKey = `${row.employee_id}::${row.date}`;
        if (!hasProcessedDays || !coveredPairs.has(pairKey)) {
          daysPresent.add(row.date);
          workedMinutes += Math.max(0, row.duration_minutes || 0);
        }
        if (isLate(row)) lateEvents += 1;
        if (isEarlyLeave(row)) earlyLeaveEvents += 1;
        if (!row.clock_out) openShift = true;
        const candidate = row.clock_out || row.clock_in;
        if (candidate && (!lastSeen || String(candidate) > String(lastSeen))) {
          lastSeen = candidate;
        }
      }

      const daysCount = daysPresent.size;
      list.push({
        employeeId,
        employeeName: name,
        employeeCode: code,
        daysPresent: daysCount,
        workedMinutes,
        avgMinutesPerDay:
          daysCount > 0 ? Math.floor(workedMinutes / daysCount) : 0,
        lateEvents,
        earlyLeaveEvents,
        openShift,
        lastSeen,
      });
    }

    list.sort((a, b) => b.workedMinutes - a.workedMinutes);
    return list;
  }, [employees, employeesById, rowsByEmployee, daysByEmployee, search]);

  const liveRows = useMemo(() => {
    const list = combinedRows
      .filter((r) => r.date === today)
      .slice()
      .sort((a, b) => String(b.clock_in).localeCompare(String(a.clock_in)));
    return list.slice(0, 25);
  }, [combinedRows, today]);

  const kpis = useMemo(() => {
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(
      (e) => e.status === "active"
    ).length;

    const presentToday = new Set<string>();
    const openShifts = new Set<string>();
    let workedMinutes = 0;
    let lateEvents = 0;
    let earlyLeaveEvents = 0;
    const dayPairs = new Set<string>();

    const hasProcessedDays = days.length > 0;
    if (hasProcessedDays) {
      for (const d of days) {
        if (d.status !== "Absent") dayPairs.add(`${d.employee_id}::${d.date}`);
        workedMinutes += Math.max(0, d.worked_minutes || 0);
        if (d.date === today && d.status !== "Absent")
          presentToday.add(String(d.employee_id));
        if (d.date === today && d.in_time && !d.out_time)
          openShifts.add(String(d.employee_id));
        if (typeof d.late_minutes === "number" && d.late_minutes > 0)
          lateEvents += 1;
        if (
          typeof d.early_leave_minutes === "number" &&
          d.early_leave_minutes > 0
        )
          earlyLeaveEvents += 1;
      }
    }

    for (const r of rows) {
      const pairKey = `${r.employee_id}::${r.date}`;
      if (!hasProcessedDays || !dayPairs.has(pairKey)) {
        if (r.date === today) presentToday.add(String(r.employee_id));
        const dur = Math.max(0, r.duration_minutes || 0);
        workedMinutes += dur;
        if (dur > 0) dayPairs.add(`${r.employee_id}::${r.date}`);
        if (isLate(r)) lateEvents += 1;
        if (isEarlyLeave(r)) earlyLeaveEvents += 1;
      }
      if (!r.clock_out) openShifts.add(String(r.employee_id));
    }

    const avgMinutesPerDay =
      dayPairs.size > 0 ? Math.floor(workedMinutes / dayPairs.size) : 0;

    return {
      totalEmployees,
      activeEmployees,
      presentToday: presentToday.size,
      openShifts: openShifts.size,
      workedMinutes,
      avgMinutesPerDay,
      lateEvents,
      earlyLeaveEvents,
    };
  }, [employees, rows, days, today]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return summaries.find((s) => s.employeeId === selectedEmployeeId) || null;
  }, [selectedEmployeeId, summaries]);

  const selectedEmployeeRows = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return (rowsByEmployee.get(selectedEmployeeId) || []).slice();
  }, [rowsByEmployee, selectedEmployeeId]);

  const selectedEmployeeDays = useMemo((): DaySummary[] => {
    if (!selectedEmployeeId) return [];
    const byDate = new Map<DayKey, AttendanceRow[]>();
    for (const r of selectedEmployeeRows) {
      const date = r.date as DayKey;
      const list = byDate.get(date);
      if (list) list.push(r);
      else byDate.set(date, [r]);
    }

    const employeeLeaves = leavesByEmployee.get(selectedEmployeeId) || [];
    const leaveByDate = new Map<DayKey, LeaveRecord>();
    for (const l of employeeLeaves) {
      if (!l?.date) continue;
      leaveByDate.set(l.date as DayKey, l);
    }

    const allDates = new Set<DayKey>();
    for (const date of byDate.keys()) allDates.add(date);
    for (const date of leaveByDate.keys()) allDates.add(date);

    const result: DaySummary[] = [];
    for (const date of Array.from(allDates).sort((a, b) =>
      a.localeCompare(b)
    )) {
      const list = byDate.get(date) || [];
      const sorted = list
        .slice()
        .sort((a, b) => String(a.clock_in).localeCompare(String(b.clock_in)));
      const firstIn = sorted[0]?.clock_in ?? null;
      let lastOut: string | null = null;
      let workedMinutes = 0;
      let lateCount = 0;
      let earlyLeaveCount = 0;
      let openShift = false;

      for (const r of sorted) {
        workedMinutes += Math.max(0, r.duration_minutes || 0);
        if (isLate(r)) lateCount += 1;
        if (isEarlyLeave(r)) earlyLeaveCount += 1;
        if (!r.clock_out) openShift = true;
        if (r.clock_out && (!lastOut || String(r.clock_out) > String(lastOut)))
          lastOut = r.clock_out;
      }

      const firstMs = toMs(firstIn);
      const lastMs = toMs(lastOut);
      const stayMinutes =
        firstMs != null && lastMs != null
          ? Math.max(0, Math.floor((lastMs - firstMs) / 60_000))
          : 0;

      result.push({
        date,
        firstIn,
        lastOut,
        checkins: sorted.length,
        checkouts: sorted.filter((r) => !!r.clock_out).length,
        workedMinutes,
        stayMinutes,
        lateCount,
        earlyLeaveCount,
        openShift,
        leave: leaveByDate.get(date),
      });
    }

    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [selectedEmployeeId, selectedEmployeeRows, leavesByEmployee]);

  const selectedDayRows = useMemo(() => {
    if (!selectedDay) return [];
    const list = rowsByEmployee.get(selectedDay.employee_id) || [];
    return list
      .filter((r) => r.date === selectedDay.date)
      .slice()
      .sort((a, b) => String(a.clock_in).localeCompare(String(b.clock_in)));
  }, [rowsByEmployee, selectedDay]);

  const selectedDaySummary = useMemo(() => {
    const list = selectedDayRows;
    const checkins = list.length;
    const checkouts = list.filter((r) => !!r.clock_out).length;
    const firstIn = list[0]?.clock_in ?? null;
    const lastOut = list.reduce<string | null>((acc, r) => {
      if (!r.clock_out) return acc;
      if (!acc || String(r.clock_out) > String(acc)) return r.clock_out;
      return acc;
    }, null);
    const workedMinutes = list.reduce(
      (sum, r) => sum + Math.max(0, r.duration_minutes || 0),
      0
    );
    const firstMs = toMs(firstIn);
    const lastMs = toMs(lastOut);
    const stayMinutes =
      firstMs != null && lastMs != null
        ? Math.max(0, Math.floor((lastMs - firstMs) / 60_000))
        : 0;
    return {
      checkins,
      checkouts,
      firstIn,
      lastOut,
      workedMinutes,
      stayMinutes,
    };
  }, [selectedDayRows]);

  const selectedDayLeave = useMemo(() => {
    if (!selectedDay) return null;
    const list = leavesByEmployee.get(String(selectedDay.employee_id)) || [];
    return (
      list.find((l) => String(l.date) === String(selectedDay.date)) || null
    );
  }, [selectedDay, leavesByEmployee]);

  const cardSx = {
    borderRadius: 3,
    border: "1px solid",
    borderColor: "divider",
    overflow: "hidden",
  } as const;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-end"
        mb={3}
        gap={2}
        flexWrap="wrap"
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Attendance Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Workforce attendance, performance signals, and payable hours in one
            view.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            startIcon={<RefreshRounded />}
            onClick={() => void load()}
            disabled={loading}
            sx={{ borderRadius: 2 }}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...cardSx, p: 2.5, mb: 2.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <TextField
            label="Start"
            type="date"
            value={start}
            onChange={(e) => setRangeStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 170 }}
          />
          <TextField
            label="End"
            type="date"
            value={end}
            onChange={(e) => setRangeEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 170 }}
          />
          <Box sx={{ flex: 1 }} />
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee (name, code, id)"
            size="small"
            sx={{ minWidth: { xs: "100%", md: 360 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            lg: "repeat(4, 1fr)",
          },
          gap: 2,
          mb: 2.5,
        }}
      >
        <Paper elevation={0} sx={{ ...cardSx, p: 2.25 }}>
          <Typography variant="overline" color="text.secondary">
            Employees
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
            {kpis.totalEmployees}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Active: {kpis.activeEmployees}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            ...cardSx,
            p: 2.25,
            bgcolor: alpha(theme.palette.success.main, 0.07),
          }}
        >
          <Typography variant="overline" color="text.secondary">
            Present Today
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
            {kpis.presentToday}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Date: {today}
          </Typography>
        </Paper>
        <Paper elevation={0} sx={{ ...cardSx, p: 2.25 }}>
          <Typography variant="overline" color="text.secondary">
            Payable Hours
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
            {formatMinutes(kpis.workedMinutes)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Avg/day: {formatMinutes(kpis.avgMinutesPerDay)}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            ...cardSx,
            p: 2.25,
            bgcolor: alpha(theme.palette.warning.main, 0.08),
          }}
        >
          <Typography variant="overline" color="text.secondary">
            Alerts
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
            {kpis.openShifts}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={`Late: ${kpis.lateEvents}`}
              sx={chipSx.warning}
            />
            <Chip
              size="small"
              label={`Early: ${kpis.earlyLeaveEvents}`}
              sx={chipSx.warning}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Open shifts currently active
          </Typography>
        </Paper>
      </Box>

      <Paper elevation={0} sx={{ ...cardSx, mb: 2.5 }}>
        <Box sx={{ p: 2.5, pb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Employee Overview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Attendance totals, performance signals, and payout-ready hours.
          </Typography>
        </Box>
        <Divider />
        {loading ? (
          <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead sx={{ bgcolor: "background.default" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    EMPLOYEE
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    DAYS
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    WORKED
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    AVG/DAY
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    LATE
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    EARLY
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    SHIFT
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    LAST SEEN
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 700, color: "text.secondary" }}
                  >
                    ACTION
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow
                    key={s.employeeId}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setSelectedEmployeeId(s.employeeId)}
                  >
                    <TableCell>
                      <Stack spacing={0.2}>
                        <Typography sx={{ fontWeight: 800 }} noWrap>
                          {s.employeeName}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                        >
                          {s.employeeCode} • #{s.employeeId}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{s.daysPresent}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>
                      {formatMinutes(s.workedMinutes)}
                    </TableCell>
                    <TableCell>{formatMinutes(s.avgMinutesPerDay)}</TableCell>
                    <TableCell>
                      {s.lateEvents > 0 ? (
                        <Chip
                          size="small"
                          label={s.lateEvents}
                          sx={chipSx.warning}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {s.earlyLeaveEvents > 0 ? (
                        <Chip
                          size="small"
                          label={s.earlyLeaveEvents}
                          sx={chipSx.warning}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {s.openShift ? (
                        <Chip size="small" label="Open" sx={chipSx.openShift} />
                      ) : (
                        <Chip
                          size="small"
                          label="Closed"
                          sx={chipSx.closedShift}
                        />
                      )}
                    </TableCell>
                    <TableCell>{formatTime(s.lastSeen)}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmployeeId(s.employeeId);
                        }}
                      >
                        <VisibilityRounded fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {summaries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">
                        No employees match the current filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.1fr 0.9fr" },
          gap: 2.5,
          alignItems: "start",
        }}
      >
        <Paper elevation={0} sx={{ ...cardSx }}>
          <Box sx={{ p: 2.5, pb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Live Today
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Latest clock-ins and clock-outs (today only).
            </Typography>
          </Box>
          <Divider />
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: "background.default" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    EMPLOYEE
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    IN
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    OUT
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>
                    WORKED
                  </TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {liveRows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Stack spacing={0.2}>
                        <Typography sx={{ fontWeight: 800 }} noWrap>
                          {r.employee_name ||
                            employeesById.get(String(r.employee_id))?.name ||
                            `Employee #${r.employee_id}`}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                        >
                          {r.employee_code ||
                            employeesById.get(String(r.employee_id))?.code ||
                            "—"}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{formatTime(r.clock_in)}</TableCell>
                    <TableCell>
                      {r.clock_out ? (
                        formatTime(r.clock_out)
                      ) : (
                        <Chip size="small" label="Open" sx={chipSx.openShift} />
                      )}
                    </TableCell>
                    <TableCell>
                      {formatMinutes(r.duration_minutes || 0)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="text"
                        onClick={() =>
                          setSelectedDay({
                            employee_id: String(r.employee_id),
                            date: r.date as DayKey,
                          })
                        }
                      >
                        View Day
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {liveRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                      <Typography color="text.secondary">
                        No records today yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper elevation={0} sx={{ ...cardSx }}>
          <Box sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Process Days
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generate day-level attendance summaries for reporting.
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                onClick={() => void processDays()}
                disabled={busy || loading}
                sx={{ borderRadius: 2 }}
              >
                {busy ? "Processing..." : "Process Range"}
              </Button>
              <Chip
                label={`${start} → ${end}`}
                sx={{ fontWeight: 800, bgcolor: "background.default" }}
              />
            </Stack>
          </Box>
          <Divider />
          <Box sx={{ p: 2.5 }}>
            {days.length === 0 ? (
              <Typography color="text.secondary">
                No processed days yet.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ bgcolor: "background.default" }}>
                    <TableRow>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        EMPLOYEE
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        DATE
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        STATUS
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        MINUTES
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {days.map((d) => (
                      <TableRow
                        key={`${d.employee_id}-${d.date}`}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() =>
                          setSelectedDay({
                            employee_id: String(d.employee_id),
                            date: d.date as DayKey,
                          })
                        }
                      >
                        <TableCell sx={{ fontWeight: 800 }}>
                          {employeesById.get(String(d.employee_id))?.name ||
                            `Employee #${d.employee_id}`}
                        </TableCell>
                        <TableCell>{d.date}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={d.status}
                            sx={getDayStatusChipSx(d.status)}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {formatMinutes(d.worked_minutes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Paper>
      </Box>

      <Drawer
        anchor="right"
        open={!!selectedEmployeeId}
        onClose={() => setSelectedEmployeeId(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 520 } } }}
      >
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }} noWrap>
                {selectedEmployee?.employeeName || "Employee"}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {selectedEmployee?.employeeCode || "—"} • #{selectedEmployeeId}{" "}
                • {start} → {end}
              </Typography>
            </Box>
            <IconButton onClick={() => setSelectedEmployeeId(null)}>
              <CloseRounded />
            </IconButton>
          </Stack>

          {selectedEmployee && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
              <Chip
                label={`Days: ${selectedEmployee.daysPresent}`}
                sx={{ fontWeight: 800, bgcolor: "background.default" }}
              />
              <Chip
                label={`Worked: ${formatMinutes(
                  selectedEmployee.workedMinutes
                )}`}
                sx={{ fontWeight: 800, bgcolor: "background.default" }}
              />
              <Chip
                label={`Avg/day: ${formatMinutes(
                  selectedEmployee.avgMinutesPerDay
                )}`}
                sx={{ fontWeight: 800, bgcolor: "background.default" }}
              />
              {selectedEmployee.openShift && (
                <Chip label="Open shift" sx={chipSx.openShift} />
              )}
              {selectedEmployee.lateEvents > 0 && (
                <Chip
                  label={`Late: ${selectedEmployee.lateEvents}`}
                  sx={chipSx.warning}
                />
              )}
              {selectedEmployee.earlyLeaveEvents > 0 && (
                <Chip
                  label={`Early: ${selectedEmployee.earlyLeaveEvents}`}
                  sx={chipSx.warning}
                />
              )}
            </Stack>
          )}
        </Box>

        <Divider />

        <Box sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 900, mb: 1.5 }}>
            Day Breakdown
          </Typography>
          {selectedEmployeeDays.length === 0 ? (
            <Typography color="text.secondary">No records in range.</Typography>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ ...cardSx }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: "background.default" }}>
                  <TableRow>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      DATE
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      FIRST/LAST
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      WORKED
                    </TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedEmployeeDays.slice(0, 31).map((d) => (
                    <TableRow key={d.date} hover>
                      <TableCell sx={{ fontWeight: 800 }}>{d.date}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontWeight: 800 }}>
                          {formatTime(d.firstIn)} → {formatTime(d.lastOut)}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          In/Out: {d.checkins}/{d.checkouts} • Stay:{" "}
                          {formatMinutes(d.stayMinutes)}
                          {d.leave ? ` • Leave: ${d.leave.reason || "—"}` : ""}
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                          {d.leave && (
                            <Chip
                              size="small"
                              label="Leave"
                              sx={chipSx.warning}
                            />
                          )}
                          {d.openShift && (
                            <Chip
                              size="small"
                              label="Open"
                              sx={chipSx.openShift}
                            />
                          )}
                          {d.lateCount > 0 && (
                            <Chip
                              size="small"
                              label={`Late ${d.lateCount}`}
                              sx={chipSx.warning}
                            />
                          )}
                          {d.earlyLeaveCount > 0 && (
                            <Chip
                              size="small"
                              label={`Early ${d.earlyLeaveCount}`}
                              sx={chipSx.warning}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>
                        {formatMinutes(d.workedMinutes)}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="text"
                          onClick={() =>
                            setSelectedDay({
                              employee_id: selectedEmployeeId!,
                              date: d.date,
                            })
                          }
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Drawer>

      <Dialog
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900 }} noWrap>
              Day Details
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {selectedDay
                ? `${
                    employeesById.get(String(selectedDay.employee_id))?.name ||
                    `Employee #${selectedDay.employee_id}`
                  } • ${selectedDay.date}`
                : ""}
            </Typography>
          </Box>
          <IconButton onClick={() => setSelectedDay(null)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip
              label={`Check-ins: ${selectedDaySummary.checkins}`}
              sx={{ fontWeight: 800, bgcolor: "background.default" }}
            />
            <Chip
              label={`Check-outs: ${selectedDaySummary.checkouts}`}
              sx={{ fontWeight: 800, bgcolor: "background.default" }}
            />
            <Chip
              label={`First: ${formatTime(selectedDaySummary.firstIn)}`}
              sx={{ fontWeight: 800, bgcolor: "background.default" }}
            />
            <Chip
              label={`Last: ${formatTime(selectedDaySummary.lastOut)}`}
              sx={{ fontWeight: 800, bgcolor: "background.default" }}
            />
            <Chip
              label={`Worked: ${formatMinutes(
                selectedDaySummary.workedMinutes
              )}`}
              sx={{ fontWeight: 800, bgcolor: "background.default" }}
            />
            <Chip
              label={`Stay: ${formatMinutes(selectedDaySummary.stayMinutes)}`}
              sx={{ fontWeight: 800, bgcolor: "background.default" }}
            />
            {selectedDayLeave && (
              <Chip
                label={`Leave: ${selectedDayLeave.reason || "—"}`}
                sx={chipSx.warning}
              />
            )}
          </Stack>

          {selectedDayRows.length === 0 ? (
            <Typography color="text.secondary">
              {selectedDayLeave
                ? "No attendance records for this day."
                : "No records for this day."}
            </Typography>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ ...cardSx }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: "background.default" }}>
                  <TableRow>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      #
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      IN
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      OUT
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      WORKED
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      STATUS
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedDayRows.map((r, idx) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontWeight: 800 }}>{idx + 1}</TableCell>
                      <TableCell>{formatTime(r.clock_in)}</TableCell>
                      <TableCell>
                        {r.clock_out ? formatTime(r.clock_out) : "—"}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>
                        {formatMinutes(r.duration_minutes || 0)}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap">
                          {!r.clock_out && (
                            <Chip
                              size="small"
                              label="Open shift"
                              sx={chipSx.openShift}
                            />
                          )}
                          {isLate(r) && (
                            <Chip
                              size="small"
                              label="Late"
                              sx={chipSx.warning}
                            />
                          )}
                          {isEarlyLeave(r) && (
                            <Chip
                              size="small"
                              label="Early Leave"
                              sx={chipSx.warning}
                            />
                          )}
                          {!isLate(r) && !isEarlyLeave(r) && r.status && (
                            <Chip
                              size="small"
                              label={r.status}
                              sx={getDayStatusChipSx(r.status)}
                            />
                          )}
                          {!isLate(r) && !isEarlyLeave(r) && !r.status && (
                            <Typography variant="body2" color="text.secondary">
                              —
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
