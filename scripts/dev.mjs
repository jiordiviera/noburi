// Dev launcher: starts the runtime, waits for its ready line, then starts the desktop UI wired to it.
// This mirrors what the Tauri shell will do; the session token only ever travels over loopback.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const UI_ORIGIN = "http://localhost:1420";
const children = [];

function run(args, env) {
  const child = spawn("pnpm", args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "inherit"],
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code !== 0 && code !== null)
      process.stderr.write(`[dev] pnpm ${args.join(" ")} exited with ${code}\n`);
    shutdown();
  });
  return child;
}

function shutdown() {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const runtime = run(["--filter", "@noburi/runtime", "start"], {
  NOBURI_ALLOWED_ORIGINS: UI_ORIGIN,
});
const lines = createInterface({ input: runtime.stdout });
let ui;
function readyLine(line) {
  try {
    const parsed = JSON.parse(line);
    return parsed.event === "runtime.ready" ? parsed : null;
  } catch {
    return null;
  }
}

lines.on("line", (line) => {
  const ready = ui ? null : readyLine(line);
  if (!ready) {
    process.stdout.write(`[runtime] ${line}\n`);
    return;
  }
  process.stdout.write(`[dev] runtime on 127.0.0.1:${ready.port}\n`);
  ui = run(["--filter", "@noburi/desktop", "dev"], {
    VITE_NOBURI_RUNTIME_URL: `http://127.0.0.1:${ready.port}`,
    VITE_NOBURI_RUNTIME_TOKEN: ready.token,
  });
  ui.stdout.pipe(process.stdout);
});
