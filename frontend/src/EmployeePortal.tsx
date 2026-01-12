import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Alert,
  alpha,
  Avatar,
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

type LeaveType = {
  id?: string | number;
  code: string;
  name: string;
  is_paid?: number | boolean;
  requires_document?: number | boolean;
  active?: number | boolean;
  sort_order?: number;
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

type BiometricModality = "face";
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
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
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

  const selectableLeaveTypes = useMemo<LeaveType[]>(() => {
    const normalized = leaveTypes
      .map((t) => ({
        ...t,
        code: String(t.code || "").trim(),
        name: String(t.name || "").trim(),
      }))
      .filter((t) => t.code !== "" && t.name !== "");
    if (normalized.length > 0) return normalized;
    return [
      { code: "casual", name: "Casual" },
      { code: "sick", name: "Sick" },
      { code: "annual", name: "Annual" },
      { code: "unpaid", name: "Unpaid" },
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

  const [dayOpen, setDayOpen] = useState(false);
  const [dayDate, setDayDate] = useState("");
  const [dayRows, setDayRows] = useState<AttendanceRow[]>([]);

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceFor, setEvidenceFor] = useState<AttendanceRow | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);

  const lastRefreshAtRef = useRef(0);
  const profilePhotoUrlRef = useRef<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  const role = useMemo(() => {
    return String(me?.user?.role || "");
  }, [me]);

  const canEnrollBiometrics = useMemo(() => {
    if (!role) return false;
    return role !== "employee" && role !== "superadmin";
  }, [role]);

  const canEditOwnProfile = useMemo(() => {
    return role === "employee";
  }, [role]);

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editProfileBusy, setEditProfileBusy] = useState(false);
  const [editProfileError, setEditProfileError] = useState("");
  const [editProfileOk, setEditProfileOk] = useState("");
  const [editProfileForm, setEditProfileForm] = useState<{
    email: string;
    personal_phone: string;
    present_address: string;
    permanent_address: string;
  }>({
    email: "",
    personal_phone: "",
    present_address: "",
    permanent_address: "",
  });

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

  const fetchLeaveTypes = useCallback(async () => {
    try {
      const res = await api.get("/api/leave_types");
      setLeaveTypes(
        Array.isArray(res.data?.leave_types)
          ? (res.data.leave_types as LeaveType[])
          : []
      );
    } catch {
      setLeaveTypes([]);
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
    if (!canEnrollBiometrics) {
      setClockMsg({
        type: "error",
        message: "Only tenant users can enroll biometrics.",
      });
      return;
    }
    setBiometricAction("enroll");
    setBiometricImage("");
    setBiometricError("");
    setBiometricOpen(true);
  }, [canEnrollBiometrics]);

  const openClockBiometric = useCallback((type: "in" | "out") => {
    setBiometricAction(type === "in" ? "clock_in" : "clock_out");
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

  const refreshProfilePhoto = useCallback(async () => {
    if (!employeeId) {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
      setProfilePhotoUrl(null);
      return;
    }
    try {
      const res = await api.get("/api/me/profile_photo", {
        responseType: "blob",
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
      });
      if (res.status === 404 || !res.data) {
        if (profilePhotoUrlRef.current) {
          URL.revokeObjectURL(profilePhotoUrlRef.current);
          profilePhotoUrlRef.current = null;
        }
        setProfilePhotoUrl(null);
        return;
      }
      const blob = res.data as Blob;
      if (!blob.size) {
        if (profilePhotoUrlRef.current) {
          URL.revokeObjectURL(profilePhotoUrlRef.current);
          profilePhotoUrlRef.current = null;
        }
        setProfilePhotoUrl(null);
        return;
      }
      const nextUrl = URL.createObjectURL(blob);
      if (profilePhotoUrlRef.current)
        URL.revokeObjectURL(profilePhotoUrlRef.current);
      profilePhotoUrlRef.current = nextUrl;
      setProfilePhotoUrl(nextUrl);
    } catch {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
      setProfilePhotoUrl(null);
    }
  }, [employeeId]);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    void fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  useEffect(() => {
    if (selectableLeaveTypes.length === 0) return;
    const codes = new Set(
      selectableLeaveTypes.map((t) => String(t.code || ""))
    );
    setApplyForm((p) => {
      const cur = String(p.leave_type || "").trim();
      const next = codes.has(cur)
        ? cur
        : String(selectableLeaveTypes[0]?.code || "");
      if (!next || cur === next) return p;
      return { ...p, leave_type: next };
    });
  }, [selectableLeaveTypes]);

  useEffect(() => {
    if (!employeeId) return;
    void fetchEmployeeMonth();
    void refreshOpenShift();
    void refreshProfilePhoto();
  }, [employeeId, fetchEmployeeMonth, refreshOpenShift, refreshProfilePhoto]);

  useEffect(() => {
    if (!employeeId) return;
    void fetchEmployeeMonth();
  }, [employeeId, fetchEmployeeMonth, monthStr]);

  useEffect(() => {
    return () => {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
    };
  }, []);

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
        if (!canEnrollBiometrics) {
          setBiometricError("Only tenant users can enroll biometrics.");
          return;
        }
        await api.post("/api/biometrics/enroll", {
          employee_id: employeeId,
          biometric_modality: "face",
          biometric_image: biometricImage,
        });
        setClockMsg({ type: "success", message: "Biometric enrolled" });
        closeBiometric();
        return;
      }

      const geo = await getBiometricGeo();
      const ok = await clock(biometricAction === "clock_in" ? "in" : "out", {
        modality: "face",
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
    canEnrollBiometrics,
    clock,
    closeBiometric,
    employeeId,
    getBiometricGeo,
  ]);

  const openEditProfile = useCallback(() => {
    setEditProfileError("");
    setEditProfileOk("");
    setEditProfileForm({
      email: String(me?.employee?.email || ""),
      personal_phone: String(me?.employee?.personal_phone || ""),
      present_address: String(me?.employee?.present_address || ""),
      permanent_address: String(me?.employee?.permanent_address || ""),
    });
    setEditProfileOpen(true);
  }, [me]);

  const closeEditProfile = useCallback(() => {
    setEditProfileOpen(false);
    setEditProfileBusy(false);
  }, []);

  const submitEditProfile = useCallback(async () => {
    setEditProfileBusy(true);
    setEditProfileError("");
    setEditProfileOk("");
    try {
      const payload = {
        email: editProfileForm.email,
        personal_phone: editProfileForm.personal_phone,
        present_address: editProfileForm.present_address,
        permanent_address: editProfileForm.permanent_address,
      };
      const res = await api.post("/api/me/update", payload);
      const updated = res.data?.employee || null;
      if (updated) {
        setMe((prev) => {
          if (!prev) return prev;
          return { ...prev, employee: updated as MeResponse["employee"] };
        });
      }
      setEditProfileOk("Profile updated");
      setEditProfileOpen(false);
    } catch (err: unknown) {
      setEditProfileError(getErrorMessage(err, "Failed to update profile"));
    } finally {
      setEditProfileBusy(false);
    }
  }, [editProfileForm]);

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
    const base = { fontWeight: 700, border: "1px solid" } as const;
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

  const panelCardSx = useMemo(
    () =>
      ({
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        bgcolor: "background.paper",
      } as const),
    []
  );

  const recentAttendance = useMemo(() => {
    const list = attendance
      .slice()
      .sort((a, b) =>
        String(b.clock_in || "").localeCompare(String(a.clock_in || ""))
      );
    return list.slice(0, 6);
  }, [attendance]);

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
          bgcolor: "background.default",
        }}
      >
        <Container maxWidth="xl" sx={{ pb: 4 }}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 4 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <CircularProgress size={22} />
              <Typography sx={{ fontWeight: 700 }}>Loading portal…</Typography>
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
          bgcolor: "background.default",
        }}
      >
        <Container maxWidth="xl" sx={{ pb: 4 }}>
          <Alert severity="error" sx={{ borderRadius: 2 }}>
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
          bgcolor: "background.default",
        }}
      >
        <Container maxWidth="xl" sx={{ pb: 4 }}>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
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
        bgcolor: "background.default",
      }}
    >
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Stack spacing={2.5}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(0, 1fr) 420px",
                xl: "minmax(0, 1fr) 460px",
              },
              gap: 2,
              alignItems: "stretch",
            }}
          >
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 3,
                p: { xs: 2, sm: 2.5 },
                height: "100%",
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                  gap: 2,
                  alignItems: "center",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ minWidth: 0 }}
                >
                  <Avatar
                    variant="circular"
                    src={profilePhotoUrl || undefined}
                    sx={{
                      width: 44,
                      height: 44,
                      fontWeight: 700,
                      bgcolor: "primary.main",
                      border: "1px solid",
                      borderColor: "divider",
                      flex: "0 0 auto",
                    }}
                  >
                    {initials}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }} noWrap>
                      {displayName}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      noWrap
                      sx={{ fontWeight: 500 }}
                    >
                      {me?.employee?.designation
                        ? `${me.employee.designation} • `
                        : ""}
                      {me?.employee?.department
                        ? `${me.employee.department} • `
                        : ""}
                      {me?.employee?.code ? `Code: ${me.employee.code}` : ""}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      noWrap
                      sx={{ fontWeight: 500 }}
                    >
                      {me?.employee?.shift_name
                        ? `Shift: ${me.employee.shift_name}`
                        : "Shift: —"}
                      {workingDays ? ` • ${workingDays}` : ""}
                    </Typography>
                  </Box>
                </Stack>

                <Stack
                  spacing={1}
                  alignItems={{ xs: "flex-start", md: "flex-end" }}
                >
                  <Chip
                    size="small"
                    icon={<AccessTimeRounded fontSize="small" />}
                    label={
                      openShift === null
                        ? "Shift: Unknown"
                        : openShift
                        ? "Shift: Open"
                        : "Shift: Closed"
                    }
                    color={
                      openShift === null
                        ? "default"
                        : openShift
                        ? "success"
                        : "warning"
                    }
                    variant="outlined"
                    sx={{ fontWeight: 700 }}
                  />
                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                    justifyContent={{ xs: "flex-start", md: "flex-end" }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<RefreshRounded />}
                      onClick={() => {
                        void fetchEmployeeMonth();
                        void refreshOpenShift();
                        void refreshProfilePhoto();
                      }}
                      disabled={statsLoading || clockBusy}
                      sx={{ borderRadius: 2, fontWeight: 700 }}
                    >
                      Refresh
                    </Button>
                    {canEditOwnProfile ? (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={openEditProfile}
                        disabled={editProfileBusy || statsLoading}
                        sx={{ borderRadius: 2, fontWeight: 700 }}
                      >
                        Edit Profile
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => setApplyOpen(true)}
                      disabled={applyBusy || statsLoading}
                      sx={{ borderRadius: 2, fontWeight: 700 }}
                    >
                      Apply Leave
                    </Button>
                  </Stack>
                </Stack>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                  gap: 2,
                  alignItems: { md: "center" },
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ flexWrap: "wrap" }}
                >
                  {canEnrollBiometrics ? (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={openEnrollBiometric}
                      disabled={clockBusy || biometricBusy}
                      sx={{ borderRadius: 2, fontWeight: 700 }}
                    >
                      Enroll Biometrics
                    </Button>
                  ) : null}
                  {showClockIn && (
                    <Button
                      size="small"
                      color="success"
                      variant="contained"
                      startIcon={<LoginRounded />}
                      onClick={() => openClockBiometric("in")}
                      disabled={clockBusy || biometricBusy}
                      sx={{ borderRadius: 2, fontWeight: 700 }}
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
                      sx={{ borderRadius: 2, fontWeight: 700 }}
                    >
                      Clock Out
                    </Button>
                  )}
                </Stack>
                <Stack direction="row" justifyContent={{ md: "flex-end" }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={monthLabel}
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              </Box>

              {clockMsg && (
                <Alert severity={clockMsg.type} sx={{ mt: 2, borderRadius: 2 }}>
                  {clockMsg.message}
                </Alert>
              )}
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                borderRadius: 3,
                p: { xs: 1.5, sm: 2 },
                height: "100%",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexWrap: "nowrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: { xs: 1, sm: 1.25 },
                  overflowX: { xs: "auto", lg: "hidden" },
                }}
              >
                <Stack
                  spacing={0.75}
                  alignItems="center"
                  sx={{ flex: "1 1 0", minWidth: 100 }}
                >
                  <Box
                    sx={{
                      width: { xs: 52, sm: 62 },
                      height: { xs: 52, sm: 62 },
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid",
                      borderColor: "divider",
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      flex: "0 0 auto",
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 900, lineHeight: 1 }}
                    >
                      {attendanceByDate.size}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Days Present
                  </Typography>
                </Stack>

                <Stack
                  spacing={0.75}
                  alignItems="center"
                  sx={{ flex: "1 1 0", minWidth: 100 }}
                >
                  <Box
                    sx={{
                      width: { xs: 52, sm: 62 },
                      height: { xs: 52, sm: 62 },
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid",
                      borderColor: "divider",
                      bgcolor: alpha(theme.palette.success.main, 0.1),
                      flex: "0 0 auto",
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 900, lineHeight: 1 }}
                    >
                      {leaveTotals ? leaveTotals.total : "—"}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Leaves
                  </Typography>
                </Stack>

                <Stack
                  spacing={0.75}
                  alignItems="center"
                  sx={{ flex: "1 1 0", minWidth: 100 }}
                >
                  <Box
                    sx={{
                      width: { xs: 52, sm: 62 },
                      height: { xs: 52, sm: 62 },
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid",
                      borderColor: "divider",
                      bgcolor: alpha(theme.palette.warning.main, 0.12),
                      flex: "0 0 auto",
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 900, lineHeight: 1 }}
                    >
                      {holidays.length}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Holidays
                  </Typography>
                </Stack>

                <Stack
                  spacing={0.75}
                  alignItems="center"
                  sx={{ flex: "1 1 0", minWidth: 120 }}
                >
                  <Box
                    sx={{
                      width: { xs: 52, sm: 62 },
                      height: { xs: 52, sm: 62 },
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid",
                      borderColor: "divider",
                      bgcolor: alpha(theme.palette.info.main, 0.1),
                      flex: "0 0 auto",
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 900, lineHeight: 1 }}
                    >
                      {leaves.length}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Leave Requests
                  </Typography>
                </Stack>
              </Box>
            </Paper>
          </Box>

          <Paper
            variant="outlined"
            sx={{
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="fullWidth"
              sx={{
                px: 2,
                pt: 1,
                pb: 0,
                "& .MuiTab-root": {
                  textTransform: "none",
                  fontWeight: 700,
                  minHeight: 48,
                },
                "& .MuiTab-root.Mui-selected": {
                  color: theme.palette.primary.dark,
                },
              }}
              TabIndicatorProps={{ style: { height: 2 } }}
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
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1.2fr 0.8fr" },
                    gap: 2,
                    alignItems: "start",
                  }}
                >
                  <Stack spacing={2}>
                    <Paper elevation={0} sx={{ ...panelCardSx, p: 2 }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                        alignItems={{ sm: "center" }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800 }}>
                            Monthly Overview
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Attendance, leaves, holidays, and totals.
                          </Typography>
                        </Box>
                        <Chip
                          label={monthLabel}
                          sx={{
                            fontWeight: 800,
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                            color: theme.palette.primary.dark,
                          }}
                        />
                      </Stack>

                      <Box
                        sx={{
                          mt: 2,
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
                          gap: 1.25,
                        }}
                      >
                        <Paper
                          elevation={0}
                          sx={{
                            border: "1px solid",
                            borderColor: alpha(theme.palette.text.primary, 0.1),
                            borderRadius: 3.5,
                            p: 1.5,
                            bgcolor: alpha(theme.palette.success.main, 0.08),
                          }}
                        >
                          <Typography variant="overline" color="text.secondary">
                            Days Present
                          </Typography>
                          <Typography
                            sx={{
                              fontWeight: 800,
                              fontSize: 24,
                              lineHeight: 1.1,
                            }}
                          >
                            {attendanceByDate.size}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            With punches
                          </Typography>
                        </Paper>

                        <Paper
                          elevation={0}
                          sx={{
                            border: "1px solid",
                            borderColor: alpha(theme.palette.text.primary, 0.1),
                            borderRadius: 3.5,
                            p: 1.5,
                            bgcolor: alpha(theme.palette.warning.main, 0.09),
                          }}
                        >
                          <Typography variant="overline" color="text.secondary">
                            Leaves
                          </Typography>
                          <Typography
                            sx={{
                              fontWeight: 800,
                              fontSize: 24,
                              lineHeight: 1.1,
                            }}
                          >
                            {leaveTotals ? leaveTotals.total : "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {leaveTotals
                              ? `${leaveTotals.paid} paid • ${leaveTotals.unpaid} unpaid`
                              : "Totals unavailable"}
                          </Typography>
                        </Paper>

                        <Paper
                          elevation={0}
                          sx={{
                            border: "1px solid",
                            borderColor: alpha(theme.palette.text.primary, 0.1),
                            borderRadius: 3.5,
                            p: 1.5,
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                          }}
                        >
                          <Typography variant="overline" color="text.secondary">
                            Holidays
                          </Typography>
                          <Typography
                            sx={{
                              fontWeight: 800,
                              fontSize: 24,
                              lineHeight: 1.1,
                            }}
                          >
                            {holidays.length}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            In this month
                          </Typography>
                        </Paper>
                      </Box>
                    </Paper>

                    <Paper elevation={0} sx={{ ...panelCardSx, p: 2 }}>
                      <Typography sx={{ fontWeight: 800, mb: 1 }}>
                        Recent Attendance
                      </Typography>
                      {recentAttendance.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No attendance records to show.
                        </Typography>
                      ) : (
                        <Stack spacing={1}>
                          {recentAttendance.map((r) => {
                            const inMethod = normalizeMethod(r.clock_in_method);
                            const outMethod = normalizeMethod(
                              r.clock_out_method
                            );
                            const inHasGeo =
                              typeof r.clock_in_lat === "number" &&
                              typeof r.clock_in_lng === "number";
                            const outHasGeo =
                              typeof r.clock_out_lat === "number" &&
                              typeof r.clock_out_lng === "number";
                            return (
                              <Paper
                                key={String(r.id || `${r.date}-${r.clock_in}`)}
                                elevation={0}
                                sx={{
                                  border: "1px solid",
                                  borderColor: alpha(
                                    theme.palette.text.primary,
                                    0.1
                                  ),
                                  borderRadius: 3.5,
                                  p: 1.5,
                                  bgcolor: alpha(
                                    theme.palette.background.paper,
                                    0.78
                                  ),
                                }}
                              >
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  alignItems={{ sm: "center" }}
                                >
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 800 }} noWrap>
                                      {r.date} • {formatTime(r.clock_in)} →{" "}
                                      {r.clock_out
                                        ? formatTime(r.clock_out)
                                        : "—"}
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                      noWrap
                                    >
                                      {minutesToHM(
                                        Number(r.duration_minutes || 0)
                                      )}
                                    </Typography>
                                  </Box>
                                  <Stack
                                    direction="row"
                                    spacing={0.75}
                                    flexWrap="wrap"
                                    useFlexGap
                                    sx={{ justifyContent: "flex-end" }}
                                  >
                                    <Chip
                                      size="small"
                                      label={`IN: ${methodLabel(inMethod)}`}
                                      sx={chipSx.neutral}
                                    />
                                    <Chip
                                      size="small"
                                      label={`OUT: ${methodLabel(outMethod)}`}
                                      sx={chipSx.neutral}
                                    />
                                    {(inHasGeo || outHasGeo) && (
                                      <Chip
                                        size="small"
                                        label="Geo"
                                        sx={{
                                          fontWeight: 700,
                                          bgcolor: alpha(
                                            theme.palette.primary.main,
                                            0.12
                                          ),
                                          color: theme.palette.primary.dark,
                                          border: "1px solid",
                                          borderColor: alpha(
                                            theme.palette.primary.main,
                                            0.24
                                          ),
                                        }}
                                      />
                                    )}
                                  </Stack>
                                </Stack>
                              </Paper>
                            );
                          })}
                        </Stack>
                      )}
                    </Paper>
                  </Stack>

                  <Stack spacing={2}>
                    <Paper elevation={0} sx={{ ...panelCardSx, p: 2 }}>
                      <Typography sx={{ fontWeight: 800, mb: 1 }}>
                        Profile
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                          gap: 1.25,
                        }}
                      >
                        {[
                          { k: "Employee", v: displayName },
                          { k: "Code", v: me?.employee?.code || "—" },
                          {
                            k: "Department",
                            v: me?.employee?.department || "—",
                          },
                          {
                            k: "Designation",
                            v: me?.employee?.designation || "—",
                          },
                          {
                            k: "Employee Type",
                            v: me?.employee?.employee_type || "—",
                          },
                          { k: "Status", v: me?.employee?.status || "—" },
                        ].map((it) => (
                          <Paper
                            key={it.k}
                            elevation={0}
                            sx={{
                              border: "1px solid",
                              borderColor: alpha(
                                theme.palette.text.primary,
                                0.1
                              ),
                              borderRadius: 3,
                              p: 1.5,
                              bgcolor: alpha(
                                theme.palette.background.paper,
                                0.78
                              ),
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontWeight: 700 }}
                            >
                              {it.k}
                            </Typography>
                            <Typography sx={{ fontWeight: 800 }} noWrap>
                              {String(it.v || "—")}
                            </Typography>
                          </Paper>
                        ))}
                      </Box>
                    </Paper>

                    <Paper elevation={0} sx={{ ...panelCardSx, p: 2 }}>
                      <Typography sx={{ fontWeight: 800, mb: 1 }}>
                        Contact & Work
                      </Typography>
                      <Stack spacing={1}>
                        {[
                          { k: "Email", v: me?.employee?.email || "—" },
                          {
                            k: "Phone",
                            v: me?.employee?.personal_phone || "—",
                          },
                          {
                            k: "Supervisor",
                            v: me?.employee?.supervisor_name || "—",
                          },
                          {
                            k: "Work Location",
                            v: me?.employee?.work_location || "—",
                          },
                          {
                            k: "Date of Joining",
                            v: me?.employee?.date_of_joining || "—",
                          },
                        ].map((it) => (
                          <Stack
                            key={it.k}
                            direction="row"
                            spacing={1.5}
                            alignItems="baseline"
                          >
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ fontWeight: 700, minWidth: 130 }}
                            >
                              {it.k}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 700, minWidth: 0 }}
                              noWrap
                            >
                              {String(it.v || "—")}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Paper>
                  </Stack>
                </Box>
              )}

              {tab === 0 && (
                <Stack spacing={2}>
                  <Paper elevation={0} sx={{ ...panelCardSx, p: 1.5 }}>
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
                        sx={{ borderRadius: 2, fontWeight: 700 }}
                      >
                        Prev
                      </Button>
                      <Box sx={{ flex: 1, textAlign: "center" }}>
                        <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                          {monthLabel}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {monthStr}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setMonth(new Date())}
                        sx={{ borderRadius: 2, fontWeight: 700 }}
                      >
                        Today
                      </Button>
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
                        sx={{ borderRadius: 2, fontWeight: 700 }}
                      >
                        Next
                      </Button>
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ ...panelCardSx, p: 1.5 }}>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        gap: { xs: 0.5, sm: 1 },
                        px: { xs: 0, sm: 0.5 },
                        pb: { xs: 0.5, sm: 1 },
                      }}
                    >
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (w) => (
                          <Box
                            key={w}
                            sx={{
                              py: { xs: 0.5, sm: 0.75 },
                              textAlign: "center",
                              color: "text.secondary",
                              letterSpacing: 0.6,
                              textTransform: "uppercase",
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                fontSize: { xs: 10, sm: 12 },
                              }}
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
                        gap: { xs: 0.5, sm: 1 },
                        p: { xs: 0.25, sm: 0.5 },
                      }}
                    >
                      {calendarGrid.cells.map((cell, idx) => {
                        if (!cell) {
                          return (
                            <Box
                              key={`empty-${idx}`}
                              sx={{
                                minHeight: { xs: 58, sm: 84, md: 98 },
                                borderRadius: { xs: 2.5, sm: 3 },
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
                          ? { label: "Leave", sx: chipSx.ok }
                          : pendingLeave
                          ? { label: "Pending", sx: chipSx.warn }
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
                          ? `${formatLeaveTypeLabel(
                              leaveList[0]?.leave_type
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
                              borderRadius: { xs: 2.5, sm: 3 },
                              overflow: "hidden",
                              border: "1px solid",
                              borderColor: "divider",
                              bgcolor: alpha(
                                theme.palette.background.paper,
                                0.92
                              ),
                              transition: "border-color 140ms ease",
                              "&:hover": {
                                borderColor: alpha(
                                  theme.palette.primary.main,
                                  0.2
                                ),
                              },
                            }}
                          >
                            <Box
                              sx={{
                                minHeight: { xs: 58, sm: 84, md: 98 },
                                p: { xs: 0.75, sm: 1.25 },
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
                                    minHeight: { xs: 58, sm: 84, md: 98 },
                                    display: "grid",
                                    placeItems: "center",
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      fontWeight: 800,
                                      fontSize: { xs: 18, sm: 24 },
                                      letterSpacing: -0.3,
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
                                    minHeight: { xs: 58, sm: 84, md: 98 },
                                  }}
                                >
                                  <Box
                                    sx={{
                                      position: "absolute",
                                      top: { xs: 6, sm: 10 },
                                      left: { xs: 6, sm: 10 },
                                      width: { xs: 22, sm: 26 },
                                      height: { xs: 22, sm: 26 },
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
                                      sx={{ fontWeight: 700, lineHeight: 1 }}
                                    >
                                      {cell.day}
                                    </Typography>
                                  </Box>

                                  {isPresent ? (
                                    <Box
                                      sx={{
                                        position: "absolute",
                                        top: { xs: 6, sm: 10 },
                                        right: { xs: 6, sm: 10 },
                                        px: 0.9,
                                        py: 0.2,
                                        borderRadius: 999,
                                        ...badge.sx,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 700,
                                          fontSize: { xs: 10, sm: 12 },
                                        }}
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
                                        display: { xs: "none", sm: "flex" },
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
                                              fontWeight: 700,
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
                                            fontWeight: 700,
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
                                            fontWeight: 700,
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
                                          fontWeight: 800,
                                          fontSize: isPresent
                                            ? { xs: 14, sm: 18 }
                                            : { xs: 13, sm: 16 },
                                          letterSpacing: -0.3,
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
                                          fontWeight: 700,
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
                                        fontWeight: 700,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 700, lineHeight: 1 }}
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
                                        sx={{ fontWeight: 700 }}
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
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                    gap: 2,
                    alignItems: "start",
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{ ...panelCardSx, p: 1.5, gridColumn: "1 / -1" }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      alignItems={{ sm: "center" }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ flex: 1 }}
                      >
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
                          sx={{ borderRadius: 2, fontWeight: 700 }}
                        >
                          Prev
                        </Button>
                        <Box sx={{ flex: 1, textAlign: "center" }}>
                          <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>
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
                          sx={{ borderRadius: 2, fontWeight: 700 }}
                        >
                          Next
                        </Button>
                      </Stack>

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
                            sx={{ borderRadius: 2, fontWeight: 700 }}
                          >
                            {b.label}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                    >
                      <Paper
                        elevation={0}
                        sx={{
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 3,
                          p: 1.5,
                          bgcolor: alpha(theme.palette.warning.main, 0.08),
                          flex: 1,
                        }}
                      >
                        <Typography variant="overline" color="text.secondary">
                          Leave Totals
                        </Typography>
                        <Typography sx={{ fontWeight: 800 }}>
                          {leaveTotals ? `${leaveTotals.total} total` : "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {leaveTotals
                            ? `${leaveTotals.paid} paid • ${leaveTotals.unpaid} unpaid`
                            : "Totals unavailable"}
                        </Typography>
                      </Paper>

                      <Paper
                        elevation={0}
                        sx={{
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 3,
                          p: 1.5,
                          bgcolor: alpha(theme.palette.text.primary, 0.03),
                          flex: 1,
                        }}
                      >
                        <Typography variant="overline" color="text.secondary">
                          Requests Loaded
                        </Typography>
                        <Typography sx={{ fontWeight: 800 }}>
                          {leaves.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Records in this month
                        </Typography>
                      </Paper>
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ ...panelCardSx, p: 2 }}>
                    <Typography sx={{ fontWeight: 800, mb: 1 }}>
                      Upcoming ({leavesUpcoming.length})
                    </Typography>
                    {filteredLeaves.length === 0 ||
                    leavesUpcoming.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No upcoming leaves.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {leavesUpcoming.map((l) => {
                          const status = String(l.status || "pending")
                            .toLowerCase()
                            .trim();
                          const dayName = new Date(
                            `${l.date}T00:00:00`
                          ).toLocaleDateString("default", { weekday: "short" });
                          return (
                            <Paper
                              key={String(l.id)}
                              elevation={0}
                              sx={{
                                border: "1px solid",
                                borderColor: "divider",
                                borderRadius: 3,
                                p: 1.5,
                                bgcolor: alpha(
                                  theme.palette.background.paper,
                                  0.78
                                ),
                                transition: "border-color 140ms ease",
                                "&:hover": {
                                  borderColor: alpha(
                                    theme.palette.primary.main,
                                    0.2
                                  ),
                                },
                              }}
                            >
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1.5}
                                alignItems={{ sm: "center" }}
                              >
                                <Box sx={{ flex: 1 }}>
                                  <Typography sx={{ fontWeight: 800 }}>
                                    {l.date} • {dayName}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    {formatLeaveTypeLabel(l.leave_type)} •{" "}
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
                                      ? chipSx.ok
                                      : status === "rejected"
                                      ? chipSx.error
                                      : status === "pending"
                                      ? chipSx.warn
                                      : chipSx.neutral),
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 700 }}
                                  >
                                    {String(l.status || "pending")}
                                  </Typography>
                                </Box>
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    )}
                  </Paper>

                  <Paper elevation={0} sx={{ ...panelCardSx, p: 2 }}>
                    <Typography sx={{ fontWeight: 800, mb: 1 }}>
                      Past ({leavesPast.length})
                    </Typography>
                    {filteredLeaves.length === 0 || leavesPast.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No past leaves.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {leavesPast
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
                                  borderColor: "divider",
                                  borderRadius: 3,
                                  p: 1.5,
                                  bgcolor: alpha(
                                    theme.palette.background.paper,
                                    0.78
                                  ),
                                  transition: "border-color 140ms ease",
                                  "&:hover": {
                                    borderColor: alpha(
                                      theme.palette.primary.main,
                                      0.2
                                    ),
                                  },
                                }}
                              >
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1.5}
                                  alignItems={{ sm: "center" }}
                                >
                                  <Box sx={{ flex: 1 }}>
                                    <Typography sx={{ fontWeight: 800 }}>
                                      {l.date} • {dayName}
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      {formatLeaveTypeLabel(l.leave_type)} •{" "}
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
                                        ? chipSx.ok
                                        : status === "rejected"
                                        ? chipSx.error
                                        : status === "pending"
                                        ? chipSx.warn
                                        : chipSx.neutral),
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 700 }}
                                    >
                                      {String(l.status || "pending")}
                                    </Typography>
                                  </Box>
                                </Stack>
                              </Paper>
                            );
                          })}
                      </Stack>
                    )}
                  </Paper>
                </Box>
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
        <DialogTitle sx={{ fontWeight: 800 }}>{dayDate || "Day"}</DialogTitle>
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
                    {`Leave • ${formatLeaveTypeLabel(
                      leaveList[0]?.leave_type
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
                      borderColor: "divider",
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
                      <Typography sx={{ fontWeight: 800 }}>
                        {formatTime(punch.firstIn)} →{" "}
                        {formatTime(punch.lastOut)}
                      </Typography>
                      <Typography
                        color="text.secondary"
                        sx={{ fontWeight: 700 }}
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
                            borderColor: "divider",
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
                              <Typography sx={{ fontWeight: 800 }}>
                                #{idx + 1} • {formatTime(r.clock_in)} →{" "}
                                {r.clock_out ? formatTime(r.clock_out) : "—"}
                              </Typography>
                              <Typography
                                color="text.secondary"
                                sx={{ fontWeight: 700 }}
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
                                  fontWeight: 700,
                                  bgcolor: "background.default",
                                }}
                              />
                              <Chip
                                size="small"
                                label={`OUT: ${
                                  r.clock_out ? methodLabel(outMethod) : "—"
                                }`}
                                sx={{
                                  fontWeight: 700,
                                  bgcolor: "background.default",
                                }}
                              />
                              {inMethod === "machine" &&
                              r.clock_in_device_id ? (
                                <Chip
                                  size="small"
                                  label={String(r.clock_in_device_id)}
                                  sx={{
                                    fontWeight: 700,
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
                                    fontWeight: 700,
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
                                  sx={{ borderRadius: 2, fontWeight: 700 }}
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
        <DialogTitle sx={{ fontWeight: 800 }}>
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
                <Typography color="text.secondary" sx={{ fontWeight: 700 }}>
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
                    borderColor: "divider",
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
                      <Typography sx={{ fontWeight: 800 }}>
                        {String(ev.event_type || "event")} •{" "}
                        {String(ev.modality || "biometric")}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontWeight: 700 }}
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
        open={editProfileOpen}
        onClose={editProfileBusy ? undefined : closeEditProfile}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Edit Profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {editProfileError ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {editProfileError}
              </Alert>
            ) : null}
            {editProfileOk ? (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {editProfileOk}
              </Alert>
            ) : null}
            <TextField
              label="Email"
              type="email"
              value={editProfileForm.email}
              onChange={(e) =>
                setEditProfileForm((p) => ({ ...p, email: e.target.value }))
              }
              disabled={editProfileBusy}
              fullWidth
            />
            <TextField
              label="Phone"
              value={editProfileForm.personal_phone}
              onChange={(e) =>
                setEditProfileForm((p) => ({
                  ...p,
                  personal_phone: e.target.value,
                }))
              }
              disabled={editProfileBusy}
              fullWidth
            />
            <TextField
              label="Present address"
              value={editProfileForm.present_address}
              onChange={(e) =>
                setEditProfileForm((p) => ({
                  ...p,
                  present_address: e.target.value,
                }))
              }
              disabled={editProfileBusy}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Permanent address"
              value={editProfileForm.permanent_address}
              onChange={(e) =>
                setEditProfileForm((p) => ({
                  ...p,
                  permanent_address: e.target.value,
                }))
              }
              disabled={editProfileBusy}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEditProfile} disabled={editProfileBusy}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitEditProfile()}
            disabled={editProfileBusy}
          >
            {editProfileBusy ? "Please wait…" : "Save"}
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
        <DialogTitle sx={{ fontWeight: 800 }}>Apply Leave</DialogTitle>
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
                {selectableLeaveTypes.map((t) => (
                  <MenuItem key={t.code} value={t.code}>
                    {t.name}
                  </MenuItem>
                ))}
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
        <DialogTitle sx={{ fontWeight: 800 }}>
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
                  sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  Start Camera
                </Button>
                <Button
                  variant="outlined"
                  onClick={stopBiometricCamera}
                  disabled={biometricBusy}
                  sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  Stop Camera
                </Button>
                <Button
                  variant="contained"
                  onClick={captureBiometricSelfie}
                  disabled={biometricBusy}
                  sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  Take Selfie
                </Button>
                <Button
                  component="label"
                  variant="outlined"
                  disabled={biometricBusy}
                  sx={{ borderRadius: 2, fontWeight: 700 }}
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
