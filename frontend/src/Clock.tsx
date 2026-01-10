import { useEffect, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Box,
  Button,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  Paper,
  Alert,
  Stack,
  CircularProgress,
} from "@mui/material";
import { AccessTime, ExitToApp, Login } from "@mui/icons-material";

interface Employee {
  id: string;
  name: string;
}

interface ClockRecord {
  clock_in: string;
  clock_out?: string;
  status?: string;
  late_minutes?: number;
  early_leave_minutes?: number;
}

export default function Clock() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    record?: ClockRecord;
  } | null>(null);
  const employeeLabelId = "employee-select-label";

  useEffect(() => {
    api.get("/api/employees").then((r) => setEmployees(r.data.employees));
  }, []);

  const clock = async (type: "in" | "out") => {
    setLoading(true);
    setResult(null);
    const url =
      type === "in" ? "/api/attendance/clockin" : "/api/attendance/clockout";
    try {
      const res = await api.post(url, { employee_id: employeeId });
      const record = res.data.record;
      let msg = `${type === "in" ? "Clock In" : "Clock Out"} Successful`;

      if (record.status && record.status !== "Present") {
        msg += ` (${record.status})`;
      }
      if (record.late_minutes > 0) {
        msg += ` - Late by ${record.late_minutes} mins`;
      }
      if (record.early_leave_minutes > 0) {
        msg += ` - Left early by ${record.early_leave_minutes} mins`;
      }

      setResult({ type: "success", message: msg, record });
    } catch (err: unknown) {
      setResult({
        type: "error",
        message: getErrorMessage(err, "Failed to record attendance"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4, textAlign: "center" }}>
        <Stack spacing={3} alignItems="center">
          <AccessTime sx={{ fontSize: 60, color: "primary.main" }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Time Clock
          </Typography>

          <FormControl fullWidth>
            <InputLabel id={employeeLabelId}>Select Employee</InputLabel>
            <Select
              labelId={employeeLabelId}
              value={employeeId}
              label="Select Employee"
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction="row" spacing={2} width="100%">
            <Button
              variant="contained"
              color="success"
              size="large"
              fullWidth
              startIcon={<Login />}
              onClick={() => clock("in")}
              disabled={!employeeId || loading}
            >
              Clock In
            </Button>
            <Button
              variant="contained"
              color="warning"
              size="large"
              fullWidth
              startIcon={<ExitToApp />}
              onClick={() => clock("out")}
              disabled={!employeeId || loading}
            >
              Clock Out
            </Button>
          </Stack>

          {loading && <CircularProgress />}

          {result && (
            <Alert
              severity={result.type}
              sx={{ width: "100%" }}
              iconMapping={{
                success: <AccessTime fontSize="inherit" />,
              }}
            >
              {result.message}
              {result.record && (
                <Box mt={1} fontSize="0.875rem">
                  <Typography variant="caption" display="block">
                    Time:{" "}
                    {new Date(
                      result.record.clock_out || result.record.clock_in
                    ).toLocaleTimeString()}
                  </Typography>
                </Box>
              )}
            </Alert>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
