import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 1420 is the Tauri convention; strict so the shell and runtime CORS list stay in sync.
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, strictPort: true, host: "localhost" },
  clearScreen: false,
});
