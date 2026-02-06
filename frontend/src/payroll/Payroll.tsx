import { useState } from "react";
import { Box, Container, Paper, Tab, Tabs, Typography } from "@mui/material";
import {
  AccountBalanceRounded,
  AssessmentRounded,
  HistoryRounded,
  MonetizationOnRounded,
  SettingsSuggestRounded,
} from "@mui/icons-material";
import PayrollCycles from "./PayrollCycles";
import PayrollLoans from "./PayrollLoans";
import PayrollReports from "./PayrollReports";
import PayrollSettings from "./PayrollSettings";
import PayrollStructures from "./PayrollStructures";

export default function Payroll() {
  const [tab, setTab] = useState(0);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: "bold" }}>
        Payroll Management
      </Typography>

      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab
            icon={<SettingsSuggestRounded />}
            iconPosition="start"
            label="Settings"
          />
          <Tab
            icon={<AccountBalanceRounded />}
            iconPosition="start"
            label="Structure"
          />
          <Tab
            icon={<HistoryRounded />}
            iconPosition="start"
            label="Payroll Cycles"
          />
          <Tab
            icon={<MonetizationOnRounded />}
            iconPosition="start"
            label="Loans & Advances"
          />
          <Tab
            icon={<AssessmentRounded />}
            iconPosition="start"
            label="Reports"
          />
        </Tabs>
      </Paper>

      <Box sx={{ mt: 2 }}>
        {tab === 0 && <PayrollSettings />}
        {tab === 1 && <PayrollStructures />}
        {tab === 2 && <PayrollCycles />}
        {tab === 3 && <PayrollLoans />}
        {tab === 4 && <PayrollReports />}
      </Box>
    </Container>
  );
}
