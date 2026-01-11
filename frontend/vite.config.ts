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
  plugins: [react()],
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
