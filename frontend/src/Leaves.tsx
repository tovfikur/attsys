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
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
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

type LeaveSettings = {
  auto_approve: 0 | 1;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatMonth = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const formatDate = (y: number, m0: number, day: number) =>
  `${y}-${pad2(m0 + 1)}-${pad2(day)}`;

export default function Leaves() {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const role = getUser()?.role || "";
  const canManage = role === "hr_admin" || role === "tenant_owner";
  const canApprove =
    role === "manager" || role === "hr_admin" || role === "tenant_owner";
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>("");
  const [actionOk, setActionOk] = useState<string>("");
  const [leaveTypesOpen, setLeaveTypesOpen] = useState(false);
  const [leaveTypesBusy, setLeaveTypesBusy] = useState(false);
  const [leaveTypesError, setLeaveTypesError] = useState("");
  const [leaveTypesOk, setLeaveTypesOk] = useState("");
  const [leaveSettingsOpen, setLeaveSettingsOpen] = useState(false);
  const [leaveSettingsBusy, setLeaveSettingsBusy] = useState(false);
  const [leaveSettingsError, setLeaveSettingsError] = useState("");
  const [leaveSettingsOk, setLeaveSettingsOk] = useState("");
  const [leaveSettingsDraft, setLeaveSettingsDraft] = useState<LeaveSettings>({
    auto_approve: 0,
  });
  const [leaveTypeEditing, setLeaveTypeEditing] = useState<LeaveType | null>(
    null
  );
  const [leaveTypeDraft, setLeaveTypeDraft] = useState<{
    code: string;
    name: string;
    is_paid: 0 | 1;
    requires_document: 0 | 1;
    active: 0 | 1;
    sort_order: number;
  }>({
    code: "",
    name: "",
    is_paid: 1,
    requires_document: 0,
    active: 1,
    sort_order: 0,
  });
  const lastRefreshAtRef = useRef(0);

  const monthStr = useMemo(() => formatMonth(currentDate), [currentDate]);

  const leaveTypeNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of leaveTypes) {
      const code = String(t.code || "")
        .trim()
        .toLowerCase();
      const name = String(t.name || "").trim();
      if (code && name) m.set(code, name);
    }
    return m;
  }, [leaveTypes]);

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

  const fetchLeaveTypes = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (canManage) qs.set("include_inactive", "1");
      const res = await api.get(`/api/leave_types?${qs.toString()}`);
      setLeaveTypes(
        Array.isArray(res.data?.leave_types)
          ? (res.data.leave_types as LeaveType[])
          : []
      );
    } catch {
      setLeaveTypes([]);
    }
  }, [canManage]);

  const openLeaveTypes = useCallback(() => {
    setLeaveTypesOpen(true);
    setLeaveTypesError("");
    setLeaveTypesOk("");
    setLeaveTypeEditing(null);
    setLeaveTypeDraft({
      code: "",
      name: "",
      is_paid: 1,
      requires_document: 0,
      active: 1,
      sort_order: 0,
    });
    void fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  const fetchLeaveSettings = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await api.get("/api/leave_settings");
      const raw = res.data?.settings?.auto_approve;
      const auto_approve = Number(raw) ? 1 : 0;
      setLeaveSettingsDraft({ auto_approve });
    } catch {
      setLeaveSettingsDraft({ auto_approve: 0 });
    }
  }, [canManage]);

  const openLeaveSettings = useCallback(() => {
    setLeaveSettingsOpen(true);
    setLeaveSettingsError("");
    setLeaveSettingsOk("");
    void fetchLeaveSettings();
  }, [fetchLeaveSettings]);

  const saveLeaveSettings = useCallback(async () => {
    if (!canManage) return;
    setLeaveSettingsBusy(true);
    setLeaveSettingsError("");
    setLeaveSettingsOk("");
    try {
      await api.post("/api/leave_settings", {
        auto_approve: leaveSettingsDraft.auto_approve,
      });
      setLeaveSettingsOk("Saved");
      await fetchLeaveSettings();
    } catch (err: unknown) {
      setLeaveSettingsError(getErrorMessage(err, "Failed to save settings"));
    } finally {
      setLeaveSettingsBusy(false);
    }
  }, [canManage, fetchLeaveSettings, leaveSettingsDraft.auto_approve]);

  const startNewLeaveType = useCallback(() => {
    setLeaveTypesError("");
    setLeaveTypesOk("");
    setLeaveTypeEditing(null);
    setLeaveTypeDraft({
      code: "",
      name: "",
      is_paid: 1,
      requires_document: 0,
      active: 1,
      sort_order: 0,
    });
  }, []);

  const startEditLeaveType = useCallback((t: LeaveType) => {
    setLeaveTypesError("");
    setLeaveTypesOk("");
    setLeaveTypeEditing(t);
    setLeaveTypeDraft({
      code: String(t.code || ""),
      name: String(t.name || ""),
      is_paid: Number(t.is_paid) ? 1 : 0,
      requires_document: Number(t.requires_document) ? 1 : 0,
      active: Number(t.active) ? 1 : 0,
      sort_order: Number.isFinite(Number(t.sort_order))
        ? Number(t.sort_order)
        : 0,
    });
  }, []);

  const saveLeaveType = useCallback(async () => {
    const code = leaveTypeDraft.code.trim().toLowerCase();
    const name = leaveTypeDraft.name.trim();
    if (!code || !name) {
      setLeaveTypesError("Code and name are required.");
      return;
    }
    setLeaveTypesBusy(true);
    setLeaveTypesError("");
    setLeaveTypesOk("");
    try {
      await api.post("/api/leave_types", {
        code,
        name,
        is_paid: leaveTypeDraft.is_paid,
        requires_document: leaveTypeDraft.requires_document,
        active: leaveTypeDraft.active,
        sort_order: leaveTypeDraft.sort_order,
      });
      setLeaveTypesOk("Saved");
      await fetchLeaveTypes();
      setLeaveTypeEditing(null);
      setLeaveTypeDraft({
        code: "",
        name: "",
        is_paid: 1,
        requires_document: 0,
        active: 1,
        sort_order: 0,
      });
    } catch (err: unknown) {
      setLeaveTypesError(getErrorMessage(err, "Failed to save leave type"));
    } finally {
      setLeaveTypesBusy(false);
    }
  }, [fetchLeaveTypes, leaveTypeDraft]);

  const deactivateLeaveType = useCallback(
    async (t: LeaveType) => {
      const code = String(t.code || "")
        .trim()
        .toLowerCase();
      if (!code) return;
      if (!window.confirm(`Deactivate leave type "${t.name}"?`)) return;
      setLeaveTypesBusy(true);
      setLeaveTypesError("");
      setLeaveTypesOk("");
      try {
        await api.post("/api/leave_types/deactivate", { code });
        setLeaveTypesOk("Updated");
        await fetchLeaveTypes();
      } catch (err: unknown) {
        setLeaveTypesError(getErrorMessage(err, "Failed to update leave type"));
      } finally {
        setLeaveTypesBusy(false);
      }
    },
    [fetchLeaveTypes]
  );

  const activateLeaveType = useCallback(
    async (t: LeaveType) => {
      const code = String(t.code || "")
        .trim()
        .toLowerCase();
      const name = String(t.name || "").trim();
      if (!code || !name) return;
      setLeaveTypesBusy(true);
      setLeaveTypesError("");
      setLeaveTypesOk("");
      try {
        await api.post("/api/leave_types", {
          code,
          name,
          is_paid: Number(t.is_paid) ? 1 : 0,
          requires_document: Number(t.requires_document) ? 1 : 0,
          active: 1,
          sort_order: Number.isFinite(Number(t.sort_order))
            ? Number(t.sort_order)
            : 0,
        });
        setLeaveTypesOk("Updated");
        await fetchLeaveTypes();
      } catch (err: unknown) {
        setLeaveTypesError(getErrorMessage(err, "Failed to update leave type"));
      } finally {
        setLeaveTypesBusy(false);
      }
    },
    [fetchLeaveTypes]
  );

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
        await api.post("/api/leaves/update", {
          id: leaveId,
          status: nextStatus,
        });
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
    void fetchLeaveTypes();
  }, [fetchLeaveTypes]);

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
  const todayStr = new Date().toISOString().slice(0, 10);

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
    borderRadius: { xs: 2.5, sm: 2 },
    p: { xs: 0.75, sm: 1.25 },
    bgcolor: "background.default",
    cursor: "pointer",
    minHeight: { xs: 0, sm: 108 },
    aspectRatio: { xs: "1 / 1", sm: "auto" },
    display: "flex",
    flexDirection: "column",
    gap: { xs: 0.5, sm: 0.75 },
    transition: "transform 120ms ease, box-shadow 120ms ease",
    "&:active": {
      transform: { xs: "scale(0.985)", sm: "none" },
    },
    "@media (hover:hover) and (pointer:fine)": {
      "&:hover": {
        transform: "translateY(-1px)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
      },
    },
  } as const;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 } }}>
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
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          sx={{ width: { xs: "100%", md: "auto" } }}
        >
          {canManage ? (
            <Button
              variant="outlined"
              onClick={openLeaveTypes}
              disabled={leaveTypesBusy}
              sx={{ borderRadius: 2, width: { xs: "100%", sm: "auto" } }}
            >
              Leave Types
            </Button>
          ) : null}
          {canManage ? (
            <Button
              variant="outlined"
              onClick={openLeaveSettings}
              disabled={leaveSettingsBusy}
              sx={{ borderRadius: 2, width: { xs: "100%", sm: "auto" } }}
            >
              Leave Settings
            </Button>
          ) : null}
          <Button
            variant="outlined"
            startIcon={<RefreshRounded />}
            onClick={() => void fetchLeaves()}
            disabled={loading}
            sx={{ borderRadius: 2, width: { xs: "100%", sm: "auto" } }}
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
        <Box sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            alignItems={{ xs: "stretch", md: "center" }}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ width: { xs: "100%", md: "auto" } }}
            >
              <Button
                variant="outlined"
                onClick={() => setCurrentDate(new Date(year, month0 - 1, 1))}
                sx={{
                  borderRadius: 999,
                  minWidth: { xs: 40, sm: 42 },
                  px: { xs: 0.5, sm: 1 },
                }}
              >
                <ChevronLeft />
              </Button>
              <Box sx={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                <Typography sx={{ fontWeight: 900 }} noWrap>
                  {monthLabel}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={() => setCurrentDate(new Date(year, month0 + 1, 1))}
                sx={{
                  borderRadius: 999,
                  minWidth: { xs: 40, sm: 42 },
                  px: { xs: 0.5, sm: 1 },
                }}
              >
                <ChevronRight />
              </Button>
            </Stack>

            <Box sx={{ flex: 1 }} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              {role !== "employee" ? (
                <TextField
                  label="Employee"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  size="small"
                  sx={{ minWidth: { xs: "100%", sm: 220 } }}
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
                sx={{ minWidth: { xs: "100%", sm: 200 } }}
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

        <Box sx={{ p: { xs: 1.75, sm: 2.5 } }}>
          {loading ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: { xs: 0.5, sm: 1.25 },
                  mb: { xs: 0.75, sm: 1 },
                  px: { xs: 0.25, sm: 0 },
                }}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <Box
                    key={d}
                    sx={{
                      textAlign: "center",
                      color: "text.secondary",
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 800, fontSize: { xs: 10, sm: 12 } }}
                    >
                      {d}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: { xs: 0.5, sm: 1.25 },
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
                  const isToday = dateStr === todayStr;

                  const statusCounts = (() => {
                    const r = {
                      approved: 0,
                      pending: 0,
                      rejected: 0,
                      other: 0,
                    };
                    for (const l of list) {
                      const s = String(l.status || "")
                        .trim()
                        .toLowerCase();
                      if (s === "approved") r.approved += 1;
                      else if (s === "rejected") r.rejected += 1;
                      else if (s === "pending") r.pending += 1;
                      else r.other += 1;
                    }
                    return r;
                  })();

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
                        boxShadow: isToday
                          ? `0 0 0 2px ${alpha(
                              theme.palette.primary.main,
                              0.24
                            )}`
                          : "none",
                      }}
                    >
                      {isSmDown ? (
                        <Box
                          sx={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 0.5,
                          }}
                        >
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            spacing={0.75}
                          >
                            <Box
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                display: "grid",
                                placeItems: "center",
                                bgcolor: isToday
                                  ? alpha(theme.palette.primary.main, 0.14)
                                  : "transparent",
                                color: isToday
                                  ? theme.palette.primary.dark
                                  : theme.palette.text.primary,
                              }}
                            >
                              <Typography
                                sx={{ fontWeight: 900, fontSize: 13 }}
                              >
                                {day}
                              </Typography>
                            </Box>

                            {hasLeaves ? (
                              <Box
                                sx={{
                                  minWidth: 22,
                                  height: 18,
                                  px: 0.8,
                                  borderRadius: 999,
                                  display: "grid",
                                  placeItems: "center",
                                  bgcolor: alpha(
                                    theme.palette.primary.main,
                                    0.14
                                  ),
                                  border: "1px solid",
                                  borderColor: alpha(
                                    theme.palette.primary.main,
                                    0.22
                                  ),
                                  color: theme.palette.primary.dark,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontWeight: 900,
                                    fontSize: 11,
                                    lineHeight: 1,
                                  }}
                                >
                                  {list.length}
                                </Typography>
                              </Box>
                            ) : (
                              <Box sx={{ width: 22, height: 18 }} />
                            )}
                          </Stack>

                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={0.6}
                            sx={{ minHeight: 16 }}
                          >
                            {statusCounts.approved > 0 ? (
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 999,
                                  bgcolor: theme.palette.warning.main,
                                  boxShadow: `0 0 0 2px ${alpha(
                                    theme.palette.warning.main,
                                    0.16
                                  )}`,
                                }}
                              />
                            ) : null}
                            {statusCounts.pending > 0 ? (
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 999,
                                  bgcolor: theme.palette.text.secondary,
                                  boxShadow: `0 0 0 2px ${alpha(
                                    theme.palette.text.secondary,
                                    0.16
                                  )}`,
                                }}
                              />
                            ) : null}
                            {statusCounts.rejected > 0 ? (
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 999,
                                  bgcolor: theme.palette.error.main,
                                  boxShadow: `0 0 0 2px ${alpha(
                                    theme.palette.error.main,
                                    0.16
                                  )}`,
                                }}
                              />
                            ) : null}
                            {hasLeaves ? (
                              <Typography
                                sx={{
                                  fontWeight: 800,
                                  fontSize: 11,
                                  color: "text.secondary",
                                  ml: 0.25,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                Leaves
                              </Typography>
                            ) : (
                              <Typography
                                sx={{
                                  fontWeight: 800,
                                  fontSize: 11,
                                  color: "text.disabled",
                                }}
                              >
                                —
                              </Typography>
                            )}
                          </Stack>
                        </Box>
                      ) : (
                        <>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Typography sx={{ fontWeight: 900 }}>
                              {day}
                            </Typography>
                            {hasLeaves ? (
                              <Chip
                                size="small"
                                label={list.length}
                                sx={{
                                  fontWeight: 900,
                                  bgcolor: alpha(
                                    theme.palette.primary.main,
                                    0.16
                                  ),
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
                            const emp = employeesById.get(
                              String(l.employee_id)
                            );
                            const name =
                              emp?.name || `#${String(l.employee_id)}`;
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
                                  "& .MuiChip-label": {
                                    display: "block",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  },
                                }}
                              />
                            );
                          })}
                          {extra > 0 ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              +{extra} more
                            </Typography>
                          ) : null}
                        </>
                      )}
                    </Box>
                  );
                })}
              </Box>
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
        fullScreen={isSmDown}
        PaperProps={{ sx: { borderRadius: isSmDown ? 0 : 3 } }}
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
                const typeCode = (l.leave_type || "leave").toString();
                const type =
                  leaveTypeNameByCode.get(typeCode.trim().toLowerCase()) ||
                  typeCode;
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

      <Dialog
        open={leaveTypesOpen}
        onClose={() => {
          setLeaveTypesOpen(false);
          setLeaveTypesBusy(false);
          setLeaveTypesError("");
          setLeaveTypesOk("");
          setLeaveTypeEditing(null);
        }}
        maxWidth="md"
        fullWidth
        fullScreen={isSmDown}
        PaperProps={{ sx: { borderRadius: isSmDown ? 0 : 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Leave Types</DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          {leaveTypesError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {leaveTypesError}
            </Alert>
          ) : null}
          {leaveTypesOk ? (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {leaveTypesOk}
            </Alert>
          ) : null}

          <Paper
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
              bgcolor: "background.default",
              mb: 2,
            }}
          >
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ sm: "center" }}
              >
                <Typography sx={{ fontWeight: 900, flex: 1 }}>
                  {leaveTypeEditing ? "Edit Type" : "New Type"}
                </Typography>
                <Button
                  variant="outlined"
                  onClick={startNewLeaveType}
                  disabled={leaveTypesBusy}
                  sx={{ borderRadius: 2 }}
                >
                  New
                </Button>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  label="Code"
                  value={leaveTypeDraft.code}
                  onChange={(e) => {
                    const raw = e.target.value || "";
                    const cleaned = raw
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "")
                      .slice(0, 16);
                    setLeaveTypeDraft((p) => ({ ...p, code: cleaned }));
                  }}
                  disabled={!!leaveTypeEditing || leaveTypesBusy}
                  size="small"
                  sx={{ minWidth: { sm: 180 } }}
                />
                <TextField
                  label="Name"
                  value={leaveTypeDraft.name}
                  onChange={(e) =>
                    setLeaveTypeDraft((p) => ({ ...p, name: e.target.value }))
                  }
                  disabled={leaveTypesBusy}
                  fullWidth
                  size="small"
                />
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  select
                  label="Paid"
                  value={leaveTypeDraft.is_paid}
                  onChange={(e) =>
                    setLeaveTypeDraft((p) => ({
                      ...p,
                      is_paid: Number(e.target.value) ? 1 : 0,
                    }))
                  }
                  disabled={leaveTypesBusy}
                  size="small"
                  sx={{ minWidth: { sm: 180 } }}
                >
                  <MenuItem value={1}>Paid</MenuItem>
                  <MenuItem value={0}>Unpaid</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Document"
                  value={leaveTypeDraft.requires_document}
                  onChange={(e) =>
                    setLeaveTypeDraft((p) => ({
                      ...p,
                      requires_document: Number(e.target.value) ? 1 : 0,
                    }))
                  }
                  disabled={leaveTypesBusy}
                  size="small"
                  sx={{ minWidth: { sm: 220 } }}
                >
                  <MenuItem value={0}>Not required</MenuItem>
                  <MenuItem value={1}>Required</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Active"
                  value={leaveTypeDraft.active}
                  onChange={(e) =>
                    setLeaveTypeDraft((p) => ({
                      ...p,
                      active: Number(e.target.value) ? 1 : 0,
                    }))
                  }
                  disabled={leaveTypesBusy}
                  size="small"
                  sx={{ minWidth: { sm: 180 } }}
                >
                  <MenuItem value={1}>Active</MenuItem>
                  <MenuItem value={0}>Inactive</MenuItem>
                </TextField>
                <TextField
                  label="Sort"
                  type="number"
                  value={leaveTypeDraft.sort_order}
                  onChange={(e) =>
                    setLeaveTypeDraft((p) => ({
                      ...p,
                      sort_order: Number(e.target.value || 0),
                    }))
                  }
                  disabled={leaveTypesBusy}
                  size="small"
                  sx={{ minWidth: { sm: 120 } }}
                />
              </Stack>

              <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                <Button
                  variant="contained"
                  onClick={() => void saveLeaveType()}
                  disabled={
                    leaveTypesBusy ||
                    !leaveTypeDraft.code.trim() ||
                    !leaveTypeDraft.name.trim()
                  }
                >
                  {leaveTypesBusy ? "Working..." : "Save"}
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Typography sx={{ fontWeight: 900, mb: 1 }}>All Types</Typography>
          {leaveTypes.length === 0 ? (
            <Typography color="text.secondary">No leave types.</Typography>
          ) : (
            <Stack spacing={1}>
              {leaveTypes.map((t) => {
                const active = Number(t.active) ? true : false;
                return (
                  <Paper
                    key={t.code}
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
                          {t.name}{" "}
                          <Typography
                            component="span"
                            color="text.secondary"
                            sx={{ fontWeight: 800 }}
                          >
                            ({t.code})
                          </Typography>
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                        >
                          <Chip
                            size="small"
                            label={Number(t.is_paid) ? "Paid" : "Unpaid"}
                            sx={{ fontWeight: 900 }}
                          />
                          <Chip
                            size="small"
                            label={
                              Number(t.requires_document)
                                ? "Document required"
                                : "No document"
                            }
                            sx={{ fontWeight: 900 }}
                          />
                          <Chip
                            size="small"
                            label={active ? "Active" : "Inactive"}
                            sx={{ fontWeight: 900 }}
                          />
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => startEditLeaveType(t)}
                          disabled={leaveTypesBusy}
                        >
                          Edit
                        </Button>
                        {active ? (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            onClick={() => void deactivateLeaveType(t)}
                            disabled={leaveTypesBusy}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => void activateLeaveType(t)}
                            disabled={leaveTypesBusy}
                          >
                            Activate
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={leaveSettingsOpen}
        onClose={() => {
          setLeaveSettingsOpen(false);
          setLeaveSettingsBusy(false);
          setLeaveSettingsError("");
          setLeaveSettingsOk("");
        }}
        maxWidth="sm"
        fullWidth
        fullScreen={isSmDown}
        PaperProps={{ sx: { borderRadius: isSmDown ? 0 : 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Leave Settings</DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          {leaveSettingsError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {leaveSettingsError}
            </Alert>
          ) : null}
          {leaveSettingsOk ? (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {leaveSettingsOk}
            </Alert>
          ) : null}

          <Paper
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
              bgcolor: "background.default",
            }}
          >
            <Stack spacing={1.5}>
              <FormControlLabel
                control={
                  <Switch
                    checked={leaveSettingsDraft.auto_approve === 1}
                    onChange={(e) =>
                      setLeaveSettingsDraft({
                        auto_approve: e.target.checked ? 1 : 0,
                      })
                    }
                  />
                }
                label="Auto-approve leave requests"
              />
              <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                <Button
                  variant="contained"
                  onClick={() => void saveLeaveSettings()}
                  disabled={leaveSettingsBusy}
                >
                  {leaveSettingsBusy ? "Working..." : "Save"}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
