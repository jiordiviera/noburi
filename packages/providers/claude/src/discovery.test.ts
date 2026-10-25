import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import {
  findGitRoot,
  groupSessions,
  RECENT_ACTIVITY_MS,
  type DiscoveryFs,
  type SessionInfo,
} from "./discovery.ts";

const NOW = 1_800_000_000_000;

function fakeFs(dirs: string[], gitDirs: string[] = []): DiscoveryFs {
  return {
    isDirectory: (p) => dirs.includes(p),
    exists: (p) => gitDirs.some((g) => p === `${g}/.git`),
  };
}

const session = (id: string, cwd: string | undefined, ageMs: number): SessionInfo => ({
  sessionId: id,
  summary: `summary ${id}`,
  lastModified: NOW - ageMs,
  cwd,
});

describe("groupSessions", () => {
  it("groups by working directory and sorts by last activity", () => {
    const projects = groupSessions(
      [
        session("a1", "/w/alpha", 5000),
        session("b1", "/w/beta", 1000),
        session("a2", "/w/alpha", 3000),
      ],
      fakeFs(["/w/alpha", "/w/beta"]),
      NOW,
    );
    expect(projects.map((p) => p.name)).toEqual(["beta", "alpha"]);
    expect(projects[1]?.sessions.map((s) => s.id)).toEqual(["a2", "a1"]);
  });

  it("reports missing folders without dropping their sessions", () => {
    const [project] = groupSessions([session("x", "/gone", 10_000_000)], fakeFs([]), NOW);
    expect(project?.exists).toBe(false);
    expect(project?.sessions).toHaveLength(1);
  });

  it("keeps sessions with no recorded folder in their own group", () => {
    const [project] = groupSessions([session("n", undefined, 1)], fakeFs([]), NOW);
    expect(project?.path).toBeNull();
    expect(project?.name).toBe("Unknown folder");
  });

  it("flags sessions written to in the last minutes", () => {
    const [project] = groupSessions(
      [session("hot", "/w", 1000), session("cold", "/w", RECENT_ACTIVITY_MS + 1)],
      fakeFs(["/w"]),
      NOW,
    );
    expect(project?.sessions.map((s) => [s.id, s.recentlyActive])).toEqual([
      ["hot", true],
      ["cold", false],
    ]);
  });

  it("gives each path a stable id", () => {
    const a = groupSessions([session("1", "/w/a", 1)], fakeFs(["/w/a"]), NOW)[0]?.id;
    const b = groupSessions([session("2", "/w/a", 9)], fakeFs(["/w/a"]), NOW)[0]?.id;
    expect(a).toBe(b);
    expect(a).toMatch(/^[\w-]{16}$/);
  });
});

describe("findGitRoot", () => {
  it("walks up to the repository root", () => {
    expect(findGitRoot("/w/repo/packages/app", fakeFs([], ["/w/repo"]))).toBe("/w/repo");
    expect(findGitRoot("/tmp/loose", fakeFs([]))).toBeNull();
  });
});

describe("read-only scanner", () => {
  it("never imports an SDK function that writes sessions", () => {
    const source = readFileSync(new URL("./source.ts", import.meta.url), "utf8");
    const imports =
      source.match(/import \{([^}]*)\} from "@anthropic-ai\/claude-agent-sdk"/)?.[1] ?? "";
    for (const writer of [
      "deleteSession",
      "renameSession",
      "tagSession",
      "forkSession",
      "importSession",
    ]) {
      expect(imports).not.toContain(writer);
    }
  });
});
