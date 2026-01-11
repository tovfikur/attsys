import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Box,
  Button,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Select,
  Typography,
  Paper,
  Alert,
  Stack,
  CircularProgress,
} from "@mui/material";
import { AccessTime, ExitToApp, Login } from "@mui/icons-material";

interface Employee {
  id: string;
  name: string;
}

interface ClockRecord {
  clock_in: string;
  clock_out?: string;
  status?: string;
  late_minutes?: number;
  early_leave_minutes?: number;
}

type BiometricModality = "face" | "fingerprint";
type BiometricAction = "clock_in" | "clock_out" | "enroll";
type BiometricGeo = {
  latitude: number;
  longitude: number;
  accuracy_m?: number;
};

export default function Clock() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [openShift, setOpenShift] = useState<boolean | null>(null);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    record?: ClockRecord;
  } | null>(null);
  const employeeLabelId = "employee-select-label";

  const [biometricOpen, setBiometricOpen] = useState(false);
  const [biometricAction, setBiometricAction] =
    useState<BiometricAction>("clock_in");
  const [biometricModality, setBiometricModality] =
    useState<BiometricModality>("face");
  const [biometricImage, setBiometricImage] = useState("");
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  const biometricVideoRef = useRef<HTMLVideoElement | null>(null);
  const biometricStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    api.get("/api/employees").then((r) => setEmployees(r.data.employees));
  }, []);

  const refreshOpenShift = useCallback(
    async (id: string) => {
      if (!id) {
        setOpenShift(null);
        return;
      }
      setStatusLoading(true);
      try {
        const res = await api.get(
          `/api/attendance/open?employee_id=${encodeURIComponent(id)}`,
          { timeout: 8000 }
        );
        setOpenShift(Boolean(res.data?.open));
      } catch {
        setOpenShift(null);
      } finally {
        setStatusLoading(false);
      }
    },
    [setOpenShift]
  );

  useEffect(() => {
    setResult(null);
    setOpenShift(null);
    if (!employeeId) return;
    void refreshOpenShift(employeeId);
  }, [employeeId, refreshOpenShift]);

  const notifyAttendanceUpdated = (id: string) => {
    window.dispatchEvent(
      new CustomEvent("attendance:updated", { detail: { employeeId: id } })
    );
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const bc = new BroadcastChannel("attendance");
      bc.postMessage({ type: "updated", employeeId: id, ts: Date.now() });
      bc.close();
    }
  };

  const getBiometricGeo =
    useCallback(async (): Promise<BiometricGeo | null> => {
      if (!navigator?.geolocation?.getCurrentPosition) return null;
      return await new Promise((resolve) => {
        let done = false;
        const t = window.setTimeout(() => {
          if (done) return;
          done = true;
          resolve(null);
        }, 6500);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (done) return;
            done = true;
            window.clearTimeout(t);
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy,
            });
          },
          () => {
            if (done) return;
            done = true;
            window.clearTimeout(t);
            resolve(null);
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
        );
      });
    }, []);

  const stopBiometricCamera = useCallback(() => {
    const stream = biometricStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      biometricStreamRef.current = null;
    }
    const el = biometricVideoRef.current;
    if (el) el.srcObject = null;
  }, []);

  const closeBiometric = useCallback(() => {
    stopBiometricCamera();
    setBiometricOpen(false);
    setBiometricBusy(false);
  }, [stopBiometricCamera]);

  const openBiometric = useCallback((action: BiometricAction) => {
    setBiometricAction(action);
    setBiometricModality("face");
    setBiometricImage("");
    setBiometricError("");
    setBiometricOpen(true);
  }, []);

  const startBiometricCamera = useCallback(async () => {
    stopBiometricCamera();
    if (!navigator?.mediaDevices?.getUserMedia) {
      setBiometricError("Camera not available");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      biometricStreamRef.current = stream;
      const el = biometricVideoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play();
      }
    } catch (err: unknown) {
      setBiometricError(getErrorMessage(err, "Failed to start camera"));
    }
  }, [stopBiometricCamera]);

  const captureBiometricSelfie = useCallback(() => {
    const el = biometricVideoRef.current;
    if (!el) return;
    const w = el.videoWidth || 0;
    const h = el.videoHeight || 0;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(el, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setBiometricImage(dataUrl);
  }, []);

  const onPickBiometricFile = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const v = typeof reader.result === "string" ? reader.result : "";
      setBiometricImage(v);
    };
    reader.readAsDataURL(file);
  }, []);

  const clock = async (
    type: "in" | "out",
    biometric: {
      modality: BiometricModality;
      image: string;
      geo?: BiometricGeo | null;
    }
  ) => {
    setLoading(true);
    setResult(null);
    const url =
      type === "in" ? "/api/attendance/clockin" : "/api/attendance/clockout";
    try {
      const res = await api.post(url, {
        employee_id: employeeId,
        biometric_modality: biometric.modality,
        biometric_image: biometric.image,
        geo: biometric.geo || null,
      });
      const record = res.data.record;
      let msg = `${type === "in" ? "Clock In" : "Clock Out"} Successful`;

      if (record.status && record.status !== "Present") {
        msg += ` (${record.status})`;
      }
      if (record.late_minutes > 0) {
        msg += ` - Late by ${record.late_minutes} mins`;
      }
      if (record.early_leave_minutes > 0) {
        msg += ` - Left early by ${record.early_leave_minutes} mins`;
      }

      setResult({ type: "success", message: msg, record });
      setOpenShift(type === "in");
      notifyAttendanceUpdated(employeeId);
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Failed to record attendance");
      if (message.includes("Open shift exists")) setOpenShift(true);
      if (message.includes("No open shift")) setOpenShift(false);
      setResult({
        type: "error",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  const submitBiometric = async () => {
    if (!employeeId) return;
    if (!biometricImage) {
      setBiometricError("Biometric image is required");
      return;
    }
    setBiometricBusy(true);
    setBiometricError("");
    try {
      if (biometricAction === "enroll") {
        await api.post("/api/biometrics/enroll", {
          employee_id: employeeId,
          biometric_modality: biometricModality,
          biometric_image: biometricImage,
        });
        setResult({ type: "success", message: "Biometric enrolled" });
        closeBiometric();
        return;
      }
      await clock(biometricAction === "clock_in" ? "in" : "out", {
        modality: biometricModality,
        image: biometricImage,
        geo: await getBiometricGeo(),
      });
      closeBiometric();
    } catch (err: unknown) {
      setBiometricError(getErrorMessage(err, "Failed"));
    } finally {
      setBiometricBusy(false);
    }
  };

  const showClockIn =
    !employeeId || (openShift === null ? true : openShift === false);
  const showClockOut =
    !employeeId || (openShift === null ? true : openShift === true);

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4, textAlign: "center" }}>
        <Stack spacing={3} alignItems="center">
          <AccessTime sx={{ fontSize: 60, color: "primary.main" }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Time Clock
          </Typography>

          <FormControl fullWidth>
            <InputLabel id={employeeLabelId}>Select Employee</InputLabel>
            <Select
              labelId={employeeLabelId}
              value={employeeId}
              label="Select Employee"
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction="row" spacing={2} width="100%">
            {showClockIn && (
              <Button
                variant="contained"
                color="success"
                size="large"
                fullWidth
                startIcon={<Login />}
                onClick={() => openBiometric("clock_in")}
                disabled={!employeeId || loading || statusLoading}
              >
                Clock In
              </Button>
            )}
            {showClockOut && (
              <Button
                variant="contained"
                color="warning"
                size="large"
                fullWidth
                startIcon={<ExitToApp />}
                onClick={() => openBiometric("clock_out")}
                disabled={!employeeId || loading || statusLoading}
              >
                Clock Out
              </Button>
            )}
          </Stack>

          <Button
            variant="outlined"
            fullWidth
            disabled={!employeeId || loading || statusLoading}
            onClick={() => openBiometric("enroll")}
          >
            Enroll Biometrics
          </Button>

          {(loading || statusLoading) && <CircularProgress />}

          {result && (
            <Alert
              severity={result.type}
              sx={{ width: "100%" }}
              iconMapping={{
                success: <AccessTime fontSize="inherit" />,
              }}
            >
              {result.message}
              {result.record && (
                <Box mt={1} fontSize="0.875rem">
                  <Typography variant="caption" display="block">
                    Time:{" "}
                    {new Date(
                      result.record.clock_out || result.record.clock_in
                    ).toLocaleTimeString()}
                  </Typography>
                </Box>
              )}
            </Alert>
          )}
        </Stack>
      </Paper>
      <Dialog
        open={biometricOpen}
        onClose={biometricBusy ? undefined : closeBiometric}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {biometricAction === "enroll"
            ? "Enroll Biometrics"
            : biometricAction === "clock_in"
            ? "Clock In (Biometric)"
            : "Clock Out (Biometric)"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {biometricError ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {biometricError}
              </Alert>
            ) : null}

            <FormControl fullWidth>
              <InputLabel id="biometric-modality-label">Modality</InputLabel>
              <Select
                labelId="biometric-modality-label"
                value={biometricModality}
                label="Modality"
                onChange={(e) =>
                  setBiometricModality(e.target.value as BiometricModality)
                }
              >
                <MenuItem value="face">Face (Selfie)</MenuItem>
                <MenuItem value="fingerprint">Fingerprint (Image)</MenuItem>
              </Select>
            </FormControl>

            {biometricModality === "face" ? (
              <Stack spacing={1.25}>
                <Box
                  sx={{
                    width: "100%",
                    bgcolor: "background.default",
                    borderRadius: 2,
                    overflow: "hidden",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Box
                    component="video"
                    ref={biometricVideoRef}
                    muted
                    playsInline
                    autoPlay
                    sx={{ width: "100%", display: "block" }}
                  />
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="outlined"
                    onClick={() => void startBiometricCamera()}
                    disabled={biometricBusy}
                  >
                    Start Camera
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={stopBiometricCamera}
                    disabled={biometricBusy}
                  >
                    Stop Camera
                  </Button>
                  <Button
                    variant="contained"
                    onClick={captureBiometricSelfie}
                    disabled={biometricBusy}
                  >
                    Take Selfie
                  </Button>
                  <Button
                    component="label"
                    variant="outlined"
                    disabled={biometricBusy}
                  >
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) =>
                        onPickBiometricFile(e.target.files?.[0] || null)
                      }
                    />
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Button
                component="label"
                variant="outlined"
                disabled={biometricBusy}
              >
                Upload Fingerprint Image
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) =>
                    onPickBiometricFile(e.target.files?.[0] || null)
                  }
                />
              </Button>
            )}

            {biometricImage ? (
              <Box
                component="img"
                src={biometricImage}
                alt="Biometric"
                sx={{
                  width: "100%",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeBiometric} disabled={biometricBusy}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitBiometric()}
            disabled={biometricBusy || !biometricImage}
          >
            {biometricBusy
              ? "Please wait…"
              : biometricAction === "enroll"
              ? "Enroll"
              : biometricAction === "clock_in"
              ? "Clock In"
              : "Clock Out"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
