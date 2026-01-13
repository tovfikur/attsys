import { useCallback, useEffect, useMemo, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  CloseRounded,
  PrintRounded,
  RefreshRounded,
} from "@mui/icons-material";

type DayKey = `${number}-${number}-${number}`;

type Employee = {
  id: string;
  name: string;
  code: string;
  status?: string;
  shift_name?: string;
  working_days?: string;
  created_at?: string;
};

type AttendanceRow = {
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
};

type LeaveRecord = {
  id?: string | number;
  employee_id?: string | number;
  date: string;
  leave_type?: string | null;
  day_part?: string | null;
  status?: string | null;
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

const formatMinutes = (minutes: number): string => {
  const safe = Math.max(0, Math.floor(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

const dayKeyToUtcMs = (day: DayKey): number => {
  const m = String(day).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d))
    return NaN;
  return Date.UTC(y, mo - 1, d);
};

const utcMsToDayKey = (ms: number): DayKey => {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as DayKey;
};

const listLastDaysInRange = (
  start: DayKey,
  end: DayKey,
  limit: number
): DayKey[] => {
  const s = dayKeyToUtcMs(start);
  const e = dayKeyToUtcMs(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || limit <= 0) return [];
  const a = Math.min(s, e);
  const b = Math.max(s, e);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((b - a) / dayMs) + 1;
  const take = Math.min(days, limit);
  const out: DayKey[] = [];
  for (let i = 0; i < take; i++) {
    out.push(utcMsToDayKey(b - i * dayMs));
  }
  return out;
};

const formatClock = (value: string | null | undefined): string => {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return raw;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
};

const normalizeStatus = (v: string | null | undefined): string => {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (!s) return "pending";
  if (s === "approved" || s === "rejected" || s === "pending") return s;
  return s;
};

const escapeHtml = (v: string): string =>
  String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const printHtml = (html: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "1200px";
  iframe.style.height = "900px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.visibility = "hidden";
  let printed = false;

  const writeDoc = () => {
    const doc = iframe.contentDocument;
    if (!doc) return false;
    doc.open();
    doc.write(html);
    doc.close();
    return true;
  };

  const supportsSrcdoc =
    "srcdoc" in (iframe as unknown as Record<string, unknown>);

  if (supportsSrcdoc) {
    (iframe as unknown as { srcdoc: string }).srcdoc = html;
  } else {
    iframe.src = "about:blank";
  }

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    const w = iframe.contentWindow;
    if (!w) {
      cleanup();
      return;
    }
    try {
      w.focus();
      w.print();
    } finally {
      window.setTimeout(cleanup, 1500);
    }
  };

  iframe.onload = () => {
    if (!supportsSrcdoc) writeDoc();
    window.setTimeout(triggerPrint, 50);
  };

  document.body.appendChild(iframe);

  if (!supportsSrcdoc) {
    window.setTimeout(() => {
      if (!printed && writeDoc()) triggerPrint();
    }, 250);
  } else {
    window.setTimeout(triggerPrint, 800);
  }
};

export default function Reports() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const today = useMemo(() => getDhakaToday(), []);
  const [start, setStart] = useState<DayKey>(
    () => `${today.slice(0, 7)}-01` as DayKey
  );
  const [end, setEnd] = useState<DayKey>(() => today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [search, setSearch] = useState("");
  const [employeeDetailsOpen, setEmployeeDetailsOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.get(
        `/api/attendance/dashboard?start=${encodeURIComponent(
          start
        )}&end=${encodeURIComponent(end)}&limit=10000&ensure_days=1`
      );
      setEmployees(
        Array.isArray(res.data?.employees) ? res.data.employees : []
      );
      setAttendance(
        Array.isArray(res.data?.attendance) ? res.data.attendance : []
      );
      setLeaves(Array.isArray(res.data?.leaves) ? res.data.leaves : []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load reports"));
    } finally {
      setBusy(false);
    }
  }, [end, start]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedRange = useMemo(() => {
    const s = normalizeDayKey(start) || today;
    const e = normalizeDayKey(end) || today;
    return s <= e ? { start: s, end: e } : { start: e, end: s };
  }, [end, start, today]);

  const openEmployeeDetails = useCallback((employeeId: string) => {
    setSelectedEmployeeId(String(employeeId || "") || null);
    setEmployeeDetailsOpen(true);
  }, []);

  const closeEmployeeDetails = useCallback(() => {
    setEmployeeDetailsOpen(false);
  }, []);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return (
      employees.find((e) => String(e.id) === String(selectedEmployeeId)) || null
    );
  }, [employees, selectedEmployeeId]);

  const employeeAttendanceByDate = useMemo(() => {
    if (!selectedEmployeeId) return new Map<string, AttendanceRow[]>();
    const m = new Map<string, AttendanceRow[]>();
    for (const r of attendance) {
      if (String(r.employee_id) !== String(selectedEmployeeId)) continue;
      const d = String(r.date || "");
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(r);
      else m.set(d, [r]);
    }
    return m;
  }, [attendance, selectedEmployeeId]);

  const employeeLeavesByDate = useMemo(() => {
    if (!selectedEmployeeId) return new Map<string, LeaveRecord[]>();
    const m = new Map<string, LeaveRecord[]>();
    for (const l of leaves) {
      if (String(l.employee_id || "") !== String(selectedEmployeeId)) continue;
      const d = String(l.date || "");
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(l);
      else m.set(d, [l]);
    }
    return m;
  }, [leaves, selectedEmployeeId]);

  const employeeDaily = useMemo(() => {
    if (!selectedEmployeeId) return [];
    const last30 = listLastDaysInRange(
      normalizedRange.start,
      normalizedRange.end,
      30
    );
    return last30.map((date) => {
      const dayAttendance = employeeAttendanceByDate.get(date) || [];
      const dayLeaves = employeeLeavesByDate.get(date) || [];
      const workedMinutes = dayAttendance.reduce(
        (sum, r) => sum + Math.max(0, Number(r.duration_minutes || 0)),
        0
      );
      const payableMinutes = dayAttendance.reduce(
        (sum, r) =>
          sum +
          (r.clock_out ? Math.max(0, Number(r.duration_minutes || 0)) : 0),
        0
      );
      const lateMinutes = dayAttendance.reduce(
        (sum, r) => sum + Math.max(0, Number(r.late_minutes || 0)),
        0
      );
      const earlyLeaveMinutes = dayAttendance.reduce(
        (sum, r) => sum + Math.max(0, Number(r.early_leave_minutes || 0)),
        0
      );
      const firstIn = dayAttendance
        .map((r) => String(r.clock_in || ""))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))[0];
      const lastOutCandidate = dayAttendance
        .map((r) => String(r.clock_out || r.clock_in || ""))
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))[0];
      const openShift = dayAttendance.some((r) => !r.clock_out);
      const leaveSummary = dayLeaves
        .slice()
        .sort((a, b) =>
          normalizeStatus(a.status).localeCompare(normalizeStatus(b.status))
        )
        .map((l) => {
          const t = String(l.leave_type || "").trim() || "Leave";
          const p = String(l.day_part || "").trim();
          const s = normalizeStatus(l.status);
          return `${t}${p ? ` (${p})` : ""} • ${s}`;
        });
      return {
        date,
        workedMinutes,
        payableMinutes,
        lateMinutes,
        earlyLeaveMinutes,
        firstIn,
        lastOutCandidate,
        openShift,
        leaveSummary,
      };
    });
  }, [
    employeeAttendanceByDate,
    employeeLeavesByDate,
    normalizedRange.end,
    normalizedRange.start,
    selectedEmployeeId,
  ]);

  const employeeTotals = useMemo(() => {
    const totals = {
      workedMinutes: 0,
      payableMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      presentDays: 0,
      leaveDays: 0,
      absentDays: 0,
      openShiftDays: 0,
    };
    for (const d of employeeDaily) {
      totals.workedMinutes += Math.max(0, Number(d.workedMinutes || 0));
      totals.payableMinutes += Math.max(0, Number(d.payableMinutes || 0));
      totals.lateMinutes += Math.max(0, Number(d.lateMinutes || 0));
      totals.earlyLeaveMinutes += Math.max(0, Number(d.earlyLeaveMinutes || 0));
      const hasLeave = d.leaveSummary.length > 0;
      const hasAttendance =
        d.workedMinutes > 0 || d.firstIn || d.lastOutCandidate;
      if (hasLeave) totals.leaveDays += 1;
      else if (hasAttendance) totals.presentDays += 1;
      else totals.absentDays += 1;
      if (d.openShift) totals.openShiftDays += 1;
    }
    return totals;
  }, [employeeDaily]);

  const byEmployee = useMemo(() => {
    const m = new Map<
      string,
      {
        workedMinutes: number;
        payableMinutes: number;
        attendanceDays: Set<string>;
        openShifts: number;
        lateMinutes: number;
        earlyLeaveMinutes: number;
        approvedLeaves: number;
        pendingLeaves: number;
        rejectedLeaves: number;
        leaveTypes: Set<string>;
        lastSeen: string;
      }
    >();

    const touch = (employeeId: string) => {
      const id = String(employeeId || "");
      if (!id) return null;
      const existing = m.get(id);
      if (existing) return existing;
      const next = {
        workedMinutes: 0,
        payableMinutes: 0,
        attendanceDays: new Set<string>(),
        openShifts: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        approvedLeaves: 0,
        pendingLeaves: 0,
        rejectedLeaves: 0,
        leaveTypes: new Set<string>(),
        lastSeen: "",
      };
      m.set(id, next);
      return next;
    };

    for (const r of attendance) {
      const rec = touch(String(r.employee_id));
      if (!rec) continue;
      const minutes = Math.max(0, Number(r.duration_minutes || 0));
      rec.workedMinutes += minutes;
      if (r.clock_out) rec.payableMinutes += minutes;
      if (r.date) rec.attendanceDays.add(String(r.date));
      if (!r.clock_out) rec.openShifts += 1;
      rec.lateMinutes += Math.max(0, Number(r.late_minutes || 0));
      rec.earlyLeaveMinutes += Math.max(0, Number(r.early_leave_minutes || 0));
      const candidate = String(r.clock_out || r.clock_in || "");
      if (candidate && (!rec.lastSeen || candidate > rec.lastSeen)) {
        rec.lastSeen = candidate;
      }
    }

    for (const l of leaves) {
      const rec = touch(String(l.employee_id || ""));
      if (!rec) continue;
      const status = String(l.status || "pending")
        .trim()
        .toLowerCase();
      if (status === "approved") rec.approvedLeaves += 1;
      else if (status === "rejected") rec.rejectedLeaves += 1;
      else rec.pendingLeaves += 1;
      const lt = String(l.leave_type || "").trim();
      if (lt) rec.leaveTypes.add(lt);
    }

    return m;
  }, [attendance, leaves]);

  const kpis = useMemo(() => {
    const employeesCount = employees.length;
    const approvedLeaves = leaves.reduce((sum, l) => {
      const s = String(l.status || "pending")
        .trim()
        .toLowerCase();
      return sum + (s === "approved" ? 1 : 0);
    }, 0);
    const payableMinutes = Array.from(byEmployee.values()).reduce(
      (sum, v) => sum + Math.max(0, v.payableMinutes),
      0
    );
    const workedMinutes = Array.from(byEmployee.values()).reduce(
      (sum, v) => sum + Math.max(0, v.workedMinutes),
      0
    );
    return { employeesCount, approvedLeaves, payableMinutes, workedMinutes };
  }, [byEmployee, employees.length, leaves]);

  const rows = useMemo(() => {
    const q = String(search || "")
      .trim()
      .toLowerCase();
    const list = employees.map((e) => {
      const agg = byEmployee.get(String(e.id));
      const days = agg?.attendanceDays.size || 0;
      const approvedLeaves = agg?.approvedLeaves || 0;
      const pendingLeaves = agg?.pendingLeaves || 0;
      const rejectedLeaves = agg?.rejectedLeaves || 0;
      const leaveTypes = agg ? Array.from(agg.leaveTypes.values()) : [];
      leaveTypes.sort((a, b) => a.localeCompare(b));
      return {
        id: String(e.id),
        name: String(e.name || ""),
        code: String(e.code || ""),
        status: String(e.status || ""),
        shiftName: String(e.shift_name || ""),
        workingDays: String(e.working_days || ""),
        daysPresent: days,
        workedMinutes: agg?.workedMinutes || 0,
        payableMinutes: agg?.payableMinutes || 0,
        openShifts: agg?.openShifts || 0,
        lateMinutes: agg?.lateMinutes || 0,
        earlyLeaveMinutes: agg?.earlyLeaveMinutes || 0,
        approvedLeaves,
        pendingLeaves,
        rejectedLeaves,
        leaveTypes,
        lastSeen: agg?.lastSeen || "",
      };
    });

    const filtered = q
      ? list.filter((r) => {
          const a =
            `${r.name} ${r.code} ${r.shiftName} ${r.status}`.toLowerCase();
          return a.includes(q);
        })
      : list;

    filtered.sort((a, b) => b.workedMinutes - a.workedMinutes);
    return filtered;
  }, [byEmployee, employees, search]);

  const handlePrint = useCallback(() => {
    const title = `Tenant Report (${normalizedRange.start} to ${normalizedRange.end})`;
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111827; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .muted { color: #6b7280; font-size: 12px; margin: 0 0 18px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0 18px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
    .kpi .label { color: #6b7280; font-size: 11px; }
    .kpi .value { font-size: 16px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; color: #374151; background: #f9fafb; }
    thead { display: table-header-group; }
    .nowrap { white-space: nowrap; }
    @media print { body { margin: 0.5in; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</p>
  <div class="kpis">
    <div class="kpi"><div class="label">Employees</div><div class="value">${escapeHtml(
      String(kpis.employeesCount)
    )}</div></div>
    <div class="kpi"><div class="label">Approved leaves</div><div class="value">${escapeHtml(
      String(kpis.approvedLeaves)
    )}</div></div>
    <div class="kpi"><div class="label">Worked</div><div class="value">${escapeHtml(
      formatMinutes(kpis.workedMinutes)
    )}</div></div>
    <div class="kpi"><div class="label">Payable</div><div class="value">${escapeHtml(
      formatMinutes(kpis.payableMinutes)
    )}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Employee</th>
        <th class="nowrap">Code</th>
        <th>Shift</th>
        <th class="nowrap">Present days</th>
        <th class="nowrap">Worked</th>
        <th class="nowrap">Payable</th>
        <th class="nowrap">Leaves (A/P/R)</th>
        <th class="nowrap">Late (min)</th>
        <th class="nowrap">Early (min)</th>
        <th class="nowrap">Open shifts</th>
        <th class="nowrap">Last seen</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td>${escapeHtml(r.name)}<div class="muted">${escapeHtml(
            r.leaveTypes.length ? r.leaveTypes.join(", ") : ""
          )}</div></td>
        <td class="nowrap">${escapeHtml(r.code || "—")}</td>
        <td>${escapeHtml(r.shiftName || "—")}</td>
        <td class="nowrap">${escapeHtml(String(r.daysPresent))}</td>
        <td class="nowrap">${escapeHtml(formatMinutes(r.workedMinutes))}</td>
        <td class="nowrap">${escapeHtml(formatMinutes(r.payableMinutes))}</td>
        <td class="nowrap">${escapeHtml(
          `${r.approvedLeaves}/${r.pendingLeaves}/${r.rejectedLeaves}`
        )}</td>
        <td class="nowrap">${escapeHtml(String(r.lateMinutes || 0))}</td>
        <td class="nowrap">${escapeHtml(String(r.earlyLeaveMinutes || 0))}</td>
        <td class="nowrap">${escapeHtml(String(r.openShifts || 0))}</td>
        <td class="nowrap">${escapeHtml(r.lastSeen || "—")}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
    printHtml(html);
  }, [kpis, normalizedRange.end, normalizedRange.start, rows]);

  const handlePrintIndividual = useCallback(() => {
    if (!selectedEmployeeId) return;
    const empName = String(
      selectedEmployee?.name || `Employee #${selectedEmployeeId}`
    );
    const empCode = String(selectedEmployee?.code || "");
    const title = `Employee Report (${normalizedRange.start} to ${normalizedRange.end})`;

    const dailyRows = employeeDaily
      .map((d) => {
        const hasLeave = d.leaveSummary.length > 0;
        const hasAttendance =
          d.workedMinutes > 0 || d.firstIn || d.lastOutCandidate;
        const headline = hasLeave
          ? "Leave"
          : hasAttendance
          ? d.openShift
            ? "Present (Open shift)"
            : "Present"
          : "Absent";
        return `<tr>
  <td class="nowrap">${escapeHtml(d.date)}</td>
  <td>${escapeHtml(headline)}</td>
  <td class="nowrap">${escapeHtml(
    `${formatClock(d.firstIn)} / ${formatClock(d.lastOutCandidate)}`
  )}</td>
  <td class="nowrap">${escapeHtml(formatMinutes(d.workedMinutes))}</td>
  <td class="nowrap">${escapeHtml(formatMinutes(d.payableMinutes))}</td>
  <td class="nowrap">${escapeHtml(String(d.lateMinutes || 0))}</td>
  <td class="nowrap">${escapeHtml(String(d.earlyLeaveMinutes || 0))}</td>
  <td>${escapeHtml(d.leaveSummary.join(" | ") || "—")}</td>
</tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111827; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .muted { color: #6b7280; font-size: 12px; margin: 0 0 18px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0 18px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
    .kpi .label { color: #6b7280; font-size: 11px; }
    .kpi .value { font-size: 16px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; color: #374151; background: #f9fafb; }
    thead { display: table-header-group; }
    .nowrap { white-space: nowrap; }
    @media print { body { margin: 0.5in; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">${escapeHtml(empName)}${escapeHtml(
      empCode ? ` • ${empCode}` : ""
    )} • Generated ${escapeHtml(new Date().toLocaleString())}</p>
  <div class="kpis">
    <div class="kpi"><div class="label">Present days</div><div class="value">${escapeHtml(
      String(employeeTotals.presentDays)
    )}</div></div>
    <div class="kpi"><div class="label">Leave days</div><div class="value">${escapeHtml(
      String(employeeTotals.leaveDays)
    )}</div></div>
    <div class="kpi"><div class="label">Worked</div><div class="value">${escapeHtml(
      formatMinutes(employeeTotals.workedMinutes)
    )}</div></div>
    <div class="kpi"><div class="label">Payable</div><div class="value">${escapeHtml(
      formatMinutes(employeeTotals.payableMinutes)
    )}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="nowrap">Date</th>
        <th>Status</th>
        <th class="nowrap">In / Out</th>
        <th class="nowrap">Worked</th>
        <th class="nowrap">Payable</th>
        <th class="nowrap">Late</th>
        <th class="nowrap">Early</th>
        <th>Leave details</th>
      </tr>
    </thead>
    <tbody>
      ${dailyRows || ""}
    </tbody>
  </table>
</body>
</html>`;
    printHtml(html);
  }, [
    employeeDaily,
    employeeTotals,
    normalizedRange.end,
    normalizedRange.start,
    selectedEmployee,
    selectedEmployeeId,
  ]);

  return (
    <Container maxWidth="lg" disableGutters>
      <Stack spacing={2.25}>
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: 22 }}>
            Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Tenant-wide summary and employee-wise breakdown by date range.
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <Box sx={{ p: 2.25 }}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ md: "flex-end" }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="From"
                  type="date"
                  value={normalizedRange.start}
                  onChange={(e) =>
                    setStart(normalizeDayKey(e.target.value) || today)
                  }
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  disabled={busy}
                />
                <TextField
                  label="To"
                  type="date"
                  value={normalizedRange.end}
                  onChange={(e) =>
                    setEnd(normalizeDayKey(e.target.value) || today)
                  }
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  disabled={busy}
                />
              </Stack>

              <TextField
                label="Search employee"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="small"
                sx={{ flex: 1, minWidth: { xs: "100%", md: 320 } }}
                disabled={busy}
              />

              <Stack direction="row" spacing={1.25} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  startIcon={<RefreshRounded />}
                  onClick={() => void load()}
                  disabled={busy}
                >
                  Refresh
                </Button>
                <Button
                  variant="contained"
                  startIcon={<PrintRounded />}
                  onClick={handlePrint}
                  disabled={busy || rows.length === 0}
                >
                  Print
                </Button>
              </Stack>
            </Stack>
          </Box>
          <Divider />

          {error ? (
            <Box sx={{ p: 2.25 }}>
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {error}
              </Alert>
            </Box>
          ) : null}

          <Box sx={{ p: 2.25 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(4, minmax(0, 1fr))",
                },
                gap: 1.5,
              }}
            >
              <Paper
                variant="outlined"
                sx={{ p: 1.75, borderRadius: 2.5, bgcolor: "background.paper" }}
              >
                <Typography variant="caption" color="text.secondary">
                  Employees
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
                  {kpis.employeesCount}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{ p: 1.75, borderRadius: 2.5, bgcolor: "background.paper" }}
              >
                <Typography variant="caption" color="text.secondary">
                  Approved Leaves
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
                  {kpis.approvedLeaves}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{ p: 1.75, borderRadius: 2.5, bgcolor: "background.paper" }}
              >
                <Typography variant="caption" color="text.secondary">
                  Worked Time
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
                  {formatMinutes(kpis.workedMinutes)}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{ p: 1.75, borderRadius: 2.5, bgcolor: "background.paper" }}
              >
                <Typography variant="caption" color="text.secondary">
                  Payable Time
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
                  {formatMinutes(kpis.payableMinutes)}
                </Typography>
              </Paper>
            </Box>
          </Box>

          <Divider />

          <Box sx={{ p: 2.25 }}>
            {busy ? (
              <Box sx={{ py: 6, display: "grid", placeItems: "center" }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {isMobile ? (
                  <Stack spacing={1.25}>
                    {rows.map((r) => (
                      <Paper
                        key={r.id}
                        variant="outlined"
                        onClick={() => openEmployeeDetails(r.id)}
                        sx={{
                          p: 1.5,
                          borderRadius: 2.5,
                          cursor: "pointer",
                          transition:
                            "box-shadow 140ms ease, border-color 140ms ease",
                          "&:hover": {
                            boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
                            borderColor: "primary.main",
                          },
                        }}
                      >
                        <Stack spacing={1.25}>
                          <Stack
                            direction="row"
                            spacing={1.25}
                            alignItems="center"
                          >
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography sx={{ fontWeight: 900 }} noWrap>
                                {r.name || `Employee #${r.id}`}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                              >
                                {r.code ? `${r.code}` : "—"}
                                {r.shiftName ? ` • ${r.shiftName}` : ""}
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                display: "grid",
                                justifyItems: "end",
                                gap: 0.25,
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Worked
                              </Typography>
                              <Typography sx={{ fontWeight: 900 }}>
                                {formatMinutes(r.workedMinutes)}
                              </Typography>
                            </Box>
                          </Stack>

                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                              gap: 1,
                            }}
                          >
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.25,
                                borderRadius: 2,
                                bgcolor: "background.paper",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Payable
                              </Typography>
                              <Typography sx={{ fontWeight: 900 }}>
                                {formatMinutes(r.payableMinutes)}
                              </Typography>
                            </Paper>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.25,
                                borderRadius: 2,
                                bgcolor: "background.paper",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Present days
                              </Typography>
                              <Typography sx={{ fontWeight: 900 }}>
                                {r.daysPresent}
                              </Typography>
                            </Paper>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.25,
                                borderRadius: 2,
                                bgcolor: "background.paper",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Leaves (A/P/R)
                              </Typography>
                              <Typography sx={{ fontWeight: 900 }}>
                                {`${r.approvedLeaves}/${r.pendingLeaves}/${r.rejectedLeaves}`}
                              </Typography>
                            </Paper>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.25,
                                borderRadius: 2,
                                bgcolor: "background.paper",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Late / Early
                              </Typography>
                              <Typography sx={{ fontWeight: 900 }}>
                                {(r.lateMinutes || 0) > 0 ? r.lateMinutes : 0} /{" "}
                                {(r.earlyLeaveMinutes || 0) > 0
                                  ? r.earlyLeaveMinutes
                                  : 0}
                              </Typography>
                            </Paper>
                          </Box>

                          <Stack spacing={0.4}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Leave types
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 700 }}
                            >
                              {r.leaveTypes.length
                                ? r.leaveTypes.join(", ")
                                : "—"}
                            </Typography>
                          </Stack>

                          <Stack
                            direction="row"
                            spacing={1}
                            justifyContent="space-between"
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Open shifts: {r.openShifts || 0}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ whiteSpace: "nowrap" }}
                            >
                              Last seen: {r.lastSeen || "—"}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}

                    {rows.length === 0 ? (
                      <Paper
                        variant="outlined"
                        sx={{ p: 3, borderRadius: 3, textAlign: "center" }}
                      >
                        <Typography color="text.secondary">
                          No employees found for this range.
                        </Typography>
                      </Paper>
                    ) : null}
                  </Stack>
                ) : (
                  <TableContainer
                    component={Paper}
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 3,
                      overflowX: "auto",
                      overflowY: "hidden",
                    }}
                  >
                    <Table size="small" sx={{ minWidth: 980 }}>
                      <TableHead sx={{ bgcolor: "background.default" }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 900 }}>
                            Employee
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }}>Code</TableCell>
                          <TableCell sx={{ fontWeight: 900 }}>Shift</TableCell>
                          <TableCell sx={{ fontWeight: 900 }} align="right">
                            Present
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }} align="right">
                            Worked
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }} align="right">
                            Payable
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }} align="right">
                            Leaves A/P/R
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }} align="right">
                            Late (min)
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }} align="right">
                            Early (min)
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }} align="right">
                            Open
                          </TableCell>
                          <TableCell sx={{ fontWeight: 900 }}>
                            Last Seen
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow
                            key={r.id}
                            hover
                            onClick={() => openEmployeeDetails(r.id)}
                            sx={{ cursor: "pointer" }}
                          >
                            <TableCell sx={{ minWidth: 240 }}>
                              <Stack spacing={0.25}>
                                <Typography sx={{ fontWeight: 800 }} noWrap>
                                  {r.name || `Employee #${r.id}`}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                >
                                  {r.leaveTypes.length
                                    ? `Leave types: ${r.leaveTypes.join(", ")}`
                                    : "—"}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>{r.code || "—"}</TableCell>
                            <TableCell>{r.shiftName || "—"}</TableCell>
                            <TableCell align="right">{r.daysPresent}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>
                              {formatMinutes(r.workedMinutes)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>
                              {formatMinutes(r.payableMinutes)}
                            </TableCell>
                            <TableCell align="right">
                              {`${r.approvedLeaves}/${r.pendingLeaves}/${r.rejectedLeaves}`}
                            </TableCell>
                            <TableCell align="right">
                              {r.lateMinutes || 0}
                            </TableCell>
                            <TableCell align="right">
                              {r.earlyLeaveMinutes || 0}
                            </TableCell>
                            <TableCell align="right">
                              {r.openShifts || 0}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                              {r.lastSeen || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={11}
                              align="center"
                              sx={{ py: 6 }}
                            >
                              <Typography color="text.secondary">
                                No employees found for this range.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            )}
          </Box>
        </Paper>
      </Stack>

      <Dialog
        open={employeeDetailsOpen}
        onClose={busy ? undefined : closeEmployeeDetails}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            fontWeight: 900,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900 }} noWrap>
              {selectedEmployee?.name || "Employee Report"}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {selectedEmployee?.code ? `${selectedEmployee.code} • ` : ""}
              Last 30 days • {normalizedRange.start} to {normalizedRange.end}
            </Typography>
          </Box>
          <IconButton
            onClick={closeEmployeeDetails}
            disabled={busy}
            aria-label="Close"
          >
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            {employeeDaily.map((d) => {
              const hasLeave = d.leaveSummary.length > 0;
              const hasAttendance =
                d.workedMinutes > 0 || d.firstIn || d.lastOutCandidate;
              const headline = hasLeave
                ? "Leave"
                : hasAttendance
                ? d.openShift
                  ? "Present (Open shift)"
                  : "Present"
                : "Absent";
              return (
                <Paper
                  key={d.date}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 2.5 }}
                >
                  <Stack spacing={1}>
                    <Stack
                      direction="row"
                      spacing={1}
                      justifyContent="space-between"
                      alignItems="baseline"
                    >
                      <Typography sx={{ fontWeight: 900 }}>{d.date}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {headline}
                      </Typography>
                    </Stack>

                    {hasLeave ? (
                      <Stack spacing={0.25}>
                        {d.leaveSummary.map((t) => (
                          <Typography
                            key={t}
                            variant="body2"
                            sx={{ fontWeight: 700 }}
                          >
                            {t}
                          </Typography>
                        ))}
                      </Stack>
                    ) : null}

                    {hasAttendance ? (
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 1,
                        }}
                      >
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            borderRadius: 2,
                            bgcolor: "background.paper",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            In / Out
                          </Typography>
                          <Typography sx={{ fontWeight: 900 }}>
                            {formatClock(d.firstIn)} /{" "}
                            {formatClock(d.lastOutCandidate)}
                          </Typography>
                        </Paper>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            borderRadius: 2,
                            bgcolor: "background.paper",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Worked / Payable
                          </Typography>
                          <Typography sx={{ fontWeight: 900 }}>
                            {formatMinutes(d.workedMinutes)} /{" "}
                            {formatMinutes(d.payableMinutes)}
                          </Typography>
                        </Paper>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            borderRadius: 2,
                            bgcolor: "background.paper",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Late (min)
                          </Typography>
                          <Typography sx={{ fontWeight: 900 }}>
                            {d.lateMinutes}
                          </Typography>
                        </Paper>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            borderRadius: 2,
                            bgcolor: "background.paper",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Early (min)
                          </Typography>
                          <Typography sx={{ fontWeight: 900 }}>
                            {d.earlyLeaveMinutes}
                          </Typography>
                        </Paper>
                      </Box>
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}
            {employeeDaily.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                <Typography color="text.secondary">
                  No days available in this range.
                </Typography>
              </Paper>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="contained"
            startIcon={<PrintRounded />}
            onClick={handlePrintIndividual}
            disabled={busy || !selectedEmployeeId || employeeDaily.length === 0}
          >
            Print
          </Button>
          <Button onClick={closeEmployeeDetails} disabled={busy}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
