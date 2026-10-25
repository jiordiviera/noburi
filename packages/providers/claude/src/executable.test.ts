import { describe, expect, it } from "vite-plus/test";
import { findClaudeExecutable } from "./executable.ts";

/** A fake filesystem where only these paths are executable. */
const only =
  (...paths: string[]) =>
  (p: string) =>
    paths.includes(p);

describe("findClaudeExecutable", () => {
  it("prefers NOBURI_CLAUDE_BIN and never falls back when it is wrong", () => {
    expect(findClaudeExecutable({ NOBURI_CLAUDE_BIN: "/x/claude" }, only("/x/claude"))).toBe(
      "/x/claude",
    );
    expect(
      findClaudeExecutable(
        { NOBURI_CLAUDE_BIN: "/missing", PATH: "/usr/bin" },
        only("/usr/bin/claude"),
      ),
    ).toBeNull();
  });

  it("searches PATH, then the installer locations", () => {
    expect(findClaudeExecutable({ PATH: "/a:/b", HOME: "/h" }, only("/b/claude"))).toBe(
      "/b/claude",
    );
    expect(
      findClaudeExecutable({ PATH: "/usr/bin", HOME: "/h" }, only("/h/.local/bin/claude")),
    ).toBe("/h/.local/bin/claude");
    expect(findClaudeExecutable({ PATH: "", HOME: "/h" }, only())).toBeNull();
  });
});
