import { randomBytes } from "node:crypto";
import { runClaude, sdkSessionSource } from "@noburi/provider-claude";
import { createApi } from "./api.ts";
import { RunManager } from "./runs.ts";
import { createRuntimeServer, listenLoopback } from "./server.ts";

const token = process.env.NOBURI_RUNTIME_TOKEN ?? randomBytes(32).toString("base64url");
const port = Number(process.env.NOBURI_RUNTIME_PORT ?? 0);
const allowedOrigins = (
  process.env.NOBURI_ALLOWED_ORIGINS ??
  "http://localhost:1420,tauri://localhost,http://tauri.localhost"
).split(",");

const api = createApi({ sessions: sdkSessionSource, runs: new RunManager(runClaude) });
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
