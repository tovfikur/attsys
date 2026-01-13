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
  useMediaQuery,
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
  shift_id?: string;
  shift_name?: string;
  working_days?: string;
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
  clock_in_method?: string | null;
  clock_out_method?: string | null;
  clock_in_lat?: number | null;
  clock_in_lng?: number | null;
  clock_in_accuracy_m?: number | null;
  clock_out_lat?: number | null;
  clock_out_lng?: number | null;
  clock_out_accuracy_m?: number | null;
  clock_in_device_id?: string | null;
  clock_out_device_id?: string | null;
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
  leave_type?: string | null;
  day_part?: string | null;
  reason: string | null;
  status: string | null;
  created_at?: string;
}

interface HolidayRecord {
  id: string | number;
  date: string;
  name: string;
  created_at?: string;
}

interface LeaveType {
  id?: string | number;
  code: string;
  name: string;
  is_paid?: number | boolean;
  requires_document?: number | boolean;
  active?: number | boolean;
  sort_order?: number;
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

const normalizeMethod = (
  raw: unknown
): "machine" | "thumb" | "face" | "unknown" => {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v) return "unknown";
  if (v === "machine" || v === "device") return "machine";
  if (v === "thumb" || v === "fingerprint" || v === "thumbprint")
    return "thumb";
  if (v === "face" || v === "selfie") return "face";
  return "unknown";
};

const methodLabel = (m: "machine" | "thumb" | "face" | "unknown"): string => {
  if (m === "machine") return "Machine";
  if (m === "thumb") return "Thumb";
  if (m === "face") return "Face";
  return "Unknown";
};

