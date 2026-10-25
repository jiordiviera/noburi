import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import type { ClaudeRunOptions, RunEvent } from "@noburi/provider-claude";
import { MissionService } from "./missions.ts";
import { RunManager } from "./runs.ts";
import { Store } from "./store.ts";
import { processedTokens, usageSummary } from "./usage.ts";

/** Fake Claude that reports 10 input + 20 output + 5 cache read + 1 cache write tokens per run. */
async function* reportingRun(options: ClaudeRunOptions): AsyncGenerator<RunEvent> {
  yield {
    type: "session",
    sessionId: "s",
    model: options.model ?? "?",
    cwd: options.cwd,
    permissionMode: "default",
    apiKeySource: "none",
  };
  yield {
    type: "result",
    ok: true,
    sessionId: "s",
    text: "done",
    numTurns: 1,
    durationMs: 1,
    usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 1 },
    costUsdEstimated: 0.5,
    measurementSource: "sdk.result",
  };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

function setup() {
  const store = new Store(":memory:");
  const service = new MissionService(store, new RunManager(reportingRun), {
    changes: async () => null,
  });
  return { store, service };
}

describe("usage", () => {
  it("adds up only what the SDK reported, by agent and model", async () => {
    const { store, service } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "x" });
    service.setPlan(mission.id, [
      { title: "a", instructions: "a", agentId: "architect", dependsOn: [] },
      { title: "b", instructions: "b", agentId: "developer", dependsOn: [0] },
    ]);
    service.start(mission.id);
    await until(() => store.getMission(mission.id)?.status === "COMPLETED");

    const summary = usageSummary(store);
    expect(summary.totals).toMatchObject({
      inputTokens: 20,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 2,
      runs: 2,
    });
    expect(summary.byAgentModel.map((u) => [u.agentId, u.model, u.runs])).toEqual(
      expect.arrayContaining([
        ["architect", "opus", 1],
        ["developer", "sonnet", 1],
      ]),
    );
    expect(summary.sources).toEqual(["sdk.result"]);
    expect(summary.apiKeySources).toEqual(["none"]);
    expect(processedTokens(summary.totals)).toBe(72);
  });

  it("reports nothing rather than zeros when no run has reported usage", () => {
    const { store, service } = setup();
    service.create({ workspacePath: "/w", objective: "draft only" });
    const summary = usageSummary(store);
    expect(summary.totals.runs).toBe(0);
    expect(summary.byAgentModel).toEqual([]);
    expect(summary.sources).toEqual([]);
  });

  it("stops before the next task once the budget is used, never mid-run", async () => {
    const { store, service } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "x", budgetTokens: 30 });
    service.setPlan(mission.id, [
      { title: "first", instructions: "a", agentId: "developer", dependsOn: [] },
      { title: "second", instructions: "b", agentId: "developer", dependsOn: [0] },
    ]);
    service.start(mission.id);
    await until(() => store.getMission(mission.id)?.status === "CANCELLED");
    expect(store.listTasks(mission.id).map((t) => t.status)).toEqual(["SUCCEEDED", "CANCELLED"]);
    const stop = store.listEvents(mission.id).find((e) => e.type === "mission.cancelled");
    expect(stop?.payload).toEqual({ reason: "budget", usedTokens: 36, budgetTokens: 30 });
  });

  it("adds the budget column to databases made by the previous version", () => {
    const path = join(mkdtempSync(join(tmpdir(), "noburi-")), "old.db");
    const old = new DatabaseSync(path);
    old.exec(
      "create table missions (id text primary key, workspace_path text not null, title text not null, objective text not null, status text not null, created_at text not null, started_at text, finished_at text)",
    );
    old.exec(
      "insert into missions values ('11111111-1111-1111-1111-111111111111', '/w', 't', 'o', 'COMPLETED', '2026-10-25T00:00:00Z', null, null)",
    );
    old.close();
    const store = new Store(path);
    expect(store.listMissions()[0]).toMatchObject({ title: "t", budgetTokens: null });
    store.close();
  });
});
