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
  Typography,
} from "@mui/material";
import {
  AddRounded,
  AccountBalanceWalletRounded,
  CardGiftcardRounded,
  CheckRounded,
  CloseRounded,
  DeleteRounded,
  DownloadRounded,
  EditRounded,
  HistoryRounded,
  LockRounded,
  PaidRounded,
  PlayArrowRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import api from "../api";
import { getErrorMessage } from "../utils/errors";
import PayslipListDialog from "./PayslipListDialog";

type PayrollCycle = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status:
    | "draft"
    | "processing"
    | "approved"
    | "locked"
    | "paid"
    | "calculated";
  processed_count: number;
  total_net: number;
  created_at: string;
};

type Employee = {
  id: number;
  code: string;
  name: string;
};

type Bonus = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  kind?: string | null;
  direction?: string | null;
  title: string;
  amount: number;
  taxable: number | boolean;
  status: string;
};

type BonusForm = {
  id?: number;
  employee_id: number | "";
  kind: "bonus" | "commission" | "incentive" | "penalty" | "fine";
  direction: "earning" | "deduction";
  title: string;
  amount: string;
  taxable: boolean;
  status: "pending" | "applied" | "cancelled";
};

type ApprovalHistory = {
  id: number;
  action: string;
  note?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  created_at: string;
};

type PayslipPaymentSummary = {
  payslip_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  net_salary: number;
  paid_amount: number;
  balance: number;
  payment_status: string;
  last_payment_date?: string | null;
};

type PayslipPayment = {
  id: number;
  payslip_id: number;
  amount: number;
  payment_date: string;
  method: string;
  reference?: string | null;
  created_at: string;
};

