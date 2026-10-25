import { describe, expect, it } from "vite-plus/test";
import type { Agent, MissionEvent, MissionTask, TaskStatus } from "@/lib/runtime";
import { deriveOffice } from "./officeState";

const agents: Agent[] = [
  { id: "developer", name: "Developer", role: "", model: "sonnet", avatar: "developer" },
  { id: "architect", name: "Architect", role: "", model: "opus", avatar: "reviewer" },
  { id: "researcher", name: "Researcher", role: "", model: "haiku", avatar: "researcher" },
];

const task = (id: string, agentId: string, status: TaskStatus, position = 0): MissionTask => ({
  id,
  missionId: "m",
  position,
  title: `Task ${id}`,
  instructions: "",
  dependsOn: [],
  agentId,
  status,
  sessionId: null,
  resultText: null,
  error: status === "FAILED" ? "boom" : null,
});

let seq = 0;
const event = (
  taskId: string,
  type: string,
  payload: Record<string, unknown> = {},
): MissionEvent => ({
  seq: ++seq,
  taskId,
  type,
  payload,
  at: "2026-10-25T00:00:00Z",
});

const visual = (agentId: string, office: ReturnType<typeof deriveOffice>) =>
  office.find((a) => a.agentId === agentId);

describe("deriveOffice", () => {
  it("shows nobody working when no mission runs", () => {
    const office = deriveOffice(agents, [], [], null);
    expect(office.map((a) => [a.visual, a.label])).toEqual([
      ["idle", "Not on this mission"],
      ["idle", "Not on this mission"],
      ["idle", "Not on this mission"],
    ]);
  });

  it("works only while a tool is actually running, and thinks otherwise", () => {
    const tasks = [task("t1", "developer", "RUNNING")];
    const started = [
      event("t1", "task.started"),
      event("t1", "tool.started", { toolUseId: "u1", name: "Bash", summary: "npm test" }),
    ];
    expect(visual("developer", deriveOffice(agents, tasks, started, "RUNNING"))).toMatchObject({
      visual: "working",
      detail: "Bash · npm test",
    });
    const finished = [...started, event("t1", "tool.completed", { toolUseId: "u1" })];
    expect(visual("developer", deriveOffice(agents, tasks, finished, "RUNNING"))?.visual).toBe(
      "thinking",
    );
  });

  it("asks for the human only while an approval is pending", () => {
    const tasks = [task("t1", "developer", "WAITING_APPROVAL")];
    const events = [
      event("t1", "approval.requested", { toolName: "Bash", summary: "rm -rf build" }),
    ];
    expect(visual("developer", deriveOffice(agents, tasks, events, "RUNNING"))).toMatchObject({
      visual: "waiting",
      label: "Needs you",
      detail: "Bash · rm -rf build",
    });
  });

  it("never animates a run once the mission is no longer running", () => {
    const tasks = [task("t1", "developer", "RUNNING")];
    const events = [event("t1", "tool.started", { toolUseId: "u1", name: "Read", summary: "a" })];
    expect(visual("developer", deriveOffice(agents, tasks, events, "INTERRUPTED"))?.visual).toBe(
      "idle",
    );
  });

  it("reflects outcomes per agent: done, failed, up next", () => {
    const tasks = [
      task("t1", "architect", "SUCCEEDED", 0),
      task("t2", "developer", "FAILED", 1),
      task("t3", "researcher", "PENDING", 2),
    ];
    const office = deriveOffice(agents, tasks, [], "RUNNING");
    expect(office.map((a) => [a.agentId, a.visual, a.label])).toEqual([
      ["developer", "error", "Failed"],
      ["architect", "done", "Done"],
      ["researcher", "idle", "Up next"],
    ]);
  });
});
