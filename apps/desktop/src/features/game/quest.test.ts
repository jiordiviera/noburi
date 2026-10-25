import { describe, expect, it } from "vite-plus/test";
import type { MissionEvent } from "@/lib/runtime";
import { questSteps } from "./quest";

let seq = 0;
const ev = (type: string, payload: Record<string, unknown> = {}): MissionEvent => ({
  seq: ++seq,
  taskId: "t",
  type,
  payload,
  at: "2026-10-25T00:00:00Z",
});
const tool = (id: string, name: string, summary: string, isError = false) => [
  ev("tool.started", { toolUseId: id, name, summary }),
  ev("tool.completed", { toolUseId: id, isError }),
];
const stateOf = (steps: ReturnType<typeof questSteps>) =>
  Object.fromEntries(steps.map((s) => [s.id, s.state]));

describe("quest steps", () => {
  it("checks off a step only when its command succeeded", () => {
    const events = [
      ev("mission.started"),
      ...tool("1", "Bash", "git fetch origin && git checkout -b noburi/issue-1 origin/main"),
      ...tool("2", "Edit", "/w/todo.js"),
      ...tool("3", "Bash", "npm test", true),
    ];
    expect(stateOf(questSteps({ events, status: "RUNNING", pullRequest: null }))).toEqual({
      take: "done",
      branch: "done",
      change: "done",
      tests: "active",
      commit: "todo",
      push: "todo",
      pr: "todo",
      deliver: "todo",
    });
  });

  it("reads the whole command, not the clipped summary", () => {
    const long = `cat >> todo.test.js <<'EOF'\n${"x".repeat(200)}\nEOF\nnpm test`;
    const events = [
      ev("mission.started"),
      ev("tool.started", {
        toolUseId: "1",
        name: "Bash",
        summary: long.slice(0, 160),
        detail: long,
      }),
      ev("tool.completed", { toolUseId: "1", isError: false }),
    ];
    expect(stateOf(questSteps({ events, status: "RUNNING", pullRequest: null }))["tests"]).toBe(
      "done",
    );
  });

  it("marks the step the player is asked about as waiting", () => {
    const events = [
      ev("mission.started"),
      ...tool("1", "Bash", "npm test"),
      ...tool("2", "Bash", 'git commit -m "Fix"'),
      ev("approval.requested", {
        approvalId: "a1",
        toolName: "Bash",
        summary: "git push -u origin noburi/issue-1",
        detail: "git push -u origin noburi/issue-1",
      }),
    ];
    const steps = stateOf(questSteps({ events, status: "RUNNING", pullRequest: null }));
    expect(steps["push"]).toBe("waiting");
    expect(steps["branch"]).toBe("todo");
    expect(Object.values(steps).filter((s) => s === "active")).toEqual([]);
  });

  it("delivers only with a pull request", () => {
    const events = [ev("mission.started"), ...tool("1", "Bash", "gh pr create --fill")];
    expect(stateOf(questSteps({ events, status: "COMPLETED", pullRequest: null }))["deliver"]).toBe(
      "todo",
    );
    expect(
      stateOf(
        questSteps({ events, status: "COMPLETED", pullRequest: "https://github.com/o/r/pull/5" }),
      )["deliver"],
    ).toBe("done");
  });
});
