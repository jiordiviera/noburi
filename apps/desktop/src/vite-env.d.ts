/// <reference types="vite-plus/client" />

interface ImportMetaEnv {
  /** Set by `pnpm dev` (scripts/dev.mjs) from the runtime's ready line; Tauri will inject these later. */
  readonly VITE_NOBURI_RUNTIME_URL?: string;
  readonly VITE_NOBURI_RUNTIME_TOKEN?: string;
}
