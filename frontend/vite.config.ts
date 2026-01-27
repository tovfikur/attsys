import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const hmrProtocol = process.env.VITE_HMR_PROTOCOL;
const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
  ? Number(process.env.VITE_HMR_CLIENT_PORT)
  : undefined;
const hmrHost = process.env.VITE_HMR_HOST;
const hmrPort = process.env.VITE_HMR_PORT
  ? Number(process.env.VITE_HMR_PORT)
  : undefined;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'configure-response-headers',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          // Override any external CSP that might be blocking scripts
          res.setHeader('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "connect-src 'self' ws: wss: http://localhost:5170 http://demo.localhost:5170 https://khudroo.com; " +
            "img-src 'self' data: blob: http: https:; " +
            "font-src 'self' data: https://fonts.gstatic.com; " +
            "object-src 'none'; " +
            "base-uri 'self';"
          );
          next();
        });
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    hmr:
      hmrProtocol || hmrClientPort || hmrHost || hmrPort
        ? {
            protocol: (hmrProtocol as "ws" | "wss" | undefined) || undefined,
            clientPort: hmrClientPort,
            host: hmrHost,
            port: hmrPort,
          }
        : undefined,
  },
});
