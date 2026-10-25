import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { ENVIRONMENT_PRESETS } from "@noburi/core";
import type { ClaudeRunOptions, RunEvent } from "@noburi/provider-claude";
import { MissionService } from "./missions.ts";
import { RunManager } from "./runs.ts";
import { Store } from "./store.ts";

function setup() {
  const seen: ClaudeRunOptions[] = [];
  async function* run(options: ClaudeRunOptions): AsyncGenerator<RunEvent> {
    seen.push(options);
    yield {
      type: "result",
      ok: true,
      sessionId: "s",
      text: "done",
      numTurns: 1,
      durationMs: 1,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsdEstimated: 0,
      measurementSource: "sdk.result",
    };
  }
  const store = new Store(":memory:");
  const service = new MissionService(store, new RunManager(run), { changes: async () => null });
  return { store, service, seen };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe("agent environment", () => {
  it("defaults to the project's own settings, without the user's global setup", () => {
    const { service } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "x" });
    expect(mission.environment).toEqual(ENVIRONMENT_PRESETS.project);
  });

  it("reaches every run of the mission", async () => {
    const { store, service, seen } = setup();
    const { mission } = service.create({
      workspacePath: "/w",
      objective: "x",
      environment: ENVIRONMENT_PRESETS.isolated,
    });
    service.start(mission.id);
    await until(() => store.getMission(mission.id)?.status === "COMPLETED");
    expect(seen[0]?.environment).toEqual(ENVIRONMENT_PRESETS.isolated);
  });

  it("can only change while the mission is a draft", async () => {
    const { store, service } = setup();
    const { mission } = service.create({ workspacePath: "/w", objective: "x" });
    expect(
      service.setEnvironment(mission.id, ENVIRONMENT_PRESETS.terminal).mission.environment,
    ).toEqual(ENVIRONMENT_PRESETS.terminal);
    service.start(mission.id);
    await until(() => store.getMission(mission.id)?.status === "COMPLETED");
    expect(() => service.setEnvironment(mission.id, ENVIRONMENT_PRESETS.isolated)).toThrow(/draft/);
  });

  it("shows missions from before this change as having used the full terminal setup", () => {
    const path = join(mkdtempSync(join(tmpdir(), "noburi-")), "old.db");
    const old = new DatabaseSync(path);
    old.exec(
      "create table missions (id text primary key, workspace_path text not null, title text not null, objective text not null, status text not null, created_at text not null, started_at text, finished_at text, budget_tokens integer)",
    );
    old.exec(
      "insert into missions values ('11111111-1111-1111-1111-111111111111', '/w', 't', 'o', 'COMPLETED', '2026-10-25T00:00:00Z', null, null, null)",
    );
    old.close();
    const store = new Store(path);
    expect(store.listMissions()[0]?.environment).toEqual(ENVIRONMENT_PRESETS.terminal);
    store.close();
  });
});
