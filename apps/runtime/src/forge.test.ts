import { mkdtempSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ClaudeRunOptions, RunEvent, SessionSource } from "@noburi/provider-claude";
import { createApi } from "./api.ts";
import { GitHubForge, issueInstructions, type Exec } from "./forge.ts";
import { MissionService } from "./missions.ts";
import { RunManager } from "./runs.ts";
import { createRuntimeServer, listenLoopback } from "./server.ts";
import { Store } from "./store.ts";

// oxlint-disable-next-line typescript/no-explicit-any
const read = async (res: Response | Promise<Response>): Promise<any> => (await res).json();

const ISSUE = {
  number: 1,
  title: "remaining() counts finished items",
  body: "It should count open ones.",
  url: "https://github.com/o/r/issues/1",
  labels: [{ name: "bug", color: "d73a4a" }],
};

/** Records every command; answers like gh would for a repository with one issue. */
function fakeGh() {
  const calls: string[][] = [];
  const exec: Exec = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === "issue" && args[1] === "list") return JSON.stringify([ISSUE]);
    if (args[0] === "issue" && args[1] === "view") return JSON.stringify(ISSUE);
    if (args[0] === "repo" && args[1] === "clone") {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(String(args[3]), ".git"), { recursive: true });
      return "";
    }
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  return { exec, calls };
}

describe("GitHub forge", () => {
  it("reads open issues through gh and clones a repository only once", async () => {
    const { exec, calls } = fakeGh();
    const forge = new GitHubForge(exec, mkdtempSync(join(tmpdir(), "noburi-ws-")));
    expect(await forge.listIssues("o/r")).toEqual([ISSUE]);
    const first = await forge.workspace("o/r");
    expect(await forge.workspace("o/r")).toBe(first);
    expect(first).toMatch(/o\/r$/);
    expect(calls.filter((c) => c[1] === "repo")).toHaveLength(1);
  });

  it("refuses anything that is not owner/name before running a command", async () => {
    const { exec, calls } = fakeGh();
    const forge = new GitHubForge(exec, tmpdir());
    await expect(forge.listIssues("o/r --web")).rejects.toThrow(/not a GitHub repository/);
    await expect(forge.workspace("../etc")).rejects.toThrow(/not a GitHub repository/);
    await expect(forge.workspace("o/..")).rejects.toThrow(/not a GitHub repository/);
    expect(calls).toEqual([]);
  });

  it("asks the agent for a branch and a pull request, never a merge", () => {
    const text = issueInstructions("o/r", ISSUE);
    expect(text).toContain("noburi/issue-1");
    expect(text).toContain("Closes #1");
    expect(text).toContain("Do not merge anything.");
    expect(text).toContain("no AI co-author");
    expect(text).toContain("Only if the tests pass");
  });
});

let server: Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

async function start() {
  const seen: ClaudeRunOptions[] = [];
  const releases: (() => void)[] = [];
  const gate = new Promise<void>((r) => releases.push(r));
  const release = () => releases.forEach((r) => r());
  async function* run(options: ClaudeRunOptions): AsyncGenerator<RunEvent> {
    seen.push(options);
    await gate;
    yield {
      type: "result",
      ok: true,
      sessionId: "s",
      text: "https://github.com/o/r/pull/2",
      numTurns: 1,
      durationMs: 1,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsdEstimated: 0,
      measurementSource: "sdk.result",
    };
  }
  const store = new Store(":memory:");
  const runs = new RunManager(run);
  const service = new MissionService(store, runs, { changes: async () => null });
  const sessions: SessionSource = {
    list: async () => [],
    info: async () => undefined,
    messages: async () => [],
  };
  const forge = new GitHubForge(fakeGh().exec, mkdtempSync(join(tmpdir(), "noburi-ws-")));
  const api = createApi({ sessions, runs, missions: { service, store }, forge });
  server = createRuntimeServer({ token: "t", allowedOrigins: [], api });
  const base = `http://127.0.0.1:${await listenLoopback(server)}`;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { authorization: "Bearer t", "content-type": "application/json" },
    });
  return { call, seen, release };
}

describe("work on an issue", () => {
  it("lists the board's issues", async () => {
    const { call } = await start();
    const body = await read(call("/forge/issues?repo=o/r"));
    expect(body.issues.map((i: { number: number }) => i.number)).toEqual([1]);
    expect((await call("/forge/issues?repo=bad")).status).toBe(400);
  });

  it("starts a developer mission in the clone, linked to the issue, once at a time", async () => {
    const { call, seen, release } = await start();
    const work = () =>
      call("/forge/work", { method: "POST", body: JSON.stringify({ repo: "o/r", number: 1 }) });
    const res = await work();
    expect(res.status).toBe(201);
    const view = await read(res);
    expect(view.mission.issueRef).toBe("o/r#1");
    expect(view.mission.status).toBe("RUNNING");
    expect(view.tasks).toHaveLength(1);
    expect(view.tasks[0].agentId).toBe("developer");
    for (let i = 0; i < 100 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    expect(seen[0]?.cwd).toMatch(/o\/r$/);
    expect(seen[0]?.prompt).toContain("Closes #1");

    const again = await work();
    expect(again.status).toBe(409);
    expect((await read(again)).code).toBe("already_working");
    release();
  });
});
