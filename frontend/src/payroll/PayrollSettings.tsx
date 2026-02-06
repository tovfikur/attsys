import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  InputAdornment,
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
import { DeleteRounded, EditRounded } from "@mui/icons-material";
import api from "../api";
import { getErrorMessage } from "../utils/errors";

type PayrollSettingsForm = {
  overtime_rate_multiplier: string;
  late_penalty_multiplier: string;
  early_leave_penalty_multiplier: string;
  work_hours_per_day: string;
  days_per_month: string;
  currency_code: string;
  pf_employee_contribution_percent: string;
  pf_employer_contribution_percent: string;
  proration_basis: "calendar" | "working" | "fixed_days_per_month";
  scheduler_enabled: boolean;
  scheduler_day_of_month: string;
  scheduler_auto_run: boolean;
  scheduler_auto_email: boolean;
};

type TaxSlab = {
  id: number;
  name: string;
  min_salary: number;
  max_salary: number | null;
  tax_percent: number;
};

type TaxSlabForm = {
  id?: number;
  name: string;
  min_salary: string;
  max_salary: string;
  tax_percent: string;
};

type RolePermissions = {
  role_name: string;
  permissions: string[];
};

const defaultSettings: PayrollSettingsForm = {
  overtime_rate_multiplier: "1.5",
  late_penalty_multiplier: "1",
  early_leave_penalty_multiplier: "1",
  work_hours_per_day: "8",
  days_per_month: "30",
  currency_code: "USD",
  pf_employee_contribution_percent: "0",
  pf_employer_contribution_percent: "0",
  proration_basis: "calendar",
  scheduler_enabled: false,
  scheduler_day_of_month: "1",
  scheduler_auto_run: true,
  scheduler_auto_email: false,
};

