import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: ["khudroo.com", ".khudroo.com"],
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
  },
});