export default function PayrollCycles() {
  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cycleAction, setCycleAction] = useState<{
    id: number;
    kind: "lock" | "pay";
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [newCycle, setNewCycle] = useState({
    name: "",
    start_date: "",
    end_date: "",
  });

  const [reviewCycle, setReviewCycle] = useState<PayrollCycle | null>(null);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusCycle, setBonusCycle] = useState<PayrollCycle | null>(null);
  const [bonusList, setBonusList] = useState<Bonus[]>([]);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusError, setBonusError] = useState("");
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalCycle, setApprovalCycle] = useState<PayrollCycle | null>(null);
  const [approvalAction, setApprovalAction] = useState<"approved" | "rejected">(
    "approved",
  );
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCycle, setHistoryCycle] = useState<PayrollCycle | null>(null);
  const [historyList, setHistoryList] = useState<ApprovalHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentsCycle, setPaymentsCycle] = useState<PayrollCycle | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PayslipPaymentSummary[]>(
    [],
  );
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentsSaving, setPaymentsSaving] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState<number | "">("");
  const [payslipPayments, setPayslipPayments] = useState<PayslipPayment[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    method: "bank_transfer",
    reference: "",
  });
  const emptyBonusForm: BonusForm = {
    employee_id: "",
    kind: "bonus",
    direction: "earning",
    title: "",
    amount: "",
    taxable: true,
    status: "pending",
  };
  const [bonusForm, setBonusForm] = useState<BonusForm>(emptyBonusForm);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/payroll/cycles");
      const list = Array.isArray(res.data?.cycles) ? res.data.cycles : [];
      setCycles(list);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load payroll cycles"));
    } finally {
      setLoading(false);
    }
  }, []);
  const fetchEmployees = useCallback(async () => {
    if (employees.length > 0) return;
    setEmployeeLoading(true);
    try {
      const res = await api.get("/api/employees");
      const list = Array.isArray(res.data?.employees) ? res.data.employees : [];
      setEmployees(list);
    } catch (err) {
      setBonusError(getErrorMessage(err, "Failed to load employees"));
    } finally {
      setEmployeeLoading(false);
    }
  }, [employees.length]);

  const fetchBonuses = useCallback(async (cycleId: number) => {
    setBonusLoading(true);
    try {
      const res = await api.get(`/api/payroll/bonuses?cycle_id=${cycleId}`);
      const list = Array.isArray(res.data?.bonuses) ? res.data.bonuses : [];
      setBonusList(list);
      setBonusError("");
    } catch (err) {
      setBonusError(getErrorMessage(err, "Failed to load bonuses"));
    } finally {
      setBonusLoading(false);
    }
  }, []);

  const fetchApprovals = useCallback(async (cycleId: number) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/api/payroll/cycles/approvals?id=${cycleId}`);
      const list = Array.isArray(res.data?.approvals) ? res.data.approvals : [];
      setHistoryList(list);
      setHistoryError("");
    } catch (err) {
      setHistoryError(getErrorMessage(err, "Failed to load approval history"));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchPaymentSummary = useCallback(async (cycleId: number) => {
    setPaymentsLoading(true);
    setPaymentsError("");
    try {
      const res = await api.get(`/api/payroll/payments?cycle_id=${cycleId}`);
      const list = Array.isArray(res.data?.payslips) ? res.data.payslips : [];
      setPaymentSummary(list);
    } catch (err) {
      setPaymentsError(getErrorMessage(err, "Failed to load payment summary"));
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  const fetchPayslipPayments = useCallback(async (payslipId: number) => {
    try {
      const res = await api.get(
        `/api/payroll/payments/payslip?payslip_id=${payslipId}`,
      );
      const list = Array.isArray(res.data?.payments) ? res.data.payments : [];
      setPayslipPayments(list);
    } catch (err) {
      setPaymentsError(getErrorMessage(err, "Failed to load payments"));
    }
  }, []);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  useEffect(() => {
    if (!paymentsOpen) return;
    if (!selectedPayslipId) return;
    fetchPayslipPayments(Number(selectedPayslipId));
  }, [fetchPayslipPayments, paymentsOpen, selectedPayslipId]);

  const handleCreate = async () => {
    setCreateBusy(true);
    setCreateBusy(true);
    try {
      await api.post("/api/payroll/cycles", newCycle);
      setCreateOpen(false);
      fetchCycles();
      setNewCycle({ name: "", start_date: "", end_date: "" });
    } catch (err) {
      alert(getErrorMessage(err, "Failed to create payroll cycle"));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleRunPayroll = async (id: number) => {
    if (!confirm("Are you sure you want to run payroll calculation?")) return;
    try {
      await api.post(`/api/payroll/cycles/run?id=${id}`);
      fetchCycles();
    } catch (err) {
      alert(getErrorMessage(err, "Failed to run payroll cycle"));
    }
  };

  const handleLock = async (id: number) => {
    if (!confirm("Locking this cycle will prevent further changes. Continue?"))
      return;
    try {
      setCycleAction({ id, kind: "lock" });
      await api.post("/api/payroll/cycles/lock", { id });
      fetchCycles();
    } catch (err) {
      alert(getErrorMessage(err, "Failed to lock payroll cycle"));
    } finally {
      setCycleAction((prev) =>
        prev?.id === id && prev.kind === "lock" ? null : prev,
      );
    }
  };

  const handleMarkPaid = async (id: number) => {
    if (!confirm("Mark this cycle as PAID? This will record payments.")) return;
    try {
      setCycleAction({ id, kind: "pay" });
      await api.post("/api/payroll/cycles/pay", { id });
      fetchCycles();
    } catch (err) {
      alert(getErrorMessage(err, "Failed to mark cycle as paid"));
    } finally {
      setCycleAction((prev) =>
        prev?.id === id && prev.kind === "pay" ? null : prev,
      );
    }
  };

  const handleOpenApproval = (
    cycle: PayrollCycle,
    action: "approved" | "rejected",
  ) => {
    setApprovalCycle(cycle);
    setApprovalAction(action);
    setApprovalNote("");
    setApprovalOpen(true);
  };

  const handleSubmitApproval = async () => {
    if (!approvalCycle) return;
    setApprovalSaving(true);
    try {
      const note = approvalNote.trim();
      if (approvalAction === "approved") {
        await api.post("/api/payroll/cycles/approve", {
          id: approvalCycle.id,
          note: note || null,
        });
      } else {
        await api.post("/api/payroll/cycles/reject", {
          id: approvalCycle.id,
          note: note || null,
        });
      }
      setApprovalOpen(false);
      setApprovalCycle(null);
      fetchCycles();
    } catch (err) {
      alert(
        getErrorMessage(
          err,
          approvalAction === "approved"
            ? "Failed to approve payroll cycle"
            : "Failed to reject payroll cycle",
        ),
      );
    } finally {
      setApprovalSaving(false);
    }
  };

  const handleDownloadBank = async (id: number) => {
    window.open(
      `${api.defaults.baseURL || ""}/api/payroll/cycles/bank-export?cycle_id=${id}&token=${localStorage.getItem("token")}`,
      "_blank",
    );
  };

  const handleOpenBonuses = async (cycle: PayrollCycle) => {
    setBonusCycle(cycle);
    setBonusOpen(true);
    setBonusForm(emptyBonusForm);
    setBonusError("");
    await Promise.all([fetchBonuses(cycle.id), fetchEmployees()]);
  };

  const handleSaveBonus = async () => {
    if (!bonusCycle) return;
    if (!bonusForm.employee_id || !bonusForm.title || !bonusForm.amount) {
      setBonusError("Employee, title, and amount are required");
      return;
    }
    setBonusSaving(true);
    try {
      await api.post("/api/payroll/bonuses", {
        id: bonusForm.id,
        employee_id: bonusForm.employee_id,
        payroll_cycle_id: bonusCycle.id,
        kind: bonusForm.kind,
        direction: bonusForm.direction,
        title: bonusForm.title,
        amount: Number(bonusForm.amount),
        taxable: bonusForm.direction === "earning" && bonusForm.taxable ? 1 : 0,
        status: bonusForm.status,
      });
      setBonusForm(emptyBonusForm);
      fetchBonuses(bonusCycle.id);
    } catch (err) {
      setBonusError(getErrorMessage(err, "Failed to save variable pay"));
    } finally {
      setBonusSaving(false);
    }
  };

  const handleDeleteBonus = async (id: number) => {
    if (!confirm("Delete this bonus?")) return;
    try {
      await api.post("/api/payroll/bonuses/delete", { id });
      if (bonusCycle) {
        fetchBonuses(bonusCycle.id);
      }
    } catch (err) {
      setBonusError(getErrorMessage(err, "Failed to delete bonus"));
    }
  };

  const handleOpenHistory = async (cycle: PayrollCycle) => {
    setHistoryCycle(cycle);
    setHistoryOpen(true);
    setHistoryList([]);
    setHistoryError("");
    await fetchApprovals(cycle.id);
  };

  const handleOpenPayments = async (cycle: PayrollCycle) => {
    setPaymentsCycle(cycle);
    setPaymentsOpen(true);
    setPaymentsError("");
    setPaymentSummary([]);
    setPayslipPayments([]);
    setSelectedPayslipId("");
    setPaymentForm({
      amount: "",
      payment_date: new Date().toISOString().split("T")[0],
      method: "bank_transfer",
      reference: "",
    });
    await fetchPaymentSummary(cycle.id);
  };

  const handleAddPayment = async () => {
    if (!paymentsCycle) return;
    if (!selectedPayslipId || !paymentForm.amount) {
      setPaymentsError("Payslip and amount are required");
      return;
    }
    setPaymentsSaving(true);
    try {
      await api.post("/api/payroll/payments/add", {
        payslip_id: selectedPayslipId,
        amount: Number(paymentForm.amount),
        payment_date: paymentForm.payment_date,
        method: paymentForm.method,
        reference: paymentForm.reference || null,
      });
      setPaymentForm((prev) => ({ ...prev, amount: "", reference: "" }));
      await fetchPaymentSummary(paymentsCycle.id);
      await fetchPayslipPayments(Number(selectedPayslipId));
      fetchCycles();
    } catch (err) {
      setPaymentsError(getErrorMessage(err, "Failed to record payment"));
    } finally {
      setPaymentsSaving(false);
    }
  };

  const getStatusColor = (
    status: string,
  ): "success" | "warning" | "info" | "default" => {
    switch (status) {
      case "paid":
        return "success";
      case "locked":
        return "warning";
      case "approved":
        return "warning";
      case "processing":
      case "calculated":
        return "info";
      default:
        return "default";
    }
  };

  const bonusReadOnly =
    bonusCycle?.status === "locked" || bonusCycle?.status === "paid";

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Payroll Cycles</Typography>
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          onClick={() => setCreateOpen(true)}
        >
          New Cycle
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Period</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Employees</TableCell>
              <TableCell align="right">Total Net</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cycles.map((cycle) => (
              <TableRow key={cycle.id}>
                <TableCell>{cycle.name}</TableCell>
                <TableCell>
                  {cycle.start_date} to {cycle.end_date}
                </TableCell>
                <TableCell>
                  <Chip
                    label={
                      cycle.status === "calculated"
                        ? "PROCESSING"
                        : cycle.status.toUpperCase()
                    }
                    color={getStatusColor(cycle.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">{cycle.processed_count}</TableCell>
                <TableCell align="right">
                  {cycle.total_net?.toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {cycle.status === "draft" && (
                      <IconButton
                        title="Run Calculation"
                        color="primary"
                        onClick={() => handleRunPayroll(cycle.id)}
                      >
                        <PlayArrowRounded />
                      </IconButton>
                    )}
                    {(cycle.status === "processing" ||
                      cycle.status === "calculated") && (
                      <IconButton
                        title="Approve Cycle"
                        color="success"
                        onClick={() => handleOpenApproval(cycle, "approved")}
                      >
                        <CheckRounded />
                      </IconButton>
                    )}
                    {(cycle.status === "processing" ||
                      cycle.status === "calculated") && (
                      <IconButton
                        title="Reject Cycle"
                        color="error"
                        onClick={() => handleOpenApproval(cycle, "rejected")}
                      >
                        <CloseRounded />
                      </IconButton>
                    )}
                    {cycle.status === "approved" && (
                      <IconButton
                        title="Lock Cycle"
                        color="warning"
                        onClick={() => handleLock(cycle.id)}
                        disabled={cycleAction?.id === cycle.id}
                      >
                        <LockRounded />
                      </IconButton>
                    )}
                    {cycle.status === "locked" && (
                      <IconButton
                        title="Mark Paid"
                        color="success"
                        onClick={() => handleMarkPaid(cycle.id)}
                        disabled={cycleAction?.id === cycle.id}
                      >
                        <PaidRounded />
                      </IconButton>
                    )}
                    {(cycle.status === "locked" || cycle.status === "paid") && (
                      <IconButton
                        title="Payments"
                        onClick={() => handleOpenPayments(cycle)}
                      >
                        <AccountBalanceWalletRounded />
                      </IconButton>
                    )}
                    <IconButton
                      title="Variable Pay"
                      onClick={() => handleOpenBonuses(cycle)}
                    >
                      <CardGiftcardRounded />
                    </IconButton>
                    <IconButton
                      title="Approval History"
                      onClick={() => handleOpenHistory(cycle)}
                    >
                      <HistoryRounded />
                    </IconButton>
                    {cycle.status !== "draft" && (
                      <IconButton
                        title="Review Payslips"
                        onClick={() => setReviewCycle(cycle)}
                      >
                        <VisibilityRounded />
                      </IconButton>
                    )}
                    {(cycle.status === "locked" || cycle.status === "paid") && (
                      <IconButton
                        title="Bank Export"
                        onClick={() => handleDownloadBank(cycle.id)}
                      >
                        <DownloadRounded />
                      </IconButton>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {cycles.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No payroll cycles found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogTitle>Create Payroll Cycle</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 300 }}>
            <TextField
              label="Cycle Name"
              fullWidth
              value={newCycle.name}
              onChange={(e) =>
                setNewCycle({ ...newCycle, name: e.target.value })
              }
              placeholder="e.g. Feb 2026"
            />
            <TextField
              label="Start Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={newCycle.start_date}
              onChange={(e) =>
                setNewCycle({ ...newCycle, start_date: e.target.value })
              }
            />
            <TextField
              label="End Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={newCycle.end_date}
              onChange={(e) =>
                setNewCycle({ ...newCycle, end_date: e.target.value })
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
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={paymentsOpen}
        onClose={() => {
          setPaymentsOpen(false);
          setPaymentsCycle(null);
          setPaymentSummary([]);
          setPayslipPayments([]);
          setSelectedPayslipId("");
        }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Payments{paymentsCycle ? ` - ${paymentsCycle.name}` : ""}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {paymentsError && <Alert severity="error">{paymentsError}</Alert>}

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Payslip"
                select
                fullWidth
                value={selectedPayslipId}
                onChange={(e) => setSelectedPayslipId(Number(e.target.value))}
                disabled={paymentsLoading || paymentsSaving}
              >
                {paymentSummary.map((p) => (
                  <MenuItem key={p.payslip_id} value={p.payslip_id}>
                    {p.employee_name} ({p.employee_code}) - Balance{" "}
                    {Number(p.balance).toLocaleString()}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Amount"
                type="number"
                fullWidth
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    amount: e.target.value,
                  }))
                }
                disabled={paymentsSaving}
              />
              <TextField
                label="Payment Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={paymentForm.payment_date}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    payment_date: e.target.value,
                  }))
                }
                disabled={paymentsSaving}
              />
              <TextField
                label="Method"
                fullWidth
                value={paymentForm.method}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    method: e.target.value,
                  }))
                }
                disabled={paymentsSaving}
              />
              <TextField
                label="Reference (optional)"
                fullWidth
                value={paymentForm.reference}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    reference: e.target.value,
                  }))
                }
                disabled={paymentsSaving}
              />
            </Stack>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="contained"
                onClick={handleAddPayment}
                disabled={paymentsSaving || paymentsLoading || !paymentsCycle}
              >
                {paymentsSaving ? "Recording..." : "Record Payment"}
              </Button>
            </Stack>

            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell align="right">Net</TableCell>
                    <TableCell align="right">Paid</TableCell>
                    <TableCell align="right">Balance</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell>Last Payment</TableCell>
                    <TableCell align="right">Quick Pay</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paymentSummary.map((p) => (
                    <TableRow key={p.payslip_id} hover>
                      <TableCell>
                        {p.employee_name} ({p.employee_code})
                      </TableCell>
                      <TableCell align="right">
                        {Number(p.net_salary).toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {Number(p.paid_amount).toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {Number(p.balance).toLocaleString()}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={String(
                            p.payment_status || "pending",
                          ).toUpperCase()}
                          color={
                            p.payment_status === "paid"
                              ? "success"
                              : p.payment_status === "partial"
                                ? "warning"
                                : "default"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {p.last_payment_date
                          ? new Date(p.last_payment_date).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSelectedPayslipId(p.payslip_id);
                            setPaymentForm((prev) => ({
                              ...prev,
                              amount: String(p.balance || ""),
                            }));
                          }}
                          disabled={paymentsSaving || Number(p.balance) <= 0}
                        >
                          Fill Balance
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paymentSummary.length === 0 && !paymentsLoading && (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No payslips found for this cycle.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {selectedPayslipId && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Method</TableCell>
                      <TableCell>Reference</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payslipPayments.map((pp) => (
                      <TableRow key={pp.id}>
                        <TableCell>{pp.payment_date}</TableCell>
                        <TableCell align="right">
                          {Number(pp.amount).toLocaleString()}
                        </TableCell>
                        <TableCell>{pp.method}</TableCell>
                        <TableCell>{pp.reference || "-"}</TableCell>
                      </TableRow>
                    ))}
                    {payslipPayments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          No payments recorded for this payslip.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={bonusOpen}
        onClose={() => {
          setBonusOpen(false);
          setBonusCycle(null);
          setBonusList([]);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Variable Pay{bonusCycle ? ` - ${bonusCycle.name}` : ""}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {bonusReadOnly && (
              <Alert severity="info">
                Variable pay is locked for this cycle.
              </Alert>
            )}
            {bonusError && <Alert severity="error">{bonusError}</Alert>}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Employee"
                select
                fullWidth
                value={bonusForm.employee_id}
                onChange={(e) =>
                  setBonusForm({
                    ...bonusForm,
                    employee_id: Number(e.target.value),
                  })
                }
                disabled={bonusReadOnly || employeeLoading}
              >
                {employees.map((employee) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.code})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Kind"
                select
                fullWidth
                value={bonusForm.kind}
                onChange={(e) => {
                  const nextKind = e.target.value as BonusForm["kind"];
                  const nextDirection =
                    nextKind === "penalty" || nextKind === "fine"
                      ? "deduction"
                      : bonusForm.direction;
                  setBonusForm({
                    ...bonusForm,
                    kind: nextKind,
                    direction: nextDirection,
                    taxable:
                      nextDirection === "deduction" ? false : bonusForm.taxable,
                  });
                }}
                disabled={bonusReadOnly}
              >
                <MenuItem value="bonus">Bonus</MenuItem>
                <MenuItem value="commission">Commission</MenuItem>
                <MenuItem value="incentive">Incentive</MenuItem>
                <MenuItem value="penalty">Penalty</MenuItem>
                <MenuItem value="fine">Fine</MenuItem>
              </TextField>
              <TextField
                label="Direction"
                select
                fullWidth
                value={bonusForm.direction}
                onChange={(e) => {
                  const nextDirection = e.target
                    .value as BonusForm["direction"];
                  setBonusForm({
                    ...bonusForm,
                    direction: nextDirection,
                    taxable:
                      nextDirection === "deduction" ? false : bonusForm.taxable,
                  });
                }}
                disabled={bonusReadOnly}
              >
                <MenuItem value="earning">Earning</MenuItem>
                <MenuItem value="deduction">Deduction</MenuItem>
              </TextField>
              <TextField
                label="Title"
                fullWidth
                value={bonusForm.title}
                onChange={(e) =>
                  setBonusForm({ ...bonusForm, title: e.target.value })
                }
                disabled={bonusReadOnly}
              />
              <TextField
                label="Amount"
                type="number"
                fullWidth
                value={bonusForm.amount}
                onChange={(e) =>
                  setBonusForm({ ...bonusForm, amount: e.target.value })
                }
                disabled={bonusReadOnly}
              />
              <TextField
                label="Taxable"
                select
                fullWidth
                value={bonusForm.taxable ? "yes" : "no"}
                onChange={(e) =>
                  setBonusForm({
                    ...bonusForm,
                    taxable: e.target.value === "yes",
                  })
                }
                disabled={bonusReadOnly || bonusForm.direction === "deduction"}
              >
                <MenuItem value="yes">Yes</MenuItem>
                <MenuItem value="no">No</MenuItem>
              </TextField>
            </Stack>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="contained"
                onClick={handleSaveBonus}
                disabled={bonusSaving || bonusReadOnly || !bonusCycle}
              >
                {bonusForm.id ? "Update Item" : "Add Item"}
              </Button>
              <Button
                onClick={() => setBonusForm(emptyBonusForm)}
                disabled={bonusSaving}
              >
                Clear
              </Button>
            </Stack>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell>Direction</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="center">Taxable</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bonusList.map((bonus) => (
                    <TableRow key={bonus.id}>
                      <TableCell>
                        {bonus.employee_name} ({bonus.employee_code})
                      </TableCell>
                      <TableCell>
                        {String(bonus.kind || "bonus").toUpperCase()}
                      </TableCell>
                      <TableCell>
                        {String(bonus.direction || "earning").toUpperCase()}
                      </TableCell>
                      <TableCell>{bonus.title}</TableCell>
                      <TableCell align="right">
                        {bonus.amount?.toLocaleString()}
                      </TableCell>
                      <TableCell align="center">
                        {bonus.taxable ? "Yes" : "No"}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={bonus.status?.toUpperCase()}
                          color={
                            bonus.status === "applied"
                              ? "success"
                              : bonus.status === "cancelled"
                                ? "default"
                                : "warning"
                          }
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent="flex-end"
                        >
                          <IconButton
                            size="small"
                            onClick={() =>
                              setBonusForm({
                                id: bonus.id,
                                employee_id: bonus.employee_id,
                                kind:
                                  (bonus.kind as BonusForm["kind"]) || "bonus",
                                direction:
                                  (bonus.direction as BonusForm["direction"]) ||
                                  "earning",
                                title: bonus.title,
                                amount: String(bonus.amount ?? ""),
                                taxable: Boolean(bonus.taxable),
                                status:
                                  bonus.status === "cancelled"
                                    ? "cancelled"
                                    : bonus.status === "applied"
                                      ? "applied"
                                      : "pending",
                              })
                            }
                            disabled={
                              bonusReadOnly || bonus.status !== "pending"
                            }
                          >
                            <EditRounded fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteBonus(bonus.id)}
                            disabled={
                              bonusReadOnly || bonus.status !== "pending"
                            }
                          >
                            <DeleteRounded fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {bonusList.length === 0 && !bonusLoading && (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        No variable pay items found for this cycle.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBonusOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={approvalOpen}
        onClose={() => {
          setApprovalOpen(false);
          setApprovalCycle(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {approvalAction === "approved" ? "Approve" : "Reject"} Cycle
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {approvalCycle?.name}
            </Typography>
            <TextField
              label="Note"
              fullWidth
              multiline
              minRows={3}
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setApprovalOpen(false);
              setApprovalCycle(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color={approvalAction === "approved" ? "success" : "error"}
            onClick={handleSubmitApproval}
            disabled={approvalSaving || !approvalCycle}
          >
            {approvalAction === "approved" ? "Approve" : "Reject"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryCycle(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Approval History{historyCycle ? ` - ${historyCycle.name}` : ""}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {historyError && <Alert severity="error">{historyError}</Alert>}
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Action</TableCell>
                    <TableCell>Note</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyList.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.action?.toUpperCase()}
                          color={
                            row.action === "approved" ? "success" : "warning"
                          }
                        />
                      </TableCell>
                      <TableCell>{row.note || "-"}</TableCell>
                      <TableCell>{row.user_name || "-"}</TableCell>
                      <TableCell>{row.user_role || "-"}</TableCell>
                      <TableCell>
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {historyList.length === 0 && !historyLoading && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        No approval history found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {reviewCycle && (
        <PayslipListDialog
          open={!!reviewCycle}
          cycleId={reviewCycle.id}
          cycleName={reviewCycle.name}
          status={reviewCycle.status}
          onClose={() => {
            setReviewCycle(null);
            fetchCycles();
          }}
        />
      )}
    </Stack>
  );
}
