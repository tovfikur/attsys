import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  MenuItem,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Grid,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import api from "../api";
import { getErrorMessage } from "../utils/errors";

interface PayslipItem {
  id: number;
  name: string;
  type: "earning" | "deduction";
  amount: number;
  is_variable: number;
}

interface Payslip {
  id: number;
  employee_name: string;
  employee_code: string;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  items: PayslipItem[];
}

interface PayslipEditorDialogProps {
  open: boolean;
  onClose: () => void;
  payslipId: number;
}

export default function PayslipEditorDialog({
  open,
  onClose,
  payslipId,
}: PayslipEditorDialogProps) {
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newItem, setNewItem] = useState<{
    name: string;
    type: "earning" | "deduction";
    amount: string;
  }>({
    name: "",
    type: "earning",
    amount: "",
  });
  const [adding, setAdding] = useState(false);

  const fetchPayslip = useCallback(async () => {
    if (!payslipId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/payroll/payslip?id=${payslipId}`);
      setPayslip(res.data);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load payslip"));
    } finally {
      setLoading(false);
    }
  }, [payslipId]);

  useEffect(() => {
    if (open && payslipId) {
      fetchPayslip();
    }
  }, [open, payslipId, fetchPayslip]);

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.amount) return;
    setAdding(true);
    try {
      await api.post(`/api/payroll/payslip/item?id=${payslipId}`, {
        name: newItem.name,
        type: newItem.type,
        amount: Number(newItem.amount),
      });
      setNewItem({ name: "", type: "earning", amount: "" });
      fetchPayslip(); // Refresh to see updated totals
    } catch (err) {
      alert(getErrorMessage(err, "Failed to add adjustment"));
    } finally {
      setAdding(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Payslip #{payslipId}
        {payslip && ` - ${payslip.employee_name} (${payslip.employee_code})`}
      </DialogTitle>
      <DialogContent dividers>
        {loading && !payslip ? (
          <Stack alignItems="center" p={3}>
            <CircularProgress />
          </Stack>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : payslip ? (
          <Stack spacing={3}>
            {/* Financial Summary */}
            <Paper
              variant="outlined"
              sx={{ p: 2, bgcolor: "background.default" }}
            >
              <Grid container spacing={2} textAlign="center">
                <Grid size={{ xs: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    GROSS EARNINGS
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    {Number(payslip.gross_salary).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    TOTAL DEDUCTIONS
                  </Typography>
                  <Typography variant="h6" color="error.main">
                    {Number(payslip.total_deductions).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    NET SALARY
                  </Typography>
                  <Typography variant="h6" fontWeight="bold">
                    {Number(payslip.net_salary).toLocaleString()}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>

            {/* Items Table */}
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Component</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Source</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payslip.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          color={
                            item.type === "earning"
                              ? "success.main"
                              : "error.main"
                          }
                          fontWeight="bold"
                        >
                          {item.type.toUpperCase()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {Number(item.amount).toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {item.is_variable ? "Manual/Var" : "Fixed"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Add Manual Item Form */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Add Manual Adjustment
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Description"
                    size="small"
                    fullWidth
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem({ ...newItem, name: e.target.value })
                    }
                    placeholder="e.g. Performance Bonus"
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    select
                    label="Type"
                    size="small"
                    fullWidth
                    value={newItem.type}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        type:
                          e.target.value === "deduction"
                            ? "deduction"
                            : "earning",
                      })
                    }
                  >
                    <MenuItem value="earning">Earning (+)</MenuItem>
                    <MenuItem value="deduction">Deduction (-)</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Amount"
                    type="number"
                    size="small"
                    fullWidth
                    value={newItem.amount}
                    onChange={(e) =>
                      setNewItem({ ...newItem, amount: e.target.value })
                    }
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">$</InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleAddItem}
                    disabled={adding || !newItem.name || !newItem.amount}
                  >
                    Add
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
