import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  Email as EmailIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import api from "../api";
import { getErrorMessage } from "../utils/errors";
import PayslipEditorDialog from "./PayslipEditorDialog";

interface PayslipSummary {
  id: number;
  employee_name: string;
  employee_code: string;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
}

interface PayslipListDialogProps {
  open: boolean;
  onClose: () => void;
  cycleId: number;
  cycleName: string;
  status: string;
}

export default function PayslipListDialog({
  open,
  onClose,
  cycleId,
  cycleName,
  status,
}: PayslipListDialogProps) {
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editId, setEditId] = useState<number | null>(null);

  const fetchPayslips = useCallback(async () => {
    if (!cycleId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/payroll/payslips?cycle_id=${cycleId}`);
      setPayslips(res.data);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load payslips"));
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    if (open && cycleId) {
      fetchPayslips();
    }
  }, [open, cycleId, fetchPayslips]);

  const handleEdit = (id: number) => {
    setEditId(id);
  };

  const handleView = (id: number) => {
    void (async () => {
      try {
        const res = await api.get(`/api/payroll/payslip/view?id=${id}`, {
          responseType: "text",
        });
        const html = String(res.data ?? "");
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err) {
        alert(getErrorMessage(err, "Failed to open payslip"));
      }
    })();
  };

  const handleEmail = async (id: number) => {
    if (!confirm("Send payslip via email to this employee?")) return;
    try {
      await api.post("/api/payroll/email", { payslip_id: id });
      alert("Email sent successfully!");
    } catch (err) {
      alert(getErrorMessage(err, "Failed to send payslip email"));
    }
  };

  const handleEmailAll = async () => {
    if (
      !confirm(
        `Send payslips to ALL employees in this cycle (${cycleName})? This may take a while.`,
      )
    )
      return;
    try {
      setLoading(true);
      const res = await api.post("/api/payroll/email", { cycle_id: cycleId });
      alert(`Emails queued/sent! Result: ${JSON.stringify(res.data.result)}`);
    } catch (err) {
      alert(getErrorMessage(err, "Failed to send payslips"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="h6">Review Payslips - {cycleName}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={status.toUpperCase()} size="small" />
              {(status === "locked" || status === "paid") && (
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  onClick={handleEmailAll}
                >
                  Email All
                </Button>
              )}
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {loading ? (
            <Stack alignItems="center" p={3}>
              <CircularProgress />
            </Stack>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell align="right">Gross</TableCell>
                    <TableCell align="right">Deductions</TableCell>
                    <TableCell align="right">Net Salary</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payslips.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {p.employee_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {p.employee_code}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {Number(p.gross_salary).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ color: "error.main" }}>
                        {Number(p.total_deductions).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold" }}>
                        {Number(p.net_salary).toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleView(p.id)}
                          title="View PDF"
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleEmail(p.id)}
                          title="Email Payslip"
                        >
                          <EmailIcon fontSize="small" />
                        </IconButton>
                        {status !== "locked" && status !== "paid" && (
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(p.id)}
                            title="Edit / Adjust"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {payslips.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        No payslips generated yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <PayslipEditorDialog
        open={!!editId}
        payslipId={editId || 0}
        onClose={() => {
          setEditId(null);
          fetchPayslips(); // Refresh list to update totals
        }}
      />
    </>
  );
}
