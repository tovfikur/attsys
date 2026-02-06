import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
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
  AssessmentRounded,
  DownloadRounded,
  EmailRounded,
  HistoryRounded,
  TableChartRounded,
} from "@mui/icons-material";
import api from "../api";
import { getErrorMessage } from "../utils/errors";

type MonthlyReport = {
  month: number;
  total_gross: number;
  total_net: number;
  total_tax: number;
  employee_count: number;
};

type Cycle = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
};

type DepartmentCost = {
  department: string;
  total_gross: number;
  total_net: number;
  employee_count: number;
};

type TaxReportItem = {
  name: string;
  code: string;
  department: string;
  gross_salary: number;
  tax_deducted: number;
};

type OvertimeReportItem = {
  name: string;
  code: string;
  department: string;
  overtime_hours: number;
  overtime_pay: number;
};

type DeductionReportItem = {
  name: string;
  code: string;
  deduction_name: string;
  amount: number;
};

type CycleReportData = {
  cycle: Cycle;
  totals: {
    total_gross: number;
    total_net: number;
    total_deductions: number;
    total_tax: number;
    total_ot_hours: number;
  };
  department_cost: DepartmentCost[];
  tax_report: TaxReportItem[];
  overtime_report: OvertimeReportItem[];
  deduction_report: DeductionReportItem[];
};

type JournalItem = {
  id: number;
  account_name: string;
  account_code: string;
  debit: number;
  credit: number;
};

type JournalEntry = {
  id: number;
  reference_id: string;
  reference_type: string;
  date: string;
  description: string;
  items: JournalItem[];
};

type AuditRow = {
  id: number;
  time: string;
  action: string;
  user_id: number | null;
  user_role: string | null;
  user_name: string | null;
  meta: string | null;
};