export default function PayrollSettings() {
  const [form, setForm] = useState<PayrollSettingsForm>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [slabs, setSlabs] = useState<TaxSlab[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(false);
  const [slabsSaving, setSlabsSaving] = useState(false);
  const [slabsError, setSlabsError] = useState("");
  const [roles, setRoles] = useState<RolePermissions[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [rolesError, setRolesError] = useState("");
  const [rolesOk, setRolesOk] = useState("");
  const emptySlabForm: TaxSlabForm = {
    name: "",
    min_salary: "",
    max_salary: "",
    tax_percent: "",
  };
  const [slabForm, setSlabForm] = useState<TaxSlabForm>(emptySlabForm);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/payroll/settings");
      const settings = res.data?.settings || {};
      setForm({
        overtime_rate_multiplier: String(
          settings.overtime_rate_multiplier ??
            defaultSettings.overtime_rate_multiplier,
        ),
        late_penalty_multiplier: String(
          settings.late_penalty_multiplier ??
            defaultSettings.late_penalty_multiplier,
        ),
        early_leave_penalty_multiplier: String(
          settings.early_leave_penalty_multiplier ??
            defaultSettings.early_leave_penalty_multiplier,
        ),
        work_hours_per_day: String(
          settings.work_hours_per_day ?? defaultSettings.work_hours_per_day,
        ),
        days_per_month: String(
          settings.days_per_month ?? defaultSettings.days_per_month,
        ),
        currency_code: String(
          settings.currency_code ?? defaultSettings.currency_code,
        ),
        pf_employee_contribution_percent: String(
          settings.pf_employee_contribution_percent ??
            defaultSettings.pf_employee_contribution_percent,
        ),
        pf_employer_contribution_percent: String(
          settings.pf_employer_contribution_percent ??
            defaultSettings.pf_employer_contribution_percent,
        ),
        proration_basis: ((): PayrollSettingsForm["proration_basis"] => {
          const v = String(
            settings.proration_basis ?? defaultSettings.proration_basis,
          );
          if (v === "working" || v === "fixed_days_per_month") return v;
          return "calendar";
        })(),
        scheduler_enabled: ((): boolean => {
          const v =
            settings.scheduler_enabled ?? defaultSettings.scheduler_enabled;
          if (v === true) return true;
          if (v === false) return false;
          const n = Number(v);
          return Number.isFinite(n) ? n === 1 : String(v).trim() === "1";
        })(),
        scheduler_day_of_month: String(
          settings.scheduler_day_of_month ??
            defaultSettings.scheduler_day_of_month,
        ),
        scheduler_auto_run: ((): boolean => {
          const v =
            settings.scheduler_auto_run ??
            (defaultSettings.scheduler_auto_run ? 1 : 0);
          const n = Number(v);
          return Number.isFinite(n) ? n === 1 : String(v).trim() === "1";
        })(),
        scheduler_auto_email: ((): boolean => {
          const v =
            settings.scheduler_auto_email ??
            (defaultSettings.scheduler_auto_email ? 1 : 0);
          const n = Number(v);
          return Number.isFinite(n) ? n === 1 : String(v).trim() === "1";
        })(),
      });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load payroll settings"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTaxSlabs = useCallback(async () => {
    setSlabsLoading(true);
    setSlabsError("");
    try {
      const res = await api.get("/api/payroll/tax-slabs");
      const list = Array.isArray(res.data?.slabs) ? res.data.slabs : [];
      setSlabs(list);
    } catch (err) {
      setSlabsError(getErrorMessage(err, "Failed to load tax slabs"));
    } finally {
      setSlabsLoading(false);
    }
  }, []);

  const fetchPayrollPermissions = useCallback(async () => {
    setRolesLoading(true);
    setRolesError("");
    setRolesOk("");
    try {
      const res = await api.get("/api/payroll/permissions");
      const list = Array.isArray(res.data?.roles) ? res.data.roles : [];
      setRoles(list);
    } catch (err) {
      setRolesError(getErrorMessage(err, "Failed to load payroll permissions"));
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchTaxSlabs();
    fetchPayrollPermissions();
  }, [fetchSettings, fetchTaxSlabs, fetchPayrollPermissions]);

  const handleChange = (field: keyof PayrollSettingsForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setOk("");
    const overtime = Number(form.overtime_rate_multiplier);
    const lateMult = Number(form.late_penalty_multiplier);
    const earlyMult = Number(form.early_leave_penalty_multiplier);
    const workHours = Number(form.work_hours_per_day);
    const days = Number(form.days_per_month);
    const pfEmp = Number(form.pf_employee_contribution_percent);
    const pfEr = Number(form.pf_employer_contribution_percent);
    const schedDay = Number(form.scheduler_day_of_month);

    if (!Number.isFinite(overtime) || overtime <= 0) {
      setError("Overtime rate multiplier must be a positive number.");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(lateMult) || lateMult < 0) {
      setError("Late penalty multiplier must be zero or positive.");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(earlyMult) || earlyMult < 0) {
      setError("Early leave penalty multiplier must be zero or positive.");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(workHours) || workHours <= 0) {
      setError("Work hours per day must be a positive number.");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      setError("Days per month must be a positive number.");
      setSaving(false);
      return;
    }
    if (form.scheduler_enabled) {
      if (!Number.isFinite(schedDay) || schedDay < 1 || schedDay > 28) {
        setError("Scheduler day of month must be between 1 and 28.");
        setSaving(false);
        return;
      }
    }
    if (!Number.isFinite(pfEmp) || pfEmp < 0) {
      setError("PF (Employee) percent must be zero or positive.");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(pfEr) || pfEr < 0) {
      setError("PF (Employer) percent must be zero or positive.");
      setSaving(false);
      return;
    }

    try {
      await api.post("/api/payroll/settings", {
        overtime_rate_multiplier: overtime,
        late_penalty_multiplier: lateMult,
        early_leave_penalty_multiplier: earlyMult,
        work_hours_per_day: workHours,
        days_per_month: days,
        currency_code: form.currency_code,
        pf_employee_contribution_percent: pfEmp,
        pf_employer_contribution_percent: pfEr,
        proration_basis: form.proration_basis,
        scheduler_enabled: form.scheduler_enabled ? 1 : 0,
        scheduler_day_of_month: form.scheduler_day_of_month,
        scheduler_auto_run: form.scheduler_auto_run ? 1 : 0,
        scheduler_auto_email: form.scheduler_auto_email ? 1 : 0,
      });
      setOk("Settings updated successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update settings"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress />
      </Stack>
    );
  }

  const handleSaveTaxSlab = async () => {
    setSlabsSaving(true);
    setSlabsError("");
    const name = slabForm.name.trim();
    const min = Number(slabForm.min_salary);
    const max =
      slabForm.max_salary.trim() === "" ? null : Number(slabForm.max_salary);
    const percent = Number(slabForm.tax_percent);

    if (!name) {
      setSlabsError("Name is required.");
      setSlabsSaving(false);
      return;
    }
    if (!Number.isFinite(min) || min < 0) {
      setSlabsError("Min salary must be a valid number (0 or higher).");
      setSlabsSaving(false);
      return;
    }
    if (max !== null && (!Number.isFinite(max) || max < min)) {
      setSlabsError("Max salary must be empty or a number >= min salary.");
      setSlabsSaving(false);
      return;
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setSlabsError("Tax percent must be between 0 and 100.");
      setSlabsSaving(false);
      return;
    }

    try {
      await api.post("/api/payroll/tax-slabs", {
        id: slabForm.id,
        name,
        min_salary: min,
        max_salary: max,
        tax_percent: percent,
      });
      setSlabForm(emptySlabForm);
      fetchTaxSlabs();
    } catch (err) {
      setSlabsError(getErrorMessage(err, "Failed to save tax slab"));
    } finally {
      setSlabsSaving(false);
    }
  };

  const handleDeleteTaxSlab = async (id: number) => {
    if (!confirm("Delete this tax slab?")) return;
    try {
      await api.post("/api/payroll/tax-slabs/delete", { id });
      fetchTaxSlabs();
    } catch (err) {
      setSlabsError(getErrorMessage(err, "Failed to delete tax slab"));
    }
  };

  const payrollPerms: { key: string; label: string }[] = [
    { key: "payroll.read", label: "Read" },
    { key: "payroll.manage", label: "Manage" },
    { key: "payroll.run", label: "Run" },
    { key: "payroll.approve", label: "Approve" },
    { key: "payroll.lock", label: "Lock" },
    { key: "payroll.pay", label: "Pay" },
    { key: "payroll.settings", label: "Settings" },
  ];

  const toggleRolePerm = (roleName: string, perm: string) => {
    setRoles((prev) =>
      prev.map((r) => {
        if (r.role_name !== roleName) return r;
        const set = new Set(r.permissions || []);
        if (set.has(perm)) set.delete(perm);
        else set.add(perm);
        return { ...r, permissions: Array.from(set) };
      }),
    );
  };

  const handleSavePayrollPermissions = async () => {
    setRolesSaving(true);
    setRolesError("");
    setRolesOk("");
    try {
      await api.post("/api/payroll/permissions", { roles });
      setRolesOk("Permissions updated.");
    } catch (err) {
      setRolesError(getErrorMessage(err, "Failed to update permissions"));
    } finally {
      setRolesSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Payroll Settings</Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {ok && <Alert severity="success">{ok}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Stack spacing={3}>
          <TextField
            label="Overtime Rate Multiplier"
            type="number"
            value={form.overtime_rate_multiplier}
            onChange={(e) =>
              handleChange("overtime_rate_multiplier", e.target.value)
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">x</InputAdornment>,
            }}
          />
          <TextField
            label="Late Penalty Multiplier"
            type="number"
            value={form.late_penalty_multiplier}
            onChange={(e) =>
              handleChange("late_penalty_multiplier", e.target.value)
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">x</InputAdornment>,
            }}
          />
          <TextField
            label="Early Leave Penalty Multiplier"
            type="number"
            value={form.early_leave_penalty_multiplier}
            onChange={(e) =>
              handleChange("early_leave_penalty_multiplier", e.target.value)
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">x</InputAdornment>,
            }}
          />
          <TextField
            label="Work Hours Per Day"
            type="number"
            value={form.work_hours_per_day}
            onChange={(e) => handleChange("work_hours_per_day", e.target.value)}
            InputProps={{
              endAdornment: <InputAdornment position="end">hrs</InputAdornment>,
            }}
          />
          <TextField
            label="Days Per Month"
            type="number"
            value={form.days_per_month}
            onChange={(e) => handleChange("days_per_month", e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">days</InputAdornment>
              ),
            }}
          />
          <TextField
            select
            label="Proration Basis"
            value={form.proration_basis}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                proration_basis: e.target
                  .value as PayrollSettingsForm["proration_basis"],
              }))
            }
            helperText="How to compute per-day salary for unpaid leave/absence deductions"
          >
            <MenuItem value="calendar">Calendar days in cycle</MenuItem>
            <MenuItem value="working">Scheduled working days</MenuItem>
            <MenuItem value="fixed_days_per_month">
              Fixed days per month
            </MenuItem>
          </TextField>
          <TextField
            label="Currency Code"
            value={form.currency_code}
            onChange={(e) =>
              handleChange("currency_code", e.target.value.toUpperCase())
            }
            inputProps={{ maxLength: 3 }}
            helperText="ISO currency code, e.g., USD, BDT, EUR"
          />
          <TextField
            label="PF (Employee) Percent"
            type="number"
            value={form.pf_employee_contribution_percent}
            onChange={(e) =>
              handleChange("pf_employee_contribution_percent", e.target.value)
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
          />
          <TextField
            label="PF (Employer) Percent"
            type="number"
            value={form.pf_employer_contribution_percent}
            onChange={(e) =>
              handleChange("pf_employer_contribution_percent", e.target.value)
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
          />
          <Typography variant="subtitle1">Scheduler</Typography>
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            flexWrap="wrap"
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Checkbox
                checked={form.scheduler_enabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    scheduler_enabled: e.target.checked,
                  }))
                }
              />
              <Typography>Enable monthly scheduler</Typography>
            </Stack>
            <TextField
              label="Run day (1-28)"
              type="number"
              value={form.scheduler_day_of_month}
              onChange={(e) =>
                handleChange("scheduler_day_of_month", e.target.value)
              }
              size="small"
              sx={{ width: 160 }}
              disabled={!form.scheduler_enabled}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Checkbox
                checked={form.scheduler_auto_run}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    scheduler_auto_run: e.target.checked,
                  }))
                }
                disabled={!form.scheduler_enabled}
              />
              <Typography>Auto run payroll</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Checkbox
                checked={form.scheduler_auto_email}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    scheduler_auto_email: e.target.checked,
                  }))
                }
                disabled={!form.scheduler_enabled}
              />
              <Typography>Auto email payslips</Typography>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button onClick={fetchSettings} disabled={saving}>
              Reload
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", md: "center" }}
            spacing={1}
          >
            <Typography variant="h6">Tax Slabs</Typography>
            <Button onClick={fetchTaxSlabs} disabled={slabsLoading}>
              Reload
            </Button>
          </Stack>

          {slabsError && <Alert severity="error">{slabsError}</Alert>}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Min</TableCell>
                  <TableCell align="right">Max</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {slabs.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>{s.name}</TableCell>
                    <TableCell align="right">
                      {Number(s.min_salary).toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      {s.max_salary === null
                        ? "—"
                        : Number(s.max_salary).toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      <Chip size="small" label={`${s.tax_percent}%`} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                      >
                        <Button
                          size="small"
                          startIcon={<EditRounded />}
                          variant="outlined"
                          onClick={() =>
                            setSlabForm({
                              id: s.id,
                              name: s.name,
                              min_salary: String(s.min_salary),
                              max_salary:
                                s.max_salary === null
                                  ? ""
                                  : String(s.max_salary),
                              tax_percent: String(s.tax_percent),
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteRounded />}
                          variant="outlined"
                          onClick={() => handleDeleteTaxSlab(s.id)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {slabs.length === 0 && !slabsLoading && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No tax slabs configured yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Name"
              fullWidth
              value={slabForm.name}
              onChange={(e) =>
                setSlabForm({ ...slabForm, name: e.target.value })
              }
            />
            <TextField
              label="Min Salary"
              type="number"
              fullWidth
              value={slabForm.min_salary}
              onChange={(e) =>
                setSlabForm({ ...slabForm, min_salary: e.target.value })
              }
            />
            <TextField
              label="Max Salary (optional)"
              type="number"
              fullWidth
              value={slabForm.max_salary}
              onChange={(e) =>
                setSlabForm({ ...slabForm, max_salary: e.target.value })
              }
            />
            <TextField
              label="Tax Percent"
              type="number"
              fullWidth
              value={slabForm.tax_percent}
              onChange={(e) =>
                setSlabForm({ ...slabForm, tax_percent: e.target.value })
              }
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
            />
          </Stack>

          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              onClick={() => setSlabForm(emptySlabForm)}
              disabled={slabsSaving}
            >
              Clear
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveTaxSlab}
              disabled={slabsSaving}
            >
              {slabsSaving
                ? "Saving..."
                : slabForm.id
                  ? "Update Slab"
                  : "Add Slab"}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", md: "center" }}
            spacing={1}
          >
            <Typography variant="h6">Payroll Permissions</Typography>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={fetchPayrollPermissions} disabled={rolesLoading}>
                Reload
              </Button>
              <Button
                variant="contained"
                onClick={handleSavePayrollPermissions}
                disabled={rolesSaving || rolesLoading}
              >
                {rolesSaving ? "Saving..." : "Save Permissions"}
              </Button>
            </Stack>
          </Stack>

          {rolesError && <Alert severity="error">{rolesError}</Alert>}
          {rolesOk && <Alert severity="success">{rolesOk}</Alert>}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Role</TableCell>
                  {payrollPerms.map((p) => (
                    <TableCell key={p.key} align="center">
                      {p.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.role_name} hover>
                    <TableCell>{r.role_name}</TableCell>
                    {payrollPerms.map((p) => (
                      <TableCell key={p.key} align="center">
                        <Checkbox
                          checked={(r.permissions || []).includes(p.key)}
                          onChange={() => toggleRolePerm(r.role_name, p.key)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {roles.length === 0 && !rolesLoading && (
                  <TableRow>
                    <TableCell colSpan={1 + payrollPerms.length} align="center">
                      No roles found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Paper>
    </Stack>
  );
}
