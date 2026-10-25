import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds the user's Claude Code CLI for packaged builds, where the SDK's own binary is not shipped.
 * Order: NOBURI_CLAUDE_BIN, then PATH, then the locations the official installers use. Desktop
 * launchers often start apps with a minimal PATH, hence the fallbacks.
 */
export function findClaudeExecutable(
  env: NodeJS.ProcessEnv = process.env,
  check: (path: string) => boolean = isExecutable,
): string | null {
  const explicit = env["NOBURI_CLAUDE_BIN"];
  if (explicit) return check(explicit) ? explicit : null;
  const home = env["HOME"] ?? "";
  const candidates = [
    ...(env["PATH"] ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((dir) => join(dir, "claude")),
    join(home, ".local", "bin", "claude"),
    join(home, ".claude", "local", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  return candidates.find((path) => check(path)) ?? null;
}
