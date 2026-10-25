import { fileURLToPath, URL } from "node:url";
import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Port 1420 is the Tauri convention; strict so the shell and runtime CORS list stay in sync.
export default defineConfig({
  // lazyPlugins skips loading plugins when Vite+ only lints or checks.
  plugins: lazyPlugins(() => [react(), tailwindcss()]) ?? [],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 1420, strictPort: true, host: "localhost" },
  clearScreen: false,
});
