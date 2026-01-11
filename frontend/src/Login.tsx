import { useMemo, useState } from "react";
import api from "./api";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
  Alert,
  Fade,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  VisibilityOffRounded,
  VisibilityRounded,
  ShieldRounded,
  BusinessRounded,
  ArrowForwardRounded,
  BadgeRounded,
} from "@mui/icons-material";
import { getErrorMessage } from "./utils/errors";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [twofa, setTwofa] = useState(false);

  // Forgot Password State
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [debugLink, setDebugLink] = useState("");

  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const sub = host.split(".")[0];
  const tenantHint =
    localStorage.getItem("tenant") || sessionStorage.getItem("tenant") || "";
  const isSuperadminPortal =
    (!host.includes(".") || sub === "superadmin") && !tenantHint;

  const tenantSubdomain = useMemo(() => {
    if (host.includes(".") && sub !== "superadmin") return sub;
    return tenantHint || "";
  }, [host, sub, tenantHint]);

  const [tenantPortalMode, setTenantPortalMode] = useState<
    "employee" | "admin"
  >(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname;
      if (p.includes("/employee-login")) return "employee";
    }
    return "admin";
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw {
          response: {
            data: { error: "Please enter a valid email address." },
            status: 400,
          },
        };
      if (password.length < 6)
        throw {
          response: {
            data: { error: "Password must be at least 6 characters long." },
            status: 400,
          },
        };

      const response = await api.post(
        isSuperadminPortal ? "/api/login" : "/api/tenant_login",
        isSuperadminPortal
          ? { email, password, twofa }
          : { email, password, twofa, portal_mode: tenantPortalMode }
      );

      if (response.data.token) {
        if (remember) {
          localStorage.setItem("token", response.data.token);
          localStorage.setItem("user", JSON.stringify(response.data.user));
        } else {
          sessionStorage.setItem("token", response.data.token);
          sessionStorage.setItem("user", JSON.stringify(response.data.user));
        }
        const role = String(response.data?.user?.role || "");
        if (role === "employee") navigate("/employee-portal");
        else if (role === "superadmin") navigate("/dashboard");
        else navigate("/employees");
      }
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 429)
        setError("Too many attempts. Please try again later.");
      else
        setError(
          getErrorMessage(err, "Invalid credentials. Please try again.")
        );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotSuccess("");
    setForgotError("");
    setDebugLink("");

    try {
      const res = await api.post("/api/forgot-password", {
        email: forgotEmail,
      });
      setForgotSuccess(res.data.message);
      if (res.data.dev_link) {
        setDebugLink(res.data.dev_link);
      }
    } catch (err: unknown) {
      setForgotError(getErrorMessage(err, "Something went wrong."));
    } finally {
      setForgotLoading(false);
    }
  };

  // Visual assets & gradients
  const brandColor = isSuperadminPortal ? "#7c3aed" : "#2563eb"; // Violet vs Blue
  const gradientBg = isSuperadminPortal
    ? "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)"
    : "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)";

  const accentGradient = isSuperadminPortal
    ? "linear-gradient(45deg, #7c3aed 30%, #a78bfa 90%)"
    : "linear-gradient(45deg, #2563eb 30%, #60a5fa 90%)";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      {/* Left Panel: Form Section */}
      <Box
        sx={{
          flex: { xs: 1, md: "0 0 480px", lg: "0 0 560px" },
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          p: { xs: 4, sm: 6, md: 8 },
          bgcolor: "background.paper",
          position: "relative",
          zIndex: 1,
          boxShadow: { md: "20px 0 60px rgba(0,0,0,0.05)" },
        }}
      >
        <Box sx={{ maxWidth: 400, mx: "auto", width: "100%" }}>
          {/* Header */}
          <Stack spacing={3} sx={{ mb: 6 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isSuperadminPortal
                  ? "rgba(124, 58, 237, 0.1)"
                  : "rgba(37, 99, 235, 0.1)",
                color: brandColor,
              }}
            >
              {isSuperadminPortal ? (
                <ShieldRounded fontSize="large" />
              ) : tenantPortalMode === "employee" ? (
                <BadgeRounded fontSize="large" />
              ) : (
                <BusinessRounded fontSize="large" />
              )}
            </Box>

            <Box>
              <Typography
                variant="h3"
                fontWeight="800"
                sx={{ mb: 1, letterSpacing: "-0.02em" }}
              >
                Welcome back
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ fontSize: "1.1rem" }}
              >
                {isSuperadminPortal
                  ? "Sign in to the Super Admin Portal"
                  : tenantPortalMode === "employee"
                  ? "Sign in to the Employee Portal"
                  : "Sign in to your Tenant Workspace"}
              </Typography>
            </Box>

            {!isSuperadminPortal && (
              <Stack spacing={1.25}>
                <ToggleButtonGroup
                  value={tenantPortalMode}
                  exclusive
                  onChange={(_, next) => {
                    if (!next) return;
                    setTenantPortalMode(next);
                  }}
                  fullWidth
                  size="small"
                  sx={{
                    "& .MuiToggleButton-root": {
                      textTransform: "none",
                      fontWeight: 800,
                      borderRadius: 2,
                      px: 2,
                      py: 1,
                    },
                  }}
                >
                  <ToggleButton value="employee">Employee</ToggleButton>
                  <ToggleButton value="admin">Admin / HR</ToggleButton>
                </ToggleButtonGroup>
                {tenantSubdomain && (
                  <Typography variant="caption" color="text.secondary">
                    Tenant: {tenantSubdomain}
                  </Typography>
                )}
              </Stack>
            )}
          </Stack>

          {/* Form */}
          <form onSubmit={handleLogin} noValidate>
            <Stack spacing={3}>
              {error && (
                <Fade in>
                  <Alert
                    severity="error"
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "error.light",
                      bgcolor: "error.lighter",
                    }}
                  >
                    {error}
                  </Alert>
                </Fade>
              )}

              <TextField
                label="Email address"
                type="email"
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "background.default",
                    transition: "all 0.2s",
                    "&:hover": { bgcolor: "action.hover" },
                    "&.Mui-focused": {
                      bgcolor: "background.paper",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                    },
                  },
                }}
              />

              <TextField
                label="Password"
                type={showPwd ? "text" : "password"}
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={() => setShowPwd(!showPwd)}
                        edge="end"
                        size="small"
                      >
                        {showPwd ? (
                          <VisibilityOffRounded />
                        ) : (
                          <VisibilityRounded />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "background.default",
                    transition: "all 0.2s",
                    "&:hover": { bgcolor: "action.hover" },
                    "&.Mui-focused": {
                      bgcolor: "background.paper",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                    },
                  },
                }}
              />

              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      Remember me
                    </Typography>
                  }
                />
                <Button
                  variant="text"
                  size="small"
                  onClick={() => setShowForgot(true)}
                  sx={{
                    textTransform: "none",
                    fontWeight: 600,
                    color: "text.secondary",
                  }}
                >
                  Forgot password?
                </Button>
              </Stack>

              {isSuperadminPortal && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={twofa}
                      onChange={(e) => setTwofa(e.target.checked)}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      Enable 2FA
                    </Typography>
                  }
                />
              )}

              <Button
                type="submit"
                fullWidth
                size="large"
                variant="contained"
                disabled={loading}
                sx={{
                  py: 1.5,
                  fontSize: "1rem",
                  fontWeight: 700,
                  borderRadius: 3,
                  textTransform: "none",
                  background: accentGradient,
                  boxShadow: "0 4px 14px 0 rgba(0,0,0,0.1)",
                  transition: "all 0.2s",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: "0 6px 20px 0 rgba(0,0,0,0.15)",
                  },
                }}
                endIcon={!loading && <ArrowForwardRounded />}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Sign in"
                )}
              </Button>
            </Stack>
          </form>

          {/* Footer */}
          <Box sx={{ mt: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Need an account?{" "}
              <Button
                variant="text"
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  color: brandColor,
                  p: 0,
                  minWidth: "auto",
                  "&:hover": {
                    bgcolor: "transparent",
                    textDecoration: "underline",
                  },
                }}
              >
                Contact Support
              </Button>
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Right Panel: Visual Section (Desktop Only) */}
      {!isMobile && (
        <Box
          sx={{
            flex: 1,
            background: gradientBg,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* Abstract Shapes/Blur */}
          <Box
            sx={{
              position: "absolute",
              top: "-20%",
              right: "-10%",
              width: "60%",
              height: "60%",
              background: isSuperadminPortal
                ? "radial-gradient(circle, rgba(124,58,237,0.4) 0%, rgba(124,58,237,0) 70%)"
                : "radial-gradient(circle, rgba(37,99,235,0.2) 0%, rgba(37,99,235,0) 70%)",
              filter: "blur(60px)",
              opacity: 0.8,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              bottom: "-10%",
              left: "-10%",
              width: "50%",
              height: "50%",
              background: isSuperadminPortal
                ? "radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(59,130,246,0) 70%)"
                : "radial-gradient(circle, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0) 70%)",
              filter: "blur(60px)",
              opacity: 0.8,
            }}
          />

          {/* Glass Card Content */}
          <Paper
            elevation={0}
            sx={{
              position: "relative",
              zIndex: 2,
              p: 6,
              maxWidth: 480,
              background: isSuperadminPortal
                ? "rgba(15, 23, 42, 0.6)"
                : "rgba(255, 255, 255, 0.6)",
              backdropFilter: "blur(20px)",
              borderRadius: 4,
              border: "1px solid",
              borderColor: isSuperadminPortal
                ? "rgba(255,255,255,0.1)"
                : "rgba(255,255,255,0.8)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
            }}
          >
            <Typography
              variant="h4"
              fontWeight="800"
              sx={{
                mb: 2,
                color: isSuperadminPortal ? "white" : "text.primary",
                lineHeight: 1.2,
              }}
            >
              {isSuperadminPortal
                ? "Secure Platform Management"
                : "Attendance tracking made simple."}
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: isSuperadminPortal
                  ? "rgba(255,255,255,0.7)"
                  : "text.secondary",
                lineHeight: 1.6,
              }}
            >
              {isSuperadminPortal
                ? "Monitor system health, provision tenants, and manage global settings with enterprise-grade security."
                : "Streamline your workforce management with real-time tracking, automated reports, and seamless device integration."}
            </Typography>
          </Paper>
        </Box>
      )}

      {/* Forgot Password Modal */}
      <Dialog
        open={showForgot}
        onClose={() => setShowForgot(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Reset Password</DialogTitle>
        <form onSubmit={handleForgotSubmit}>
          <DialogContent sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter your email address and we'll send you a link to reset your
              password.
            </Typography>

            {forgotError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {forgotError}
              </Alert>
            )}

            {forgotSuccess && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {forgotSuccess}
                {debugLink && (
                  <Box sx={{ mt: 1 }}>
                    <Link
                      href={debugLink}
                      sx={{ fontWeight: "bold", cursor: "pointer" }}
                      onClick={(e) => {
                        e.preventDefault();
                        // We navigate internally for this SPA
                        navigate(debugLink);
                      }}
                    >
                      Click here to reset (Dev Only)
                    </Link>
                  </Box>
                )}
              </Alert>
            )}

            {!forgotSuccess && (
              <TextField
                autoFocus
                margin="dense"
                label="Email Address"
                type="email"
                fullWidth
                variant="outlined"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                disabled={forgotLoading}
              />
            )}
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 1 }}>
            <Button
              onClick={() => setShowForgot(false)}
              disabled={forgotLoading}
              sx={{ color: "text.secondary" }}
            >
              Cancel
            </Button>
            {!forgotSuccess && (
              <Button
                type="submit"
                variant="contained"
                disabled={forgotLoading}
                startIcon={forgotLoading && <CircularProgress size={16} />}
              >
                Send Link
              </Button>
            )}
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