const mapsUrl = (lat: number, lng: number): string =>
  `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;

const formatLatLng = (
  lat: number | null | undefined,
  lng: number | null | undefined
): string => {
  if (typeof lat !== "number" || typeof lng !== "number") return "—";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
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
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const role = getUser()?.role || "";
  const canManageLeaveTypes = role === "hr_admin" || role === "tenant_owner";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [leaveTotals, setLeaveTotals] = useState<
    Record<string, { paid: number; unpaid: number; total: number }>
  >({});

  const selectableLeaveTypes = useMemo<LeaveType[]>(() => {
    const normalized = leaveTypes
      .map((t) => {
        const code = String(t.code || "").trim();
        const name = String(t.name || "").trim();
        const active = t.active === 0 || t.active === false ? 0 : 1;
        const sort_order = Number.isFinite(Number(t.sort_order))
          ? Number(t.sort_order)
          : 0;
        return { ...t, code, name, active, sort_order };
      })
      .filter((t) => t.code !== "" && t.name !== "")
      .sort((a, b) => {
        const so = Number(a.sort_order) - Number(b.sort_order);
        if (so !== 0) return so;
        return String(a.name).localeCompare(String(b.name));
      });
    if (normalized.length > 0) return normalized;
    return [
      { code: "casual", name: "Casual", active: 1 },
      { code: "sick", name: "Sick", active: 1 },
      { code: "annual", name: "Annual", active: 1 },
      { code: "unpaid", name: "Unpaid", active: 1 },
    ];
  }, [leaveTypes]);

  const leaveTypeNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of selectableLeaveTypes) {
      const code = String(t.code || "")
        .trim()
        .toLowerCase();
      const name = String(t.name || "").trim();
      if (code && name) m.set(code, name);
    }
    return m;
  }, [selectableLeaveTypes]);

  const formatLeaveTypeLabel = useCallback(
    (raw: unknown) => {
      const code = String(raw ?? "").trim();
      if (!code) return "leave";
      return leaveTypeNameByCode.get(code.toLowerCase()) || code;
    },
    [leaveTypeNameByCode]
  );

  const fetchLeaveTypes = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (canManageLeaveTypes) qs.set("include_inactive", "1");
      const suffix = qs.toString();
      const url = suffix ? `/api/leave_types?${suffix}` : "/api/leave_types";
      const res = await api.get(url);
      setLeaveTypes(
        Array.isArray(res.data?.leave_types)
          ? (res.data.leave_types as LeaveType[])
          : []
      );
    } catch {
      setLeaveTypes([]);
    }
  }, [canManageLeaveTypes]);

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
      error: {
        ...base,
        bgcolor: alpha(theme.palette.error.main, 0.14),
        borderColor: alpha(theme.palette.error.main, 0.26),
        color: theme.palette.error.dark,
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

  useEffect(() => {
    void fetchLeaveTypes();
  }, [fetchLeaveTypes]);

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
  const [leaveActionBusy, setLeaveActionBusy] = useState(false);
  const [leaveActionError, setLeaveActionError] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceFor, setEvidenceFor] = useState<AttendanceRow | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<
    Array<{
      id: string;
      employee_id: string;
      attendance_record_id: string;
      event_type: string;
      modality: string;
      matched: number;
      sha256: string;
      created_at: string;
      image_data_url: string | null;
      latitude?: number | null;
      longitude?: number | null;
      accuracy_m?: number | null;
    }>
  >([]);

  const [deviceOpen, setDeviceOpen] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [deviceFor, setDeviceFor] = useState<AttendanceRow | null>(null);
  const [deviceItems, setDeviceItems] = useState<
    Array<{
      id: string;
      device_id: string;
      employee_id: string;
      event_type: string;
      occurred_at: string | null;
      occurred_at_utc: string | null;
      created_at: string | null;
    }>
  >([]);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollEmployeeId, setEnrollEmployeeId] = useState<string>("");
  const [enrollEmployeeLabel, setEnrollEmployeeLabel] = useState<string>("");
  const [enrollImage, setEnrollImage] = useState("");
  const [enrollCameraOn, setEnrollCameraOn] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const [enrollOk, setEnrollOk] = useState("");
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);

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

  const closeEvidence = useCallback(() => {
    setEvidenceOpen(false);
    setEvidenceBusy(false);
    setEvidenceError("");
    setEvidenceItems([]);
    setEvidenceFor(null);
  }, []);

  const openEvidence = useCallback(async (row: AttendanceRow) => {
    const rid = Number(row.id);
    if (!Number.isFinite(rid) || rid <= 0) {
      setEvidenceFor(row);
      setEvidenceOpen(true);
      setEvidenceBusy(false);
      setEvidenceItems([]);
      setEvidenceError("No attendance record evidence available.");
      return;
    }
    setEvidenceFor(row);
    setEvidenceOpen(true);
    setEvidenceBusy(true);
    setEvidenceError("");
    setEvidenceItems([]);
    try {
      const res = await api.get(
        `/api/attendance/evidence?attendance_record_id=${encodeURIComponent(
          String(rid)
        )}`
      );
      const list = Array.isArray(res.data?.evidence) ? res.data.evidence : [];
      setEvidenceItems(list);
    } catch (err: unknown) {
      setEvidenceError(getErrorMessage(err, "Failed to load evidence"));
    } finally {
      setEvidenceBusy(false);
    }
  }, []);

  const closeDevice = useCallback(() => {
    setDeviceOpen(false);
    setDeviceBusy(false);
    setDeviceError("");
    setDeviceItems([]);
    setDeviceFor(null);
  }, []);

  const openDevice = useCallback(async (row: AttendanceRow) => {
    setDeviceFor(row);
    setDeviceOpen(true);
    setDeviceBusy(true);
    setDeviceError("");
    setDeviceItems([]);
    try {
      const res = await api.get(
        `/api/attendance/raw_events?employee_id=${encodeURIComponent(
          String(row.employee_id)
        )}&start_date=${encodeURIComponent(
          String(row.date)
        )}&end_date=${encodeURIComponent(String(row.date))}`
      );
      const list = Array.isArray(res.data?.events) ? res.data.events : [];
      setDeviceItems(list);
    } catch (err: unknown) {
      setDeviceError(getErrorMessage(err, "Failed to load device events"));
    } finally {
      setDeviceBusy(false);
    }
  }, []);

  const stopEnrollCamera = useCallback(() => {
    const stream = enrollStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      enrollStreamRef.current = null;
    }
    const el = enrollVideoRef.current;
    if (el) el.srcObject = null;
    setEnrollCameraOn(false);
  }, []);

  const closeEnroll = useCallback(() => {
    stopEnrollCamera();
    setEnrollOpen(false);
    setEnrollBusy(false);
    setEnrollError("");
    setEnrollOk("");
    setEnrollImage("");
    setEnrollEmployeeId("");
    setEnrollEmployeeLabel("");
  }, [stopEnrollCamera]);

  const startEnrollCamera = useCallback(async () => {
    stopEnrollCamera();
    if (!navigator?.mediaDevices?.getUserMedia) {
      setEnrollError("Camera not available");
      setEnrollCameraOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      enrollStreamRef.current = stream;
      const el = enrollVideoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play().catch(() => {});
      }
      setEnrollCameraOn(true);
    } catch (err: unknown) {
      setEnrollError(getErrorMessage(err, "Failed to start camera"));
      setEnrollCameraOn(false);
    }
  }, [stopEnrollCamera]);

  const captureEnrollSelfie = useCallback(() => {
    const el = enrollVideoRef.current;
    if (!el) return;
    const w = el.videoWidth || 0;
    const h = el.videoHeight || 0;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(el, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setEnrollImage(dataUrl);
    stopEnrollCamera();
  }, [stopEnrollCamera]);

  const takeEnrollPicture = useCallback(async () => {
    if (enrollBusy) return;
    setEnrollError("");
    setEnrollOk("");
    if (enrollImage) {
      setEnrollImage("");
      await startEnrollCamera();
      return;
    }
    if (!enrollCameraOn) {
      await startEnrollCamera();
      return;
    }
    captureEnrollSelfie();
  }, [
    captureEnrollSelfie,
    enrollBusy,
    enrollCameraOn,
    enrollImage,
    startEnrollCamera,
  ]);

  const submitEnroll = useCallback(async () => {
    if (!enrollEmployeeId) return;
    if (!enrollImage) {
      setEnrollError("Biometric image is required");
      return;
    }
    setEnrollBusy(true);
    setEnrollError("");
    setEnrollOk("");
    try {
      await api.post("/api/biometrics/enroll", {
        employee_id: enrollEmployeeId,
        biometric_modality: "face",
        biometric_image: enrollImage,
      });
      setEnrollOk("Enrolled face template");
      setEnrollImage("");
      stopEnrollCamera();
    } catch (err: unknown) {
      setEnrollError(getErrorMessage(err, "Failed to enroll biometrics"));
    } finally {
      setEnrollBusy(false);
    }
  }, [enrollEmployeeId, enrollImage, stopEnrollCamera]);

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
      setHolidays(dashRes.data.holidays || []);
      setLeaveTotals(dashRes.data.leave_totals || {});
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

  const openEnrollForEmployee = useCallback(
    (employeeId: string) => {
      const employee =
        employeesById.get(String(employeeId)) ||
        (employeeId ? { name: `Employee #${employeeId}` } : null);
      setEnrollEmployeeId(String(employeeId || ""));
      setEnrollEmployeeLabel(
        employee
          ? `${String(employee.name || "Employee")}${
              employee && "code" in employee && employee.code
                ? ` • ${String(employee.code)}`
                : ""
            }`
          : ""
      );
      setEnrollImage("");
      setEnrollError("");
      setEnrollOk("");
      setEnrollOpen(true);
    },
    [employeesById]
  );

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

  const selectedEmployeeLeaveTotals = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return leaveTotals[String(selectedEmployeeId)] || null;
  }, [leaveTotals, selectedEmployeeId]);

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

  const notifyAttendanceUpdated = () => {
    window.dispatchEvent(new Event("attendance:updated"));
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const bc = new BroadcastChannel("attendance");
      bc.postMessage({ type: "updated" });
      bc.close();
    }
  };

  const getLeaveStatusChipSx = useCallback(
    (status: string | null | undefined) => {
      const s = String(status || "")
        .trim()
        .toLowerCase();
      if (!s) return chipSx.neutral;
      if (s === "approved") return chipSx.warning;
      if (s === "rejected") return chipSx.error;
      if (s === "cancelled") return chipSx.neutral;
      if (s.startsWith("pending")) return chipSx.neutral;
      return chipSx.neutral;
    },
    [chipSx]
  );

  useEffect(() => {
    setLeaveActionError("");
  }, [selectedDay]);

  const updateSelectedDayLeaveStatus = async (nextStatus: string) => {
    if (!selectedDayLeave?.id) return;
    setLeaveActionBusy(true);
    setLeaveActionError("");
    try {
      await api.post("/api/leaves/update", {
        id: selectedDayLeave.id,
        status: nextStatus,
      });
      await load();
      notifyAttendanceUpdated();
    } catch (err: unknown) {
      setLeaveActionError(
        getErrorMessage(err, "Failed to update leave status")
      );
    } finally {
      setLeaveActionBusy(false);
    }
  };

  const cardSx = {
    borderRadius: 3,
    border: "1px solid",
    borderColor: "divider",
    overflow: "hidden",
  } as const;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 } }}>
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
            sx={{ minWidth: { xs: "100%", md: 170 } }}
          />
          <TextField
            label="End"
            type="date"
            value={end}
            onChange={(e) => setRangeEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: { xs: "100%", md: 170 } }}
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
          <>
            <Box sx={{ display: { xs: "block", md: "none" }, p: 2 }}>
              {summaries.length === 0 ? (
                <Box sx={{ py: 4, textAlign: "center" }}>
                  <Typography color="text.secondary">
                    No employees match the current filters.
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1.25}>
                  {summaries.map((s) => (
                    <Paper
                      key={s.employeeId}
                      variant="outlined"
                      onClick={() => setSelectedEmployeeId(s.employeeId)}
                      sx={{
                        p: 1.5,
                        borderRadius: 2.5,
                        cursor: "pointer",
                        transition: "background-color 0.2s",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontWeight: 900 }} noWrap>
                            {s.employeeName}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                          >
                            {s.employeeCode} • #{s.employeeId}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployeeId(s.employeeId);
                          }}
                        >
                          <VisibilityRounded fontSize="small" />
                        </IconButton>
                      </Stack>

                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        sx={{ mt: 1 }}
                      >
                        <Chip
                          size="small"
                          label={`Worked: ${formatMinutes(s.workedMinutes)}`}
                          sx={{
                            fontWeight: 900,
                            bgcolor: "background.default",
                          }}
                        />
                        <Chip
                          size="small"
                          label={s.openShift ? "Open shift" : "Closed shift"}
                          sx={
                            s.openShift ? chipSx.openShift : chipSx.closedShift
                          }
                        />
                        {s.lateEvents > 0 ? (
                          <Chip
                            size="small"
                            label={`Late: ${s.lateEvents}`}
                            sx={chipSx.warning}
                          />
                        ) : null}
                        {s.earlyLeaveEvents > 0 ? (
                          <Chip
                            size="small"
                            label={`Early: ${s.earlyLeaveEvents}`}
                            sx={chipSx.warning}
                          />
                        ) : null}
                        <Chip
                          size="small"
                          label={`Days: ${s.daysPresent}`}
                          sx={{
                            fontWeight: 900,
                            bgcolor: "background.default",
                          }}
                        />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>

            <Box sx={{ display: { xs: "none", md: "block" } }}>
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
                        DAYS
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        WORKED
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        AVG/DAY
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        LATE
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        EARLY
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
                        SHIFT
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 700, color: "text.secondary" }}
                      >
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
                        <TableCell>
                          {formatMinutes(s.avgMinutesPerDay)}
                        </TableCell>
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
                            <Chip
                              size="small"
                              label="Open"
                              sx={chipSx.openShift}
                            />
                          ) : (
                            <Chip
                              size="small"
                              label="Closed"
                              sx={chipSx.closedShift}
                            />
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {formatTime(s.lastSeen)}
                        </TableCell>
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
            </Box>
          </>
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
          <Box sx={{ display: { xs: "block", sm: "none" }, p: 2 }}>
            {liveRows.length === 0 ? (
              <Box sx={{ py: 4, textAlign: "center" }}>
                <Typography color="text.secondary">
                  No records today yet.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={1.25}>
                {liveRows.map((r) => (
                  <Paper
                    key={r.id}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2.5 }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 900 }} noWrap>
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
                      </Box>
                      <Chip
                        size="small"
                        label={formatMinutes(r.duration_minutes || 0)}
                        sx={{ fontWeight: 900, bgcolor: "background.default" }}
                      />
                    </Stack>

                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      sx={{ mt: 1 }}
                    >
                      <Chip
                        size="small"
                        label={`In: ${formatTime(r.clock_in)}`}
                        sx={{ fontWeight: 900, bgcolor: "background.default" }}
                      />
                      <Chip
                        size="small"
                        label={
                          r.clock_out
                            ? `Out: ${formatTime(r.clock_out)}`
                            : "Open"
                        }
                        sx={
                          r.clock_out
                            ? { fontWeight: 900, bgcolor: "background.default" }
                            : chipSx.openShift
                        }
                      />
                    </Stack>

                    <Button
                      size="small"
                      variant="text"
                      onClick={() =>
                        setSelectedDay({
                          employee_id: String(r.employee_id),
                          date: r.date as DayKey,
                        })
                      }
                      sx={{ mt: 1 }}
                      fullWidth
                    >
                      View Day
                    </Button>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>

          <Box sx={{ display: { xs: "none", sm: "block" } }}>
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
                      IN
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: "text.secondary",
                        display: { xs: "none", sm: "table-cell" },
                      }}
                    >
                      OUT
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, color: "text.secondary" }}
                    >
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
                      <TableCell
                        sx={{ display: { xs: "none", sm: "table-cell" } }}
                      >
                        {r.clock_out ? (
                          formatTime(r.clock_out)
                        ) : (
                          <Chip
                            size="small"
                            label="Open"
                            sx={chipSx.openShift}
                          />
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
          </Box>
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
              {selectedEmployeeLeaveTotals && (
                <>
                  <Chip
                    label={`Paid Leave: ${selectedEmployeeLeaveTotals.paid}`}
                    sx={{ fontWeight: 800, bgcolor: "background.default" }}
                  />
                  <Chip
                    label={`Unpaid Leave: ${selectedEmployeeLeaveTotals.unpaid}`}
                    sx={{ fontWeight: 800, bgcolor: "background.default" }}
                  />
                </>
              )}
              {holidays.length > 0 && (
                <Chip
                  label={`Holidays: ${holidays.length}`}
                  sx={{ fontWeight: 800, bgcolor: "background.default" }}
                />
              )}
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

          {selectedEmployeeId ? (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => openEnrollForEmployee(selectedEmployeeId)}
                sx={{ borderRadius: 2, fontWeight: 900 }}
              >
                Enroll Biometrics
              </Button>
            </Stack>
          ) : null}
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
                          {d.leave
                            ? ` • Leave: ${formatLeaveTypeLabel(
                                d.leave.leave_type
                              )}`
                            : ""}
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                          {d.leave && (
                            <Chip
                              size="small"
                              label={`${(
                                d.leave.status || "pending"
                              ).toString()} • ${(
                                d.leave.day_part || "full"
                              ).toString()}`}
                              sx={getLeaveStatusChipSx(d.leave.status)}
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
        fullScreen={isMobile}
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
                label={`Leave: ${formatLeaveTypeLabel(
                  selectedDayLeave.leave_type
                )} • ${(selectedDayLeave.day_part || "full").toString()} • ${(
                  selectedDayLeave.status || "pending"
                ).toString()}`}
                sx={getLeaveStatusChipSx(selectedDayLeave.status)}
              />
            )}
          </Stack>

          {leaveActionError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {leaveActionError}
            </Alert>
          ) : null}

          {selectedDayLeave?.id ? (
            <Stack
              direction="row"
              spacing={1.5}
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 2 }}
            >
              {String(selectedDayLeave.status || "").toLowerCase() ===
              "pending" ? (
                role === "manager" ||
                role === "hr_admin" ||
                role === "tenant_owner" ? (
                  <>
                    <Button
                      variant="contained"
                      onClick={() =>
                        void updateSelectedDayLeaveStatus("approved")
                      }
                      disabled={leaveActionBusy}
                    >
                      Approve
                    </Button>
                    <Button
                      color="error"
                      variant="outlined"
                      onClick={() =>
                        void updateSelectedDayLeaveStatus("rejected")
                      }
                      disabled={leaveActionBusy}
                    >
                      Reject
                    </Button>
                  </>
                ) : null
              ) : null}
            </Stack>
          ) : null}

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
                      METHOD
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      LOCATION
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
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      EVIDENCE
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedDayRows.map((r, idx) => (
                    <TableRow key={r.id} hover>
                      {(() => {
                        const inMethod = normalizeMethod(r.clock_in_method);
                        const outMethod = normalizeMethod(r.clock_out_method);
                        const inHasGeo =
                          typeof r.clock_in_lat === "number" &&
                          typeof r.clock_in_lng === "number" &&
                          inMethod !== "machine";
                        const outHasGeo =
                          typeof r.clock_out_lat === "number" &&
                          typeof r.clock_out_lng === "number" &&
                          outMethod !== "machine";
                        const rid = Number(r.id);
                        const hasRecordId = Number.isFinite(rid) && rid > 0;
                        const showEvidence =
                          hasRecordId &&
                          !(inMethod === "machine" && outMethod === "machine");

                        return (
                          <>
                            <TableCell sx={{ fontWeight: 800 }}>
                              {idx + 1}
                            </TableCell>
                            <TableCell>{formatTime(r.clock_in)}</TableCell>
                            <TableCell>
                              {r.clock_out ? formatTime(r.clock_out) : "—"}
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={0.75}
                                flexWrap="wrap"
                              >
                                <Chip
                                  size="small"
                                  label={`IN: ${methodLabel(inMethod)}`}
                                  sx={{
                                    fontWeight: 900,
                                    bgcolor: "background.default",
                                  }}
                                />
                                <Chip
                                  size="small"
                                  label={`OUT: ${
                                    r.clock_out ? methodLabel(outMethod) : "—"
                                  }`}
                                  sx={{
                                    fontWeight: 900,
                                    bgcolor: "background.default",
                                  }}
                                />
                                {inMethod === "machine" &&
                                r.clock_in_device_id ? (
                                  <Chip
                                    size="small"
                                    label={String(r.clock_in_device_id)}
                                    sx={{
                                      fontWeight: 900,
                                      bgcolor: "background.default",
                                    }}
                                  />
                                ) : null}
                                {outMethod === "machine" &&
                                r.clock_out_device_id ? (
                                  <Chip
                                    size="small"
                                    label={String(r.clock_out_device_id)}
                                    sx={{
                                      fontWeight: 900,
                                      bgcolor: "background.default",
                                    }}
                                  />
                                ) : null}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.25}>
                                {inHasGeo ? (
                                  <Typography
                                    variant="body2"
                                    component="a"
                                    href={mapsUrl(
                                      r.clock_in_lat as number,
                                      r.clock_in_lng as number
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                    sx={{
                                      color: "primary.main",
                                      textDecoration: "none",
                                      fontWeight: 800,
                                    }}
                                  >
                                    IN:{" "}
                                    {formatLatLng(
                                      r.clock_in_lat,
                                      r.clock_in_lng
                                    )}
                                  </Typography>
                                ) : (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    IN: —
                                  </Typography>
                                )}
                                {r.clock_out ? (
                                  outHasGeo ? (
                                    <Typography
                                      variant="body2"
                                      component="a"
                                      href={mapsUrl(
                                        r.clock_out_lat as number,
                                        r.clock_out_lng as number
                                      )}
                                      target="_blank"
                                      rel="noreferrer"
                                      sx={{
                                        color: "primary.main",
                                        textDecoration: "none",
                                        fontWeight: 800,
                                      }}
                                    >
                                      OUT:{" "}
                                      {formatLatLng(
                                        r.clock_out_lat,
                                        r.clock_out_lng
                                      )}
                                    </Typography>
                                  ) : (
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      OUT: —
                                    </Typography>
                                  )
                                ) : (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    OUT: —
                                  </Typography>
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 900 }}>
                              {formatMinutes(r.duration_minutes || 0)}
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={0.75}
                                flexWrap="wrap"
                              >
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
                                {!isLate(r) &&
                                  !isEarlyLeave(r) &&
                                  !r.status && (
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      —
                                    </Typography>
                                  )}
                              </Stack>
                            </TableCell>
                            <TableCell align="right">
                              <Stack
                                direction="row"
                                spacing={1}
                                justifyContent="flex-end"
                                alignItems="center"
                              >
                                {showEvidence ? (
                                  <Button
                                    size="small"
                                    variant="text"
                                    onClick={() => void openEvidence(r)}
                                    disabled={
                                      evidenceBusy && evidenceFor?.id === r.id
                                    }
                                  >
                                    {evidenceBusy && evidenceFor?.id === r.id
                                      ? "Loading…"
                                      : "Biometric"}
                                  </Button>
                                ) : (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    —
                                  </Typography>
                                )}
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => void openDevice(r)}
                                  disabled={
                                    deviceBusy &&
                                    deviceFor?.employee_id === r.employee_id &&
                                    deviceFor?.date === r.date &&
                                    deviceFor?.clock_in === r.clock_in
                                  }
                                >
                                  {deviceBusy &&
                                  deviceFor?.employee_id === r.employee_id &&
                                  deviceFor?.date === r.date &&
                                  deviceFor?.clock_in === r.clock_in
                                    ? "Loading…"
                                    : "Device"}
                                </Button>
                              </Stack>
                            </TableCell>
                          </>
                        );
                      })()}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={evidenceOpen}
        onClose={evidenceBusy ? undefined : closeEvidence}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900 }} noWrap>
              Biometric Evidence
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {evidenceFor
                ? `${evidenceFor.date} • Record #${String(evidenceFor.id)}`
                : ""}
            </Typography>
          </Box>
          <IconButton onClick={closeEvidence} disabled={evidenceBusy}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          {evidenceError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {evidenceError}
            </Alert>
          ) : null}
          {evidenceBusy ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : evidenceItems.length === 0 ? (
            <Typography color="text.secondary">No evidence stored.</Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              {evidenceItems.map((ev) => (
                <Paper
                  key={ev.id}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 3 }}
                >
                  <Stack spacing={1}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Chip
                        size="small"
                        label={String(ev.event_type || "event")}
                        sx={{ fontWeight: 900 }}
                      />
                      <Chip
                        size="small"
                        label={String(ev.modality || "modality")}
                        sx={{ fontWeight: 900, bgcolor: "background.default" }}
                      />
                      <Chip
                        size="small"
                        label={ev.matched ? "Matched" : "Unmatched"}
                        sx={{
                          fontWeight: 900,
                          bgcolor: ev.matched
                            ? alpha(theme.palette.success.main, 0.14)
                            : alpha(theme.palette.error.main, 0.14),
                        }}
                      />
                    </Stack>
                    {typeof ev.latitude === "number" &&
                    typeof ev.longitude === "number" ? (
                      <Typography
                        variant="body2"
                        component="a"
                        href={mapsUrl(ev.latitude, ev.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        sx={{
                          color: "primary.main",
                          textDecoration: "none",
                          fontWeight: 800,
                        }}
                      >
                        {formatLatLng(ev.latitude, ev.longitude)}
                        {typeof ev.accuracy_m === "number"
                          ? ` (±${Math.round(ev.accuracy_m)}m)`
                          : ""}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Location unavailable.
                      </Typography>
                    )}
                    {String(ev.modality || "").toLowerCase() === "face" ? (
                      ev.image_data_url ? (
                        <Box
                          component="img"
                          src={ev.image_data_url}
                          alt="Evidence"
                          sx={{
                            width: "100%",
                            borderRadius: 2,
                            border: "1px solid",
                            borderColor: alpha(
                              theme.palette.text.primary,
                              0.12
                            ),
                          }}
                        />
                      ) : (
                        <Typography color="text.secondary">
                          Image unavailable.
                        </Typography>
                      )
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Thumb evidence image hidden.
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {String(ev.created_at || "")}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deviceOpen}
        onClose={deviceBusy ? undefined : closeDevice}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900 }} noWrap>
              Device Events
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {deviceFor
                ? `${deviceFor.date} • Employee #${deviceFor.employee_id}`
                : ""}
            </Typography>
          </Box>
          <IconButton onClick={closeDevice} disabled={deviceBusy}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          {deviceError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {deviceError}
            </Alert>
          ) : null}
          {deviceBusy ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : deviceItems.length === 0 ? (
            <Typography color="text.secondary">
              No device events found.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      TIME
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      EVENT
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 800, color: "text.secondary" }}
                    >
                      DEVICE
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deviceItems.map((ev) => (
                    <TableRow key={ev.id} hover>
                      <TableCell sx={{ fontWeight: 800 }}>
                        {formatTime(ev.occurred_at || ev.occurred_at_utc || "")}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={String(ev.event_type || "event")}
                          sx={{
                            fontWeight: 900,
                            bgcolor: "background.default",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>
                        {ev.device_id || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={enrollOpen}
        onClose={enrollBusy ? undefined : closeEnroll}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900 }} noWrap>
              Enroll Biometrics
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {enrollEmployeeLabel ||
                (enrollEmployeeId ? `#${enrollEmployeeId}` : "")}
            </Typography>
          </Box>
          <IconButton onClick={closeEnroll} disabled={enrollBusy}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            {enrollError ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {enrollError}
              </Alert>
            ) : null}
            {enrollOk ? (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {enrollOk}
              </Alert>
            ) : null}

            <Stack spacing={1.25}>
              <Box
                sx={{
                  width: "100%",
                  bgcolor: "background.default",
                  borderRadius: 2,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: alpha(theme.palette.text.primary, 0.12),
                  position: "relative",
                }}
              >
                <Box
                  component="video"
                  ref={enrollVideoRef}
                  muted
                  playsInline
                  autoPlay
                  sx={{
                    width: "100%",
                    display: enrollImage
                      ? "none"
                      : enrollCameraOn
                      ? "block"
                      : "none",
                  }}
                />
                {enrollImage ? (
                  <Box
                    component="img"
                    src={enrollImage}
                    alt="Captured"
                    sx={{ width: "100%", display: "block" }}
                  />
                ) : null}
                {!enrollImage && !enrollCameraOn ? (
                  <Box sx={{ p: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Tap “Take picture” to open camera.
                    </Typography>
                  </Box>
                ) : null}
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  onClick={() => void takeEnrollPicture()}
                  disabled={enrollBusy}
                  sx={{ borderRadius: 2, fontWeight: 900 }}
                >
                  {enrollImage
                    ? "Retake picture"
                    : enrollCameraOn
                    ? "Capture"
                    : "Take picture"}
                </Button>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={closeEnroll} disabled={enrollBusy}>
                Close
              </Button>
              <Button
                variant="contained"
                onClick={() => void submitEnroll()}
                disabled={enrollBusy || !enrollEmployeeId || !enrollImage}
              >
                {enrollBusy ? "Please wait…" : "Enroll"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