export default function PayrollReports() {
  const [viewMode, setViewMode] = useState<"yearly" | "cycle" | "audit">(
    "yearly",
  );

  // Yearly State
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearlyData, setYearlyData] = useState<MonthlyReport[]>([]);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [yearlyError, setYearlyError] = useState("");

  // Cycle State
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<number | "">("");
  const [cycleData, setCycleData] = useState<CycleReportData | null>(null);
  const [cycleLoading, setCycleLoading] = useState(false);
  const [cycleError, setCycleError] = useState("");
  const [cycleTab, setCycleTab] = useState(0);

  // Journal State
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditDialog, setAuditDialog] = useState<AuditRow | null>(null);
  const [auditLimit, setAuditLimit] = useState(200);

  const handleEmailPayslips = async () => {
    if (!selectedCycleId) return;
    if (
      !window.confirm(
        "Are you sure you want to email payslips to all employees in this cycle?",
      )
    )
      return;

    setEmailing(true);
    try {
      const res = await api.post("/api/payroll/email", {
        cycle_id: selectedCycleId,
      });
      const result = res.data.result;
      alert(`Emails sent: ${result.sent}, Failed: ${result.failed}`);
      if (result.errors && result.errors.length > 0) {
        console.error("Email errors:", result.errors);
        alert("Some emails failed. Check console for details.");
      }
    } catch (err) {
      alert(getErrorMessage(err, "Failed to send emails"));
    } finally {
      setEmailing(false);
    }
  };

  // Fetch Yearly Report
  const fetchYearlyReport = useCallback(async () => {
    setYearlyLoading(true);
    try {
      const res = await api.get(`/api/payroll/reports/yearly?year=${year}`);
      setYearlyData(res.data.report || []);
      setYearlyError("");
    } catch (err) {
      setYearlyError(getErrorMessage(err, "Failed to load yearly report"));
    } finally {
      setYearlyLoading(false);
    }
  }, [year]);

  useEffect(() => {
    if (viewMode === "yearly") {
      fetchYearlyReport();
    }
  }, [fetchYearlyReport, viewMode]);

  // Fetch Cycles List
  const fetchCycles = useCallback(async () => {
    try {
      const res = await api.get("/api/payroll/cycles");
      setCycles(res.data.cycles || []);
    } catch (err) {
      console.error("Failed to load cycles", err);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "cycle") {
      fetchCycles();
    }
  }, [fetchCycles, viewMode]);

  // Fetch Cycle Detailed Report
  const fetchCycleReport = useCallback(async () => {
    if (!selectedCycleId) return;
    setCycleLoading(true);
    setCycleError("");
    try {
      const res = await api.get(
        `/api/payroll/reports?cycle_id=${selectedCycleId}`,
      );
      setCycleData(res.data);
    } catch (err) {
      setCycleError(getErrorMessage(err, "Failed to load cycle report"));
    } finally {
      setCycleLoading(false);
    }
  }, [selectedCycleId]);

  const fetchJournalEntries = useCallback(async () => {
    if (!selectedCycleId) return;
    setJournalLoading(true);
    try {
      const res = await api.get(
        `/api/payroll/journal_entries?cycle_id=${selectedCycleId}`,
      );
      setJournalEntries(res.data.entries || []);
    } catch (err) {
      console.error(err);
    } finally {
      setJournalLoading(false);
    }
  }, [selectedCycleId]);

  useEffect(() => {
    if (selectedCycleId) {
      fetchCycleReport();
    } else {
      setCycleData(null);
    }
  }, [selectedCycleId, fetchCycleReport]);

  useEffect(() => {
    if (cycleTab === 4 && selectedCycleId) {
      fetchJournalEntries();
    }
  }, [cycleTab, selectedCycleId, fetchJournalEntries]);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const res = await api.get(`/api/audit/tenant?limit=${auditLimit}`);
      setAuditRows(Array.isArray(res.data?.audit) ? res.data.audit : []);
    } catch (err) {
      setAuditError(getErrorMessage(err, "Failed to load audit logs"));
    } finally {
      setAuditLoading(false);
    }
  }, [auditLimit]);

  useEffect(() => {
    if (viewMode === "audit") fetchAudit();
  }, [fetchAudit, viewMode]);

  const getMonthName = (m: number) => {
    return new Date(2000, m - 1, 1).toLocaleString("default", {
      month: "long",
    });
  };

  const yearlyTotals = yearlyData.reduce(
    (acc, curr) => ({
      gross: acc.gross + Number(curr.total_gross),
      net: acc.net + Number(curr.total_net),
      tax: acc.tax + Number(curr.total_tax),
    }),
    { gross: 0, net: 0, tax: 0 },
  );

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}
      >
        <Button
          variant={viewMode === "yearly" ? "contained" : "outlined"}
          onClick={() => setViewMode("yearly")}
          startIcon={<AssessmentRounded />}
        >
          Yearly Overview
        </Button>
        <Button
          variant={viewMode === "cycle" ? "contained" : "outlined"}
          onClick={() => setViewMode("cycle")}
          startIcon={<TableChartRounded />}
        >
          Detailed Cycle Reports
        </Button>
        <Button
          variant={viewMode === "audit" ? "contained" : "outlined"}
          onClick={() => setViewMode("audit")}
          startIcon={<HistoryRounded />}
        >
          Audit Logs
        </Button>
      </Stack>

      {viewMode === "yearly" ? (
        <Stack spacing={3}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="h6">Yearly Cost Analysis - {year}</Typography>
            <TextField
              select
              label="Year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              size="small"
              sx={{ width: 120 }}
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {yearlyError && <Alert severity="error">{yearlyError}</Alert>}

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Gross Salary
                  </Typography>
                  <Typography variant="h4">
                    {yearlyTotals.gross.toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Net Payable
                  </Typography>
                  <Typography variant="h4">
                    {yearlyTotals.net.toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Tax Deducted
                  </Typography>
                  <Typography variant="h4">
                    {yearlyTotals.tax.toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Employee Count</TableCell>
                  <TableCell align="right">Gross Salary</TableCell>
                  <TableCell align="right">Tax</TableCell>
                  <TableCell align="right">Net Salary</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {yearlyLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : (
                  yearlyData.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{getMonthName(row.month)}</TableCell>
                      <TableCell align="right">{row.employee_count}</TableCell>
                      <TableCell align="right">
                        {Number(row.total_gross).toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {Number(row.total_tax).toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {Number(row.total_net).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {!yearlyLoading && yearlyData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No data found for {year}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      ) : viewMode === "cycle" ? (
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
            spacing={2}
          >
            <TextField
              select
              label="Select Payroll Cycle"
              value={selectedCycleId}
              onChange={(e) => setSelectedCycleId(Number(e.target.value))}
              size="small"
              sx={{ minWidth: 250 }}
            >
              {cycles.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.start_date} - {c.end_date})
                </MenuItem>
              ))}
            </TextField>

            {selectedCycleId && (
              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  startIcon={<EmailRounded />}
                  onClick={handleEmailPayslips}
                  disabled={emailing}
                >
                  {emailing ? "Sending..." : "Email Payslips"}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadRounded />}
                  href={`/api/payroll/cycles/bank-export?cycle_id=${selectedCycleId}`}
                  target="_blank"
                >
                  Export Bank CSV
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadRounded />}
                  href={`/api/payroll/reports/tax-export?cycle_id=${selectedCycleId}`}
                  target="_blank"
                >
                  Export Tax Summary
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadRounded />}
                  href={`/api/payroll/reports/export?cycle_id=${selectedCycleId}&kind=${
                    cycleTab === 0
                      ? "department_cost"
                      : cycleTab === 1
                        ? "tax"
                        : cycleTab === 2
                          ? "overtime"
                          : cycleTab === 3
                            ? "deductions"
                            : "journal"
                  }`}
                  target="_blank"
                >
                  Export Report CSV
                </Button>
              </Stack>
            )}
          </Stack>

          {cycleError && <Alert severity="error">{cycleError}</Alert>}
          {cycleLoading && <CircularProgress />}

          {cycleData && (
            <Stack spacing={3}>
              <Paper sx={{ p: 2 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      Total Gross
                    </Typography>
                    <Typography variant="h6">
                      {Number(cycleData.totals.total_gross).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      Total Net
                    </Typography>
                    <Typography variant="h6" color="primary.main">
                      {Number(cycleData.totals.total_net).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      Total Tax
                    </Typography>
                    <Typography variant="h6">
                      {Number(cycleData.totals.total_tax).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                      Total Overtime Hours
                    </Typography>
                    <Typography variant="h6">
                      {cycleData.totals.total_ot_hours}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              <Paper sx={{ width: "100%" }}>
                <Tabs
                  value={cycleTab}
                  onChange={(_, v) => setCycleTab(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ borderBottom: 1, borderColor: "divider" }}
                >
                  <Tab label="Department Cost" />
                  <Tab label="Tax Report" />
                  <Tab label="Overtime Report" />
                  <Tab label="Deductions & Loans" />
                  <Tab label="Journal Entries" />
                </Tabs>

                {cycleTab === 0 && (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Department</TableCell>
                          <TableCell align="right">Employees</TableCell>
                          <TableCell align="right">Total Gross</TableCell>
                          <TableCell align="right">Total Net</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {cycleData.department_cost.map((row) => (
                          <TableRow key={row.department}>
                            <TableCell>
                              {row.department || "Unassigned"}
                            </TableCell>
                            <TableCell align="right">
                              {row.employee_count}
                            </TableCell>
                            <TableCell align="right">
                              {Number(row.total_gross).toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              {Number(row.total_net).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {cycleTab === 1 && (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Employee</TableCell>
                          <TableCell>Department</TableCell>
                          <TableCell align="right">Gross Salary</TableCell>
                          <TableCell align="right">Tax Deducted</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {cycleData.tax_report.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Typography variant="body2" fontWeight="bold">
                                {row.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {row.code}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.department}</TableCell>
                            <TableCell align="right">
                              {Number(row.gross_salary).toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              {Number(row.tax_deducted).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {cycleData.tax_report.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} align="center">
                              No tax deductions in this cycle.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {cycleTab === 2 && (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Employee</TableCell>
                          <TableCell>Department</TableCell>
                          <TableCell align="right">OT Hours</TableCell>
                          <TableCell align="right">OT Amount</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {cycleData.overtime_report.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Typography variant="body2" fontWeight="bold">
                                {row.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {row.code}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.department}</TableCell>
                            <TableCell align="right">
                              {row.overtime_hours}
                            </TableCell>
                            <TableCell align="right">
                              {Number(row.overtime_pay).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {cycleData.overtime_report.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} align="center">
                              No overtime in this cycle.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {cycleTab === 3 && (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Employee</TableCell>
                          <TableCell>Deduction</TableCell>
                          <TableCell align="right">Amount</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {cycleData.deduction_report.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Typography variant="body2" fontWeight="bold">
                                {row.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {row.code}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.deduction_name}</TableCell>
                            <TableCell align="right">
                              {Number(row.amount).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {cycleData.deduction_report.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} align="center">
                              No deductions in this cycle.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {cycleTab === 4 && (
                  <Stack spacing={2}>
                    {journalLoading ? (
                      <CircularProgress />
                    ) : (
                      journalEntries.map((entry) => (
                        <Card key={entry.id} variant="outlined">
                          <CardContent>
                            <Typography variant="subtitle2" gutterBottom>
                              {entry.date} - {entry.description}
                            </Typography>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Account</TableCell>
                                  <TableCell align="right">Debit</TableCell>
                                  <TableCell align="right">Credit</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {entry.items.map((item) => (
                                  <TableRow key={item.id}>
                                    <TableCell>
                                      {item.account_code} - {item.account_name}
                                    </TableCell>
                                    <TableCell align="right">
                                      {Number(item.debit) > 0
                                        ? Number(item.debit).toLocaleString()
                                        : "-"}
                                    </TableCell>
                                    <TableCell align="right">
                                      {Number(item.credit) > 0
                                        ? Number(item.credit).toLocaleString()
                                        : "-"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      ))
                    )}
                    {!journalLoading && journalEntries.length === 0 && (
                      <Typography color="text.secondary" align="center">
                        No journal entries found for this cycle.
                      </Typography>
                    )}
                  </Stack>
                )}
              </Paper>
            </Stack>
          )}
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", md: "center" }}
            spacing={2}
          >
            <Typography variant="h6">Tenant Audit Logs</Typography>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <TextField
                label="Search"
                size="small"
                value={auditQuery}
                onChange={(e) => setAuditQuery(e.target.value)}
                sx={{ width: 220 }}
              />
              <TextField
                select
                label="Limit"
                size="small"
                value={auditLimit}
                onChange={(e) => setAuditLimit(Number(e.target.value))}
                sx={{ width: 120 }}
              >
                {[50, 100, 200, 500].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
              <Button onClick={fetchAudit} disabled={auditLoading}>
                Reload
              </Button>
            </Stack>
          </Stack>

          {auditError && <Alert severity="error">{auditError}</Alert>}

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Meta</TableCell>
                  <TableCell align="right"> </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : (
                  auditRows
                    .filter((r) => {
                      const q = auditQuery.trim().toLowerCase();
                      if (!q) return true;
                      const hay = [
                        r.action,
                        r.user_name || "",
                        r.user_role || "",
                        r.meta || "",
                      ]
                        .join(" ")
                        .toLowerCase();
                      return hay.includes(q);
                    })
                    .map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {row.time}
                        </TableCell>
                        <TableCell>{row.action}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {row.user_name || "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.user_role || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              maxWidth: 520,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {row.meta || ""}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() => setAuditDialog(row)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
                {!auditLoading &&
                  auditRows.filter((r) => {
                    const q = auditQuery.trim().toLowerCase();
                    if (!q) return true;
                    const hay = [
                      r.action,
                      r.user_name || "",
                      r.user_role || "",
                      r.meta || "",
                    ]
                      .join(" ")
                      .toLowerCase();
                    return hay.includes(q);
                  }).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  )}
              </TableBody>
            </Table>
          </TableContainer>

          <Dialog
            open={Boolean(auditDialog)}
            onClose={() => setAuditDialog(null)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Audit Details</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1}>
                <Typography variant="body2">
                  <strong>Time:</strong> {auditDialog?.time || ""}
                </Typography>
                <Typography variant="body2">
                  <strong>Action:</strong> {auditDialog?.action || ""}
                </Typography>
                <Typography variant="body2">
                  <strong>User:</strong> {auditDialog?.user_name || "—"} (
                  {auditDialog?.user_role || "—"})
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography
                    component="pre"
                    variant="caption"
                    sx={{
                      m: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {(() => {
                      const raw = auditDialog?.meta || "";
                      if (!raw) return "";
                      try {
                        return JSON.stringify(JSON.parse(raw), null, 2);
                      } catch {
                        return raw;
                      }
                    })()}
                  </Typography>
                </Paper>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAuditDialog(null)}>Close</Button>
            </DialogActions>
          </Dialog>
        </Stack>
      )}
    </Stack>
  );
}
