import { useState, useEffect, useCallback } from "react";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Stack,
  CircularProgress,
  Alert,
  MenuItem,
  InputAdornment,
  Grid,
  Chip,
} from "@mui/material";
import {
  Edit as EditIcon,
  Save as SaveIcon,
  History as HistoryIcon,
} from "@mui/icons-material";
import api from "../api";
import { getErrorMessage } from "../utils/errors";

interface Employee {
  id: number;
  code: string;
  name: string;
  department: string;
  designation: string;
}

interface SalaryComponent {
  id: number;
  name: string;
  type: "earning" | "deduction";
}

interface StructureItem {
  component_id: number;
  amount: number | string;
  is_percentage?: boolean;
  percentage?: number | string;
  name?: string;
  type?: "earning" | "deduction";
}

interface StructureHistoryItem extends StructureItem {
  type: "earning" | "deduction";
}

interface SalaryStructure {
  effective_from: string;
  base_salary: number | string;
  payment_method: string;
  items: StructureItem[];
}

interface SalaryStructureHistory extends SalaryStructure {
  status?: string;
  items: StructureHistoryItem[];
}

type BankAccount = {
  id: number;
  bank_name: string;
  account_number: string;
  branch_code?: string | null;
  account_holder_name: string;
  is_primary: number | boolean;
};

type BankAccountForm = {
  id?: number;
  bank_name: string;
  account_number: string;
  branch_code: string;
  account_holder_name: string;
  is_primary: boolean;
};

const maskAccountNumber = (v: string) => {
  const s = String(v || "");
  const last4 = s.slice(-4);
  if (s.length <= 4) return s;
  return `${"•".repeat(Math.min(8, s.length - 4))}${last4}`;
};

