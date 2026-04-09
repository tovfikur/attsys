import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
  Link as RouterLink,
} from "react-router-dom";
import { useState, type ReactElement } from "react";
import { keyframes } from "@emotion/react";
import {
  Box,
  Button,
  Container,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import {
  AssessmentRounded,
  BadgeRounded,
  ChatRounded,
  EmailRounded,
  FingerprintRounded,
  MyLocationRounded,
  QueryStatsRounded,
  ScheduleRounded,
} from "@mui/icons-material";
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
import Roster from "./Roster";
import Leaves from "./Leaves";
import Reports from "./Reports";
import Payroll from "./payroll/Payroll";
import EmployeePortal from "./EmployeePortal";
import Messenger from "./Messenger";
import GeoFences from "./GeoFences";
import TrackingDashboard from "./TrackingDashboard";
import AppShell from "./layout/AppShell";
import "./App.css";
import { clearSession, getToken, getUser } from "./utils/session";

function isIpHost(host: string): boolean {
  const h = (host || "").trim();
  if (!h) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return h.includes(":");
}

import { Capacitor } from "@capacitor/core";

function shouldShowRootLanding(): boolean {
  if (typeof window === "undefined") return false;
  // Never show landing page inside Capacitor native app.
  if (Capacitor.isNativePlatform()) return false;
  const host = (window.location.hostname || "").toLowerCase();
  if (!host) return false;
  if (host === "localhost" || isIpHost(host)) return true;
  if (host.endsWith(".localhost")) return false;

  const envRoot = String(
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_ROOT_DOMAIN || "",
  )
    .trim()
    .toLowerCase();
  const root = envRoot || "khudroo.com";
  if (host === root || host === `www.${root}`) return true;
  if (host.endsWith(`.${root}`)) return false;

  const parts = host.split(".").filter(Boolean);
  return parts.length <= 2;
}

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

const float1 = keyframes`
  0% { transform: translate3d(0, 0, 0) scale(1); opacity: .85; }
  50% { transform: translate3d(24px, -18px, 0) scale(1.06); opacity: 1; }
  100% { transform: translate3d(0, 0, 0) scale(1); opacity: .85; }
`;



function TopNavbar({ scrollTo, isDark }: { scrollTo: (id: string) => void; isDark: boolean }) {
  const surfaceBorder = isDark ? "rgba(148, 163, 184, .18)" : "rgba(15, 23, 42, .08)";
  const surfaceBg = isDark ? "rgba(2, 6, 23, .85)" : "rgba(255, 255, 255, .85)";

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        bgcolor: surfaceBg,
        borderBottom: `1px solid ${surfaceBorder}`,
        backdropFilter: 'blur(16px)',
        py: 1.5,
      }}
    >
      <Container>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <BadgeRounded color="primary" />
            <Typography fontWeight={900} letterSpacing={0.2} variant="h6">
              Khudroo
            </Typography>
          </Stack>

          <Stack direction="row" spacing={{ xs: 1, sm: 3 }} alignItems="center">
            <Button color="inherit" onClick={() => scrollTo("features")} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
              Features
            </Button>
            <Button color="inherit" component={RouterLink} to="/contact" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
              Contact
            </Button>
            <Button component={RouterLink} to="/login" variant="outlined" size="small" sx={{ borderRadius: 999 }}>
              Login
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

function LandingPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const scrollTo = (id: string) => {
    if (typeof window === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  
  const surfaceBorder = isDark ? "rgba(148, 163, 184, .18)" : "rgba(15, 23, 42, .08)";
  const surfaceBgSoft = isDark ? "rgba(15, 23, 42, .45)" : "rgba(241, 245, 249, .5)";
  const surfaceBg = isDark ? "rgba(2, 6, 23, .55)" : "rgba(255, 255, 255, .65)";
  const glass = "blur(16px)";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <TopNavbar scrollTo={scrollTo} isDark={isDark} />

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 450px at 18% 10%, rgba(56, 189, 248, .20), transparent 60%), radial-gradient(750px 420px at 90% 20%, rgba(168, 85, 247, .18), transparent 55%), radial-gradient(700px 420px at 55% 95%, rgba(34, 197, 94, .10), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          width: { xs: 240, md: 360 },
          height: { xs: 240, md: 360 },
          borderRadius: "50%",
          top: { xs: -80, md: -120 },
          left: { xs: -80, md: -120 },
          background:
            "linear-gradient(135deg, rgba(56, 189, 248, .50), rgba(59, 130, 246, .20))",
          filter: "blur(24px)",
          animation: `${float1} 8s ease-in-out infinite`,
          pointerEvents: "none",
        }}
      />

      <Container
        sx={{
          pt: {
            xs: "calc(120px + env(safe-area-inset-top, 0px))",
            md: "calc(160px + env(safe-area-inset-top, 0px))",
          },
          pb: { xs: 7, md: 10 },
          position: "relative",
        }}
      >
        <Grid container spacing={{ xs: 6, md: 8 }} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={3}>
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 950,
                  lineHeight: 1.05,
                  letterSpacing: -1.2,
                  background: isDark ? "linear-gradient(to right, #fff, #94a3b8)" : "linear-gradient(to right, #0f172a, #475569)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Intelligent Team Management & Tracking.
              </Typography>

              <Typography
                variant="h6"
                sx={{ color: "text.secondary", lineHeight: 1.6 }}
              >
                A premium SaaS platform designed for modern operations: live location
                tracking, built-in messenger, seamless Hikvision device integration,
                shifts, payroll, and insightful dashboards.
              </Typography>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ pt: 1 }}
              >
                <Button
                  component={RouterLink}
                  to="/contact"
                  variant="contained"
                  size="large"
                  sx={{ px: 4, py: 1.4, borderRadius: 999, fontSize: '1.05rem' }}
                >
                  Request Demo
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  sx={{ px: 4, py: 1.4, borderRadius: 999, fontSize: '1.05rem', color: isDark ? 'white' : 'black', borderColor: surfaceBorder }}
                  onClick={() => scrollTo("features")}
                >
                  Explore Features
                </Button>
              </Stack>
            </Stack>
          </Grid>
          
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              component="img"
              src="/hero_dashboard.png?v=2"
              alt="Dashboard UI Preview"
              sx={{
                width: '100%',
                maxHeight: 500,
                objectFit: 'cover',
                borderRadius: 6,
                boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.6)" : "0 24px 64px rgba(0,0,0,0.12)",
                border: `1px solid ${surfaceBorder}`,
                transform: 'perspective(1000px) rotateY(-5deg) rotateX(2deg)',
                transition: 'transform 0.5s ease',
                "&:hover": {
                  transform: 'perspective(1000px) rotateY(0deg) rotateX(0deg)',
                }
              }}
            />
          </Grid>
        </Grid>

        <Box id="features" sx={{ mt: { xs: 10, md: 16 } }}>
          <Stack spacing={{ xs: 10, md: 14 }}>
            
            <Grid container spacing={{ xs: 4, md: 8 }} alignItems="center">
              <Grid size={{ xs: 12, md: 5 }}>
                <Stack spacing={3}>
                  <Box sx={{ p: 1.5, bgcolor: 'primary.main', borderRadius: 3, display: 'inline-flex', alignSelf: 'flex-start' }}>
                    <MyLocationRounded sx={{ color: 'white', fontSize: 32 }} />
                  </Box>
                  <Typography variant="h3" fontWeight={900} letterSpacing={-0.5}>
                    Live Geo-fencing & Tracking
                  </Typography>
                  <Typography color="text.secondary" variant="h6" sx={{ lineHeight: 1.6 }}>
                    Monitor field activity continuously with smart boundary rules, live location history, and instant alerts when perimeters are crossed. Ensure your teams are exactly where they need to be.
                  </Typography>
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 7 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 4,
                    height: 380,
                    borderRadius: 6,
                    bgcolor: surfaceBgSoft,
                    borderColor: surfaceBorder,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Stack alignItems="center" spacing={2} sx={{ opacity: 0.6 }}>
                    <MyLocationRounded sx={{ fontSize: 80, color: 'text.secondary' }} />
                    <Typography variant="h5" fontWeight={700} color="text.secondary">Live Map Visualization Active</Typography>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    borderRadius: 6,
                    p: { xs: 4, md: 5 },
                    borderColor: surfaceBorder,
                    bgcolor: surfaceBg,
                    backdropFilter: glass,
                    height: "100%",
                  }}
                >
                  <Stack spacing={2.5}>
                    <Box sx={{ p: 1.5, bgcolor: '#8b5cf6', borderRadius: 3, display: 'inline-flex', alignSelf: 'flex-start' }}>
                      <FingerprintRounded sx={{ color: 'white', fontSize: 28 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900}>Hikvision Integration</Typography>
                    <Typography color="text.secondary" variant="body1" sx={{ lineHeight: 1.7, fontSize: '1.1rem' }}>
                      Direct synchronization with Hikvision biometric and facial recognition devices. Push commands, pull attendance logs instantly, and detect offline devices gracefully.
                    </Typography>
                  </Stack>
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    borderRadius: 6,
                    p: { xs: 4, md: 5 },
                    borderColor: surfaceBorder,
                    bgcolor: surfaceBg,
                    backdropFilter: glass,
                    height: "100%",
                  }}
                >
                  <Stack spacing={2.5}>
                    <Box sx={{ p: 1.5, bgcolor: '#10b981', borderRadius: 3, display: 'inline-flex', alignSelf: 'flex-start' }}>
                      <ChatRounded sx={{ color: 'white', fontSize: 28 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900}>Built-in Messenger</Typography>
                    <Typography color="text.secondary" variant="body1" sx={{ lineHeight: 1.7, fontSize: '1.1rem' }}>
                      Fast, secure messaging for quick communication across all your teams. Broadcast announcements, share documents, and resolve questions without ever leaving the dashboard.
                    </Typography>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>

            <Box>
              <Typography variant="h4" fontWeight={900} sx={{ mb: 4, textAlign: 'center' }}>
                Complete End-to-End Suite
              </Typography>
              <Grid container spacing={3}>
                {[
                  {
                    title: "Real-time Operations",
                    icon: <QueryStatsRounded color="primary" />,
                    desc: "Detailed actionable dashboards, device events, and activity insights.",
                  },
                  {
                    title: "Shifts & Rosters",
                    icon: <ScheduleRounded color="primary" />,
                    desc: "Easily configure flexible shifts and plan complex rosters for daily operations.",
                  },
                  {
                    title: "Payroll Automation",
                    icon: <AssessmentRounded color="primary" />,
                    desc: "End-to-end payroll cycles, automated payslips, and direct bank export.",
                  },
                ].map((f) => (
                  <Grid key={f.title} size={{ xs: 12, md: 4 }}>
                    <Paper
                      variant="outlined"
                      sx={{
                        borderRadius: 5,
                        p: { xs: 3, md: 4 },
                        borderColor: surfaceBorder,
                        bgcolor: surfaceBgSoft,
                        transition: "all 0.3s ease",
                        "&:hover": {
                          transform: "translateY(-4px)",
                          boxShadow: isDark
                            ? "0 12px 32px rgba(0,0,0,0.5)"
                            : "0 12px 32px rgba(0,0,0,0.08)",
                          borderColor: theme.palette.primary.light,
                        },
                      }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        {f.icon}
                        <Typography fontWeight={900} variant="h6">{f.title}</Typography>
                      </Stack>
                      <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {f.desc}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Box>

          </Stack>
        </Box>

        <Box sx={{ mt: { xs: 10, md: 16 } }}>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 6,
              p: { xs: 4, md: 6 },
              borderColor: surfaceBorder,
              background: isDark 
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))' 
                : 'linear-gradient(135deg, rgba(241, 245, 249, 0.8), rgba(255, 255, 255, 0.9))',
              backdropFilter: glass,
              textAlign: "center",
            }}
          >
            <Stack spacing={3} alignItems="center">
              <Box>
                <Typography variant="h3" fontWeight={950} sx={{ mb: 1, letterSpacing: -1 }}>
                  Ready to optimize your workforce?
                </Typography>
                <Typography color="text.secondary" variant="h6">
                  Join modern teams streamlining their tracking, payroll, and devices today.
                </Typography>
              </Box>
              <Button
                component={RouterLink}
                to="/contact"
                variant="contained"
                size="large"
                sx={{
                  px: 5,
                  py: 1.5,
                  borderRadius: 999,
                  fontSize: '1.1rem'
                }}
              >
                Contact Sales
              </Button>
            </Stack>
          </Paper>
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{
            mt: { xs: 8, md: 12 },
            pt: 4,
            borderTop: `1px solid ${surfaceBorder}`,
          }}
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <BadgeRounded color="inherit" sx={{ opacity: 0.6 }} />
            <Typography variant="body1" fontWeight={700} color="text.secondary">
              Khudroo
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            © {new Date().getFullYear()} Khudroo. All rights reserved.
          </Typography>
          <Stack direction="row" spacing={3}>
            <RouterLink to="/login" style={{ textDecoration: 'none', color: theme.palette.text.secondary }}>
              Login
            </RouterLink>
            <RouterLink to="/contact" style={{ textDecoration: 'none', color: theme.palette.text.secondary }}>
              Support
            </RouterLink>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

function ContactPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    message: "",
  });
  const surfaceBorder = isDark ? "rgba(148, 163, 184, .18)" : "rgba(15, 23, 42, .08)";
  const surfaceBg = isDark ? "rgba(2, 6, 23, .55)" : "rgba(255, 255, 255, .65)";
  const glass = "blur(16px)";
  const fieldSx = {
    "& .MuiInputBase-root": {
      bgcolor: isDark ? "rgba(15, 23, 42, .45)" : "rgba(255, 255, 255, 0.45)",
      borderRadius: 2,
    },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: surfaceBorder,
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: isDark ? "rgba(148, 163, 184, .32)" : "rgba(15, 23, 42, .2)",
    },
  };

  const submit = () => {
    const name = form.name.trim();
    const company = form.company.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const message = form.message.trim();
    const lines = [
      `Name: ${name || "-"}`,
      `Company: ${company || "-"}`,
      `Email: ${email || "-"}`,
      `Phone: ${phone || "-"}`,
      "",
      message || "-",
    ];
    const subject = encodeURIComponent("Khudroo — Sales Inquiry");
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:sales@khudroo.com?subject=${subject}&body=${body}`;
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 450px at 18% 10%, rgba(56, 189, 248, .22), transparent 60%), radial-gradient(750px 420px at 90% 20%, rgba(168, 85, 247, .18), transparent 55%), radial-gradient(700px 420px at 55% 95%, rgba(34, 197, 94, .10), transparent 60%)",
          pointerEvents: "none",
        }}
      />

      <Container
        sx={{
          pt: {
            xs: "calc(72px + env(safe-area-inset-top, 0px))",
            md: "calc(96px + env(safe-area-inset-top, 0px))",
          },
          pb: { xs: 5, md: 8 },
          position: "relative",
        }}
      >
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Button
              component={RouterLink}
              to="/"
              variant="text"
              sx={{ borderRadius: 999, px: 1.4 }}
            >
              Back
            </Button>
            <Stack direction="row" spacing={1} alignItems="center">
              <BadgeRounded color="primary" />
              <Typography fontWeight={900} letterSpacing={0.2}>
                Khudroo
              </Typography>
            </Stack>
          </Stack>

          <Grid container spacing={3} alignItems="stretch">
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                variant="outlined"
                sx={{
                  borderRadius: 5,
                  p: { xs: 2.4, md: 3 },
                  borderColor: surfaceBorder,
                  bgcolor: surfaceBg,
                  backdropFilter: glass,
                  height: "100%",
                }}
              >
                <Stack spacing={1.2}>
                  <Typography
                    variant="h4"
                    fontWeight={950}
                    letterSpacing={-0.6}
                  >
                    Contact Sales
                  </Typography>
                  <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    Tell us about your organization and what you need. We’ll get
                    back to you with a demo and a tailored plan.
                  </Typography>

                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ pt: 0.5 }}
                  >
                    <EmailRounded color="primary" fontSize="small" />
                    <Typography color="text.secondary">
                      sales@khudroo.com
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper
                variant="outlined"
                sx={{
                  borderRadius: 5,
                  p: { xs: 2.4, md: 3 },
                  borderColor: surfaceBorder,
                  bgcolor: surfaceBg,
                  backdropFilter: glass,
                  height: "100%",
                }}
              >
                <Stack spacing={2}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Full Name"
                        fullWidth
                        sx={fieldSx}
                        value={form.name}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, name: e.target.value }))
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Company"
                        fullWidth
                        sx={fieldSx}
                        value={form.company}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, company: e.target.value }))
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Email"
                        type="email"
                        fullWidth
                        sx={fieldSx}
                        value={form.email}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, email: e.target.value }))
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Phone (optional)"
                        fullWidth
                        sx={fieldSx}
                        value={form.phone}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, phone: e.target.value }))
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Message"
                        fullWidth
                        multiline
                        minRows={4}
                        sx={fieldSx}
                        value={form.message}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, message: e.target.value }))
                        }
                      />
                    </Grid>
                  </Grid>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                    <Button
                      variant="contained"
                      size="large"
                      onClick={submit}
                      sx={{ borderRadius: 999, px: 3, py: 1.1 }}
                    >
                      Send Inquiry
                    </Button>
                    <Button
                      component={RouterLink}
                      to="/"
                      variant="outlined"
                      size="large"
                      sx={{ borderRadius: 999, px: 3, py: 1.1 }}
                    >
                      Back to Landing
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <Typography variant="body2" color="text.secondary" sx={{ pt: 2 }}>
            © {new Date().getFullYear()} Khudroo. All rights reserved.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}

function MarketingRoute({ element }: { element: ReactElement }) {
  if (!shouldShowRootLanding()) return <Navigate to="/" replace />;
  return element;
}

function RootRoute() {
  if (shouldShowRootLanding()) return <LandingPage />;
  return <HomeRedirect />;
}

function App() {
  const isNative =
    typeof window !== "undefined" &&
    (window.location.protocol === "capacitor:" ||
      window.location.protocol === "file:" ||
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor?.isNativePlatform?.() === true);
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
          path="/contact"
          element={<MarketingRoute element={<ContactPage />} />}
        />
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
          path="/geo-fencing"
          element={
            <DenyRoleRoute
              deny={["employee", "superadmin", "manager", "payroll_admin"]}
            >
              <GeoFences />
            </DenyRoleRoute>
          }
        />
        <Route
          path="/tracking"
          element={
            <DenyRoleRoute deny={["employee", "superadmin"]}>
              <TrackingDashboard />
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
          path="/roster"
          element={
            <DenyRoleRoute deny={["superadmin"]}>
              <Roster />
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
        <Route path="/" element={<RootRoute />} />
      </Routes>
    </Router>
  );
}

export default App;
