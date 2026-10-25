import { execFile } from "node:child_process";
import { delimiter } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const START = "__NOBURI_PATH_START__";
const END = "__NOBURI_PATH_END__";

/** Extracts the PATH printed between markers; interactive shells often print banners around it. */
export function parseShellPath(output: string): string | null {
  const match = new RegExp(`${START}(.*?)${END}`, "s").exec(output);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

/** Login-shell entries first, then anything only the launcher had; no duplicates. */
export function mergePaths(fromShell: string, current: string): string {
  const seen = new Set<string>();
  return [...fromShell.split(delimiter), ...current.split(delimiter)]
    .filter((dir) => dir && !seen.has(dir) && seen.add(dir))
    .join(delimiter);
}

/**
 * Apps started from a desktop menu get a minimal PATH, so agents could not find npm, nvm's Node or
 * ~/.local/bin tools. Read the PATH the user's login shell sets up, as a terminal would.
 * Returns null when it cannot be read; the caller then keeps the current PATH.
 */
export async function loginShellPath(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  if (process.platform === "win32") return null;
  const shell = env["SHELL"] || "/bin/sh";
  try {
    const { stdout } = await run(shell, ["-ilc", `printf '${START}%s${END}' "$PATH"`], {
      env,
      timeout: 5000,
      maxBuffer: 1 << 20,
    });
    return parseShellPath(stdout);
  } catch {
    return null;
  }
}
