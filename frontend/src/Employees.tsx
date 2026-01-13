import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import { getUser } from "./utils/session";
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
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
  useMediaQuery,
  useTheme,
  alpha,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FingerprintRounded,
  VpnKeyRounded,
  ChevronLeft,
  ChevronRight,
  Close as CloseIcon,
} from "@mui/icons-material";

// --- Types ---
interface Employee {
  id: string;
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
  id?: string | number;
  tenant_id?: string | number;
  employee_id?: string | number;
  date: string;
  leave_type?: string | null;
  day_part?: string | null;
  reason?: string | null;
  status?: string | null;
  created_at?: string;
}

interface HolidayRecord {
  id?: string | number;
  tenant_id?: string | number;
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

interface LeaveAllocationRow {
  employee_id: number;
  year: number;
  leave_type: string;
  leave_type_name: string;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
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
  const [loginEmployee, setLoginEmployee] = useState<Employee | null>(null);
  const [enrollEmployee, setEnrollEmployee] = useState<Employee | null>(null);
  const [employeePhotoUrls, setEmployeePhotoUrls] = useState<
    Record<string, string | null>
  >({});
  const employeePhotoUrlsRef = useRef<Record<string, string>>({});

  const role = getUser()?.role || "";
  const canManageEmployeeLogins = [
    "superadmin",
    "tenant_owner",
    "hr_admin",
  ].includes(role);

  const refreshEmployeePhotos = useCallback(async (list: Employee[]) => {
    const withPhoto = list.filter((e) => !!String(e.profile_photo_path || ""));
    const results = await Promise.all(
      withPhoto.map(async (e) => {
        try {
          const res = await api.get(
            `/api/employees/profile_photo?employee_id=${encodeURIComponent(
              e.id
            )}`,
            {
              responseType: "blob",
              validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
            }
          );
          if (res.status === 404 || !res.data) return [e.id, null] as const;
          const blob = res.data as Blob;
          if (!blob.size) return [e.id, null] as const;
          const url = URL.createObjectURL(blob);
          return [e.id, url] as const;
        } catch {
          return [e.id, null] as const;
        }
      })
    );

    const nextRef: Record<string, string> = {};
    const nextState: Record<string, string | null> = {};
    for (const [id, url] of results) {
      if (url) {
        nextRef[id] = url;
        nextState[id] = url;
      }
    }

    const prevRef = employeePhotoUrlsRef.current;
    for (const [id, url] of Object.entries(prevRef)) {
      if (!nextRef[id] || nextRef[id] !== url) URL.revokeObjectURL(url);
    }
    employeePhotoUrlsRef.current = nextRef;
    setEmployeePhotoUrls(nextState);
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/employees");
      const list = (res.data?.employees || []) as Employee[];
      setEmployees(list);
      await refreshEmployeePhotos(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [refreshEmployeePhotos]);

  useEffect(() => {
    void loadEmployees();
    return () => {
      for (const url of Object.values(employeePhotoUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
      employeePhotoUrlsRef.current = {};
    };
  }, [loadEmployees]);

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
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 } }}>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        flexDirection={{ xs: "column", sm: "row" }}
        gap={2}
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
          sx={{
            px: 4,
            py: 1.5,
            borderRadius: 2,
            width: { xs: "100%", sm: "auto" },
          }}
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
        <Box sx={{ display: { xs: "block", md: "none" }, p: 2 }}>
          {loading ? (
            <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : employees.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center" }}>
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
            </Box>
          ) : (
            <Stack spacing={1.25}>
              {employees.map((emp) => (
                <Paper
                  key={emp.id}
                  variant="outlined"
                  onClick={() => setSelectedEmployee(emp)}
                  sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: "pointer",
                    transition: "background-color 0.2s",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar
                      src={employeePhotoUrls[emp.id] || undefined}
                      sx={{
                        bgcolor: "primary.light",
                        color: "primary.main",
                        fontWeight: "bold",
                      }}
                    >
                      {emp.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 800 }} noWrap>
                        {emp.name}
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        sx={{ mt: 0.25 }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "monospace",
                            bgcolor: "action.hover",
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                          }}
                        >
                          {emp.code}
                        </Typography>
                        <Chip
                          label={emp.status}
                          size="small"
                          color={
                            emp.status === "active" ? "success" : "default"
                          }
                          variant={
                            emp.status === "active" ? "filled" : "outlined"
                          }
                          sx={{ textTransform: "capitalize", fontWeight: 700 }}
                        />
                      </Stack>
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {new Date(emp.created_at).toLocaleDateString()}
                    </Typography>
                  </Stack>

                  <Stack
                    direction="row"
                    spacing={0.5}
                    justifyContent="flex-end"
                    sx={{ mt: 1 }}
                  >
                    {canManageEmployeeLogins && (
                      <Tooltip title="Set/Reset Login Password">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLoginEmployee(emp);
                          }}
                        >
                          <VpnKeyRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit Employee">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditEmployee(emp);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Enroll Biometrics">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEnrollEmployee(emp);
                        }}
                      >
                        <FingerprintRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Employee">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDelete(emp.id, e)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        <Box sx={{ display: { xs: "none", md: "block" } }}>
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
                            src={employeePhotoUrls[emp.id] || undefined}
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
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
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
                          color={
                            emp.status === "active" ? "success" : "default"
                          }
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
                        {canManageEmployeeLogins && (
                          <Tooltip title="Set/Reset Login Password">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLoginEmployee(emp);
                              }}
                              sx={{
                                opacity: 0.6,
                                "&:hover": {
                                  opacity: 1,
                                  bgcolor: "action.hover",
                                },
                                mr: 0.5,
                              }}
                            >
                              <VpnKeyRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Edit Employee">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditEmployee(emp);
                            }}
                            sx={{
                              opacity: 0.6,
                              "&:hover": {
                                opacity: 1,
                                bgcolor: "action.hover",
                              },
                              mr: 0.5,
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Enroll Biometrics">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEnrollEmployee(emp);
                            }}
                            sx={{
                              opacity: 0.6,
                              "&:hover": {
                                opacity: 1,
                                bgcolor: "action.hover",
                              },
                              mr: 0.5,
                            }}
                          >
                            <FingerprintRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Employee">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => handleDelete(emp.id, e)}
                            sx={{
                              opacity: 0.6,
                              "&:hover": {
                                opacity: 1,
                                bgcolor: "error.lighter",
                              },
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
        </Box>
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

      {loginEmployee && (
        <EmployeeLoginDialog
          open={!!loginEmployee}
          employee={loginEmployee}
          onClose={() => setLoginEmployee(null)}
        />
      )}

      {enrollEmployee && (
        <EnrollBiometricDialog
          open={!!enrollEmployee}
          employee={enrollEmployee}
          onClose={() => setEnrollEmployee(null)}
        />
      )}
    </Container>
  );
}

function EmployeeLoginDialog({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee: Employee;
  onClose: () => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setBusy(false);
    setError("");
    setOk("");
    setNewPassword("");
    setConfirm("");

    api
      .get(
        `/api/tenant_users/employee_login?employee_id=${encodeURIComponent(
          employee.id
        )}`
      )
      .then((res) => {
        const existingEmail = String(res.data?.email || "");
        setEmail(existingEmail);
      })
      .catch(() => {
        setEmail("");
      })
      .finally(() => setLoading(false));
  }, [employee.id, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      await api.post("/api/tenant_users/employee_login/set_password", {
        employee_id: employee.id,
        email,
        new_password: newPassword,
      });
      setOk("Login password updated");
      setNewPassword("");
      setConfirm("");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update login password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
    >
      <form onSubmit={submit}>
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pb: 1,
          }}
        >
          <Typography variant="h6" fontWeight={800}>
            Employee Login
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                borderColor: alpha(theme.palette.primary.main, 0.24),
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Typography sx={{ fontWeight: 800 }}>{employee.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                Code: {employee.code}
              </Typography>
            </Paper>

            {error && <Alert severity="error">{error}</Alert>}
            {ok && <Alert severity="success">{ok}</Alert>}

            {loading ? (
              <Stack direction="row" spacing={2} alignItems="center">
                <CircularProgress size={18} />
                <Typography color="text.secondary">Loading login…</Typography>
              </Stack>
            ) : (
              <>
                <TextField
                  label="Login email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  required
                />
                <TextField
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  fullWidth
                  required
                />
                <TextField
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  fullWidth
                  required
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={onClose} color="inherit">
            Close
          </Button>
          <Button type="submit" variant="contained" disabled={busy || loading}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EnrollBiometricDialog({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee: Employee;
  onClose: () => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      streamRef.current = null;
    }
    const el = videoRef.current;
    if (el) el.srcObject = null;
  }, []);

  const close = useCallback(() => {
    stopCamera();
    setBusy(false);
    setError("");
    setOk("");
    setImage("");
    onClose();
  }, [onClose, stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setError("");
    setOk("");
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Camera not available");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      const el = videoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play().catch(() => {});
      }
    } catch {
      setError("Failed to start camera");
    }
  }, [stopCamera]);

