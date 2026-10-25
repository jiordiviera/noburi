import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type {
  ClaudeRunOptions,
  RunEvent,
  SessionInfo,
  SessionSource,
} from "@noburi/provider-claude";
import { createApi } from "./api.ts";
import { RunManager, type RunRecord } from "./runs.ts";
import { createRuntimeServer, listenLoopback } from "./server.ts";

const NOW = 1_800_000_000_000;

// Response bodies in these tests are checked field by field, so a loose type is enough.
// oxlint-disable-next-line typescript/no-explicit-any
const read = async (res: Response | Promise<Response>): Promise<any> => (await res).json();
const TOKEN = "test-token";
const OLD = "11111111-1111-1111-1111-111111111111";
const HOT = "22222222-2222-2222-2222-222222222222";
const GONE = "33333333-3333-3333-3333-333333333333";

const infos: SessionInfo[] = [
  { sessionId: OLD, summary: "Old work", lastModified: NOW - 3_600_000, cwd: "/w/app" },
  { sessionId: HOT, summary: "Busy", lastModified: NOW - 5_000, cwd: "/w/app" },
  { sessionId: GONE, summary: "Moved", lastModified: NOW - 9_000_000, cwd: "/w/moved" },
];

const sessions: SessionSource = {
  list: async () => infos,
  info: async (id) => infos.find((s) => s.sessionId === id),
  messages: async (_id, { offset, limit }) =>
    Array.from({ length: 5 }, (_, i) => ({
      type: "user" as const,
      uuid: `m${i}`,
      parent_tool_use_id: null,
      message: { content: `message ${i}` },
    })).slice(offset, offset + limit),
};

/** Fake Claude run: asks for one approval, then reports the result, or stops when aborted. */
async function* fakeRun(options: ClaudeRunOptions): AsyncGenerator<RunEvent> {
  yield {
    type: "session",
    sessionId: options.resumeSessionId ?? "new",
    model: "m",
    cwd: options.cwd,
    permissionMode: "default",
    apiKeySource: "none",
  };
  const approved = await options.requestApproval({
    approvalId: "ap1",
    toolName: "Bash",
    summary: "pnpm test",
    blockedPath: null,
  });
  if (options.signal.aborted) return;
  yield { type: "text", text: approved ? "ran tests" : "skipped tests" };
  yield {
    type: "result",
    ok: true,
    sessionId: "s",
    text: "done",
    numTurns: 1,
    durationMs: 1,
    usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsdEstimated: 0,
    measurementSource: "sdk.result",
  };
}

let server: Server | undefined;
let runs: RunManager;
let started: ClaudeRunOptions[];
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

async function start() {
  started = [];
  runs = new RunManager((options) => {
    started.push(options);
    return fakeRun(options);
  });
  const api = createApi({
    sessions,
    runs,
    now: () => NOW,
    fs: { isDirectory: (p) => p === "/w/app", exists: () => false },
  });
  server = createRuntimeServer({ token: TOKEN, allowedOrigins: [], api });
  const base = `http://127.0.0.1:${await listenLoopback(server)}`;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    });
  return { call };
}

