import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: "..",
  plugins: [react(), tailwindcss()],
  build: { sourcemap: true },
  // Same-origin /api in dev and preview, matching the nginx proxy in production.
  server: { proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:4000" } },
  preview: { proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:4000" } },
});
