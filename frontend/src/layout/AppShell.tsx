import { useMemo, useState } from "react";
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
    label: "Dashboard",
    to: "/dashboard",
    icon: <DashboardRounded />,
    roles: ["superadmin"],
  },
  { label: "Employees", to: "/employees", icon: <PeopleAltRounded /> },
  { label: "Clock", to: "/clock", icon: <AccessTimeRounded /> },
  { label: "Attendance", to: "/attendance", icon: <QueryStatsRounded /> },
  { label: "Leaves", to: "/leaves", icon: <EventNoteRounded /> },
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

  const items = useMemo(() => {
    return navItems.filter((i) => !i.roles || i.roles.includes(role));
  }, [role]);

  const title = useMemo(() => {
    if (location.pathname.startsWith("/employees")) return "Employees";
    if (location.pathname.startsWith("/clock")) return "Clock";
    if (location.pathname.startsWith("/attendance")) return "Attendance";
    if (location.pathname.startsWith("/leaves")) return "Leaves";
    if (location.pathname.startsWith("/devices")) return "Devices";
    if (location.pathname.startsWith("/sites")) return "Sites";
    return role === "superadmin" ? "Super Admin" : "Workspace";
  }, [location.pathname, role]);

  const drawerWidth = 280;

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
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
            <Avatar sx={{ width: 36, height: 36, bgcolor: "action.hover" }}>
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
              <Avatar sx={{ width: 32, height: 32, bgcolor: "action.hover" }}>
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
