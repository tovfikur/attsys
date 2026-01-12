import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import Dashboard from "./Dashboard";
import Employees from "./Employees";
import Clock from "./Clock";
import Attendance from "./Attendance";
import Devices from "./Devices";
import DeviceEvents from "./DeviceEvents";
import DeviceIngestTest from "./DeviceIngestTest";
import Sites from "./Sites";
import Shifts from "./Shifts";
import Leaves from "./Leaves";
import EmployeePortal from "./EmployeePortal";
import AppShell from "./layout/AppShell";
import "./App.css";
import { getToken, getUser } from "./utils/session";

function PrivateRoute({ children }: { children: ReactElement }) {
  const token = getToken();
  return token ? <AppShell>{children}</AppShell> : <Navigate to="/login" />;
}

function DenyRoleRoute({
  children,
  deny,
}: {
  children: ReactElement;
  deny: string[];
}) {
  const token = getToken();
  const user = getUser();
  if (!token || !user) return <Navigate to="/login" />;
  if (user.role && deny.includes(user.role)) {
    if (user.role === "superadmin") return <Navigate to="/dashboard" />;
    if (user.role === "employee") return <Navigate to="/employee-portal" />;
    return <Navigate to="/employees" />;
  }
  return <AppShell>{children}</AppShell>;
}

function RoleRoute({
  children,
  role,
}: {
  children: ReactElement;
  role: string;
}) {
  const user = getUser();
  if (!user) return <Navigate to="/login" />;
  if (role === "superadmin" && user.role !== "superadmin") {
    return (
      <Navigate
        to={user.role === "employee" ? "/employee-portal" : "/employees"}
      />
    );
  }
  return <AppShell>{children}</AppShell>;
}

function HomeRedirect() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) return <Navigate to="/login" />;
  if (user.role === "employee") return <Navigate to="/employee-portal" />;
  if (user.role === "superadmin") return <Navigate to="/dashboard" />;
  return <Navigate to="/employees" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/employee-login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/dashboard"
          element={
            <RoleRoute role="superadmin">
              <Dashboard />
            </RoleRoute>
          }
        />
        <Route
          path="/employee-portal"
          element={
            <PrivateRoute>
              <EmployeePortal />
            </PrivateRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <DenyRoleRoute deny={["employee", "superadmin"]}>
              <Employees />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/clock"
          element={
            <DenyRoleRoute deny={["employee", "superadmin"]}>
              <Clock />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <DenyRoleRoute deny={["employee", "superadmin"]}>
              <Attendance />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/leaves"
          element={
            <DenyRoleRoute deny={["employee", "superadmin"]}>
              <Leaves />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/devices"
          element={
            <DenyRoleRoute deny={["superadmin"]}>
              <Devices />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/devices/events"
          element={
            <DenyRoleRoute deny={["superadmin"]}>
              <DeviceEvents />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/devices/ingest"
          element={
            <DenyRoleRoute deny={["superadmin"]}>
              <DeviceIngestTest />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/sites"
          element={
            <DenyRoleRoute deny={["superadmin"]}>
              <Sites />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/shifts"
          element={
            <DenyRoleRoute deny={["superadmin"]}>
              <Shifts />
            </DenyRoleRoute>
          }
        />
        <Route path="/" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
