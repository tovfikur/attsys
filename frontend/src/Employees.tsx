import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
  useTheme,
  alpha,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ChevronLeft,
  ChevronRight,
  Close as CloseIcon,
} from "@mui/icons-material";

// --- Types ---
interface Employee {
  id: string;
  name: string;
  code: string;
  status: string;
  created_at: string;
}

interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  clock_in: string;
  clock_out: string | null;
}

interface LeaveRecord {
  date: string;
  reason: string;
  status: string;
}

// --- Main Component ---
export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );

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
    </Container>
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
  const [form, setForm] = useState({ name: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/employees", form);
      setForm({ name: "", code: "" });
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
  }>({ attendance: [], leaves: [] });
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
      const res = await api.get(
        `/api/attendance/employee?id=${employee.id}&month=${monthStr}`
      );
      setRecords(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentDate, employee.id]);

  useEffect(() => {
    if (open) fetchData();
  }, [fetchData, open]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Calendar Logic
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const todayStr = new Date().toISOString().split("T")[0];

  const getDayStatus = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const attendance = records.attendance.find((r) => r.date === dateStr);
    if (attendance)
      return {
        type: "present",
        label: "Present",
        color: theme.palette.success.main,
        bg: alpha(theme.palette.success.main, 0.1),
      };

    const leave = records.leaves.find((r) => r.date === dateStr);
    if (leave)
      return {
        type: "leave",
        label: "Leave",
        color: theme.palette.warning.main,
        bg: alpha(theme.palette.warning.main, 0.1),
      };

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
            <IconButton onClick={handleNextMonth}>
              <ChevronRight />
            </IconButton>
          </Box>

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
                        sx={{
                          height: 80,
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
                          cursor: "default",
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
                        {status.label && (
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
                        )}
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
    </Dialog>
  );
}
