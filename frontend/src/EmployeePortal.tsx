import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Alert,
  alpha,
  Box,
  Button,
  ButtonBase,
  Chip,
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
  VisibilityRounded,
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
    profile_photo_path?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    personal_phone?: string | null;
    email?: string | null;
    present_address?: string | null;
    permanent_address?: string | null;
    department?: string | null;
    designation?: string | null;
    employee_type?: string | null;
    date_of_joining?: string | null;
    supervisor_name?: string | null;
    work_location?: string | null;
    status: string;
    created_at: string;
  } | null;
};

type AttendanceRow = {
  id?: string | null;
  date: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes?: number;
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

type EvidenceItem = {
  id: string;
  employee_id: string;
  attendance_record_id: string;
  event_type: string;
  modality: string;
  matched: number;
  sha256: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  image_data_url: string | null;
};

type BiometricModality = "face" | "fingerprint";
type BiometricAction = "clock_in" | "clock_out" | "enroll";
type BiometricGeo = {
  latitude: number;
  longitude: number;
  accuracy_m?: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const formatMonth = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function minutesToHM(mins: number) {
  const m = Math.max(0, Math.floor(mins || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

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

  const [biometricOpen, setBiometricOpen] = useState(false);
  const [biometricAction, setBiometricAction] =
    useState<BiometricAction>("clock_in");
  const [biometricModality, setBiometricModality] =
    useState<BiometricModality>("face");
  const [biometricImage, setBiometricImage] = useState("");
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  const biometricVideoRef = useRef<HTMLVideoElement | null>(null);
  const biometricStreamRef = useRef<MediaStream | null>(null);

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

  const [dayOpen, setDayOpen] = useState(false);
  const [dayDate, setDayDate] = useState("");
  const [dayRows, setDayRows] = useState<AttendanceRow[]>([]);

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceFor, setEvidenceFor] = useState<AttendanceRow | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);

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

  const stopBiometricCamera = useCallback(() => {
    const stream = biometricStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      biometricStreamRef.current = null;
    }
    const el = biometricVideoRef.current;
    if (el) el.srcObject = null;
  }, []);

  const closeBiometric = useCallback(() => {
    stopBiometricCamera();
    setBiometricOpen(false);
    setBiometricBusy(false);
  }, [stopBiometricCamera]);

  const openEnrollBiometric = useCallback(() => {
    setBiometricAction("enroll");
    setBiometricModality("face");
    setBiometricImage("");
    setBiometricError("");
    setBiometricOpen(true);
  }, []);

  const openClockBiometric = useCallback((type: "in" | "out") => {
    setBiometricAction(type === "in" ? "clock_in" : "clock_out");
    setBiometricModality("face");
    setBiometricImage("");
    setBiometricError("");
    setBiometricOpen(true);
  }, []);

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

  const attendanceRowsByDate = useMemo(() => {
    const m = new Map<string, AttendanceRow[]>();
    for (const r of attendance) {
      const d = String(r.date || "");
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(r);
      else m.set(d, [r]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => String(a.clock_in).localeCompare(String(b.clock_in)));
    }
    return m;
  }, [attendance]);

  const attendanceByDate = useMemo(() => {
    const m = new Map<
      string,
      { firstIn: string | null; lastOut: string | null; minutes: number }
    >();
    for (const [d, rows] of attendanceRowsByDate.entries()) {
      const cur = { firstIn: null, lastOut: null, minutes: 0 } as {
        firstIn: string | null;
        lastOut: string | null;
        minutes: number;
      };
      for (const r of rows) {
        const inTs = r.clock_in ? String(r.clock_in) : null;
        const outTs = r.clock_out ? String(r.clock_out) : null;
        if (inTs && (!cur.firstIn || inTs < cur.firstIn)) cur.firstIn = inTs;
        if (outTs && (!cur.lastOut || outTs > cur.lastOut)) cur.lastOut = outTs;
        cur.minutes += Math.max(0, Number(r.duration_minutes || 0));
      }
      m.set(d, cur);
    }
    return m;
  }, [attendanceRowsByDate]);

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

  const getBiometricGeo =
    useCallback(async (): Promise<BiometricGeo | null> => {
      if (!navigator?.geolocation?.getCurrentPosition) return null;
      return await new Promise((resolve) => {
        let done = false;
        const t = window.setTimeout(() => {
          if (done) return;
          done = true;
          resolve(null);
        }, 6500);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (done) return;
            done = true;
            window.clearTimeout(t);
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy,
            });
          },
          () => {
            if (done) return;
            done = true;
            window.clearTimeout(t);
            resolve(null);
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
        );
      });
    }, []);

  const clock = useCallback(
    async (
      type: "in" | "out",
      biometric: {
        modality: BiometricModality;
        image: string;
        geo?: BiometricGeo | null;
      }
    ): Promise<boolean> => {
      if (!employeeId) return false;
      setClockBusy(true);
      setClockMsg(null);
      try {
        const url =
          type === "in"
            ? "/api/attendance/clockin"
            : "/api/attendance/clockout";
        const res = await api.post(url, {
          employee_id: employeeId,
          biometric_modality: biometric.modality,
          biometric_image: biometric.image,
          geo: biometric.geo || null,
        });
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
        return true;
      } catch (err: unknown) {
        const message = getErrorMessage(err, "Failed to record attendance");
        if (message.includes("Open shift exists")) setOpenShift(true);
        if (message.includes("No open shift")) setOpenShift(false);
        setClockMsg({ type: "error", message });
        return false;
      } finally {
        setClockBusy(false);
      }
    },
    [employeeId, notifyAttendanceUpdated]
  );

  const startBiometricCamera = useCallback(async () => {
    stopBiometricCamera();
    if (!navigator?.mediaDevices?.getUserMedia) {
      setBiometricError("Camera not available");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      biometricStreamRef.current = stream;
      const el = biometricVideoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play();
      }
    } catch (err: unknown) {
      setBiometricError(getErrorMessage(err, "Failed to start camera"));
    }
  }, [stopBiometricCamera]);

  const captureBiometricSelfie = useCallback(() => {
    const el = biometricVideoRef.current;
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
    setBiometricImage(dataUrl);
  }, []);

  const onPickBiometricFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const v = typeof reader.result === "string" ? reader.result : "";
        setBiometricImage(v);
      };
      reader.readAsDataURL(file);
    },
    [setBiometricImage]
  );

  const submitBiometric = useCallback(async () => {
    if (!employeeId) return;
    if (!biometricImage) {
      setBiometricError("Biometric image is required");
      return;
    }
    setBiometricBusy(true);
    setBiometricError("");
    try {
      if (biometricAction === "enroll") {
        await api.post("/api/biometrics/enroll", {
          employee_id: employeeId,
          biometric_modality: biometricModality,
          biometric_image: biometricImage,
        });
        setClockMsg({ type: "success", message: "Biometric enrolled" });
        closeBiometric();
        return;
      }

      const geo = await getBiometricGeo();
      const ok = await clock(biometricAction === "clock_in" ? "in" : "out", {
        modality: biometricModality,
        image: biometricImage,
        geo,
      });
      if (ok) closeBiometric();
    } catch (err: unknown) {
      setBiometricError(getErrorMessage(err, "Failed"));
    } finally {
      setBiometricBusy(false);
    }
  }, [
    biometricAction,
    biometricImage,
    biometricModality,
    clock,
    closeBiometric,
    employeeId,
    getBiometricGeo,
  ]);

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

  const openDay = useCallback(
    (date: string) => {
      setDayDate(date);
      setDayRows((attendanceRowsByDate.get(date) || []).slice());
      setDayOpen(true);
    },
    [attendanceRowsByDate]
  );

  const closeDay = useCallback(() => {
    setDayOpen(false);
  }, []);

  const openEvidence = useCallback(async (row: AttendanceRow) => {
    const id = row.id ? String(row.id) : "";
    if (!id) return;
    setEvidenceFor(row);
    setEvidenceOpen(true);
    setEvidenceBusy(true);
    setEvidenceError("");
    setEvidenceItems([]);
    try {
      const res = await api.get(
        `/api/attendance/evidence?attendance_record_id=${encodeURIComponent(
          id
        )}`
      );
      const list = Array.isArray(res.data?.evidence) ? res.data.evidence : [];
      setEvidenceItems(list as EvidenceItem[]);
    } catch (err: unknown) {
      setEvidenceError(getErrorMessage(err, "Failed to load evidence"));
    } finally {
      setEvidenceBusy(false);
    }
  }, []);

  const closeEvidence = useCallback(() => {
    setEvidenceOpen(false);
    setEvidenceBusy(false);
    setEvidenceError("");
    setEvidenceItems([]);
    setEvidenceFor(null);
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
                <Button
                  size="small"
                  variant="outlined"
                  onClick={openEnrollBiometric}
                  disabled={clockBusy || biometricBusy}
                  sx={{ borderRadius: 2, fontWeight: 900 }}
                >
                  Enroll Biometrics
                </Button>
                {showClockIn && (
                  <Button
                    size="small"
                    color="success"
                    variant="contained"
                    startIcon={<LoginRounded />}
                    onClick={() => openClockBiometric("in")}
                    disabled={clockBusy || biometricBusy}
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
                    onClick={() => openClockBiometric("out")}
                    disabled={clockBusy || biometricBusy}
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

                  {me?.employee && (
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
                        Profile
                      </Typography>
                      <Stack spacing={0.75}>
                        <Typography variant="body2" color="text.secondary">
                          Gender: {me.employee.gender || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Date of Birth: {me.employee.date_of_birth || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Phone: {me.employee.personal_phone || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Email: {me.employee.email || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Department: {me.employee.department || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Designation: {me.employee.designation || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Employee Type: {me.employee.employee_type || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Date of Joining: {me.employee.date_of_joining || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Supervisor: {me.employee.supervisor_name || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Work Location: {me.employee.work_location || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Present Address: {me.employee.present_address || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Permanent Address:{" "}
                          {me.employee.permanent_address || "—"}
                        </Typography>
                      </Stack>
                    </Paper>
                  )}
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
                        const punchRows = attendanceRowsByDate.get(d) || [];
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

                        const methodSummary = (() => {
                          const methods = new Set<
                            "machine" | "thumb" | "face" | "unknown"
                          >();
                          let hasGeo = false;
                          for (const r of punchRows) {
                            methods.add(normalizeMethod(r.clock_in_method));
                            methods.add(normalizeMethod(r.clock_out_method));
                            if (
                              typeof r.clock_in_lat === "number" &&
                              typeof r.clock_in_lng === "number"
                            ) {
                              hasGeo = true;
                            }
                            if (
                              typeof r.clock_out_lat === "number" &&
                              typeof r.clock_out_lng === "number"
                            ) {
                              hasGeo = true;
                            }
                          }
                          methods.delete("unknown");
                          const list = Array.from(methods.values());
                          list.sort();
                          return { methods: list, hasGeo };
                        })();

                        return (
                          <ButtonBase
                            key={d}
                            onClick={() => openDay(d)}
                            aria-label={`Open day details for ${d}`}
                            title={`Open day details for ${d}`}
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

                                  {isPresent &&
                                  (methodSummary.methods.length > 0 ||
                                    methodSummary.hasGeo) ? (
                                    <Stack
                                      direction="row"
                                      spacing={0.75}
                                      sx={{
                                        position: "absolute",
                                        bottom: 10,
                                        left: 10,
                                        right: 10,
                                        justifyContent: "center",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {methodSummary.methods
                                        .slice(0, 2)
                                        .map((m) => (
                                          <Chip
                                            key={m}
                                            size="small"
                                            label={methodLabel(m)}
                                            sx={{
                                              fontWeight: 900,
                                              bgcolor: alpha(
                                                theme.palette.text.primary,
                                                0.06
                                              ),
                                            }}
                                          />
                                        ))}
                                      {methodSummary.methods.length > 2 ? (
                                        <Chip
                                          size="small"
                                          label="Mixed"
                                          sx={{
                                            fontWeight: 900,
                                            bgcolor: alpha(
                                              theme.palette.text.primary,
                                              0.06
                                            ),
                                          }}
                                        />
                                      ) : null}
                                      {methodSummary.hasGeo ? (
                                        <Chip
                                          size="small"
                                          label="GPS"
                                          sx={{
                                            fontWeight: 900,
                                            bgcolor: alpha(
                                              theme.palette.primary.main,
                                              0.12
                                            ),
                                            color: theme.palette.primary.dark,
                                          }}
                                        />
                                      ) : null}
                                    </Stack>
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
        open={dayOpen}
        onClose={() => setDayOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>{dayDate || "Day"}</DialogTitle>
        <DialogContent>
          {(() => {
            const holiday = dayDate
              ? holidaysByDate.get(dayDate) || null
              : null;
            const leaveList = dayDate ? leavesByDate.get(dayDate) || [] : [];
            const punch = dayDate
              ? attendanceByDate.get(dayDate) || null
              : null;
            const rows = dayRows;

            return (
              <Stack spacing={2} sx={{ mt: 1 }}>
                {holiday ? (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    Holiday • {holiday.name}
                  </Alert>
                ) : null}

                {leaveList.length > 0 ? (
                  <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    {`Leave • ${String(
                      leaveList[0]?.leave_type || "leave"
                    )} • ${String(leaveList[0]?.day_part || "full")} • ${String(
                      leaveList[0]?.status || "pending"
                    )}`}
                  </Alert>
                ) : null}

                {punch ? (
                  <Paper
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: alpha(theme.palette.text.primary, 0.1),
                      borderRadius: 3,
                      p: 1.5,
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ sm: "center" }}
                      justifyContent="space-between"
                    >
                      <Typography sx={{ fontWeight: 900 }}>
                        {formatTime(punch.firstIn)} →{" "}
                        {formatTime(punch.lastOut)}
                      </Typography>
                      <Typography
                        color="text.secondary"
                        sx={{ fontWeight: 900 }}
                      >
                        {minutesToHM(punch.minutes)}
                      </Typography>
                    </Stack>
                  </Paper>
                ) : (
                  <Typography color="text.secondary">
                    No attendance records for this day.
                  </Typography>
                )}

                {rows.length > 0 ? (
                  <Stack spacing={1}>
                    {rows.map((r, idx) => {
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
                      const canEvidence =
                        Boolean(r.id) &&
                        !(inMethod === "machine" && outMethod === "machine");
                      return (
                        <Paper
                          key={`${String(r.id || "row")}-${idx}`}
                          elevation={0}
                          sx={{
                            border: "1px solid",
                            borderColor: alpha(theme.palette.text.primary, 0.1),
                            borderRadius: 3,
                            p: 1.5,
                          }}
                        >
                          <Stack spacing={1}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1}
                              alignItems={{ sm: "center" }}
                              justifyContent="space-between"
                            >
                              <Typography sx={{ fontWeight: 900 }}>
                                #{idx + 1} • {formatTime(r.clock_in)} →{" "}
                                {r.clock_out ? formatTime(r.clock_out) : "—"}
                              </Typography>
                              <Typography
                                color="text.secondary"
                                sx={{ fontWeight: 900 }}
                              >
                                {minutesToHM(Number(r.duration_minutes || 0))}
                              </Typography>
                            </Stack>

                            <Stack
                              direction="row"
                              spacing={0.75}
                              flexWrap="wrap"
                              useFlexGap
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
                              {canEvidence ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<VisibilityRounded />}
                                  onClick={() => void openEvidence(r)}
                                  sx={{ borderRadius: 2, fontWeight: 900 }}
                                >
                                  Evidence
                                </Button>
                              ) : null}
                            </Stack>

                            {inHasGeo || outHasGeo ? (
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
                                    {r.clock_in_accuracy_m
                                      ? ` (${r.clock_in_accuracy_m}m)`
                                      : ""}
                                  </Typography>
                                ) : null}
                                {outHasGeo ? (
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
                                    {r.clock_out_accuracy_m
                                      ? ` (${r.clock_out_accuracy_m}m)`
                                      : ""}
                                  </Typography>
                                ) : null}
                              </Stack>
                            ) : null}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                ) : null}
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDay}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!dayDate) return;
              closeDay();
              openApplyForDate(dayDate);
            }}
            disabled={!dayDate}
          >
            Apply Leave
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={evidenceOpen}
        onClose={evidenceBusy ? undefined : closeEvidence}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          Evidence{evidenceFor?.id ? ` • #${String(evidenceFor.id)}` : ""}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {evidenceError ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {evidenceError}
              </Alert>
            ) : null}
            {evidenceBusy ? (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <CircularProgress size={20} />
                <Typography color="text.secondary" sx={{ fontWeight: 900 }}>
                  Loading…
                </Typography>
              </Stack>
            ) : null}
            {!evidenceBusy && evidenceItems.length === 0 && !evidenceError ? (
              <Typography color="text.secondary">No evidence found.</Typography>
            ) : null}
            {evidenceItems.map((ev) => {
              const hasGeo =
                typeof ev.latitude === "number" &&
                typeof ev.longitude === "number";
              return (
                <Paper
                  key={String(ev.id)}
                  elevation={0}
                  sx={{
                    border: "1px solid",
                    borderColor: alpha(theme.palette.text.primary, 0.1),
                    borderRadius: 3,
                    p: 1.5,
                  }}
                >
                  <Stack spacing={1.25}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ sm: "center" }}
                      justifyContent="space-between"
                    >
                      <Typography sx={{ fontWeight: 900 }}>
                        {String(ev.event_type || "event")} •{" "}
                        {String(ev.modality || "biometric")}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontWeight: 900 }}
                      >
                        {formatTime(ev.created_at)}
                      </Typography>
                    </Stack>
                    {hasGeo ? (
                      <Typography
                        variant="body2"
                        component="a"
                        href={mapsUrl(
                          ev.latitude as number,
                          ev.longitude as number
                        )}
                        target="_blank"
                        rel="noreferrer"
                        sx={{
                          color: "primary.main",
                          textDecoration: "none",
                          fontWeight: 800,
                        }}
                      >
                        {formatLatLng(ev.latitude, ev.longitude)}
                        {ev.accuracy_m ? ` (${ev.accuracy_m}m)` : ""}
                      </Typography>
                    ) : null}
                    {ev.image_data_url ? (
                      <Box
                        component="img"
                        src={ev.image_data_url}
                        alt="Evidence"
                        sx={{
                          width: "100%",
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: alpha(theme.palette.text.primary, 0.12),
                          display: "block",
                        }}
                      />
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEvidence} disabled={evidenceBusy}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
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
      <Dialog
        open={biometricOpen}
        onClose={biometricBusy ? undefined : closeBiometric}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {biometricAction === "enroll"
            ? "Enroll Biometrics"
            : biometricAction === "clock_in"
            ? "Clock In (Biometric)"
            : "Clock Out (Biometric)"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {biometricError ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {biometricError}
              </Alert>
            ) : null}
            <TextField
              select
              label="Modality"
              value={biometricModality}
              onChange={(e) =>
                setBiometricModality(e.target.value as BiometricModality)
              }
            >
              <MenuItem value="face">Face (Selfie)</MenuItem>
              <MenuItem value="fingerprint">Fingerprint (Image)</MenuItem>
            </TextField>

            {biometricModality === "face" ? (
              <Stack spacing={1.25}>
                <Box
                  sx={{
                    width: "100%",
                    bgcolor: "background.default",
                    borderRadius: 2,
                    overflow: "hidden",
                    border: "1px solid",
                    borderColor: alpha(theme.palette.text.primary, 0.12),
                  }}
                >
                  <Box
                    component="video"
                    ref={biometricVideoRef}
                    muted
                    playsInline
                    autoPlay
                    sx={{ width: "100%", display: "block" }}
                  />
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="outlined"
                    onClick={() => void startBiometricCamera()}
                    disabled={biometricBusy}
                    sx={{ borderRadius: 2, fontWeight: 900 }}
                  >
                    Start Camera
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={stopBiometricCamera}
                    disabled={biometricBusy}
                    sx={{ borderRadius: 2, fontWeight: 900 }}
                  >
                    Stop Camera
                  </Button>
                  <Button
                    variant="contained"
                    onClick={captureBiometricSelfie}
                    disabled={biometricBusy}
                    sx={{ borderRadius: 2, fontWeight: 900 }}
                  >
                    Take Selfie
                  </Button>
                  <Button
                    component="label"
                    variant="outlined"
                    disabled={biometricBusy}
                    sx={{ borderRadius: 2, fontWeight: 900 }}
                  >
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) =>
                        onPickBiometricFile(e.target.files?.[0] || null)
                      }
                    />
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Button
                component="label"
                variant="outlined"
                disabled={biometricBusy}
                sx={{ borderRadius: 2, fontWeight: 900 }}
              >
                Upload Fingerprint Image
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) =>
                    onPickBiometricFile(e.target.files?.[0] || null)
                  }
                />
              </Button>
            )}

            {biometricImage ? (
              <Box
                component="img"
                src={biometricImage}
                alt="Biometric"
                sx={{
                  width: "100%",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: alpha(theme.palette.text.primary, 0.12),
                }}
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeBiometric} disabled={biometricBusy}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitBiometric()}
            disabled={biometricBusy || !biometricImage}
          >
            {biometricBusy
              ? "Please wait…"
              : biometricAction === "enroll"
              ? "Enroll"
              : biometricAction === "clock_in"
              ? "Clock In"
              : "Clock Out"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
