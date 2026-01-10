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
import AppShell from "./layout/AppShell";
import "./App.css";
import { getToken } from "./utils/session";

function PrivateRoute({ children }: { children: ReactElement }) {
  const token = getToken();
  return token ? <AppShell>{children}</AppShell> : <Navigate to="/login" />;
}

function RoleRoute({
  children,
  role,
}: {
  children: ReactElement;
  role: string;
}) {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  const user = raw ? JSON.parse(raw) : null;
  if (!user) return <Navigate to="/login" />;
  if (role === "superadmin" && user.role !== "superadmin")
    return <Navigate to="/employees" />;
  return <AppShell>{children}</AppShell>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
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
          path="/employees"
          element={
            <PrivateRoute>
              <Employees />
            </PrivateRoute>
          }
        />
        <Route
          path="/clock"
          element={
            <PrivateRoute>
              <Clock />
            </PrivateRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <PrivateRoute>
              <Attendance />
            </PrivateRoute>
          }
        />
        <Route
          path="/devices"
          element={
            <PrivateRoute>
              <Devices />
            </PrivateRoute>
          }
        />
        <Route
          path="/devices/events"
          element={
            <PrivateRoute>
              <DeviceEvents />
            </PrivateRoute>
          }
        />
        <Route
          path="/devices/ingest"
          element={
            <PrivateRoute>
              <DeviceIngestTest />
            </PrivateRoute>
          }
        />
        <Route
          path="/sites"
          element={
            <PrivateRoute>
              <Sites />
            </PrivateRoute>
          }
        />
        <Route
          path="/shifts"
          element={
            <PrivateRoute>
              <Shifts />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
