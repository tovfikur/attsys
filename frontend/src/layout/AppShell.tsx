import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotificationStream } from "../hooks/useNotificationStream";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Badge,
  alpha,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Slide,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from "@mui/material";
import {
  AccessTimeRounded,
  AccountCircleRounded,
  ApartmentRounded,
  AssessmentRounded,
  DashboardRounded,
  DevicesRounded,
  ExitToAppRounded,
  EventNoteRounded,
  ChatRounded,
  LoginRounded,
  LogoutRounded,
  MenuRounded,
  MonetizationOnRounded,
  PeopleAltRounded,
  QueryStatsRounded,
  PhotoCameraRounded,
  VpnKeyRounded,
} from "@mui/icons-material";
import { Capacitor } from "@capacitor/core";
import { Camera } from "@capacitor/camera";
import { Filesystem } from "@capacitor/filesystem";
import { Geolocation } from "@capacitor/geolocation";
import { clearSession, getUser } from "../utils/session";
import api from "../api";
import axios from "axios";
import { getErrorMessage } from "../utils/errors";

type NavItem = {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: string[];
};

const navItems: NavItem[] = [
  {
    label: "My Portal",
    to: "/employee-portal",
    icon: <PeopleAltRounded />,
    roles: ["employee"],
  },
  {
    label: "Messenger",
    to: "/messenger",
    icon: <ChatRounded />,
    roles: ["tenant_owner", "hr_admin", "payroll_admin", "manager", "employee"],
  },
  {
    label: "Profile",
    to: "/employee-portal/profile",
    icon: <AccountCircleRounded />,
    roles: ["employee"],
  },
  {
    label: "Apply Leave",
    to: "/employee-portal?applyLeave=1",
    icon: <EventNoteRounded />,
    roles: ["employee"],
  },
  {
    label: "My Payroll",
    to: "/employee-portal?tab=payroll",
    icon: <MonetizationOnRounded />,
    roles: ["employee"],
  },
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: <DashboardRounded />,
    roles: ["superadmin"],
  },
  {
    label: "Employees",
    to: "/employees",
    icon: <PeopleAltRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Check In/Out",
    to: "/clock",
    icon: <AccessTimeRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Attendance",
    to: "/attendance",
    icon: <QueryStatsRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Tracking",
    to: "/tracking",
    icon: <QueryStatsRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Geo-Fencing",
    to: "/geo-fencing",
    icon: <ApartmentRounded />,
    roles: ["tenant_owner", "hr_admin"],
  },
  {
    label: "Leaves",
    to: "/leaves",
    icon: <EventNoteRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Shifts",
    to: "/shifts",
    icon: <AccessTimeRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Roster Duty",
    to: "/roster",
    icon: <EventNoteRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Reports",
    to: "/reports",
    icon: <AssessmentRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Payroll",
    to: "/payroll",
    icon: <MonetizationOnRounded />,
    roles: ["tenant_owner", "hr_admin", "payroll_admin"],
  },
  {
    label: "Devices",
    to: "/devices",
    icon: <DevicesRounded />,
    roles: ["tenant_owner", "hr_admin"],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuEl, setUserMenuEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const role = user?.role || "";
  const [employeeId, setEmployeeId] = useState("");
  const [employeeOpenShift, setEmployeeOpenShift] = useState<boolean | null>(
    null,
  );
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const profilePhotoUrlRef = useRef<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(null);
  const tenantLogoUrlRef = useRef<string | null>(null);
  const [tenantLogoBusy, setTenantLogoBusy] = useState(false);
  const tenantLogoInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info" | "warning";
  }>({ open: false, message: "", severity: "success" });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [messengerUnread, setMessengerUnread] = useState(0);
  const [leavesUnseenPending, setLeavesUnseenPending] = useState(0);
  const [geoBreachUnseen, setGeoBreachUnseen] = useState(0);
  const geoBreachUnseenRef = useRef(0);
  const geoPausedUntilRef = useRef(0);
  const geoLastSendRef = useRef(0);

  const handleLogout = () => {
    setLogoutConfirmOpen(true);
  };

  const confirmLogout = () => {
    setLogoutConfirmOpen(false);
    clearSession();
    setToast({ open: true, message: "Logged out", severity: "info" });
    navigate("/login");
  };

  useEffect(() => {
    if (role === "employee") {
      document.title = "KHR-Employee";
    } else if (
      role === "tenant_owner" ||
      role === "hr_admin" ||
      role === "manager" ||
      role === "superadmin"
    ) {
      document.title = "KHR-Admin";
    } else {
      document.title = "KHR-SaaS";
    }
  }, [role]);

  useEffect(() => {
    const onToast = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { message?: unknown; severity?: unknown }
        | undefined;
      const message = String(detail?.message || "").trim();
      if (!message) return;
      const severityRaw = String(detail?.severity || "success").toLowerCase();
      const severity =
        severityRaw === "error" ||
        severityRaw === "info" ||
        severityRaw === "warning" ||
        severityRaw === "success"
          ? (severityRaw as "success" | "error" | "info" | "warning")
          : "success";
      setToast({ open: true, message, severity });
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform()) return;
    const key = "native_permissions_requested_v1";
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
    void (async () => {
      await Camera.requestPermissions({
        permissions: ["camera", "photos"] as unknown as never[],
      }).catch(() => {});
      await Geolocation.requestPermissions().catch(() => {});
      const fs = Filesystem as unknown as {
        requestPermissions?: () => Promise<unknown>;
      };
      if (typeof fs.requestPermissions === "function") {
        await fs.requestPermissions().catch(() => {});
      }
    })();
  }, []);

  // SSE now delivers all badge counts; this function exists only to zero them on logout.
  const refreshIndicators = useCallback(async () => {
    if (!user) {
      setMessengerUnread(0);
      setLeavesUnseenPending(0);
      setGeoBreachUnseen(0);
      geoBreachUnseenRef.current = 0;
    }
  }, [user]);

  // SSE: receive live badge counts from the server (replaces 15s polling)
  const sseToken = user ? (localStorage.getItem("token") || sessionStorage.getItem("token")) : null;
  const sseRoleOk = !!user && role !== "superadmin";
  const sseTenant = typeof window !== "undefined"
    ? (localStorage.getItem("tenant") || sessionStorage.getItem("tenant") || null)
    : null;

  const handleSseCounts = useCallback((counts: { messenger_unread?: number; leaves_pending?: number; geo_breaches?: number }) => {
    if (counts.messenger_unread !== undefined) {
      setMessengerUnread(Math.max(0, counts.messenger_unread));
    }
    if (counts.leaves_pending !== undefined) {
      setLeavesUnseenPending(Math.max(0, counts.leaves_pending));
    }
    if (counts.geo_breaches !== undefined) {
      const next = Math.max(0, counts.geo_breaches);
      if (next > geoBreachUnseenRef.current) {
        setToast({ open: true, message: "Geo-fence breach detected", severity: "warning" });
      }
      geoBreachUnseenRef.current = next;
      setGeoBreachUnseen(next);
    }
  }, []);

  useNotificationStream({
    token: sseToken,
    tenantHint: sseTenant,
    enabled: sseRoleOk,
    onCounts: handleSseCounts,
  });

  // Keep manual triggers — run once on mount and on focus/visibility/events
  useEffect(() => {
    void refreshIndicators();

    const triggerRefresh = () => { void refreshIndicators(); };
    const onVisibilityChange = () => { if (!document.hidden) triggerRefresh(); };

    window.addEventListener("attendance:updated", triggerRefresh);
    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("attendance:updated", triggerRefresh);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshIndicators]);

  useEffect(() => {
    if (!user) return;
    if (role !== "tenant_owner") return;
    if (!location.pathname.startsWith("/leaves")) return;
    void (async () => {
      try {
        await api.post(
          "/api/leaves/mark_seen",
          {},
          { headers: { "X-Toast-Skip": "1" }, timeout: 8000 },
        );
      } finally {
        void refreshIndicators();
      }
    })();
  }, [location.pathname, refreshIndicators, role, user]);

  useEffect(() => {
    if (!user) return;
    if (!(role === "tenant_owner" || role === "hr_admin" || role === "manager"))
      return;
    if (!location.pathname.startsWith("/tracking")) return;
    void (async () => {
      try {
        await api.post(
          "/api/geo/breaches/mark_seen",
          {},
          { headers: { "X-Toast-Skip": "1" }, timeout: 8000 },
        );
      } finally {
        void refreshIndicators();
      }
    })();
  }, [location.pathname, refreshIndicators, role, user]);

  useEffect(() => {
    if (role !== "employee") {
      setEmployeeId("");
      setEmployeeOpenShift(null);
      return;
    }
    let alive = true;
    const run = async () => {
      try {
        const res = await api.get("/api/me", { timeout: 8000 });
        const id = res.data?.user?.employee_id ?? res.data?.employee?.id ?? "";
        if (!alive) return;
        setEmployeeId(String(id || ""));
      } catch {
        if (!alive) return;
        setEmployeeId("");
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [role]);

  useEffect(() => {
    if (!user) return;
    if (role !== "employee") return;
    if (!employeeId) return;

    let alive = true;

    const send = async () => {
      if (!alive) return;
      const now = Date.now();
      if (now < geoPausedUntilRef.current) return;
      if (!("geolocation" in navigator)) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!alive) return;
          const coords = pos.coords;
          const payload = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy_m:
              typeof coords.accuracy === "number"
                ? Math.round(coords.accuracy)
                : null,
            speed_mps: typeof coords.speed === "number" ? coords.speed : null,
            device_status: document.hidden ? "background" : "foreground",
          };

          void (async () => {
            try {
              geoLastSendRef.current = Date.now();
              const res = await api.post("/api/geo/location/update", payload, {
                headers: { "X-Toast-Skip": "1" },
                timeout: 8000,
              });
              if (Number(res.data?.enabled || 0) === 0) {
                geoPausedUntilRef.current = Date.now() + 5 * 60_000;
              }
            } catch {
              geoPausedUntilRef.current = Date.now() + 60_000;
            }
          })();
        },
        () => {
          geoPausedUntilRef.current = Date.now() + 60_000;
        },
        {
          enableHighAccuracy: true,
          maximumAge: 15_000,
          timeout: 10_000,
        },
      );
    };

    void send();
    const id = window.setInterval(send, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [employeeId, role, user]);

  const refreshEmployeeOpenShift = useCallback(async () => {
    if (role !== "employee" || !employeeId) {
      setEmployeeOpenShift(null);
      return;
    }
    try {
      const res = await api.get(
        `/api/attendance/open?employee_id=${encodeURIComponent(employeeId)}`,
        { timeout: 8000 },
      );
      setEmployeeOpenShift(Boolean(res.data?.open));
    } catch {
      setEmployeeOpenShift(null);
    }
  }, [employeeId, role]);

  useEffect(() => {
    if (role !== "employee") return;
    void refreshEmployeeOpenShift();

    const triggerRefresh = () => {
      void refreshEmployeeOpenShift();
    };

    const onVisibilityChange = () => {
      if (!document.hidden) triggerRefresh();
    };

    window.addEventListener("attendance:updated", triggerRefresh);
    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("attendance:updated", triggerRefresh);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshEmployeeOpenShift, role]);

  // Password Change State
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", new: "", confirm: "" });
  const [pwdError, setPwdError] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const handleChangePassword = async () => {
    setPwdError("");
    if (pwdForm.new !== pwdForm.confirm) {
      setPwdError("New passwords do not match");
      return;
    }
    if (pwdForm.new.length < 6) {
      setPwdError("New password must be at least 6 characters");
      return;
    }
    setPwdBusy(true);
    try {
      await api.post(
        "/api/change_password",
        {
          current_password: pwdForm.current,
          new_password: pwdForm.new,
        },
        { headers: { "X-Toast-Skip": "1" } },
      );
      setToast({
        open: true,
        message: "Password updated successfully",
        severity: "success",
      });
      setPwdForm({ current: "", new: "", confirm: "" });
      setTimeout(() => setShowPwdModal(false), 1500);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        handleLogout();
        return;
      }
      setPwdError(getErrorMessage(err, "Failed to update password"));
    } finally {
      setPwdBusy(false);
    }
  };

  const refreshProfilePhoto = async () => {
    if (!user || role === "superadmin") {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
      setProfilePhotoUrl(null);
      return;
    }
    try {
      const res = await api.get("/api/me/profile_photo", {
        responseType: "blob",
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
      });
      if (res.status === 404 || !res.data) {
        if (profilePhotoUrlRef.current) {
          URL.revokeObjectURL(profilePhotoUrlRef.current);
          profilePhotoUrlRef.current = null;
        }
        setProfilePhotoUrl(null);
        return;
      }
      const blob = res.data as Blob;
      if (!blob.size) {
        if (profilePhotoUrlRef.current) {
          URL.revokeObjectURL(profilePhotoUrlRef.current);
          profilePhotoUrlRef.current = null;
        }
        setProfilePhotoUrl(null);
        return;
      }
      const nextUrl = URL.createObjectURL(blob);
      if (profilePhotoUrlRef.current)
        URL.revokeObjectURL(profilePhotoUrlRef.current);
      profilePhotoUrlRef.current = nextUrl;
      setProfilePhotoUrl(nextUrl);
    } catch {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
      setProfilePhotoUrl(null);
    }
  };

  const refreshTenantLogo = async () => {
    if (!user || role === "superadmin") {
      if (tenantLogoUrlRef.current) {
        URL.revokeObjectURL(tenantLogoUrlRef.current);
        tenantLogoUrlRef.current = null;
      }
      setTenantLogoUrl(null);
      return;
    }
    try {
      const res = await api.get("/api/tenant/logo", {
        responseType: "blob",
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
      });
      if (res.status === 404 || !res.data) {
        if (tenantLogoUrlRef.current) {
          URL.revokeObjectURL(tenantLogoUrlRef.current);
          tenantLogoUrlRef.current = null;
        }
        setTenantLogoUrl(null);
        return;
      }
      const blob = res.data as Blob;
      if (!blob.size) {
        if (tenantLogoUrlRef.current) {
          URL.revokeObjectURL(tenantLogoUrlRef.current);
          tenantLogoUrlRef.current = null;
        }
        setTenantLogoUrl(null);
        return;
      }
      const nextUrl = URL.createObjectURL(blob);
      if (tenantLogoUrlRef.current)
        URL.revokeObjectURL(tenantLogoUrlRef.current);
      tenantLogoUrlRef.current = nextUrl;
      setTenantLogoUrl(nextUrl);
    } catch {
      if (tenantLogoUrlRef.current) {
        URL.revokeObjectURL(tenantLogoUrlRef.current);
        tenantLogoUrlRef.current = null;
      }
      setTenantLogoUrl(null);
    }
  };

  useEffect(() => {
    refreshProfilePhoto();
    refreshTenantLogo();
    return () => {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }
      if (tenantLogoUrlRef.current) {
        URL.revokeObjectURL(tenantLogoUrlRef.current);
        tenantLogoUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  const handleChoosePhoto = () => {
    fileInputRef.current?.click();
  };

  const handleChooseTenantLogo = () => {
    tenantLogoInputRef.current?.click();
  };

  const handlePhotoSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/api/me/profile_photo/upload", fd, {
        headers: { "Content-Type": "multipart/form-data", "X-Toast-Skip": "1" },
      });
      await refreshProfilePhoto();
      setToast({
        open: true,
        message: "Profile photo updated",
        severity: "success",
      });
    } catch (err: unknown) {
      setToast({
        open: true,
        message: getErrorMessage(err, "Failed to upload profile photo"),
        severity: "error",
      });
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleTenantLogoSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setTenantLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/api/tenant/logo/upload", fd, {
        headers: { "Content-Type": "multipart/form-data", "X-Toast-Skip": "1" },
      });
      await refreshTenantLogo();
      setToast({
        open: true,
        message: "Tenant logo updated",
        severity: "success",
      });
    } catch (err: unknown) {
      setToast({
        open: true,
        message: getErrorMessage(err, "Failed to upload tenant logo"),
        severity: "error",
      });
    } finally {
      setTenantLogoBusy(false);
    }
  };

  const items = useMemo(() => {
    return navItems.filter((i) => !i.roles || i.roles.includes(role));
  }, [role]);

  const renderNavIcon = useCallback(
    (item: NavItem) => {
      const to = String(item.to || "");
      const isMessenger = to === "/messenger";
      const isLeaves = to === "/leaves";
      const isTracking = to === "/tracking";
      const badgeCount = isMessenger
        ? messengerUnread
        : isLeaves
          ? leavesUnseenPending
          : isTracking
            ? geoBreachUnseen
            : 0;
      if (badgeCount <= 0) return item.icon;
      return (
        <Badge
          color="error"
          badgeContent={badgeCount > 99 ? "99+" : badgeCount}
        >
          {item.icon}
        </Badge>
      );
    },
    [geoBreachUnseen, leavesUnseenPending, messengerUnread],
  );

  const title = useMemo(() => {
    if (location.pathname.startsWith("/employees")) return "Employees";
    if (location.pathname.startsWith("/clock")) return "Check In/Out";
    if (location.pathname.startsWith("/attendance")) return "Attendance";
    if (location.pathname.startsWith("/leaves")) return "Leaves";
    if (location.pathname.startsWith("/reports")) return "Reports";
    if (location.pathname.startsWith("/messenger")) return "Messenger";
    if (location.pathname.startsWith("/employee-portal"))
      return "Employee Portal";
    if (location.pathname.startsWith("/devices")) return "Devices";
    if (location.pathname.startsWith("/sites")) return "Sites";
    if (location.pathname.startsWith("/tracking")) return "Tracking";
    if (location.pathname.startsWith("/geo-fencing")) return "Geo-Fencing";
    return role === "superadmin" ? "Super Admin" : "Workspace";
  }, [location.pathname, role]);

  const showCenterCheck = useMemo(() => {
    if (isDesktop) return false;
    return role === "employee";
  }, [isDesktop, role]);

  const centerCheck = useMemo(() => {
    if (!showCenterCheck) return null;
    if (role !== "employee") {
      return {
        ariaLabel: "Check In/Out",
        to: "/clock",
        bg: theme.palette.primary.main,
        fg: theme.palette.primary.contrastText,
        icon: <AccessTimeRounded />,
      };
    }

    const stage =
      employeeOpenShift === true
        ? "out"
        : employeeOpenShift === false
          ? "in"
          : "unknown";
    const to =
      stage === "out"
        ? "/employee-portal?quickCheck=out"
        : stage === "in"
          ? "/employee-portal?quickCheck=in"
          : "/employee-portal?quickCheck=auto";

    return {
      ariaLabel:
        stage === "out" ? "Check Out" : stage === "in" ? "Check In" : "Check",
      to,
      bg:
        stage === "out"
          ? theme.palette.warning.main
          : stage === "in"
            ? theme.palette.success.main
            : theme.palette.primary.main,
      fg:
        stage === "out"
          ? theme.palette.warning.contrastText
          : stage === "in"
            ? theme.palette.success.contrastText
            : theme.palette.primary.contrastText,
      icon:
        stage === "out" ? (
          <ExitToAppRounded />
        ) : stage === "in" ? (
          <LoginRounded />
        ) : (
          <AccessTimeRounded />
        ),
    };
  }, [
    employeeOpenShift,
    role,
    showCenterCheck,
    theme.palette.primary,
    theme.palette.success,
    theme.palette.warning,
  ]);

  const brandLogoSrc = useMemo(() => {
    if (role === "superadmin") return "/icon.svg";
    return tenantLogoUrl || "/icon.svg";
  }, [role, tenantLogoUrl]);

  const drawerWidth = 280;
  const isDark = theme.palette.mode === "dark";
  const drawerBg = isDark ? "#0b0f19" : "#ffffff";
  const borderColor = isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.08)";

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 3, pb: 2 }}>
        <Stack direction="row" spacing={1.8} alignItems="center">
          <Avatar
            src={brandLogoSrc}
            sx={{
              bgcolor: "primary.main",
              width: 44,
              height: 44,
              boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.4)" : "0 8px 24px rgba(59,130,246,0.3)",
            }}
          >
            <ApartmentRounded fontSize="medium" />
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: "-0.03em" }}>
              KHR
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, letterSpacing: 0.5 }}>
              {role === "superadmin" ? "PLATFORM ADMIN" : "WORKSPACE"}
            </Typography>
          </Box>
        </Stack>
      </Box>
      <Box sx={{ px: 2, pb: 1 }}><Divider sx={{ borderColor }} /></Box>
      <List sx={{ px: 2, pt: 1 }}>
        {items.map((item) => {
          const isSelected = item.to === '/' || item.to === '/dashboard' 
            ? location.pathname === item.to 
            : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
          return (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              selected={isSelected}
              onClick={() => setMobileOpen(false)}
              sx={{
                borderRadius: 2,
                mb: 0.6,
                py: 1,
                position: "relative",
                "&.Mui-selected": {
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: theme.palette.primary.main,
                  "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    left: -16,
                    top: "15%",
                    height: "70%",
                    width: 4,
                    bgcolor: theme.palette.primary.main,
                    borderRadius: "0 4px 4px 0",
                  }
                },
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }
              }}
            >
              <ListItemIcon sx={{ minWidth: 42, color: isSelected ? 'inherit' : 'text.secondary' }}>
                {renderNavIcon(item)}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontWeight: isSelected ? 800 : 600, fontSize: '0.95rem' }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ mt: "auto", p: 2, pb: 3 }}>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 4,
            bgcolor: isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(241, 245, 249, 0.6)",
            border: `1px solid ${borderColor}`,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={profilePhotoUrl || undefined}
              sx={{
                width: 40,
                height: 40,
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: theme.palette.primary.main,
                border: "1px solid",
                borderColor: alpha(theme.palette.primary.main, 0.25),
              }}
            >
              {(user?.name || "U").slice(0, 1).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 14 }} noWrap>
                {user?.name || "User"}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {user?.email || role}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );

  const contentBg = isDark
    ? "linear-gradient(160deg, #0f172a 0%, #020617 100%)"
    : "linear-gradient(160deg, #f8fafc 0%, #e2e8f0 100%)";

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: isDark ? "#0f172a" : "#f8fafc",
        backgroundImage: contentBg,
        overflowX: "hidden",
      }}
    >
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{
          top: 0,
          pt: "env(safe-area-inset-top)",
          bgcolor: isDark ? "rgba(15, 23, 42, 0.75)" : "rgba(248, 250, 252, 0.85)",
          borderBottom: `1px solid ${borderColor}`,
          backdropFilter: "blur(12px)",
          backgroundImage: "none",
          color: "text.primary",
        }}
      >
        <Toolbar sx={{ minHeight: 64, px: { xs: 1.5, sm: 2.5 } }}>
          {!isDesktop && (
            <IconButton
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuRounded />
            </IconButton>
          )}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ minWidth: 0 }}
          >
            <Typography
              variant="h6"
              noWrap
              sx={{
                fontWeight: 900,
                letterSpacing: "-0.02em",
                maxWidth: { xs: "58vw", sm: "none" },
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </Typography>
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={(e) => setUserMenuEl(e.currentTarget)}
            color="inherit"
            sx={{ borderRadius: 999, px: 1.25 }}
            aria-label="Open user menu"
          >
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Avatar
                src={profilePhotoUrl || undefined}
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: theme.palette.primary.main,
                  border: "1px solid",
                  borderColor: alpha(theme.palette.primary.main, 0.18),
                }}
              >
                {(user?.name || "U").slice(0, 1).toUpperCase()}
              </Avatar>
              {isDesktop && (
                <Box sx={{ textAlign: "left" }}>
                  <Typography
                    sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1.1 }}
                    noWrap
                  >
                    {user?.name || "User"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {role === "superadmin" ? "Super Admin" : "Tenant User"}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Button>
          <Menu
            anchorEl={userMenuEl}
            open={Boolean(userMenuEl)}
            onClose={() => setUserMenuEl(null)}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            {role !== "superadmin" && role !== "employee" && (
              <MenuItem
                onClick={() => {
                  setUserMenuEl(null);
                  handleChoosePhoto();
                }}
                disabled={photoBusy || !user}
              >
                <ListItemIcon>
                  <PhotoCameraRounded fontSize="small" />
                </ListItemIcon>
                {photoBusy ? "Uploading..." : "Change Photo"}
              </MenuItem>
            )}
            {role === "tenant_owner" && (
              <MenuItem
                onClick={() => {
                  setUserMenuEl(null);
                  handleChooseTenantLogo();
                }}
                disabled={tenantLogoBusy || !user}
              >
                <ListItemIcon>
                  <PhotoCameraRounded fontSize="small" />
                </ListItemIcon>
                {tenantLogoBusy ? "Uploading..." : "Change Tenant Logo"}
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setUserMenuEl(null);
                setShowPwdModal(true);
              }}
            >
              <ListItemIcon>
                <VpnKeyRounded fontSize="small" />
              </ListItemIcon>
              Change Password
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setUserMenuEl(null);
                handleLogout();
              }}
            >
              <ListItemIcon>
                <LogoutRounded fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoSelected}
        style={{ display: "none" }}
      />
      <input
        ref={tenantLogoInputRef}
        type="file"
        accept="image/*"
        onChange={handleTenantLogoSelected}
        style={{ display: "none" }}
      />
      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        TransitionComponent={(props) => <Slide {...props} direction="down" />}
        sx={{
          mt: `calc(env(safe-area-inset-top) + ${theme.spacing(9)})`,
        }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{
            borderRadius: 999,
            px: 2,
            py: 1,
            boxShadow: "0 18px 55px rgba(0,0,0,0.18)",
            alignItems: "center",
          }}
        >
          {toast.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        fullScreen={false}
        PaperProps={{
          sx: {
            borderRadius: 3,
            mx: { xs: 2, sm: "auto" },
            width: { xs: "calc(100% - 32px)", sm: "auto" },
            bgcolor: alpha(theme.palette.background.paper, 0.92),
            backdropFilter: "blur(16px)",
            backgroundImage: "none",
            boxShadow: "0 24px 80px rgba(0,0,0,0.26)",
            overflow: "hidden",
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900, pb: 0.75 }}>
          Confirm logout
        </DialogTitle>
        <DialogContent sx={{ pt: 1.25 }}>
          <Typography color="text.secondary">
            Are you sure you want to logout?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setLogoutConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={confirmLogout}
            variant="contained"
            color="error"
            sx={{ fontWeight: 800 }}
          >
            Logout
          </Button>
        </DialogActions>
      </Dialog>

      {/* Password Change Modal */}
      <Dialog
        open={showPwdModal}
        onClose={() => setShowPwdModal(false)}
        maxWidth="xs"
        fullWidth
        fullScreen={!isDesktop}
        PaperProps={{
          sx: { borderRadius: !isDesktop ? 0 : 3, p: 1 },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          Change Password
        </DialogTitle>
        <DialogContent sx={{ pb: 3 }}>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {pwdError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {pwdError}
              </Alert>
            )}
            <TextField
              label="Current Password"
              type="password"
              value={pwdForm.current}
              onChange={(e) =>
                setPwdForm({ ...pwdForm, current: e.target.value })
              }
              fullWidth
              variant="outlined"
            />
            <TextField
              label="New Password"
              type="password"
              value={pwdForm.new}
              onChange={(e) => setPwdForm({ ...pwdForm, new: e.target.value })}
              fullWidth
              variant="outlined"
            />
            <TextField
              label="Confirm New Password"
              type="password"
              value={pwdForm.confirm}
              onChange={(e) =>
                setPwdForm({ ...pwdForm, confirm: e.target.value })
              }
              fullWidth
              variant="outlined"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            onClick={() => setShowPwdModal(false)}
            sx={{ fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleChangePassword}
            variant="contained"
            disabled={pwdBusy}
            disableElevation
            sx={{ fontWeight: 700, px: 3 }}
          >
            {pwdBusy ? "Updating..." : "Update Password"}
          </Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ display: "flex" }}>
        {isDesktop && (
          <Drawer
            variant="permanent"
            sx={{
              width: drawerWidth,
              flexShrink: 0,
              "& .MuiDrawer-paper": {
                width: drawerWidth,
                boxSizing: "border-box",
                borderRight: `1px solid ${borderColor}`,
                bgcolor: drawerBg,
                backgroundImage: "none",
              },
            }}
          >
            {drawer}
          </Drawer>
        )}

        {!isDesktop && (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              "& .MuiDrawer-paper": {
                width: { xs: `min(88vw, ${drawerWidth}px)`, sm: drawerWidth },
                boxSizing: "border-box",
                bgcolor: drawerBg,
                backgroundImage: "none",
              },
            }}
          >
            {drawer}
          </Drawer>
        )}

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            overflowX: "hidden",
            px: { xs: 2, sm: 3, md: 4 },
            py: { xs: 2, sm: 3 },
            pb: {
              xs: `calc(${theme.spacing(10)} + env(safe-area-inset-bottom))`,
              md: 3,
            },
          }}
        >
          <Box
            sx={{
              maxWidth: 1200,
              mx: "auto",
              width: "100%",
              minWidth: 0,
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>

      {!isDesktop && (
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: theme.zIndex.appBar,
            px: 1.25,
            pt: 0.75,
            pb: `calc(${theme.spacing(1)} + env(safe-area-inset-bottom))`,
            pointerEvents: "none",
          }}
        >
          <Paper
            elevation={0}
            sx={{
              pointerEvents: "auto",
              mx: "auto",
              maxWidth: 560,
              borderRadius: 999,
              border: "1px solid",
              borderColor: alpha(theme.palette.text.primary, 0.12),
              bgcolor: alpha(theme.palette.background.paper, 0.92),
              backdropFilter: "blur(16px)",
              backgroundImage: "none",
              boxShadow: "0 18px 60px rgba(0,0,0,0.14)",
              overflow: "visible",
              position: "relative",
            }}
          >
            <BottomNavigation
              showLabels={false}
              sx={{
                height: 68,
                px: 0.5,
                bgcolor: "transparent",
                "& .MuiBottomNavigationAction-label": {
                  display: "none !important",
                },
              }}
            >
              {(() => {
                const isTenantRole =
                  role === "tenant_owner" ||
                  role === "hr_admin" ||
                  role === "manager";
                const visible: NavItem[] =
                  role === "employee" && showCenterCheck
                    ? [
                        {
                          label: "Report",
                          to: "/employee-portal?report=1",
                          icon: <QueryStatsRounded />,
                        },
                        items.find((i) => i.to === "/employee-portal"),
                        items.find((i) => i.to.includes("applyLeave=1")),
                        items.find((i) => i.to === "/employee-portal/profile"),
                      ].filter((i): i is NavItem => Boolean(i))
                    : isTenantRole
                      ? [
                          "/employees",
                          "/attendance",
                          "/leaves",
                          "/shifts",
                          "/reports",
                        ]
                          .map((to) => items.find((i) => i.to === to))
                          .filter((i): i is NavItem => Boolean(i))
                      : items.slice(0, 5);
                const left = showCenterCheck ? visible.slice(0, 2) : visible;
                const right = showCenterCheck ? visible.slice(2, 4) : [];

                const renderItem = (item: NavItem) => {
                  const selected = item.to.includes("?")
                    ? `${location.pathname}${location.search || ""}` === item.to
                    : location.pathname === item.to ||
                      location.pathname.startsWith(`${item.to}/`);
                  return (
                    <BottomNavigationAction
                      key={item.to}
                      label=""
                      showLabel={false}
                      aria-label={item.label}
                      onClick={() => navigate(item.to)}
                      icon={
                        <Box
                          sx={{
                            width: 44,
                            height: 36,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            bgcolor: selected
                              ? alpha(theme.palette.primary.main, 0.14)
                              : "transparent",
                            border: "1px solid",
                            borderColor: selected
                              ? alpha(theme.palette.primary.main, 0.2)
                              : "transparent",
                            transition:
                              "background-color 140ms ease, border-color 140ms ease",
                            "& svg": {
                              fontSize: 22,
                            },
                          }}
                        >
                          {renderNavIcon(item)}
                        </Box>
                      }
                      sx={{
                        minWidth: 0,
                        flex: 1,
                        py: 0.75,
                        color: selected
                          ? theme.palette.primary.main
                          : theme.palette.text.secondary,
                        "& .MuiBottomNavigationAction-label": {
                          display: "none !important",
                        },
                      }}
                    />
                  );
                };

                const nodes: React.ReactNode[] = [];

                if (showCenterCheck) {
                  for (let idx = 0; idx < 2; idx++) {
                    const item = left[idx] as NavItem | undefined;
                    nodes.push(
                      item ? (
                        renderItem(item)
                      ) : (
                        <BottomNavigationAction
                          key={`left-pad-${idx}`}
                          disabled
                          label=""
                          showLabel={false}
                          aria-hidden
                          icon={<Box sx={{ width: 44, height: 36 }} />}
                          sx={{
                            minWidth: 0,
                            flex: 1,
                            py: 0.75,
                            opacity: 0,
                            pointerEvents: "none",
                          }}
                        />
                      ),
                    );
                  }
                } else {
                  nodes.push(...left.map(renderItem));
                }

                if (showCenterCheck && centerCheck) {
                  nodes.push(
                    <BottomNavigationAction
                      key="center-check"
                      label=""
                      showLabel={false}
                      aria-label={centerCheck.ariaLabel}
                      onClick={() => navigate(centerCheck.to)}
                      icon={
                        <Box
                          sx={{
                            width: 54,
                            height: 54,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            bgcolor: centerCheck.bg,
                            color: centerCheck.fg,
                            border: "1px solid",
                            borderColor: alpha(centerCheck.bg, 0.55),
                            boxShadow: "0 16px 44px rgba(0,0,0,0.22)",
                            "& svg": { fontSize: 28 },
                          }}
                        >
                          {centerCheck.icon}
                        </Box>
                      }
                      sx={{
                        minWidth: 0,
                        flex: 1,
                        py: 0.75,
                        "&:hover": { bgcolor: "transparent" },
                        "& .MuiBottomNavigationAction-label": {
                          display: "none !important",
                        },
                      }}
                    />,
                  );
                } else if (showCenterCheck) {
                  nodes.push(
                    <BottomNavigationAction
                      key="center-check-pad"
                      disabled
                      label=""
                      showLabel={false}
                      aria-hidden
                      icon={<Box sx={{ width: 54, height: 54 }} />}
                      sx={{
                        minWidth: 0,
                        flex: 1,
                        py: 0.75,
                        opacity: 0,
                        pointerEvents: "none",
                      }}
                    />,
                  );
                }

                if (showCenterCheck) {
                  for (let idx = 0; idx < 2; idx++) {
                    const item = right[idx] as NavItem | undefined;
                    nodes.push(
                      item ? (
                        renderItem(item)
                      ) : (
                        <BottomNavigationAction
                          key={`right-pad-${idx}`}
                          disabled
                          label=""
                          showLabel={false}
                          aria-hidden
                          icon={<Box sx={{ width: 44, height: 36 }} />}
                          sx={{
                            minWidth: 0,
                            flex: 1,
                            py: 0.75,
                            opacity: 0,
                            pointerEvents: "none",
                          }}
                        />
                      ),
                    );
                  }
                }

                return nodes;
              })()}
            </BottomNavigation>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
