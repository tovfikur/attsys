import { createTheme } from '@mui/material/styles'

export function createAppTheme(mode: 'tenant' | 'superadmin') {
  const isSuper = mode === 'superadmin'
  return createTheme({
    palette: {
      mode: isSuper ? 'dark' : 'light',
      primary: { main: isSuper ? '#7c3aed' : '#2563eb' },
      background: {
        default: isSuper ? '#0b1020' : '#f8fafc',
        paper: isSuper ? '#111827' : '#ffffff',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily:
        '"Inter","Roboto",system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif',
      h4: { fontWeight: 800, letterSpacing: '-0.02em' },
      h6: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 700 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
      },
      MuiTextField: {
        defaultProps: { fullWidth: true, size: 'medium' },
      },
    },
  })
}

