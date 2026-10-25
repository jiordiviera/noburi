import { mkdtempSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ClaudeRunOptions, RunEvent } from "@noburi/provider-claude";
import { createApi } from "./api.ts";
import { buildTaskPrompt, MissionService } from "./missions.ts";
import { RunManager } from "./runs.ts";
import { createRuntimeServer, listenLoopback } from "./server.ts";
import { Store, type EventRow } from "./store.ts";

type Script = "ok" | "fail" | "approve" | "hang";

const result = (ok: boolean, text: string): RunEvent => ({
  type: "result",
  ok,
  sessionId: "s",
  text,
  numTurns: 1,
  durationMs: 5,
  usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
  costUsdEstimated: 0,
  measurementSource: "sdk.result",
});

/** Fake Claude: each task's prompt says which script to follow ("[script:fail]" etc.). */
function fakeClaude(prompts: string[]) {
  return async function* run(options: ClaudeRunOptions): AsyncGenerator<RunEvent> {
    prompts.push(options.prompt);
    const script = (/\[script:(\w+)\]/.exec(options.prompt)?.[1] ?? "ok") as Script;
    yield {
      type: "session",
      sessionId: `session-${prompts.length}`,
      model: options.model ?? "?",
      cwd: options.cwd,
      permissionMode: "default",
      apiKeySource: "none",
    };
    yield { type: "tool.started", toolUseId: "t", name: "Read", summary: "README.md" };
    if (script === "approve") {
      const ok = await options.requestApproval({
        approvalId: "a1",
        toolName: "Bash",
        summary: "pnpm test",
        detail: "pnpm test",
        blockedPath: null,
      });
      yield { type: "text", text: ok ? "tests ran" : "skipped" };
    }
    if (script === "hang") {
      await new Promise<void>((resolve) => {
        if (options.signal.aborted) resolve();
        options.signal.addEventListener("abort", () => resolve());
      });
      return;
    }
    yield result(script !== "fail", script === "fail" ? "boom" : `done #${prompts.length}`);
  };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

function setup(path = ":memory:") {
  const prompts: string[] = [];
  const store = new Store(path);
  const runs = new RunManager(fakeClaude(prompts));
  const service = new MissionService(store, runs, { changes: async () => " M src/app.ts" });
  return { prompts, store, runs, service };
}

const events = (service: MissionService, id: string) => {
  const out: EventRow[] = [];
  service.subscribe(id, 0, (e) => out.push(e))();
  return out.map((e) => e.type);
};

describe("missions", () => {
  it("starts as a draft with a one-task plan, and runs nothing until started", () => {
    const { service, prompts } = setup();
    const view = service.create({ workspacePath: "/w", objective: "Add a README section" });
    expect(view.mission.status).toBe("DRAFT");
    expect(view.tasks.map((t) => [t.title, t.agentId, t.status])).toEqual([
      ["Carry out the objective", "developer", "PENDING"],
    ]);
    expect(prompts).toHaveLength(0);
  });

  it("runs tasks in dependency order and passes earlier results forward", async () => {
    const { service, store, prompts } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "Improve tests" });
    service.setPlan(mission.id, [
      { title: "Analyse", instructions: "Find gaps", agentId: "architect", dependsOn: [] },
      { title: "Implement", instructions: "Write tests", agentId: "developer", dependsOn: [0] },
    ]);
    service.start(mission.id);
    await until(() => store.getMission(mission.id)?.status === "COMPLETED");

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Results from the tasks this one depends on");
    expect(prompts[1]).toContain("done #1");
    expect(store.listTasks(mission.id).map((t) => [t.status, t.sessionId])).toEqual([
      ["SUCCEEDED", "session-1"],
      ["SUCCEEDED", "session-2"],
    ]);
    expect(store.listArtifacts(mission.id).map((a) => a.kind)).toEqual([
      "summary",
      "summary",
      "diff",
    ]);
    const types = events(service, mission.id);
    expect(types[0]).toBe("mission.created");
    expect(types.at(-1)).toBe("mission.completed");
    expect(types.filter((t) => t === "task.started")).toHaveLength(2);
    expect(types).toContain("usage.updated");
  });

  it("stops the mission when a task fails and never starts the tasks after it", async () => {
    const { service, store, prompts } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "x" });
    service.setPlan(mission.id, [
      { title: "Break", instructions: "[script:fail]", agentId: "developer", dependsOn: [] },
      { title: "Never", instructions: "after", agentId: "developer", dependsOn: [0] },
    ]);
    service.start(mission.id);
    await until(() => store.getMission(mission.id)?.status === "FAILED");
    expect(prompts).toHaveLength(1);
    expect(store.listTasks(mission.id).map((t) => t.status)).toEqual(["FAILED", "CANCELLED"]);
    expect(store.listTasks(mission.id)[0]?.error).toBe("boom");
  });

  it("shows WAITING_APPROVAL until a human decides", async () => {
    const { service, store, runs } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "[script:approve]" });
    service.start(mission.id);
    await until(() => store.listTasks(mission.id)[0]?.status === "WAITING_APPROVAL");
    const runId = service.view(mission.id)?.activeRunId ?? "";
    expect(runs.decide(runId, "a1", true)).toBe(true);
    await until(() => store.getMission(mission.id)?.status === "COMPLETED");
    expect(events(service, mission.id)).toEqual(
      expect.arrayContaining(["approval.requested", "approval.resolved"]),
    );
  });

  it("reports CANCELLED only after the running task has stopped", async () => {
    const { service, store } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "[script:hang]" });
    service.setPlan(mission.id, [
      { title: "Long", instructions: "[script:hang]", agentId: "developer", dependsOn: [] },
      { title: "Later", instructions: "x", agentId: "developer", dependsOn: [0] },
    ]);
    service.start(mission.id);
    await until(() => store.listTasks(mission.id)[0]?.status === "RUNNING");
    service.cancel(mission.id);
    expect(store.getMission(mission.id)?.status).toBe("RUNNING");
    await until(() => store.getMission(mission.id)?.status === "CANCELLED");
    expect(store.listTasks(mission.id).map((t) => t.status)).toEqual(["CANCELLED", "CANCELLED"]);
  });

  it("marks running work INTERRUPTED after a restart and keeps its history", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "noburi-")), "noburi.db");
    const first = setup(path);
    const { mission } = first.service.create({ workspacePath: "/w", objective: "[script:hang]" });
    first.service.start(mission.id);
    await until(() => first.store.listTasks(mission.id)[0]?.status === "RUNNING");
    // Simulate a crash: stop listening to the run, then drop the database without finishing it.
    first.runs.cancel(first.service.view(mission.id)?.activeRunId ?? "");
    await new Promise((r) => setTimeout(r, 20));
    first.store.setMissionStatus(mission.id, "RUNNING");
    first.store.updateTask(first.store.listTasks(mission.id)[0]?.id ?? "", { status: "RUNNING" });
    first.store.close();

    const reopened = new Store(path);
    expect(reopened.reconcileAfterRestart()).toEqual([mission.id]);
    expect(reopened.getMission(mission.id)?.status).toBe("INTERRUPTED");
    expect(reopened.listTasks(mission.id)[0]?.status).toBe("INTERRUPTED");
    expect(reopened.listEvents(mission.id).map((e) => e.type)).toContain("task.started");
    reopened.close();
  });

  it("builds prompts that state the role, the objective and the honesty rule", () => {
    const { service } = setup();
    const view = service.create({ workspacePath: "/w", objective: "Ship docs" });
    const prompt = buildTaskPrompt(view.mission, view.tasks[0]!, view.tasks);
    expect(prompt).toContain("You are the Developer");
    expect(prompt).toContain("Mission objective: Ship docs");
    expect(prompt).toContain("Say clearly if something was not done or not verified.");
  });
});

