import { useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Box,
  Button,
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Chip,
  Stack,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  CardActions,
  Checkbox,
  FormGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PersonAdd as AssignIcon,
  AccessTime as TimeIcon,
} from "@mui/icons-material";

interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  early_exit_tolerance_minutes: number;
  break_duration_minutes: number;
  working_days: string;
  is_default: boolean;
}

interface Employee {
  id: string;
  name: string;
  shift_id?: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Shifts() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Modal States
  const [openForm, setOpenForm] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);
  const [currentShift, setCurrentShift] = useState<Partial<Shift>>({});
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [assignShiftId, setAssignShiftId] = useState<number | null>(null);

  const fetchShifts = async () => {
    try {
      const res = await api.get("/api/shifts");
      setShifts(res.data.shifts);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get("/api/employees");
      setEmployees(res.data.employees);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchShifts();
      void fetchEmployees();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const handleSave = async () => {
    try {
      const payload = {
        ...currentShift,
        // Ensure working_days is string
        working_days: Array.isArray(currentShift.working_days)
          ? currentShift.working_days.join(",")
          : currentShift.working_days,
      };

      if (currentShift.id) {
        await api.post("/api/shifts/update?id=" + currentShift.id, payload);
      } else {
        await api.post("/api/shifts", payload);
      }
      setOpenForm(false);
      fetchShifts();
    } catch {
      alert("Failed to save shift");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this shift?")) return;
    try {
      await api.post("/api/shifts/delete?id=" + id, {});
      fetchShifts();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Failed to delete"));
    }
  };

  const handleAssign = async () => {
    if (!assignShiftId) return;
    try {
      await api.post("/api/shifts/assign", {
        shift_id: assignShiftId,
        employee_ids: selectedEmployees,
      });
      setOpenAssign(false);
      alert("Shift assigned successfully");
      fetchEmployees(); // Refresh to update local state if needed
    } catch {
      alert("Failed to assign shift");
    }
  };

  const openEdit = (shift: Shift) => {
    setCurrentShift({
      ...shift,
      // Convert comma string back to array for UI if needed, or keep as is?
      // Let's keep it simple for now, assume UI handles it or we parse it
    });
    setOpenForm(true);
  };

  const openCreate = () => {
    setCurrentShift({
      name: "",
      start_time: "09:00",
      end_time: "17:00",
      late_tolerance_minutes: 15,
      early_exit_tolerance_minutes: 15,
      break_duration_minutes: 60,
      working_days: "Mon,Tue,Wed,Thu,Fri",
      is_default: false,
    });
    setOpenForm(true);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Shifts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage work schedules and assignments
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreate}
        >
          New Shift
        </Button>
      </Stack>

      {/* Desktop Table View */}
      {!isMobile && (
        <TableContainer component={Paper} elevation={0} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Working Days</TableCell>
                <TableCell>Tolerance (Late/Early)</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>
                    <Typography fontWeight="medium">{shift.name}</Typography>
                    {shift.is_default && (
                      <Chip
                        label="Default"
                        size="small"
                        color="primary"
                        sx={{ mt: 0.5 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TimeIcon fontSize="small" color="action" />
                      <Typography>
                        {shift.start_time.slice(0, 5)} -{" "}
                        {shift.end_time.slice(0, 5)}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {shift.working_days.replace(/,/g, ", ")}
                  </TableCell>
                  <TableCell>
                    {shift.late_tolerance_minutes}m /{" "}
                    {shift.early_exit_tolerance_minutes}m
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setAssignShiftId(shift.id);
                        setOpenAssign(true);
                      }}
                    >
                      <AssignIcon />
                    </IconButton>
                    <IconButton size="small" onClick={() => openEdit(shift)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(shift.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Mobile Card View */}
      {isMobile && (
        <Stack spacing={2}>
          {shifts.map((shift) => (
            <Card key={shift.id} variant="outlined">
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="start"
                >
                  <Box>
                    <Typography variant="h6">{shift.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {shift.start_time.slice(0, 5)} -{" "}
                      {shift.end_time.slice(0, 5)}
                    </Typography>
                  </Box>
                  {shift.is_default && (
                    <Chip label="Default" size="small" color="primary" />
                  )}
                </Stack>
                <Box mt={2}>
                  <Typography
                    variant="caption"
                    display="block"
                    color="text.secondary"
                  >
                    Days: {shift.working_days.replace(/,/g, ", ")}
                  </Typography>
                  <Typography
                    variant="caption"
                    display="block"
                    color="text.secondary"
                  >
                    Tolerance: {shift.late_tolerance_minutes}m /{" "}
                    {shift.early_exit_tolerance_minutes}m
                  </Typography>
                </Box>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  startIcon={<AssignIcon />}
                  onClick={() => {
                    setAssignShiftId(shift.id);
                    setOpenAssign(true);
                  }}
                >
                  Assign
                </Button>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => openEdit(shift)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={() => handleDelete(shift.id)}
                >
                  Delete
                </Button>
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}

      {/* Create/Edit Modal */}
      <Dialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
      >
        <DialogTitle>
          {currentShift.id ? "Edit Shift" : "Create Shift"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Shift Name"
              fullWidth
              value={currentShift.name || ""}
              onChange={(e) =>
                setCurrentShift({ ...currentShift, name: e.target.value })
              }
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Start Time"
                type="time"
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }} // 5 min
                value={currentShift.start_time || ""}
                onChange={(e) =>
                  setCurrentShift({
                    ...currentShift,
                    start_time: e.target.value,
                  })
                }
              />
              <TextField
                label="End Time"
                type="time"
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                value={currentShift.end_time || ""}
                onChange={(e) =>
                  setCurrentShift({ ...currentShift, end_time: e.target.value })
                }
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Late Tolerance (min)"
                type="number"
                fullWidth
                value={currentShift.late_tolerance_minutes || 0}
                onChange={(e) =>
                  setCurrentShift({
                    ...currentShift,
                    late_tolerance_minutes: parseInt(e.target.value),
                  })
                }
              />
              <TextField
                label="Early Exit Tolerance (min)"
                type="number"
                fullWidth
                value={currentShift.early_exit_tolerance_minutes || 0}
                onChange={(e) =>
                  setCurrentShift({
                    ...currentShift,
                    early_exit_tolerance_minutes: parseInt(e.target.value),
                  })
                }
              />
            </Stack>

            <Typography variant="subtitle2">Working Days</Typography>
            <FormGroup row>
              {DAYS.map((day) => (
                <FormControlLabel
                  key={day}
                  control={
                    <Checkbox
                      checked={(currentShift.working_days || "").includes(day)}
                      onChange={(e) => {
                        const days = (currentShift.working_days || "")
                          .split(",")
                          .filter((d) => d);
                        if (e.target.checked) {
                          days.push(day);
                        } else {
                          const idx = days.indexOf(day);
                          if (idx > -1) days.splice(idx, 1);
                        }
                        // Sort by standard week order
                        days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
                        setCurrentShift({
                          ...currentShift,
                          working_days: days.join(","),
                        });
                      }}
                    />
                  }
                  label={day}
                />
              ))}
            </FormGroup>

            <FormControlLabel
              control={
                <Switch
                  checked={currentShift.is_default || false}
                  onChange={(e) =>
                    setCurrentShift({
                      ...currentShift,
                      is_default: e.target.checked,
                    })
                  }
                />
              }
              label="Set as Default Shift"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenForm(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign Modal */}
      <Dialog
        open={openAssign}
        onClose={() => setOpenAssign(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
      >
        <DialogTitle>Assign Shift to Employees</DialogTitle>
        <DialogContent dividers>
          <Typography gutterBottom>
            Select employees to assign to this shift:
          </Typography>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Employees</InputLabel>
            <Select
              multiple
              value={selectedEmployees}
              label="Employees"
              onChange={(e) => {
                const val = e.target.value;
                setSelectedEmployees(
                  typeof val === "string" ? val.split(",") : val
                );
              }}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {selected.map((value) => {
                    const emp = employees.find((e) => e.id === value);
                    return <Chip key={value} label={emp?.name} size="small" />;
                  })}
                </Box>
              )}
            >
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAssign(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssign}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
