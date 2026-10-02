import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {resolve} from "path";

// Multi-page:
//   /          → index.html  (full static landing, 100% of the design)
//   /app.html  → app.html    (React + wagmi + RainbowKit)
//
// envDir points at the repo root so Foundry and Vite share one .env.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, ".."),
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
