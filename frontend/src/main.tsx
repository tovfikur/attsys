import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { CssBaseline, ThemeProvider, useMediaQuery } from "@mui/material";
import { createAppTheme } from "./theme";



function AppThemeWrapper() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  const mode = useMemo(() => {
    return prefersDarkMode ? 'dark' : 'light';
  }, [prefersDarkMode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppThemeWrapper />
  </StrictMode>
);

