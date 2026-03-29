import { createTheme } from '@mui/material/styles'

export function createAppTheme(mode: 'tenant' | 'superadmin' | 'light' | 'dark') {
  const isDark = mode === 'superadmin' || mode === 'dark'
  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: isDark ? '#7c3aed' : '#2563eb' },
      background: {
        default: isDark ? '#0b1020' : '#f8fafc',
        paper: isDark ? '#111827' : '#ffffff',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily:
        '"Inter","Roboto",system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif',
      h4: { fontWeight: 800, letterSpacing: '-0.02em' },
      h5: { fontWeight: 800, letterSpacing: '-0.01em' },
      h6: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 700 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'all 0.2s ease-in-out',
          },
        },
      },
      MuiTextField: {
        defaultProps: { fullWidth: true, size: 'medium' },
      },
    },
  })
}

