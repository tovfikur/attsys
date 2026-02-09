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
  Chip,
  Stack,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  CardActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Grid,
  Divider,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CalendarMonth as CalendarIcon,
  List as ListIcon,
  Category as CategoryIcon,
} from "@mui/icons-material";

interface RosterType {
  id: number;
  name: string;
  description: string;
  color_code: string;
  default_start_time: string | null;
  default_end_time: string | null;
  is_active: boolean;
}

interface RosterAssignment {
  id: number;
  roster_type_id: number;
  employee_id: number;
  duty_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  notes: string;
  status: string;
  roster_type_name?: string;
  employee_name?: string;
  employee_code?: string;
  color_code?: string;
}

interface Employee {
  id: string;
  name: string;
  code: string;
}

export default function Roster() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [tabIndex, setTabIndex] = useState(0);
  const [rosterTypes, setRosterTypes] = useState<RosterType[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  // Modal States
  const [openTypeForm, setOpenTypeForm] = useState(false);
  const [openAssignmentForm, setOpenAssignmentForm] = useState(false);
  const [currentType, setCurrentType] = useState<Partial<RosterType>>({});
  const [currentAssignment, setCurrentAssignment] =
    useState<Partial<RosterAssignment>>({});

  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>("");
  const [filterRosterType, setFilterRosterType] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const fetchRosterTypes = async () => {
    try {
      const res = await api.get("/api/roster/types");
      setRosterTypes(res.data.roster_types);
    } catch (err) {
      console.error("Failed to fetch roster types", err);
    }
  };

  const fetchAssignments = async () => {
    try {
      const params: Record<string, string> = {};
      if (filterStartDate) params.start_date = filterStartDate;
      if (filterEndDate) params.end_date = filterEndDate;
      if (filterEmployee) params.employee_id = filterEmployee;
      if (filterRosterType) params.roster_type_id = filterRosterType;

      const res = await api.get("/api/roster/assignments", { params });
      setAssignments(res.data.roster_assignments);
    } catch (err) {
      console.error("Failed to fetch assignments", err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get("/api/employees");
      setEmployees(res.data.employees);
    } catch (err) {
      console.error("Failed to fetch employees", err);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchRosterTypes();
      void fetchAssignments();
      void fetchEmployees();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    void fetchAssignments();
  }, [filterEmployee, filterRosterType, filterStartDate, filterEndDate]);

  // ==================== ROSTER TYPE HANDLERS ====================

  const handleSaveType = async () => {
    try {
      if (currentType.id) {
        await api.post("/api/roster/types/update", currentType);
      } else {
        await api.post("/api/roster/types", currentType);
      }
      setOpenTypeForm(false);
      fetchRosterTypes();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Failed to save roster type"));
    }
  };

  const handleDeleteType = async (id: number) => {
    if (!window.confirm("Delete this roster type? This will fail if it has assignments."))
      return;
    try {
      await api.post("/api/roster/types/delete", { id });
      fetchRosterTypes();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Failed to delete roster type"));
    }
  };

  const openEditType = (type: RosterType) => {
    setCurrentType({ ...type });
    setOpenTypeForm(true);
  };

  const openCreateType = () => {
    setCurrentType({
      name: "",
      description: "",
      color_code: "#1976d2",
      default_start_time: null,
      default_end_time: null,
      is_active: true,
    });
    setOpenTypeForm(true);
  };

  // ==================== ROSTER ASSIGNMENT HANDLERS ====================

  const handleSaveAssignment = async () => {
    try {
      if (currentAssignment.id) {
        await api.post("/api/roster/assignments/update", currentAssignment);
      } else {
        await api.post("/api/roster/assignments", currentAssignment);
      }
      setOpenAssignmentForm(false);
      fetchAssignments();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Failed to save roster assignment"));
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    if (!window.confirm("Delete this roster assignment?")) return;
    try {
      await api.post("/api/roster/assignments/delete", { id });
      fetchAssignments();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Failed to delete roster assignment"));
    }
  };

  const openEditAssignment = (assignment: RosterAssignment) => {
    setCurrentAssignment({ ...assignment });
    setOpenAssignmentForm(true);
  };

  const openCreateAssignment = () => {
    setCurrentAssignment({
      roster_type_id: undefined,
      employee_id: undefined,
      duty_date: new Date().toISOString().slice(0, 10),
      start_time: null,
      end_time: null,
      location: "",
      notes: "",
      status: "scheduled",
    });
    setOpenAssignmentForm(true);
  };

  // ==================== CALENDAR VIEW ====================

  const renderCalendarView = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const calendarDays = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      calendarDays.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      calendarDays.push(day);
    }

    const getDayAssignments = (day: number) => {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;
      return assignments.filter((a) => a.duty_date === date);
    };

    return (
      <Box>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            background: theme.palette.mode === 'dark' 
              ? 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)'
              : 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)',
            borderRadius: 3,
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Button
              variant="contained"
              onClick={() => {
                const d = new Date(currentMonth);
                d.setMonth(d.getMonth() - 1);
                setCurrentMonth(d.toISOString().slice(0, 7));
              }}
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.2)', 
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                color: 'white',
                fontWeight: 600,
                px: 3,
              }}
            >
              ← Previous
            </Button>
            <Typography variant="h4" fontWeight="800" color="white">
              {firstDay.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </Typography>
            <Button
              variant="contained"
              onClick={() => {
                const d = new Date(currentMonth);
                d.setMonth(d.getMonth() + 1);
                setCurrentMonth(d.toISOString().slice(0, 7));
              }}
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.2)', 
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                color: 'white',
                fontWeight: 600,
                px: 3,
              }}
            >
              Next →
            </Button>
          </Stack>
        </Paper>

        <Paper elevation={3} sx={{ p: 3, borderRadius: 3, overflow: 'hidden' }}>
          {/* Day Headers */}
          <Box 
            sx={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: 1,
              mb: 2,
            }}
          >
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => (
              <Box
                key={day}
                sx={{
                  py: 1.5,
                  textAlign: 'center',
                  bgcolor: 'primary.main',
                  borderRadius: 1,
                }}
              >
                <Typography
                  fontWeight="700"
                  variant="body2"
                  color="white"
                  sx={{ letterSpacing: 0.5 }}
                >
                  {day}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Calendar Grid */}
          <Box 
            sx={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: 1.5,
            }}
          >
            {calendarDays.map((day, idx) => {
              const dayAssignments = day ? getDayAssignments(day) : [];
              const today = new Date();
              const isToday = day === today.getDate() && 
                             currentMonth === today.toISOString().slice(0, 7);
              const isPastDay = day && new Date(year, month - 1, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
              
              return (
                <Paper
                  key={idx}
                  elevation={day ? (isToday ? 4 : 1) : 0}
                  sx={{
                    minHeight: 120,
                    p: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: !day 
                      ? 'transparent'
                      : isToday 
                        ? 'primary.main'
                        : isPastDay
                          ? 'action.disabledBackground'
                          : dayAssignments.length > 0 
                            ? 'background.paper'
                            : 'grey.50',
                    border: day ? '2px solid' : 'none',
                    borderColor: isToday ? 'primary.dark' : dayAssignments.length > 0 ? 'primary.light' : 'divider',
                    borderRadius: 2,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: day ? 'pointer' : 'default',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:hover': day && !isPastDay ? {
                      transform: 'translateY(-4px)',
                      boxShadow: 4,
                      borderColor: 'primary.main',
                    } : {},
                  }}
                  onClick={() => {
                    if (day && !isPastDay) {
                      const newAssignment = {
                        roster_type_id: undefined,
                        employee_id: undefined,
                        duty_date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
                        start_time: null,
                        end_time: null,
                        location: "",
                        notes: "",
                        status: "scheduled",
                      };
                      setCurrentAssignment(newAssignment);
                      setOpenAssignmentForm(true);
                    }
                  }}
                >
                  {day && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Typography 
                          variant="h6" 
                          fontWeight="700"
                          sx={{
                            color: isToday ? 'white' : isPastDay ? 'text.disabled' : 'text.primary',
                            fontSize: '1.25rem',
                          }}
                        >
                          {day}
                        </Typography>
                        {dayAssignments.length > 0 && !isToday && (
                          <Chip
                            label={dayAssignments.length}
                            size="small"
                            sx={{
                              height: 20,
                              minWidth: 20,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              bgcolor: 'primary.main',
                              color: 'white',
                            }}
                          />
                        )}
                      </Box>
                      
                      <Stack spacing={0.5} sx={{ flex: 1, overflowY: 'auto' }}>
                        {dayAssignments.slice(0, 3).map((a) => (
                          <Box
                            key={a.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditAssignment(a);
                            }}
                            sx={{
                              px: 1,
                              py: 0.5,
                              borderRadius: 1,
                              backgroundColor: a.color_code,
                              color: 'white',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              '&:hover': {
                                opacity: 0.85,
                                transform: 'scale(1.02)',
                              },
                            }}
                          >
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'white' }}>
                              {a.employee_name}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', opacity: 0.9, color: 'white' }}>
                              {a.roster_type_name}
                            </Typography>
                          </Box>
                        ))}
                        {dayAssignments.length > 3 && (
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              color: isToday ? 'white' : 'primary.main',
                              fontWeight: 600,
                              textAlign: 'center',
                              pt: 0.5,
                            }}
                          >
                            +{dayAssignments.length - 3} more
                          </Typography>
                        )}
                      </Stack>
                    </>
                  )}
                </Paper>
              );
            })}
          </Box>
        </Paper>
      </Box>
    );
  };

  // ==================== LIST VIEW ====================

  const renderListView = () => {
    return (
      <Box>
        <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight="600" mb={2} color="text.secondary">
            Filter Assignments
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <TextField
              label="Start Date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="End Date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              sx={{ minWidth: 150 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Employee</InputLabel>
              <Select
                value={filterEmployee}
                label="Employee"
                onChange={(e) => setFilterEmployee(e.target.value)}
              >
                <MenuItem value="">All Employees</MenuItem>
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Duty Type</InputLabel>
              <Select
                value={filterRosterType}
                label="Duty Type"
                onChange={(e) => setFilterRosterType(e.target.value)}
              >
                <MenuItem value="">All Duty Types</MenuItem>
                {rosterTypes.map((type) => (
                  <MenuItem key={type.id} value={type.id.toString()}>
                    {type.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        {!isMobile ? (
          <TableContainer 
            component={Paper} 
            elevation={2} 
            sx={{ 
              borderRadius: 2,
              '& .MuiTableHead-root': {
                bgcolor: 'primary.main',
                '& .MuiTableCell-head': {
                  color: 'white',
                  fontWeight: 700,
                },
              },
            }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Employee</TableCell>
                  <TableCell>Duty Type</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow 
                    key={assignment.id}
                    sx={{
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <TableCell>
                      {new Date(assignment.duty_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Stack>
                        <Typography fontWeight="medium">
                          {assignment.employee_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {assignment.employee_code}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={assignment.roster_type_name}
                        size="small"
                        sx={{
                          backgroundColor: assignment.color_code,
                          color: "white",
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {assignment.start_time && assignment.end_time
                        ? `${assignment.start_time.slice(
                            0,
                            5
                          )} - ${assignment.end_time.slice(0, 5)}`
                        : "—"}
                    </TableCell>
                    <TableCell>{assignment.location || "—"}</TableCell>
                    <TableCell>
                      <Chip
                        label={assignment.status}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => openEditAssignment(assignment)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteAssignment(assignment.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Stack spacing={2}>
            {assignments.map((assignment) => (
              <Card key={assignment.id} variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="start"
                    >
                      <Typography variant="body1" fontWeight="bold">
                        {assignment.employee_name}
                      </Typography>
                      <Chip label={assignment.status} size="small" />
                    </Stack>
                    <Chip
                      label={assignment.roster_type_name}
                      size="small"
                      sx={{
                        backgroundColor: assignment.color_code,
                        color: "white",
                        width: "fit-content",
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      📅 {new Date(assignment.duty_date).toLocaleDateString()}
                    </Typography>
                    {assignment.start_time && assignment.end_time && (
                      <Typography variant="body2" color="text.secondary">
                        🕐 {assignment.start_time.slice(0, 5)} -{" "}
                        {assignment.end_time.slice(0, 5)}
                      </Typography>
                    )}
                    {assignment.location && (
                      <Typography variant="body2" color="text.secondary">
                        📍 {assignment.location}
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => openEditAssignment(assignment)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleDeleteAssignment(assignment.id)}
                  >
                    Delete
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    );
  };

  // ==================== TYPES MANAGEMENT VIEW ====================

  const renderTypesView = () => {
    return (
      <Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateType}
          sx={{ mb: 2 }}
        >
          New Roster Type
        </Button>

        <Grid container spacing={3}>
          {rosterTypes.map((type) => (
            <Grid item xs={12} sm={6} md={4} key={type.id}>
              <Card
                elevation={3}
                sx={{ 
                  borderLeft: `5px solid ${type.color_code}`,
                  transition: 'all 0.3s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6,
                  },
                }}
              >
                <CardContent sx={{ pb: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: type.color_code,
                      }}
                    />
                    <Typography variant="h6" fontWeight="600">{type.name}</Typography>
                  </Stack>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ mb: 2, minHeight: 40 }}
                  >
                    {type.description || "No description provided"}
                  </Typography>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" fontWeight="500">
                        Default Time:
                      </Typography>
                      <Typography variant="caption" fontWeight="600">
                        {type.default_start_time && type.default_end_time
                          ? `${type.default_start_time.slice(0, 5)} - ${type.default_end_time.slice(0, 5)}`
                          : "Not configured"}
                      </Typography>
                    </Stack>
                    <Chip
                      label={type.is_active ? "Active" : "Inactive"}
                      size="small"
                      color={type.is_active ? "success" : "default"}
                      sx={{ fontWeight: 600, alignSelf: 'flex-start' }}
                    />
                  </Stack>
                </CardContent>
                <Divider />
                <CardActions sx={{ justifyContent: 'flex-end', p: 1.5 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => openEditType(type)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => handleDeleteType(type.id)}
                  >
                    Delete
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
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
            Roster Duty
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage duty assignments and schedules
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateAssignment}
        >
          New Assignment
        </Button>
      </Stack>

      <Paper 
        elevation={2} 
        sx={{ 
          mb: 4, 
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={tabIndex}
          onChange={(_, newValue) => setTabIndex(newValue)}
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': {
              fontWeight: 600,
              fontSize: '0.95rem',
              py: 2,
            },
          }}
        >
          <Tab 
            icon={<CalendarIcon />} 
            label="Calendar" 
            iconPosition="start"
          />
          <Tab 
            icon={<ListIcon />} 
            label="List" 
            iconPosition="start"
          />
          <Tab 
            icon={<CategoryIcon />} 
            label="Duty Types" 
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {tabIndex === 0 && renderCalendarView()}
      {tabIndex === 1 && renderListView()}
      {tabIndex === 2 && renderTypesView()}

      {/* Roster Type Form Dialog */}
      <Dialog
        open={openTypeForm}
        onClose={() => setOpenTypeForm(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {currentType.id ? "Edit Roster Type" : "Create Roster Type"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Type Name"
              fullWidth
              value={currentType.name || ""}
              onChange={(e) =>
                setCurrentType({ ...currentType, name: e.target.value })
              }
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={currentType.description || ""}
              onChange={(e) =>
                setCurrentType({ ...currentType, description: e.target.value })
              }
            />
            <TextField
              label="Color Code"
              type="color"
              fullWidth
              value={currentType.color_code || "#1976d2"}
              onChange={(e) =>
                setCurrentType({ ...currentType, color_code: e.target.value })
              }
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Default Start Time"
                type="time"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={currentType.default_start_time || ""}
                onChange={(e) =>
                  setCurrentType({
                    ...currentType,
                    default_start_time: e.target.value || null,
                  })
                }
              />
              <TextField
                label="Default End Time"
                type="time"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={currentType.default_end_time || ""}
                onChange={(e) =>
                  setCurrentType({
                    ...currentType,
                    default_end_time: e.target.value || null,
                  })
                }
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTypeForm(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveType}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Roster Assignment Form Dialog */}
      <Dialog
        open={openAssignmentForm}
        onClose={() => setOpenAssignmentForm(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {currentAssignment.id ? "Edit Assignment" : "Create Assignment"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Employee</InputLabel>
              <Select
                value={currentAssignment.employee_id || ""}
                label="Employee"
                onChange={(e) =>
                  setCurrentAssignment({
                    ...currentAssignment,
                    employee_id: Number(e.target.value),
                  })
                }
              >
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.name} ({emp.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Duty Type</InputLabel>
              <Select
                value={currentAssignment.roster_type_id || ""}
                label="Duty Type"
                onChange={(e) =>
                  setCurrentAssignment({
                    ...currentAssignment,
                    roster_type_id: Number(e.target.value),
                  })
                }
              >
                {rosterTypes
                  .filter((t) => t.is_active)
                  .map((type) => (
                    <MenuItem key={type.id} value={type.id}>
                      {type.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            <TextField
              label="Duty Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={currentAssignment.duty_date || ""}
              onChange={(e) =>
                setCurrentAssignment({
                  ...currentAssignment,
                  duty_date: e.target.value,
                })
              }
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Start Time"
                type="time"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={currentAssignment.start_time || ""}
                onChange={(e) =>
                  setCurrentAssignment({
                    ...currentAssignment,
                    start_time: e.target.value || null,
                  })
                }
              />
              <TextField
                label="End Time"
                type="time"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={currentAssignment.end_time || ""}
                onChange={(e) =>
                  setCurrentAssignment({
                    ...currentAssignment,
                    end_time: e.target.value || null,
                  })
                }
              />
            </Stack>

            <TextField
              label="Location"
              fullWidth
              value={currentAssignment.location || ""}
              onChange={(e) =>
                setCurrentAssignment({
                  ...currentAssignment,
                  location: e.target.value,
                })
              }
            />

            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={2}
              value={currentAssignment.notes || ""}
              onChange={(e) =>
                setCurrentAssignment({
                  ...currentAssignment,
                  notes: e.target.value,
                })
              }
            />

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={currentAssignment.status || "scheduled"}
                label="Status"
                onChange={(e) =>
                  setCurrentAssignment({
                    ...currentAssignment,
                    status: e.target.value,
                  })
                }
              >
                <MenuItem value="scheduled">Scheduled</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAssignmentForm(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveAssignment}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