export default function PayrollStructures() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [structure, setStructure] = useState<SalaryStructure>({
    effective_from: new Date().toISOString().split("T")[0],
    base_salary: "",
    payment_method: "bank_transfer",
    items: [],
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SalaryStructureHistory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankForm, setBankForm] = useState<BankAccountForm>({
    bank_name: "",
    account_number: "",
    branch_code: "",
    account_holder_name: "",
    is_primary: true,
  });
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankError, setBankError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, compRes] = await Promise.all([
        api.get("/api/employees"),
        api.get("/api/payroll/components"),
      ]);
      setEmployees(empRes.data.employees || []);
      setComponents(compRes.data.components || []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load payroll structure data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEdit = async (emp: Employee) => {
    setSelectedEmp(emp);
    try {
      const [res, accounts] = await Promise.all([
        api.get(`/api/payroll/structure?employee_id=${emp.id}`),
        fetchBankAccounts(emp.id),
      ]);
      const s = res.data.structure as SalaryStructure | null;

      // Initialize items from components if not present
      const initialItems = components.map((c) => ({
        component_id: c.id,
        amount: 0,
        is_percentage: false,
        percentage: 0,
      }));

      if (s) {
        // Merge existing items
        const mergedItems = initialItems.map((item) => {
          const existing = s.items?.find(
            (i) => i.component_id === item.component_id,
          );
          return existing
            ? {
                ...item,
                amount: existing.amount,
                is_percentage: Boolean(existing.is_percentage),
                percentage: existing.percentage ?? 0,
              }
            : item;
        });

        setStructure({
          effective_from: s.effective_from,
          base_salary: s.base_salary,
          payment_method: s.payment_method || "bank_transfer",
          items: mergedItems,
        });
      } else {
        setStructure({
          effective_from: new Date().toISOString().split("T")[0],
          base_salary: "",
          payment_method: "bank_transfer",
          items: initialItems,
        });
      }
      setBankForm({
        bank_name: "",
        account_number: "",
        branch_code: "",
        account_holder_name: "",
        is_primary: accounts.length === 0,
      });
      setOpen(true);
    } catch (err) {
      alert(getErrorMessage(err, "Failed to load salary structure"));
    }
  };

  const handleSave = async () => {
    if (!selectedEmp) return;
    setSaving(true);
    try {
      // Filter out zero amount items to keep DB clean, or keep them?
      // Keeping them ensures we know it's explicitly 0.
      const payload = {
        effective_from: structure.effective_from,
        base_salary: Number(structure.base_salary),
        payment_method: structure.payment_method,
        items: structure.items
          .map((i) => ({
            component_id: i.component_id,
            amount: Number(i.amount),
            is_percentage: Boolean(i.is_percentage),
            percentage: Number(i.percentage),
          }))
          .filter((i) => (i.is_percentage ? i.percentage > 0 : i.amount > 0)),
      };

      await api.post(
        `/api/payroll/structure?employee_id=${selectedEmp.id}`,
        payload,
      );
      setOpen(false);
      // Maybe show success snackbar
    } catch (err) {
      alert(getErrorMessage(err, "Failed to save salary structure"));
    } finally {
      setSaving(false);
    }
  };

  const handleItemChange = (
    compId: number,
    field: "amount" | "percentage" | "is_percentage",
    val: string | boolean,
  ) => {
    setStructure((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.component_id === compId ? { ...i, [field]: val } : i,
      ),
    }));
  };

  const handleViewHistory = async (emp: Employee) => {
    setSelectedEmp(emp);
    try {
      const res = await api.get(
        `/api/payroll/structure/history?employee_id=${emp.id}`,
      );
      setHistory(res.data.history || []);
      setHistoryOpen(true);
    } catch (err) {
      alert(getErrorMessage(err, "Failed to load salary history"));
    }
  };

  const fetchBankAccounts = useCallback(async (employeeId: number) => {
    setBankLoading(true);
    setBankError("");
    try {
      const res = await api.get(
        `/api/payroll/bank_accounts?employee_id=${employeeId}`,
      );
      const accounts = res.data.accounts || [];
      setBankAccounts(accounts);
      return accounts as BankAccount[];
    } catch (err) {
      setBankError(getErrorMessage(err, "Failed to load bank accounts"));
      setBankAccounts([]);
      return [];
    } finally {
      setBankLoading(false);
    }
  }, []);

  const handleBankReset = () => {
    setBankForm({
      bank_name: "",
      account_number: "",
      branch_code: "",
      account_holder_name: "",
      is_primary: bankAccounts.length === 0,
    });
  };

  const handleBankEdit = (account: BankAccount) => {
    setBankForm({
      id: account.id,
      bank_name: account.bank_name,
      account_number: account.account_number,
      branch_code: account.branch_code || "",
      account_holder_name: account.account_holder_name,
      is_primary: Boolean(account.is_primary),
    });
  };

  const handleBankSave = async () => {
    if (!selectedEmp) return;
    setBankSaving(true);
    setBankError("");
    try {
      await api.post(
        `/api/payroll/bank_accounts?employee_id=${selectedEmp.id}`,
        {
          id: bankForm.id,
          bank_name: bankForm.bank_name,
          account_number: bankForm.account_number,
          branch_code: bankForm.branch_code,
          account_holder_name: bankForm.account_holder_name,
          is_primary: bankForm.is_primary,
        },
      );
      const accounts = await fetchBankAccounts(selectedEmp.id);
      setBankForm({
        bank_name: "",
        account_number: "",
        branch_code: "",
        account_holder_name: "",
        is_primary: accounts.length === 0,
      });
    } catch (err) {
      setBankError(getErrorMessage(err, "Failed to save bank account"));
    } finally {
      setBankSaving(false);
    }
  };

  const handleBankDelete = async (accountId: number) => {
    if (!selectedEmp) return;
    setBankSaving(true);
    setBankError("");
    try {
      await api.post(`/api/payroll/bank_accounts/delete?id=${accountId}`);
      await fetchBankAccounts(selectedEmp.id);
      if (bankForm.id === accountId) {
        handleBankReset();
      }
    } catch (err) {
      setBankError(getErrorMessage(err, "Failed to delete bank account"));
    } finally {
      setBankSaving(false);
    }
  };

  const handleSetPrimaryBank = async (accountId: number) => {
    if (!selectedEmp) return;
    setBankSaving(true);
    setBankError("");
    try {
      await api.post("/api/payroll/bank_accounts/primary", {
        employee_id: selectedEmp.id,
        account_id: accountId,
      });
      await fetchBankAccounts(selectedEmp.id);
    } catch (err) {
      setBankError(getErrorMessage(err, "Failed to update primary account"));
    } finally {
      setBankSaving(false);
    }
  };

  const bankFormValid =
    bankForm.bank_name.trim() !== "" &&
    bankForm.account_number.trim() !== "" &&
    bankForm.account_holder_name.trim() !== "";

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Employee Salary Structures</Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Designation</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : (
              employees.map((emp) => (
                <TableRow key={emp.id} hover>
                  <TableCell>{emp.code}</TableCell>
                  <TableCell>{emp.name}</TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell>{emp.designation}</TableCell>
                  <TableCell align="right">
                    <Button
                      startIcon={<EditIcon />}
                      size="small"
                      variant="outlined"
                      onClick={() => handleEdit(emp)}
                    >
                      Manage
                    </Button>
                    <Button
                      startIcon={<HistoryIcon />}
                      size="small"
                      color="secondary"
                      onClick={() => handleViewHistory(emp)}
                      sx={{ ml: 1 }}
                    >
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Manage Salary Structure - {selectedEmp?.name} ({selectedEmp?.code})
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Effective From"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={structure.effective_from}
                onChange={(e) =>
                  setStructure({ ...structure, effective_from: e.target.value })
                }
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                select
                label="Payment Method"
                fullWidth
                value={structure.payment_method}
                onChange={(e) =>
                  setStructure({ ...structure, payment_method: e.target.value })
                }
              >
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography
                variant="subtitle2"
                sx={{ mb: 2, mt: 1, color: "text.secondary" }}
              >
                Base Salary
              </Typography>
              <TextField
                label="Basic Salary"
                type="number"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
                value={structure.base_salary}
                onChange={(e) =>
                  setStructure({ ...structure, base_salary: e.target.value })
                }
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Typography
                variant="subtitle2"
                sx={{ mb: 2, mt: 2, color: "text.secondary" }}
              >
                Allowances & Deductions (Fixed)
              </Typography>
              <Stack spacing={2}>
                {components.length === 0 && (
                  <Typography variant="body2">
                    No components defined.
                  </Typography>
                )}
                {components.map((comp) => {
                  const item = structure.items.find(
                    (i) => i.component_id === comp.id,
                  );
                  const isPercentage = Boolean(item?.is_percentage);
                  return (
                    <Grid
                      container
                      spacing={2}
                      key={comp.id}
                      alignItems="center"
                    >
                      <Grid size={{ xs: 12, md: 5 }}>
                        <Typography>
                          {comp.name}
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{
                              ml: 1,
                              color:
                                comp.type === "earning"
                                  ? "success.main"
                                  : "error.main",
                            }}
                          >
                            ({comp.type.toUpperCase()})
                          </Typography>
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 12, md: 3 }}>
                        <TextField
                          size="small"
                          select
                          fullWidth
                          value={isPercentage ? "percentage" : "fixed"}
                          onChange={(e) =>
                            handleItemChange(
                              comp.id,
                              "is_percentage",
                              e.target.value === "percentage",
                            )
                          }
                        >
                          <MenuItem value="fixed">Fixed</MenuItem>
                          <MenuItem value="percentage">% of Base</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField
                          size="small"
                          type="number"
                          fullWidth
                          value={
                            isPercentage
                              ? (item?.percentage ?? "")
                              : item?.amount || ""
                          }
                          onChange={(e) =>
                            handleItemChange(
                              comp.id,
                              isPercentage ? "percentage" : "amount",
                              e.target.value,
                            )
                          }
                          InputProps={{
                            startAdornment: isPercentage ? undefined : (
                              <InputAdornment position="start">
                                $
                              </InputAdornment>
                            ),
                            endAdornment: isPercentage ? (
                              <InputAdornment position="end">%</InputAdornment>
                            ) : undefined,
                          }}
                        />
                      </Grid>
                    </Grid>
                  );
                })}
              </Stack>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Typography
                variant="subtitle2"
                sx={{ mb: 2, mt: 2, color: "text.secondary" }}
              >
                Bank Accounts
              </Typography>
              {bankError && <Alert severity="error">{bankError}</Alert>}
              <Stack spacing={2}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="Bank Name"
                      fullWidth
                      size="small"
                      value={bankForm.bank_name}
                      onChange={(e) =>
                        setBankForm({ ...bankForm, bank_name: e.target.value })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="Account Number"
                      fullWidth
                      size="small"
                      value={bankForm.account_number}
                      onChange={(e) =>
                        setBankForm({
                          ...bankForm,
                          account_number: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="Branch Code"
                      fullWidth
                      size="small"
                      value={bankForm.branch_code}
                      onChange={(e) =>
                        setBankForm({
                          ...bankForm,
                          branch_code: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="Account Holder Name"
                      fullWidth
                      size="small"
                      value={bankForm.account_holder_name}
                      onChange={(e) =>
                        setBankForm({
                          ...bankForm,
                          account_holder_name: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      select
                      label="Primary"
                      fullWidth
                      size="small"
                      value={bankForm.is_primary ? "yes" : "no"}
                      onChange={(e) =>
                        setBankForm({
                          ...bankForm,
                          is_primary: e.target.value === "yes",
                        })
                      }
                    >
                      <MenuItem value="yes">Primary</MenuItem>
                      <MenuItem value="no">Secondary</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleBankSave}
                    disabled={bankSaving || !bankFormValid}
                  >
                    {bankSaving ? "Saving..." : bankForm.id ? "Update" : "Add"}
                  </Button>
                  <Button size="small" onClick={handleBankReset}>
                    Reset
                  </Button>
                </Stack>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Bank</TableCell>
                        <TableCell>Account Number</TableCell>
                        <TableCell>Branch Code</TableCell>
                        <TableCell>Account Holder</TableCell>
                        <TableCell>Primary</TableCell>
                        <TableCell align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bankLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center">
                            <CircularProgress size={20} />
                          </TableCell>
                        </TableRow>
                      ) : bankAccounts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center">
                            No bank accounts
                          </TableCell>
                        </TableRow>
                      ) : (
                        bankAccounts.map((acc) => (
                          <TableRow key={acc.id} hover>
                            <TableCell>{acc.bank_name}</TableCell>
                            <TableCell>
                              {maskAccountNumber(acc.account_number)}
                            </TableCell>
                            <TableCell>{acc.branch_code || "-"}</TableCell>
                            <TableCell>{acc.account_holder_name}</TableCell>
                            <TableCell>
                              {acc.is_primary ? (
                                <Chip
                                  label="Primary"
                                  color="success"
                                  size="small"
                                />
                              ) : (
                                <Chip label="Secondary" size="small" />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Stack
                                direction="row"
                                spacing={1}
                                justifyContent="flex-end"
                              >
                                {!acc.is_primary && (
                                  <Button
                                    size="small"
                                    onClick={() => handleSetPrimaryBank(acc.id)}
                                  >
                                    Set Primary
                                  </Button>
                                )}
                                <Button
                                  size="small"
                                  onClick={() => handleBankEdit(acc)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="small"
                                  color="error"
                                  onClick={() => handleBankDelete(acc.id)}
                                >
                                  Delete
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Structure"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Salary Revision History: {selectedEmp?.name}</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Effective From</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Base Salary</TableCell>
                  <TableCell align="right">Total Allowances</TableCell>
                  <TableCell align="right">Total Deductions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((h, index) => {
                  const baseSalary = Number(h.base_salary);
                  const allowances = h.items
                    .filter((i) => i.type === "earning")
                    .reduce((acc, curr) => {
                      const amount = curr.is_percentage
                        ? (baseSalary * Number(curr.percentage)) / 100
                        : Number(curr.amount);
                      return acc + amount;
                    }, 0);
                  const deductions = h.items
                    .filter((i) => i.type === "deduction")
                    .reduce((acc, curr) => {
                      const amount = curr.is_percentage
                        ? (baseSalary * Number(curr.percentage)) / 100
                        : Number(curr.amount);
                      return acc + amount;
                    }, 0);
                  return (
                    <TableRow key={index}>
                      <TableCell>{h.effective_from}</TableCell>
                      <TableCell>{h.status || "active"}</TableCell>
                      <TableCell align="right">
                        {Number(h.base_salary).toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        {allowances.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        {deductions.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No history found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
