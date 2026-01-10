import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { createAppTheme } from './theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={createAppTheme(window.location.hostname.split('.')[0] === 'superadmin' || !window.location.hostname.includes('.') ? 'superadmin' : 'tenant')}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