function collect(runId: string): Promise<RunRecord[]> {
  return new Promise((resolve) => {
    const records: RunRecord[] = [];
    runs.subscribe(runId, 0, (r) => {
      records.push(r);
      if (r.event.type === "run.finished") resolve(records);
    });
  });
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe("discovery API", () => {
  it("lists projects with missing folders flagged", async () => {
    const { call } = await start();
    const body = await read(call("/discovery"));
    expect(body.scope).toMatch(/projects$/);
    expect(body.projects.map((p: { name: string; exists: boolean }) => [p.name, p.exists])).toEqual(
      [
        ["app", true],
        ["moved", false],
      ],
    );
  });

  it("pages transcript messages", async () => {
    const { call } = await start();
    const page = await read(call(`/sessions/${OLD}/messages?offset=0&limit=3`));
    expect(page.entries).toHaveLength(3);
    expect(page.hasMore).toBe(true);
    const last = await read(call(`/sessions/${OLD}/messages?offset=3&limit=3`));
    expect(last.hasMore).toBe(false);
  });

  it("rejects malformed session ids", async () => {
    const { call } = await start();
    expect((await call("/sessions/..%2Fetc/messages")).status).toBe(400);
  });
});

const post = (call: (p: string, i?: RequestInit) => Promise<Response>, body: unknown) =>
  call("/runs", { method: "POST", body: JSON.stringify(body) });

describe("resuming sessions", () => {
  it("resumes in the folder Claude recorded, ignoring a client cwd", async () => {
    const { call } = await start();
    const res = await post(call, { sessionId: OLD, prompt: "continue" });
    expect(res.status).toBe(201);
    expect(started[0]).toMatchObject({ cwd: "/w/app", resumeSessionId: OLD, fork: false });
    const bad = await post(call, { sessionId: OLD, prompt: "x", cwd: "/etc", fork: true });
    expect(bad.status).toBe(201);
    expect(started[1]?.cwd).toBe("/w/app");
  });

  it("refuses a session written to moments ago unless forced or forked", async () => {
    const { call } = await start();
    const refused = await post(call, { sessionId: HOT, prompt: "go" });
    expect(refused.status).toBe(409);
    expect((await read(refused)).code).toBe("recently_active");
    expect((await post(call, { sessionId: HOT, prompt: "go", fork: true })).status).toBe(201);
    expect((await post(call, { sessionId: HOT, prompt: "go", force: true })).status).toBe(201);
  });

  it("refuses to write to a session Noburi is already continuing", async () => {
    const { call } = await start();
    expect((await post(call, { sessionId: OLD, prompt: "one" })).status).toBe(201);
    const second = await post(call, { sessionId: OLD, prompt: "two" });
    expect((await read(second)).code).toBe("already_running");
  });

  it("refuses sessions whose folder is gone", async () => {
    const { call } = await start();
    const res = await post(call, { sessionId: GONE, prompt: "go" });
    expect((await read(res)).code).toBe("missing_folder");
  });

  it("waits for a human decision before a risky tool runs", async () => {
    const { call } = await start();
    const { runId } = await read(post(call, { sessionId: OLD, prompt: "test it" }));
    const done = collect(runId);
    await until(() => !runs.decide(runId, "nope", true) && started.length === 1);
    const decide = await call(`/runs/${runId}/approvals/ap1`, {
      method: "POST",
      body: JSON.stringify({ approved: false }),
    });
    expect(decide.status).toBe(200);
    const types = (await done).map((r) => r.event.type);
    expect(types).toEqual([
      "session",
      "approval.requested",
      "approval.resolved",
      "text",
      "result",
      "run.finished",
    ]);
    expect(runs.status(runId)).toBe("succeeded");
  });

  it("reports cancelled only after the run has stopped", async () => {
    const { call } = await start();
    const { runId } = await read(post(call, { sessionId: OLD, prompt: "long" }));
    const done = collect(runId);
    const cancel = await call(`/runs/${runId}/cancel`, { method: "POST" });
    expect(cancel.status).toBe(202);
    const records = await done;
    expect(records.at(-1)?.event).toEqual({ type: "run.finished", status: "cancelled" });
  });

  it("streams events over SSE with replay", async () => {
    const { call } = await start();
    const { runId } = await read(post(call, { sessionId: OLD, prompt: "x" }));
    await until(() => runs.decide(runId, "ap1", true));
    await until(() => runs.status(runId) === "succeeded");
    const text = await (await call(`/runs/${runId}/events?after=0`)).text();
    expect(text.match(/^data: /gm)).toHaveLength(6);
    expect(text).toContain('"status":"succeeded"');
  });
});