describe("missions API", () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  async function start() {
    const { service, store, runs } = setup();
    const api = createApi({
      sessions: { list: async () => [], info: async () => undefined, messages: async () => [] },
      runs,
      missions: { service, store },
      fs: { isDirectory: (p) => p === "/w", exists: () => false },
    });
    server = createRuntimeServer({ token: "t", allowedOrigins: [], api });
    const base = `http://127.0.0.1:${await listenLoopback(server)}`;
    return (path: string, method = "GET", body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
  }

  it("refuses a workspace that does not exist", async () => {
    const call = await start();
    expect(
      (await call("/missions", "POST", { workspacePath: "/nope", objective: "x" })).status,
    ).toBe(409);
    expect(
      (await call("/missions", "POST", { workspacePath: "relative", objective: "x" })).status,
    ).toBe(400);
  });

  it("validates plans: at most three tasks, known agents, dependencies on earlier tasks only", async () => {
    const call = await start();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const created = (await (
      await call("/missions", "POST", { workspacePath: "/w", objective: "x" })
    ).json()) as {
      mission: { id: string };
    };
    const plan = (tasks: unknown[]) =>
      call(`/missions/${created.mission.id}/plan`, "PUT", { tasks });
    const task = { title: "t", instructions: "i", agentId: "developer", dependsOn: [] };
    expect((await plan([task, task, task, task])).status).toBe(400);
    expect((await plan([{ ...task, agentId: "ghost" }])).status).toBe(400);
    expect((await plan([task, { ...task, dependsOn: [1] }])).status).toBe(400);
    expect((await plan([task, { ...task, dependsOn: [0] }])).status).toBe(200);
  });
});