  const captureSelfie = useCallback(() => {
    const el = videoRef.current;
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
    setImage(dataUrl);
    setError("");
    setOk("");
  }, []);

  const onPickFile = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const v = typeof reader.result === "string" ? reader.result : "";
      setImage(v);
      setError("");
      setOk("");
    };
    reader.readAsDataURL(file);
  }, []);

  const submit = useCallback(async () => {
    if (!image) {
      setError("Biometric image is required");
      return;
    }
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.post("/api/biometrics/enroll", {
        employee_id: employee.id,
        biometric_modality: "face",
        biometric_image: image,
      });
      setOk("Enrolled face template");
      setImage("");
      stopCamera();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to enroll biometrics"));
    } finally {
      setBusy(false);
    }
  }, [employee.id, image, stopCamera]);

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : close}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={800} noWrap>
            Enroll Biometrics
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {employee.name} • #{employee.id}
          </Typography>
        </Box>
        <IconButton onClick={close} size="small" disabled={busy}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          ) : null}
          {ok ? (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              {ok}
            </Alert>
          ) : null}

          <Stack spacing={1.5}>
            <Box
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                border: "1px solid",
                borderColor: alpha(theme.palette.text.primary, 0.12),
                bgcolor: "background.default",
                aspectRatio: "16 / 9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Box
                component="video"
                ref={videoRef}
                muted
                playsInline
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                onClick={() => void startCamera()}
                disabled={busy}
                sx={{ borderRadius: 2, fontWeight: 900 }}
              >
                Start Camera
              </Button>
              <Button
                variant="outlined"
                onClick={stopCamera}
                disabled={busy}
                sx={{ borderRadius: 2, fontWeight: 900 }}
              >
                Stop Camera
              </Button>
              <Button
                variant="contained"
                onClick={captureSelfie}
                disabled={busy}
                sx={{ borderRadius: 2, fontWeight: 900 }}
              >
                Take Selfie
              </Button>
              <Button
                component="label"
                variant="outlined"
                disabled={busy}
                sx={{ borderRadius: 2, fontWeight: 900 }}
              >
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                />
              </Button>
            </Stack>
          </Stack>

          {image ? (
            <Box
              component="img"
              src={image}
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
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={close} disabled={busy} color="inherit">
          Close
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={busy || !image}
        >
          {busy ? "Please wait…" : "Enroll"}
        </Button>
      </DialogActions>
    </Dialog>
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [form, setForm] = useState({
    name: "",
    code: "",
    gender: "",
    date_of_birth: "",
    personal_phone: "",
    email: "",
    present_address: "",
    permanent_address: "",
    department: "",
    designation: "",
    employee_type: "",
    date_of_joining: "",
    supervisor_name: "",
    work_location: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/employees", form);
      setForm({
        name: "",
        code: "",
        gender: "",
        date_of_birth: "",
        personal_phone: "",
        email: "",
        present_address: "",
        permanent_address: "",
        department: "",
        designation: "",
        employee_type: "",
        date_of_joining: "",
        supervisor_name: "",
        work_location: "",
      });
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
      fullScreen={isMobile}
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
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
            <TextField
              select
              label="Gender"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              required
              variant="outlined"
            >
              <MenuItem value="male">Male</MenuItem>
              <MenuItem value="female">Female</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
            <TextField
              label="Date of Birth"
              type="date"
              value={form.date_of_birth}
              onChange={(e) =>
                setForm({ ...form, date_of_birth: e.target.value })
              }
              required
              variant="outlined"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Personal Phone Number"
              value={form.personal_phone}
              onChange={(e) =>
                setForm({ ...form, personal_phone: e.target.value })
              }
              required
              variant="outlined"
            />
            <TextField
              label="Email Address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              variant="outlined"
            />
            <TextField
              label="Present Address"
              value={form.present_address}
              onChange={(e) =>
                setForm({ ...form, present_address: e.target.value })
              }
              required
              multiline
              minRows={2}
              variant="outlined"
            />
            <TextField
              label="Permanent Address"
              value={form.permanent_address}
              onChange={(e) =>
                setForm({ ...form, permanent_address: e.target.value })
              }
              required
              multiline
              minRows={2}
              variant="outlined"
            />
            <TextField
              label="Department"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              required
              variant="outlined"
            />
            <TextField
              label="Designation / Role"
              value={form.designation}
              onChange={(e) =>
                setForm({ ...form, designation: e.target.value })
              }
              required
              variant="outlined"
            />
            <TextField
              select
              label="Employee Type"
              value={form.employee_type}
              onChange={(e) =>
                setForm({ ...form, employee_type: e.target.value })
              }
              required
              variant="outlined"
            >
              <MenuItem value="permanent">Permanent</MenuItem>
              <MenuItem value="contract">Contract</MenuItem>
              <MenuItem value="intern">Intern</MenuItem>
            </TextField>
            <TextField
              label="Date of Joining"
              type="date"
              value={form.date_of_joining}
              onChange={(e) =>
                setForm({ ...form, date_of_joining: e.target.value })
              }
              required
              variant="outlined"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Supervisor / Reporting Manager"
              value={form.supervisor_name}
              onChange={(e) =>
                setForm({ ...form, supervisor_name: e.target.value })
              }
              required
              variant="outlined"
            />
            <TextField
              label="Work Location / Branch"
              value={form.work_location}
              onChange={(e) =>
                setForm({ ...form, work_location: e.target.value })
              }
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const profilePhotoUrlRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [form, setForm] = useState({
    name: employee.name,
    code: employee.code,
    gender: employee.gender || "",
    date_of_birth: employee.date_of_birth || "",
    personal_phone: employee.personal_phone || "",
    email: employee.email || "",
    present_address: employee.present_address || "",
    permanent_address: employee.permanent_address || "",
    department: employee.department || "",
    designation: employee.designation || "",
    employee_type: employee.employee_type || "",
    date_of_joining: employee.date_of_joining || "",
    supervisor_name: employee.supervisor_name || "",
    work_location: employee.work_location || "",
    status: employee.status,
  });
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceSyncIds, setDeviceSyncIds] = useState<Record<string, string>>(
    {}
  );
  const [attachments, setAttachments] = useState<
    {
      id: string;
      category: string;
      title: string;
      original_name: string;
      mime: string;
      size_bytes: number;
      created_at: string;
    }[]
  >([]);
  const [attachCategory, setAttachCategory] = useState("attachment");
  const [attachTitle, setAttachTitle] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const refreshProfilePhoto = useCallback(async () => {
    try {
      const res = await api.get(
        `/api/employees/profile_photo?employee_id=${encodeURIComponent(
          employee.id
        )}`,
        {
          responseType: "blob",
          validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
        }
      );
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
  }, [employee.id]);

  useEffect(() => {
    if (!open) return;

    setForm({
      name: employee.name,
      code: employee.code,
      gender: employee.gender || "",
      date_of_birth: employee.date_of_birth || "",
      personal_phone: employee.personal_phone || "",
      email: employee.email || "",
      present_address: employee.present_address || "",
      permanent_address: employee.permanent_address || "",
      department: employee.department || "",
      designation: employee.designation || "",
      employee_type: employee.employee_type || "",
      date_of_joining: employee.date_of_joining || "",
      supervisor_name: employee.supervisor_name || "",
      work_location: employee.work_location || "",
      status: employee.status,
    });
    setError("");
    setOk("");
    setAttachCategory("attachment");
    setAttachTitle("");
    setAttachFile(null);
    setPhotoBusy(false);

    const run = async () => {
      setLoading(true);
      try {
        const [dRes, sRes, aRes] = await Promise.all([
          api.get("/api/devices"),
          api.get(
            `/api/employees/device_sync_ids?employee_id=${encodeURIComponent(
              employee.id
            )}`
          ),
          api.get(
            `/api/employees/attachments?employee_id=${encodeURIComponent(
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

        setAttachments(
          ((aRes.data?.attachments || []) as {
            id: string;
            category: string;
            title: string;
            original_name: string;
            mime: string;
            size_bytes: number;
            created_at: string;
          }[]) || []
        );
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load sync IDs"));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [
    employee.code,
    employee.date_of_birth,
    employee.date_of_joining,
    employee.department,
    employee.designation,
    employee.email,
    employee.employee_type,
    employee.gender,
    employee.id,
    employee.name,
    employee.permanent_address,
    employee.personal_phone,
    employee.present_address,
    employee.status,
    employee.supervisor_name,
    employee.work_location,
    open,
  ]);

  useEffect(() => {
    if (!open) {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
      setProfilePhotoUrl(null);
      return;
    }
    refreshProfilePhoto();
    return () => {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
    };
  }, [open, refreshProfilePhoto]);

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
        gender: form.gender,
        date_of_birth: form.date_of_birth,
        personal_phone: form.personal_phone,
        email: form.email,
        present_address: form.present_address,
        permanent_address: form.permanent_address,
        department: form.department,
        designation: form.designation,
        employee_type: form.employee_type,
        date_of_joining: form.date_of_joining,
        supervisor_name: form.supervisor_name,
        work_location: form.work_location,
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

  const uploadAttachment = async () => {
    if (!attachFile) return;
    setAttachBusy(true);
    setError("");
    setOk("");
    try {
      const fd = new FormData();
      fd.set("employee_id", employee.id);
      fd.set("category", attachCategory);
      if (attachTitle.trim()) fd.set("title", attachTitle.trim());
      fd.set("file", attachFile);
      await api.post("/api/employees/attachments/upload", fd);
      const aRes = await api.get(
        `/api/employees/attachments?employee_id=${encodeURIComponent(
          employee.id
        )}`
      );
      setAttachments(
        ((aRes.data?.attachments || []) as {
          id: string;
          category: string;
          title: string;
          original_name: string;
          mime: string;
          size_bytes: number;
          created_at: string;
        }[]) || []
      );
      setAttachTitle("");
      setAttachFile(null);
      setOk("Uploaded");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to upload attachment"));
    } finally {
      setAttachBusy(false);
    }
  };

  const downloadAttachment = async (id: string, filename: string) => {
    setError("");
    try {
      const res = await api.get(
        `/api/employees/attachments/download?id=${encodeURIComponent(id)}`,
        {
          responseType: "blob",
        }
      );
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to download attachment"));
    }
  };

  const removeAttachment = async (id: string) => {
    if (!window.confirm("Delete this attachment?")) return;
    setError("");
    setOk("");
    try {
      await api.post("/api/employees/attachments/delete", { id });
      setAttachments((prev) => prev.filter((x) => x.id !== id));
      setOk("Deleted");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to delete attachment"));
    }
  };

  const uploadProfilePhoto = async (file: File) => {
    setPhotoBusy(true);
    setError("");
    setOk("");
    try {
      const fd = new FormData();
      fd.append("employee_id", employee.id);
      fd.append("file", file);
      await api.post("/api/employees/profile_photo/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshProfilePhoto();
      setOk("Profile photo updated");
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to upload profile photo"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const statusOptions = (() => {
    const base = ["active", "inactive"];
    if (form.status && !base.includes(form.status))
      return [...base, form.status];
    return base;
  })();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            src={profilePhotoUrl || undefined}
            sx={{
              width: 36,
              height: 36,
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              color: theme.palette.primary.main,
              fontWeight: 900,
            }}
          >
            {(form.name || employee.name || "?")
              .trim()
              .slice(0, 1)
              .toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight={800} lineHeight={1.1}>
              Edit Employee
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 0.35 }}
            >
              <Typography variant="body2" color="text.secondary">
                {(form.name || employee.name || "").trim() || "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                •
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {(form.code || employee.code || "").trim() || "—"}
              </Typography>
              <Chip
                size="small"
                label={(form.status || "active").trim() || "active"}
                sx={{
                  ml: 0.5,
                  fontWeight: 800,
                  height: 22,
                  bgcolor:
                    (form.status || "").toLowerCase() === "active"
                      ? alpha(theme.palette.success.main, 0.14)
                      : alpha(theme.palette.text.primary, 0.06),
                  color:
                    (form.status || "").toLowerCase() === "active"
                      ? theme.palette.success.main
                      : theme.palette.text.secondary,
                }}
              />
            </Stack>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy}
            sx={{ borderRadius: 2, fontWeight: 900, ml: 1 }}
          >
            {photoBusy ? "Uploading..." : "Upload Photo"}
          </Button>
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {ok && <Alert severity="success">{ok}</Alert>}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="subtitle2" fontWeight={900}>
                  Personal
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Basic employee identity details
                </Typography>
              </Box>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Full Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Employee Code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="Gender"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  required
                  fullWidth
                  size="small"
                >
                  <MenuItem value="male">Male</MenuItem>
                  <MenuItem value="female">Female</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </TextField>
                <TextField
                  label="Date of Birth"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) =>
                    setForm({ ...form, date_of_birth: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={900}>
                Contact
              </Typography>
              <Typography variant="body2" color="text.secondary">
                How to reach the employee and addresses
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Personal Phone Number"
                  value={form.personal_phone}
                  onChange={(e) =>
                    setForm({ ...form, personal_phone: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Email Address"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Present Address"
                  value={form.present_address}
                  onChange={(e) =>
                    setForm({ ...form, present_address: e.target.value })
                  }
                  required
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                />
                <TextField
                  label="Permanent Address"
                  value={form.permanent_address}
                  onChange={(e) =>
                    setForm({ ...form, permanent_address: e.target.value })
                  }
                  required
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                />
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={900}>
                Employment
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Department, role, and work details
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Department"
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Designation / Role"
                  value={form.designation}
                  onChange={(e) =>
                    setForm({ ...form, designation: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="Employee Type"
                  value={form.employee_type}
                  onChange={(e) =>
                    setForm({ ...form, employee_type: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                >
                  <MenuItem value="permanent">Permanent</MenuItem>
                  <MenuItem value="contract">Contract</MenuItem>
                  <MenuItem value="intern">Intern</MenuItem>
                </TextField>
                <TextField
                  label="Date of Joining"
                  type="date"
                  value={form.date_of_joining}
                  onChange={(e) =>
                    setForm({ ...form, date_of_joining: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Supervisor / Reporting Manager"
                  value={form.supervisor_name}
                  onChange={(e) =>
                    setForm({ ...form, supervisor_name: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Work Location / Branch"
                  value={form.work_location}
                  onChange={(e) =>
                    setForm({ ...form, work_location: e.target.value })
                  }
                  required
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="Status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  fullWidth
                  size="small"
                >
                  {statusOptions.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="subtitle2" fontWeight={900}>
                  Attachments
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  CV, certificates, and supporting files
                </Typography>
              </Box>
              <Chip
                label={`${attachments.length} file${
                  attachments.length === 1 ? "" : "s"
                }`}
                size="small"
                sx={{ fontWeight: 800 }}
              />
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", md: "center" }}
              >
                <TextField
                  select
                  label="Category"
                  value={attachCategory}
                  onChange={(e) => setAttachCategory(e.target.value)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="cv">CV</MenuItem>
                  <MenuItem value="certificate">Certificate</MenuItem>
                  <MenuItem value="attachment">Attachment</MenuItem>
                </TextField>
                <TextField
                  label="Title (optional)"
                  value={attachTitle}
                  onChange={(e) => setAttachTitle(e.target.value)}
                  fullWidth
                  size="small"
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    component="label"
                    variant="outlined"
                    disabled={attachBusy || loading}
                    sx={{
                      borderRadius: 2,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Choose File
                    <input
                      type="file"
                      hidden
                      onChange={(e) =>
                        setAttachFile(e.target.files?.[0] || null)
                      }
                    />
                  </Button>
                  <Button
                    variant="contained"
                    disabled={!attachFile || attachBusy || loading}
                    onClick={() => void uploadAttachment()}
                    sx={{
                      borderRadius: 2,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {attachBusy ? "Uploading..." : "Upload"}
                  </Button>
                </Stack>
              </Stack>
              {attachFile && (
                <Chip
                  label={attachFile.name}
                  onDelete={() => setAttachFile(null)}
                  deleteIcon={<DeleteIcon />}
                  size="small"
                  sx={{ alignSelf: "flex-start", fontWeight: 700 }}
                />
              )}
              {attachments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No attachments uploaded.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {attachments.map((a) => (
                    <Paper
                      key={a.id}
                      variant="outlined"
                      sx={{ p: 1.25, borderRadius: 2 }}
                    >
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.25}
                        alignItems={{ xs: "stretch", sm: "center" }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Tooltip title={a.original_name}>
                            <Typography variant="body2" fontWeight={800} noWrap>
                              {a.original_name}
                            </Typography>
                          </Tooltip>
                          <Typography variant="caption" color="text.secondary">
                            {a.category}
                            {a.title ? ` • ${a.title}` : ""} •{" "}
                            {new Date(a.created_at).toLocaleString()}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              void downloadAttachment(a.id, a.original_name)
                            }
                          >
                            Download
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            onClick={() => void removeAttachment(a.id)}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="subtitle2" fontWeight={900}>
                  Per-device Sync IDs
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Map employee IDs for each biometric device
                </Typography>
              </Box>
              {loading ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    Loading
                  </Typography>
                </Stack>
              ) : (
                <Chip
                  label={`${devicesSorted.length} device${
                    devicesSorted.length === 1 ? "" : "s"
                  }`}
                  size="small"
                  sx={{ fontWeight: 800 }}
                />
              )}
            </Stack>
            <Divider sx={{ my: 2 }} />
            {loading ? null : devicesSorted.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No devices found.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {devicesSorted.map((d) => (
                  <Paper
                    key={d.device_id}
                    variant="outlined"
                    sx={{ p: 1.25, borderRadius: 2 }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <Box sx={{ minWidth: { sm: 260 } }}>
                        <Typography variant="body2" fontWeight={800}>
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
                        size="small"
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      </DialogContent>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          e.target.value = "";
          if (!f) return;
          void uploadProfilePhoto(f);
        }}
      />
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} color="inherit" sx={{ mr: 1 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || loading}
          size="large"
        >
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
    holidays?: HolidayRecord[];
    working_days?: string;
    leave_totals?: { paid: number; unpaid: number; total: number };
  }>({ attendance: [], leaves: [], holidays: [], working_days: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState<{
    reason: string;
    status: string;
    leave_type: string;
    day_part: string;
  }>({
    reason: "",
    status: "pending",
    leave_type: "casual",
    day_part: "full",
  });
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaveOk, setLeaveOk] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const lastRefreshAtRef = useRef(0);
  const role = getUser()?.role || "";
  const canManageLeaveTypes = role === "hr_admin" || role === "tenant_owner";
  const canManageLeaveAllocations =
    role === "hr_admin" || role === "tenant_owner";
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [allocYear, setAllocYear] = useState(() => new Date().getFullYear());
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocError, setAllocError] = useState("");
  const [allocOk, setAllocOk] = useState("");
  const [allocBusyType, setAllocBusyType] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<LeaveAllocationRow[]>([]);
  const [allocDraftByType, setAllocDraftByType] = useState<
    Record<string, string>
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

  const allocationRows = useMemo<LeaveAllocationRow[]>(() => {
    if (allocations.length > 0) return allocations;
    if (selectableLeaveTypes.length === 0) return [];
    return selectableLeaveTypes
      .map((t) => {
        const code = String(t.code || "")
          .trim()
          .toLowerCase();
        if (!code) return null;
        return {
          employee_id: Number(employee.id),
          year: allocYear,
          leave_type: code,
          leave_type_name: String(t.name || code),
          allocated_days: 0,
          used_days: 0,
          remaining_days: 0,
        };
      })
      .filter((v): v is LeaveAllocationRow => v !== null);
  }, [allocYear, allocations, employee.id, selectableLeaveTypes]);

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

  const fetchLeaveAllocations = useCallback(async () => {
    if (!canManageLeaveAllocations) return;
    setAllocLoading(true);
    setAllocError("");
    setAllocOk("");
    try {
      const res = await api.get(
        `/api/leave_allocations?employee_id=${encodeURIComponent(
          employee.id
        )}&year=${encodeURIComponent(String(allocYear))}`
      );
      const rows = Array.isArray(res.data?.allocations)
        ? (res.data.allocations as LeaveAllocationRow[])
        : [];
      setAllocations(rows);
      setAllocDraftByType((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          const k = String(r.leave_type || "").toLowerCase();
          if (!k) continue;
          if (!(k in next)) next[k] = String(r.allocated_days ?? 0);
        }
        return next;
      });
    } catch (err: unknown) {
      setAllocations([]);
      setAllocError(getErrorMessage(err, "Failed to load allocations"));
    } finally {
      setAllocLoading(false);
    }
  }, [allocYear, canManageLeaveAllocations, employee.id]);

  const saveAllocation = useCallback(
    async (leaveType: string) => {
      const code = String(leaveType || "")
        .trim()
        .toLowerCase();
      if (!code) return;
      setAllocBusyType(code);
      setAllocError("");
      setAllocOk("");
      try {
        const raw = allocDraftByType[code];
        const n = raw === undefined || raw === null ? 0 : Number(raw);
        const allocatedDays = Number.isFinite(n) ? n : 0;
        await api.post("/api/leave_allocations", {
          employee_id: employee.id,
          year: allocYear,
          leave_type: code,
          allocated_days: allocatedDays,
        });
        setAllocOk("Allocation saved");
        await fetchLeaveAllocations();
      } catch (err: unknown) {
        setAllocError(getErrorMessage(err, "Failed to save allocation"));
      } finally {
        setAllocBusyType(null);
      }
    },
    [allocDraftByType, allocYear, employee.id, fetchLeaveAllocations]
  );

  const clearAllocation = useCallback(
    async (leaveType: string) => {
      const code = String(leaveType || "")
        .trim()
        .toLowerCase();
      if (!code) return;
      setAllocBusyType(code);
      setAllocError("");
      setAllocOk("");
      try {
        await api.post("/api/leave_allocations/delete", {
          employee_id: employee.id,
          year: allocYear,
          leave_type: code,
        });
        setAllocDraftByType((p) => ({ ...p, [code]: "0" }));
        setAllocOk("Allocation cleared");
        await fetchLeaveAllocations();
      } catch (err: unknown) {
        setAllocError(getErrorMessage(err, "Failed to clear allocation"));
      } finally {
        setAllocBusyType(null);
      }
    },
    [allocYear, employee.id, fetchLeaveAllocations]
  );

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
    void fetchLeaveTypes();
  }, [fetchLeaveTypes, open]);

  useEffect(() => {
    if (!open) return;
    void fetchLeaveAllocations();
  }, [fetchLeaveAllocations, open]);

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

  useEffect(() => {
    if (!open) return;
    if (selectableLeaveTypes.length === 0) return;
    const codes = new Set(
      selectableLeaveTypes.map((t) => String(t.code || ""))
    );
    setLeaveForm((p) => {
      const cur = String(p.leave_type || "").trim();
      const next = codes.has(cur)
        ? cur
        : String(selectableLeaveTypes[0]?.code || "");
      if (!next || cur === next) return p;
      return { ...p, leave_type: next };
    });
    setApplyForm((p) => {
      const cur = String(p.leave_type || "").trim();
      const next = codes.has(cur)
        ? cur
        : String(selectableLeaveTypes[0]?.code || "");
      if (!next || cur === next) return p;
      return { ...p, leave_type: next };
    });
  }, [open, selectableLeaveTypes]);

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

    const holiday = holidayByDate.get(dateStr);
    if (holiday)
      return {
        type: "holiday",
        label: holiday.name || "Holiday",
        color: theme.palette.info.main,
        bg: alpha(theme.palette.info.main, 0.12),
      };

    if (!isWorkingDay(dateStr))
      return {
        type: "off",
        label: "Off",
        color: theme.palette.text.secondary,
        bg: alpha(theme.palette.text.secondary, 0.08),
      };

    const leave = records.leaves.find((r) => r.date === dateStr);
    if (leave) {
      const status = String(leave.status || "pending").toLowerCase();
      const approved = status === "approved";
      const rejected = status === "rejected";
      return {
        type: approved
          ? "leave"
          : rejected
          ? "leave_rejected"
          : "leave_pending",
        label: approved
          ? leave.day_part && leave.day_part !== "full"
            ? "Half Leave"
            : "Leave"
          : rejected
          ? "Leave (Rejected)"
          : "Leave (Pending)",
        leave,
        color: approved
          ? theme.palette.warning.main
          : rejected
          ? theme.palette.error.main
          : theme.palette.text.secondary,
        bg: approved
          ? alpha(theme.palette.warning.main, 0.1)
          : rejected
          ? alpha(theme.palette.error.main, 0.1)
          : alpha(theme.palette.text.secondary, 0.08),
      };
    }

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

  useEffect(() => {
    if (!selectedDate) return;
    const leave = records.leaves.find((r) => r.date === selectedDate) || null;
    setLeaveForm({
      reason: (leave?.reason ?? "") || "",
      status: (leave?.status ?? "pending") || "pending",
      leave_type:
        String(leave?.leave_type || "").trim() ||
        String(selectableLeaveTypes[0]?.code || "casual"),
      day_part: (leave?.day_part ?? "full") || "full",
    });
    setLeaveError("");
    setLeaveOk("");
  }, [records.leaves, selectableLeaveTypes, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    setApplyForm((prev) => ({
      ...prev,
      start_date: selectedDate,
      end_date: selectedDate,
    }));
  }, [selectedDate]);

  const workingDaysSet = (() => {
    const raw = String(records.working_days || "");
    const parts = raw
      ? raw.split(",").map((p) => p.trim())
      : ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const set = new Set(parts.filter(Boolean).map((p) => p.toLowerCase()));
    return set;
  })();

  const holidayByDate = (() => {
    const m = new Map<string, HolidayRecord>();
    for (const h of records.holidays || []) {
      if (!h?.date) continue;
      m.set(h.date, h);
    }
    return m;
  })();

  const isWorkingDay = (dateStr: string): boolean => {
    const dt = new Date(`${dateStr}T00:00:00`);
    const dow = dt
      .toLocaleDateString("en-US", { weekday: "short" })
      .toLowerCase();
    return workingDaysSet.has(dow);
  };

  const notifyAttendanceUpdated = () => {
    window.dispatchEvent(new Event("attendance:updated"));
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const bc = new BroadcastChannel("attendance");
      bc.postMessage({ type: "updated" });
      bc.close();
    }
  };

  const saveLeave = async (statusOverride?: string) => {
    if (!selectedDate) return;
    setLeaveBusy(true);
    setLeaveError("");
    setLeaveOk("");
    try {
      const status = statusOverride ?? leaveForm.status;
      if (selectedLeave?.id) {
        await api.post("/api/leaves/update", {
          id: selectedLeave.id,
          reason: leaveForm.reason,
          status,
          leave_type: leaveForm.leave_type,
          day_part: leaveForm.day_part,
        });
      } else {
        await api.post("/api/leaves", {
          employee_id: employee.id,
          date: selectedDate,
          reason: leaveForm.reason,
          status,
          leave_type: leaveForm.leave_type,
          day_part: leaveForm.day_part,
        });
      }
      setLeaveOk("Saved");
      await fetchData();
      notifyAttendanceUpdated();
    } catch (err: unknown) {
      setLeaveError(getErrorMessage(err, "Failed to save leave"));
    } finally {
      setLeaveBusy(false);
    }
  };

  const deleteLeave = async () => {
    if (!selectedLeave?.id) return;
    if (!window.confirm("Delete this leave record?")) return;
    setLeaveBusy(true);
    setLeaveError("");
    setLeaveOk("");
    try {
      await api.post("/api/leaves/delete", { id: selectedLeave.id });
      setLeaveOk("Deleted");
      await fetchData();
      notifyAttendanceUpdated();
    } catch (err: unknown) {
      setLeaveError(getErrorMessage(err, "Failed to delete leave"));
    } finally {
      setLeaveBusy(false);
    }
  };

  const applyLeaveRange = async () => {
    if (!applyForm.start_date || !applyForm.end_date) return;
    setLeaveBusy(true);
    setLeaveError("");
    setLeaveOk("");
    try {
      await api.post("/api/leaves/apply", {
        employee_id: employee.id,
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        leave_type: applyForm.leave_type,
        day_part:
          applyForm.start_date === applyForm.end_date
            ? applyForm.day_part
            : "full",
        reason: applyForm.reason,
        status: "pending",
      });
      setLeaveOk("Applied");
      setApplyOpen(false);
      await fetchData();
      notifyAttendanceUpdated();
    } catch (err: unknown) {
      setLeaveError(getErrorMessage(err, "Failed to apply leave"));
    } finally {
      setLeaveBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: { borderRadius: isMobile ? 0 : 3, minHeight: "600px" },
      }}
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
            flexDirection={{ xs: "column", sm: "row" }}
            gap={{ xs: 1.25, sm: 0 }}
          >
            <IconButton
              onClick={handlePrevMonth}
              sx={{ alignSelf: { xs: "flex-start", sm: "auto" } }}
            >
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
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              <Button
                variant="outlined"
                size="small"
                onClick={() => setApplyOpen(true)}
                fullWidth
              >
                Apply Leave
              </Button>
              <IconButton
                onClick={handleNextMonth}
                sx={{ alignSelf: { xs: "flex-end", sm: "auto" } }}
              >
                <ChevronRight />
              </IconButton>
            </Stack>
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
                gap={{ xs: 0.5, sm: 1 }}
                mb={1}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <Box key={d} sx={{ textAlign: "center" }}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      sx={{
                        textTransform: "uppercase",
                        fontSize: { xs: 10, sm: 12 },
                      }}
                    >
                      {d}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Days Grid */}
              <Box
                display="grid"
                gridTemplateColumns="repeat(7, 1fr)"
                gap={{ xs: 0.5, sm: 1 }}
              >
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
                          height: { xs: 54, sm: 84, md: 96 },
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
                          transition:
                            "transform 140ms ease, box-shadow 140ms ease",
                          cursor: "pointer",
                          "@media (hover:hover) and (pointer:fine)": {
                            "&:hover": {
                              transform: "translateY(-2px)",
                              boxShadow: 2,
                            },
                          },
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
                          sx={{ fontSize: { xs: 14, sm: 18 }, lineHeight: 1 }}
                        >
                          {day}
                        </Typography>
                        {status.type === "present" && status.attendance ? (
                          <Box
                            sx={{
                              mt: 0.5,
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 0.25,
                              display: { xs: "none", sm: "flex" },
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
                              display: { xs: "none", sm: "inline-flex" },
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

          {canManageLeaveAllocations ? (
            <Paper
              variant="outlined"
              sx={{ mt: 3, p: 2, borderRadius: 3, bgcolor: "background.paper" }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", sm: "center" }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="subtitle2" fontWeight={900}>
                    Leave Allocations
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Set yearly allocations per leave type.
                  </Typography>
                </Box>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  <TextField
                    label="Year"
                    type="number"
                    value={allocYear}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === "" ? NaN : Number(raw);
                      if (Number.isFinite(n)) setAllocYear(Math.trunc(n));
                    }}
                    size="small"
                    sx={{ width: { xs: "100%", sm: 140 } }}
                    inputProps={{ min: 1970, max: 2200 }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => void fetchLeaveAllocations()}
                    disabled={allocLoading}
                    fullWidth={isMobile}
                  >
                    {allocLoading ? "Loading..." : "Refresh"}
                  </Button>
                </Stack>
              </Stack>
              <Divider sx={{ my: 2 }} />

              {allocError ? (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                  {allocError}
                </Alert>
              ) : null}
              {allocOk ? (
                <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                  {allocOk}
                </Alert>
              ) : null}

              {allocationRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No allocations found.
                </Typography>
              ) : (
                <>
                  {isMobile ? (
                    <Stack spacing={1.5}>
                      {allocationRows
                        .slice()
                        .sort((a, b) =>
                          String(
                            a.leave_type_name || a.leave_type
                          ).localeCompare(
                            String(b.leave_type_name || b.leave_type)
                          )
                        )
                        .map((row) => {
                          const code = String(row.leave_type || "")
                            .trim()
                            .toLowerCase();
                          const busy = allocBusyType === code;
                          const draft =
                            allocDraftByType[code] ??
                            String(row.allocated_days ?? 0);
                          return (
                            <Paper
                              key={`${row.year}-${code}`}
                              variant="outlined"
                              sx={{ p: 1.5, borderRadius: 3 }}
                            >
                              <Stack spacing={1.25}>
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <Typography sx={{ fontWeight: 900 }}>
                                    {row.leave_type_name || row.leave_type}
                                  </Typography>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    flexWrap="wrap"
                                    useFlexGap
                                    justifyContent="flex-end"
                                  >
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={`Used ${Number(
                                        row.used_days ?? 0
                                      ).toFixed(1)}`}
                                      sx={{ fontWeight: 800 }}
                                    />
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={`Remaining ${Number(
                                        row.remaining_days ?? 0
                                      ).toFixed(1)}`}
                                      sx={{ fontWeight: 800 }}
                                    />
                                  </Stack>
                                </Stack>

                                <TextField
                                  label="Allocated"
                                  value={draft}
                                  onChange={(e) =>
                                    setAllocDraftByType((p) => ({
                                      ...p,
                                      [code]: e.target.value,
                                    }))
                                  }
                                  size="small"
                                  type="number"
                                  inputProps={{ min: 0, step: 0.5 }}
                                  fullWidth
                                />

                                <Stack direction="row" spacing={1}>
                                  <Button
                                    variant="contained"
                                    disabled={busy}
                                    onClick={() => void saveAllocation(code)}
                                    fullWidth
                                  >
                                    {busy ? "Saving..." : "Save"}
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    color="inherit"
                                    disabled={busy}
                                    onClick={() => void clearAllocation(code)}
                                    fullWidth
                                  >
                                    Clear
                                  </Button>
                                </Stack>
                              </Stack>
                            </Paper>
                          );
                        })}
                    </Stack>
                  ) : (
                    <TableContainer
                      component={Paper}
                      variant="outlined"
                      sx={{
                        width: "100%",
                        overflowX: "auto",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Leave Type</TableCell>
                            <TableCell align="right">Allocated</TableCell>
                            <TableCell align="right">Used</TableCell>
                            <TableCell align="right">Remaining</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {allocationRows
                            .slice()
                            .sort((a, b) =>
                              String(
                                a.leave_type_name || a.leave_type
                              ).localeCompare(
                                String(b.leave_type_name || b.leave_type)
                              )
                            )
                            .map((row) => {
                              const code = String(row.leave_type || "")
                                .trim()
                                .toLowerCase();
                              const busy = allocBusyType === code;
                              const draft =
                                allocDraftByType[code] ??
                                String(row.allocated_days ?? 0);
                              return (
                                <TableRow key={`${row.year}-${code}`}>
                                  <TableCell sx={{ fontWeight: 800 }}>
                                    {row.leave_type_name || row.leave_type}
                                  </TableCell>
                                  <TableCell align="right">
                                    <TextField
                                      value={draft}
                                      onChange={(e) =>
                                        setAllocDraftByType((p) => ({
                                          ...p,
                                          [code]: e.target.value,
                                        }))
                                      }
                                      size="small"
                                      type="number"
                                      inputProps={{ min: 0, step: 0.5 }}
                                      sx={{ width: 120 }}
                                    />
                                  </TableCell>
                                  <TableCell align="right">
                                    {Number(row.used_days ?? 0).toFixed(1)}
                                  </TableCell>
                                  <TableCell align="right">
                                    {Number(row.remaining_days ?? 0).toFixed(1)}
                                  </TableCell>
                                  <TableCell align="right">
                                    <Stack direction="row" spacing={1}>
                                      <Button
                                        size="small"
                                        variant="contained"
                                        disabled={busy}
                                        onClick={() =>
                                          void saveAllocation(code)
                                        }
                                      >
                                        {busy ? "Saving..." : "Save"}
                                      </Button>
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        color="inherit"
                                        disabled={busy}
                                        onClick={() =>
                                          void clearAllocation(code)
                                        }
                                      >
                                        Clear
                                      </Button>
                                    </Stack>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}
            </Paper>
          ) : null}

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
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
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
                label={`Leave: ${(
                  formatLeaveTypeLabel(selectedLeave.leave_type) || "leave"
                ).toString()} • ${(
                  selectedLeave.day_part || "full"
                ).toString()}`}
                color="info"
                variant="outlined"
              />
            ) : null}
          </Stack>

          {leaveError ? (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              {leaveError}
            </Alert>
          ) : null}
          {leaveOk ? (
            <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>
              {leaveOk}
            </Alert>
          ) : null}

          <Paper
            elevation={0}
            sx={{
              mt: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
              bgcolor: "background.default",
            }}
          >
            <Stack spacing={1.5}>
              {selectedLeave?.id &&
              (role === "manager" ||
                role === "hr_admin" ||
                role === "tenant_owner") ? (
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  {String(selectedLeave.status || "").toLowerCase() ===
                  "pending" ? (
                    <>
                      <Button
                        variant="contained"
                        onClick={() => {
                          setLeaveForm((prev) => ({
                            ...prev,
                            status: "approved",
                          }));
                          void saveLeave("approved");
                        }}
                        disabled={leaveBusy}
                      >
                        Approve
                      </Button>
                      <Button
                        color="error"
                        variant="outlined"
                        onClick={() => {
                          setLeaveForm((prev) => ({
                            ...prev,
                            status: "rejected",
                          }));
                          void saveLeave("rejected");
                        }}
                        disabled={leaveBusy}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                </Stack>
              ) : null}
              <TextField
                label="Leave Reason"
                value={leaveForm.reason}
                onChange={(e) =>
                  setLeaveForm((prev) => ({ ...prev, reason: e.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Leave Status"
                value={leaveForm.status}
                onChange={(e) =>
                  setLeaveForm((prev) => ({ ...prev, status: e.target.value }))
                }
                fullWidth
                select
              >
                {["pending", "approved", "rejected"].map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Leave Type"
                value={leaveForm.leave_type}
                onChange={(e) =>
                  setLeaveForm((prev) => ({
                    ...prev,
                    leave_type: e.target.value,
                  }))
                }
                fullWidth
                select
              >
                {selectableLeaveTypes.map((t) => (
                  <MenuItem
                    key={String(t.code)}
                    value={String(t.code)}
                    disabled={Number(t.active) === 0}
                  >
                    {String(t.name || t.code)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Day Part"
                value={leaveForm.day_part}
                onChange={(e) =>
                  setLeaveForm((prev) => ({
                    ...prev,
                    day_part: e.target.value,
                  }))
                }
                fullWidth
                select
              >
                {["full", "am", "pm"].map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  onClick={() => void saveLeave()}
                  disabled={leaveBusy}
                >
                  {leaveBusy
                    ? "Saving..."
                    : selectedLeave
                    ? "Update Leave"
                    : "Add Leave"}
                </Button>
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => void deleteLeave()}
                  disabled={leaveBusy || !selectedLeave}
                >
                  Delete Leave
                </Button>
              </Stack>
            </Stack>
          </Paper>

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

      <Dialog
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h6" fontWeight={800}>
            Apply Leave
          </Typography>
          <IconButton onClick={() => setApplyOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <TextField
              label="Start"
              type="date"
              value={applyForm.start_date}
              onChange={(e) =>
                setApplyForm((p) => ({ ...p, start_date: e.target.value }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="End"
              type="date"
              value={applyForm.end_date}
              onChange={(e) =>
                setApplyForm((p) => ({ ...p, end_date: e.target.value }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Leave Type"
              value={applyForm.leave_type}
              onChange={(e) =>
                setApplyForm((p) => ({ ...p, leave_type: e.target.value }))
              }
              fullWidth
              select
            >
              {selectableLeaveTypes.map((t) => (
                <MenuItem
                  key={String(t.code)}
                  value={String(t.code)}
                  disabled={Number(t.active) === 0}
                >
                  {String(t.name || t.code)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Day Part"
              value={
                applyForm.start_date &&
                applyForm.end_date &&
                applyForm.start_date !== applyForm.end_date
                  ? "full"
                  : applyForm.day_part
              }
              onChange={(e) =>
                setApplyForm((p) => ({ ...p, day_part: e.target.value }))
              }
              fullWidth
              select
              disabled={
                !!applyForm.start_date &&
                !!applyForm.end_date &&
                applyForm.start_date !== applyForm.end_date
              }
            >
              {["full", "am", "pm"].map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Reason"
              value={applyForm.reason}
              onChange={(e) =>
                setApplyForm((p) => ({ ...p, reason: e.target.value }))
              }
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void applyLeaveRange()}
            disabled={leaveBusy}
          >
            {leaveBusy ? "Applying..." : "Apply"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
