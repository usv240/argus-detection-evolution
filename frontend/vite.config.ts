import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5180,
    proxy: {
      // 127.0.0.1 (not localhost) avoids the Windows IPv6 (::1) vs IPv4 mismatch with the backend.
      "/api": { target: "http://127.0.0.1:8810", changeOrigin: true },
    },
  },
});
