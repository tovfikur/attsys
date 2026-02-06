import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddRounded,
  CheckRounded,
  CloseRounded,
  BlockRounded,
} from "@mui/icons-material";
import api from "../api";
import { getErrorMessage } from "../utils/errors";

type Loan = {
  id: number;
  employee_name: string;
  amount: number;
  monthly_installment: number;
  balance: number;
  status: "active" | "paid" | "written_off" | "pending" | "rejected";
  created_at: string;
  reason?: string;
};

type Employee = {
  id: number;
  name: string;
  code: string;
};

export default function PayrollLoans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [newLoan, setNewLoan] = useState({
    employee_id: "",
    amount: "",
    monthly_installment: "",
    start_date: "",
    reason: "",
  });

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/payroll/loans");
      const list = Array.isArray(res.data?.loans) ? res.data.loans : [];
      setLoans(list);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load loans"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get("/api/employees");
      const list = Array.isArray(res.data?.employees) ? res.data.employees : [];
      setEmployees(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
    fetchEmployees();
  }, [fetchLoans, fetchEmployees]);

  const handleCreate = async () => {
    setCreateBusy(true);
    try {
      await api.post("/api/payroll/loans", newLoan);
      setCreateOpen(false);
      fetchLoans();
      setNewLoan({
        employee_id: "",
        amount: "",
        monthly_installment: "",
        start_date: "",
        reason: "",
      });
    } catch (err) {
      alert(getErrorMessage(err, "Failed to create loan"));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await api.post("/api/payroll/loans/status", { id, status });
      fetchLoans();
    } catch (err) {
      alert(getErrorMessage(err, "Failed to update loan status"));
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Loans & Advances</Typography>
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          onClick={() => setCreateOpen(true)}
        >
          New Loan
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell align="right">Total Amount</TableCell>
              <TableCell align="right">Installment</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loans.map((loan) => (
              <TableRow key={loan.id}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {loan.employee_name}
                  </Typography>
                  {loan.reason && (
                    <Typography variant="caption" color="text.secondary">
                      {loan.reason}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {Number(loan.amount).toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  {Number(loan.monthly_installment).toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  {Number(loan.balance).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Chip
                    label={loan.status.toUpperCase()}
                    color={
                      loan.status === "active"
                        ? "success"
                        : loan.status === "pending"
                          ? "warning"
                          : loan.status === "rejected"
                            ? "error"
                            : loan.status === "written_off"
                              ? "error"
                              : "default"
                    }
                    size="small"
                    variant={loan.status === "pending" ? "outlined" : "filled"}
                  />
                </TableCell>
                <TableCell>
                  {new Date(loan.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell align="right">
                  {loan.status === "pending" && (
                    <Stack
                      direction="row"
                      justifyContent="flex-end"
                      spacing={1}
                    >
                      <Tooltip title="Approve">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleStatusUpdate(loan.id, "active")}
                        >
                          <CheckRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() =>
                            handleStatusUpdate(loan.id, "rejected")
                          }
                        >
                          <CloseRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  )}
                  {loan.status === "active" && (
                    <Tooltip title="Write Off">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() =>
                          handleStatusUpdate(loan.id, "written_off")
                        }
                      >
                        <BlockRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {loans.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No loans found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogTitle>Grant Loan / Advance</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 350 }}>
            <TextField
              select
              label="Employee"
              fullWidth
              value={newLoan.employee_id}
              onChange={(e) =>
                setNewLoan({ ...newLoan, employee_id: e.target.value })
              }
            >
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.name} ({emp.code})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Amount"
              type="number"
              fullWidth
              value={newLoan.amount}
              onChange={(e) =>
                setNewLoan({ ...newLoan, amount: e.target.value })
              }
            />
            <TextField
              label="Monthly Installment"
              type="number"
              fullWidth
              value={newLoan.monthly_installment}
              onChange={(e) =>
                setNewLoan({ ...newLoan, monthly_installment: e.target.value })
              }
              helperText="Amount to deduct per pay cycle"
            />
            <TextField
              label="Start Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={newLoan.start_date}
              onChange={(e) =>
                setNewLoan({ ...newLoan, start_date: e.target.value })
              }
            />
            <TextField
              label="Reason / Notes"
              fullWidth
              multiline
              rows={2}
              value={newLoan.reason}
              onChange={(e) =>
                setNewLoan({ ...newLoan, reason: e.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={createBusy}
          >
            Create Loan
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
