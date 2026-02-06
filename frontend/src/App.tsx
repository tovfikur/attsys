import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
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
import Reports from "./Reports";
import Payroll from "./payroll/Payroll";
import EmployeePortal from "./EmployeePortal";
import Messenger from "./Messenger";
import AppShell from "./layout/AppShell";
import "./App.css";
import { clearSession, getToken, getUser } from "./utils/session";

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
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 900px)").matches;
  if (isMobile && user.role === "superadmin") {
    clearSession();
    return <Navigate to="/login" />;
  }
  if (user.role === "employee") return <Navigate to="/employee-portal" />;
  if (user.role === "superadmin") return <Navigate to="/dashboard" />;
  return <Navigate to="/employees" />;
}

function App() {
  const isNative =
    typeof window !== "undefined" &&
    (window.location.protocol === "capacitor:" ||
      window.location.protocol === "file:" ||
      "Capacitor" in (window as unknown as Record<string, unknown>));
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 900px)").matches;
  const Router = isNative ? HashRouter : BrowserRouter;
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/employee-login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/dashboard"
          element={
            isMobile ? (
              <Navigate to="/" />
            ) : (
              <RoleRoute role="superadmin">
                <Dashboard />
              </RoleRoute>
            )
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
          path="/employee-portal/profile"
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
          path="/reports"
          element={
            <DenyRoleRoute deny={["employee", "superadmin"]}>
              <Reports />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/payroll"
          element={
            <DenyRoleRoute deny={["employee", "manager", "superadmin"]}>
              <Payroll />
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
        <Route
          path="/reports"
          element={
            <DenyRoleRoute deny={["employee", "superadmin"]}>
              <Reports />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/messenger"
          element={
            <DenyRoleRoute deny={["superadmin"]}>
              <Messenger />
            </DenyRoleRoute>
          }
        />
        <Route path="/" element={<HomeRedirect />} />
      </Routes>
    </Router>
  );
}

export default App;
