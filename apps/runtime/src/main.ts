import { randomBytes } from "node:crypto";
import { findClaudeExecutable, runClaude, sdkSessionSource } from "@noburi/provider-claude";
import { createApi } from "./api.ts";
import { MissionService } from "./missions.ts";
import { RunManager } from "./runs.ts";
import { createRuntimeServer, listenLoopback } from "./server.ts";
import { defaultDatabasePath, Store } from "./store.ts";

const token = process.env.NOBURI_RUNTIME_TOKEN ?? randomBytes(32).toString("base64url");
const port = Number(process.env.NOBURI_RUNTIME_PORT ?? 0);
const allowedOrigins = (
  process.env.NOBURI_ALLOWED_ORIGINS ??
  "http://localhost:1420,tauri://localhost,http://tauri.localhost"
).split(",");

const store = new Store(process.env.NOBURI_DB ?? defaultDatabasePath());
// Nothing survives a restart as "running": interrupted work is shown as such, never resumed silently.
store.reconcileAfterRestart();
// Packaged builds do not ship the SDK's Claude binary: they run the user's installed Claude Code CLI.
const packaged = process.env.NOBURI_PACKAGED === "1";
const claudeExecutable = packaged || process.env.NOBURI_CLAUDE_BIN ? findClaudeExecutable() : null;
if (packaged && !claudeExecutable) {
  process.stderr.write("Claude Code CLI not found: install it or set NOBURI_CLAUDE_BIN.\n");
}
const runs = new RunManager((options) =>
  runClaude({ ...options, ...(claudeExecutable ? { executable: claudeExecutable } : {}) }),
);
const missions = { service: new MissionService(store, runs), store };
const api = createApi({ sessions: sdkSessionSource, runs, missions });
const server = createRuntimeServer({ token, allowedOrigins, api });
const boundPort = await listenLoopback(server, port);

// The desktop shell reads this line from stdout to connect; the token is never logged elsewhere.
process.stdout.write(`${JSON.stringify({ event: "runtime.ready", port: boundPort, token })}\n`);

const shutdown = () => server.close(() => process.exit(0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, shutdown);

// Set by the desktop shell: if it dies without stopping us, its pipe closes and we leave too.
if (process.env.NOBURI_EXIT_ON_STDIN_CLOSE === "1") {
  process.stdin.on("end", shutdown);
  process.stdin.resume();
}
