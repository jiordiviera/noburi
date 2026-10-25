import { describe, expect, it } from "vite-plus/test";
import { loginShellPath, mergePaths, parseShellPath } from "./shellPath.ts";

describe("login shell PATH", () => {
  it("ignores banners printed by interactive shells", () => {
    const output =
      "Welcome to zsh!\n__NOBURI_PATH_START__/home/u/.nvm/bin:/usr/bin__NOBURI_PATH_END__\nbye";
    expect(parseShellPath(output)).toBe("/home/u/.nvm/bin:/usr/bin");
    expect(parseShellPath("no markers here")).toBeNull();
  });

  it("puts the shell's entries first and keeps the launcher's extras, without duplicates", () => {
    expect(mergePaths("/home/u/.nvm/bin:/usr/bin", "/usr/bin:/bin")).toBe(
      "/home/u/.nvm/bin:/usr/bin:/bin",
    );
  });

  it("reads the PATH from a real login shell", async () => {
    const path = await loginShellPath({
      ...process.env,
      SHELL: "/bin/sh",
      PATH: "/custom/bin:/usr/bin:/bin",
    });
    expect(path).toContain("/custom/bin");
  });
});
