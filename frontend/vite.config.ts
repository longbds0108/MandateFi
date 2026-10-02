import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {resolve} from "path";

export default defineConfig({
  plugins: [react()],
  // Share the top-level .env with Foundry so there's a single source of truth
  // for addresses, RPC URL and (optionally) WalletConnect project id.
  envDir: resolve(__dirname, ".."),
  server: {
    port: 5173,
    host: true,
  },
});
