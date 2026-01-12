import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Avatar,
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
  ApartmentRounded,
  DashboardRounded,
  DevicesRounded,
  EventNoteRounded,
  LogoutRounded,
  MenuRounded,
  PeopleAltRounded,
  QueryStatsRounded,
  PhotoCameraRounded,
  VpnKeyRounded,
} from "@mui/icons-material";
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
    label: "Clock",
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
    label: "Leaves",
    to: "/leaves",
    icon: <EventNoteRounded />,
    roles: ["tenant_owner", "hr_admin", "manager"],
  },
  {
    label: "Shifts",
    to: "/shifts",
    icon: <AccessTimeRounded />,
    roles: ["tenant_owner", "hr_admin"],
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
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  // Password Change State
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", new: "", confirm: "" });
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const handleChangePassword = async () => {
    setPwdError("");
    setPwdSuccess("");
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
      await api.post("/api/change_password", {
        current_password: pwdForm.current,
        new_password: pwdForm.new,
      });
      setPwdSuccess("Password updated successfully");
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
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/api/me/profile_photo/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
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
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setTenantLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/api/tenant/logo/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
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

  const title = useMemo(() => {
    if (location.pathname.startsWith("/employees")) return "Employees";
    if (location.pathname.startsWith("/clock")) return "Clock";
    if (location.pathname.startsWith("/attendance")) return "Attendance";
    if (location.pathname.startsWith("/leaves")) return "Leaves";
    if (location.pathname.startsWith("/employee-portal"))
      return "Employee Portal";
    if (location.pathname.startsWith("/devices")) return "Devices";
    if (location.pathname.startsWith("/sites")) return "Sites";
    return role === "superadmin" ? "Super Admin" : "Workspace";
  }, [location.pathname, role]);

  const brandLogoSrc = useMemo(() => {
    if (role === "superadmin") return "/icon.svg";
    return tenantLogoUrl || "/icon.svg";
  }, [role, tenantLogoUrl]);

  const drawerWidth = 280;

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            src={brandLogoSrc}
            sx={{
              bgcolor: "primary.main",
              width: 40,
              height: 40,
              boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
            }}
          >
            <ApartmentRounded fontSize="small" />
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
              Attendance
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {role === "superadmin" ? "Platform Control" : "Tenant Console"}
            </Typography>
          </Box>
        </Stack>
      </Box>
      <Divider />
      <List sx={{ px: 1.5, pt: 1.5 }}>
        {items.map((item) => (
          <ListItemButton
            key={item.to}
            component={Link}
            to={item.to}
            selected={location.pathname === item.to}
            onClick={() => setMobileOpen(false)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              "&.Mui-selected": {
                bgcolor: "action.selected",
                "&:hover": { bgcolor: "action.selected" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ fontWeight: 700 }}
            />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: "auto", p: 2 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            borderRadius: 3,
            bgcolor: "background.paper",
            boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={profilePhotoUrl || undefined}
              sx={{ width: 36, height: 36, bgcolor: "action.hover" }}
            >
              {(user?.name || "U").slice(0, 1).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 14 }} noWrap>
                {user?.name || "User"}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {user?.email || role}
              </Typography>
            </Box>
            <IconButton
              aria-label="Change Password"
              onClick={() => setShowPwdModal(true)}
              size="small"
            >
              <VpnKeyRounded fontSize="small" />
            </IconButton>
            <IconButton aria-label="Logout" onClick={handleLogout} size="small">
              <LogoutRounded fontSize="small" />
            </IconButton>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );

  const contentBg =
    role === "superadmin"
      ? "radial-gradient(1000px circle at 10% 20%, rgba(124,58,237,0.22), transparent 35%), radial-gradient(900px circle at 90% 10%, rgba(16,185,129,0.12), transparent 40%), linear-gradient(180deg, rgba(11,16,32,1) 0%, rgba(11,16,32,1) 55%, rgba(17,24,39,1) 100%)"
      : "radial-gradient(1000px circle at 10% 20%, rgba(37,99,235,0.14), transparent 35%), radial-gradient(900px circle at 90% 20%, rgba(236,72,153,0.08), transparent 40%), linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(248,250,252,1) 70%, rgba(241,245,249,1) 100%)";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        backgroundImage: contentBg,
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "background.default",
          borderBottom: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(10px)",
          backgroundImage: "none",
        }}
      >
        <Toolbar sx={{ minHeight: 64 }}>
          {!isDesktop && (
            <IconButton
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuRounded />
            </IconButton>
          )}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              variant="h6"
              sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}
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
                sx={{ width: 32, height: 32, bgcolor: "action.hover" }}
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
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ borderRadius: 2 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>

      {/* Password Change Modal */}
      <Dialog
        open={showPwdModal}
        onClose={() => setShowPwdModal(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, p: 1 },
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
            {pwdSuccess && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {pwdSuccess}
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
                borderRight: "1px solid",
                borderColor: "divider",
                bgcolor: "background.default",
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
                width: drawerWidth,
                boxSizing: "border-box",
                bgcolor: "background.default",
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
            px: { xs: 2, sm: 3, md: 4 },
            py: { xs: 2, sm: 3 },
            pb: { xs: 10, md: 3 },
          }}
        >
          <Box
            sx={{
              maxWidth: 1200,
              mx: "auto",
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>

      {!isDesktop && (
        <Paper
          elevation={0}
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.default",
            backdropFilter: "blur(10px)",
            backgroundImage: "none",
          }}
        >
          <BottomNavigation
            showLabels
            value={items.findIndex((i) => location.pathname === i.to)}
            onChange={(_, idx) => {
              const item = items[idx];
              if (item) navigate(item.to);
            }}
          >
            {items.slice(0, 5).map((item) => (
              <BottomNavigationAction
                key={item.to}
                label={item.label}
                icon={item.icon}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}
