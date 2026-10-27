import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite-plus";

// The public website: two static pages, no framework. Pixel art comes from the repo's assets/.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        download: fileURLToPath(new URL("./download.html", import.meta.url)),
      },
    },
  },
  server: { port: 1440, strictPort: true, host: "localhost" },
});
