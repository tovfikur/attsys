import { useCallback, useEffect, useRef, useState } from "react";
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

  const role = getUser()?.role || "";
  const canManageEmployeeLogins = [
    "superadmin",
    "tenant_owner",
    "hr_admin",
  ].includes(role);

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
                            "&:hover": { opacity: 1, bgcolor: "action.hover" },
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
                            "&:hover": { opacity: 1, bgcolor: "action.hover" },
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
      PaperProps={{ sx: { borderRadius: 3 } }}
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
  const [modality, setModality] = useState<"face" | "fingerprint">("face");
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
    setModality("face");
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
        biometric_modality: modality,
        biometric_image: image,
      });
      setOk(
        `Enrolled ${modality === "face" ? "face" : "fingerprint"} template`
      );
      setImage("");
      stopCamera();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to enroll biometrics"));
    } finally {
      setBusy(false);
    }
  }, [employee.id, image, modality, stopCamera]);

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : close}
      maxWidth="sm"
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

          <TextField
            select
            label="Modality"
            value={modality}
            onChange={(e) => {
              const next =
                e.target.value === "fingerprint" ? "fingerprint" : "face";
              setModality(next);
              setError("");
              setOk("");
              setImage("");
              stopCamera();
            }}
            disabled={busy}
            fullWidth
          >
            <MenuItem value="face">Face</MenuItem>
            <MenuItem value="fingerprint">Fingerprint</MenuItem>
          </TextField>

          {modality === "face" ? (
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
          ) : (
            <Button
              component="label"
              variant="outlined"
              disabled={busy}
              sx={{ borderRadius: 2, fontWeight: 900 }}
            >
              Upload Fingerprint Image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
              />
            </Button>
          )}

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
            select
            label="Gender"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
            required
            fullWidth
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
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Personal Phone Number"
            value={form.personal_phone}
            onChange={(e) =>
              setForm({ ...form, personal_phone: e.target.value })
            }
            required
            fullWidth
          />
          <TextField
            label="Email Address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            fullWidth
          />
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
          />
          <TextField
            label="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="Designation / Role"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            required
            fullWidth
          />
          <TextField
            select
            label="Employee Type"
            value={form.employee_type}
            onChange={(e) =>
              setForm({ ...form, employee_type: e.target.value })
            }
            required
            fullWidth
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
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Supervisor / Reporting Manager"
            value={form.supervisor_name}
            onChange={(e) =>
              setForm({ ...form, supervisor_name: e.target.value })
            }
            required
            fullWidth
          />
          <TextField
            label="Work Location / Branch"
            value={form.work_location}
            onChange={(e) =>
              setForm({ ...form, work_location: e.target.value })
            }
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
              Attachments
            </Typography>
            <Stack spacing={1.25}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", sm: "center" }}
              >
                <TextField
                  select
                  label="Category"
                  value={attachCategory}
                  onChange={(e) => setAttachCategory(e.target.value)}
                  fullWidth
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
                />
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
                    onChange={(e) => setAttachFile(e.target.files?.[0] || null)}
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
              {attachFile && (
                <Typography variant="caption" color="text.secondary">
                  Selected: {attachFile.name}
                </Typography>
              )}
              {attachments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No attachments uploaded.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {attachments.map((a) => (
                    <Stack
                      key={a.id}
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.25}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      sx={{
                        p: 1,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={800}>
                          {a.original_name}
                        </Typography>
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
                  ))}
                </Stack>
              )}
            </Stack>
          </Box>

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
  const lastRefreshAtRef = useRef(0);
  const role = getUser()?.role || "";

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
      leave_type: (leave?.leave_type ?? "casual") || "casual",
      day_part: (leave?.day_part ?? "full") || "full",
    });
    setLeaveError("");
    setLeaveOk("");
  }, [records.leaves, selectedDate]);

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
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="outlined"
                size="small"
                onClick={() => setApplyOpen(true)}
              >
                Apply Leave
              </Button>
              <IconButton onClick={handleNextMonth}>
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
                label={`Leave: ${(
                  selectedLeave.leave_type || "leave"
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
                {["casual", "sick", "annual", "unpaid"].map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
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
        PaperProps={{ sx: { borderRadius: 3 } }}
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
              {["casual", "sick", "annual", "unpaid"].map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
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
