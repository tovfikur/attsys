import { useState } from "react";
import api from "./api";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getErrorMessage } from "./utils/errors";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  Alert,
  Fade,
  Paper,
} from "@mui/material";
import {
  VisibilityOffRounded,
  VisibilityRounded,
  VpnKeyRounded,
} from "@mui/icons-material";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (!token) throw { message: "Invalid token. Please request a new link." };
      if (password.length < 6)
        throw { message: "Password must be at least 6 characters long." };
      if (password !== confirm)
        throw { message: "Passwords do not match." };

      await api.post("/api/reset-password", { token, password });
      
      setSuccess("Password reset successfully. Redirecting to login...");
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to reset password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 400,
          width: "100%",
          p: 4,
          borderRadius: 4,
          boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
        }}
      >
        <Stack spacing={3} alignItems="center" sx={{ mb: 4 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "primary.lighter",
              color: "primary.main",
            }}
          >
            <VpnKeyRounded fontSize="large" />
          </Box>
          <Box textAlign="center">
            <Typography variant="h5" fontWeight="800" gutterBottom>
              Set New Password
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your new password must be different to previously used passwords.
            </Typography>
          </Box>
        </Stack>

        <form onSubmit={handleReset}>
          <Stack spacing={3}>
            {error && (
              <Fade in>
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  {error}
                </Alert>
              </Fade>
            )}
            {success && (
              <Fade in>
                <Alert severity="success" sx={{ borderRadius: 2 }}>
                  {success}
                </Alert>
              </Fade>
            )}

            <TextField
              label="New Password"
              type={showPwd ? "text" : "password"}
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || !!success}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPwd(!showPwd)}
                      edge="end"
                    >
                      {showPwd ? <VisibilityOffRounded /> : <VisibilityRounded />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              label="Confirm Password"
              type={showPwd ? "text" : "password"}
              fullWidth
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading || !!success}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loading || !!success}
              startIcon={loading && <CircularProgress size={20} color="inherit" />}
            >
              Reset Password
            </Button>

            <Button
              variant="text"
              onClick={() => navigate("/login")}
              disabled={loading}
            >
              Back to Login
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
