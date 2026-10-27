import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertTransition,
  type AgentEnvironment,
  type EventType,
  type TaskStatus,
} from "@noburi/core";
import { agentById, AGENTS } from "./agents.ts";
import type { RunManager, RunRecord } from "./runs.ts";
import type { EventRow, MissionRow, PlannedTask, Store, TaskRow } from "./store.ts";
import { missionUsage, processedTokens } from "./usage.ts";

const run = promisify(execFile);

/** Read-only summary of what changed in the workspace; null outside a git repository. */
export async function gitChanges(cwd: string): Promise<string | null> {
  try {
    const [stat, status] = await Promise.all([
      run("git", ["diff", "--stat", "HEAD"], { cwd, maxBuffer: 1 << 20 }),
      run("git", ["status", "--short"], { cwd, maxBuffer: 1 << 20 }),
    ]);
    // trimEnd keeps the leading space git uses in "XY path" status codes.
    const out = [status.stdout.trimEnd(), stat.stdout.trimEnd()].filter(Boolean).join("\n\n");
    return out || "No changes in the working tree.";
  } catch {
    return null;
  }
}

export interface MissionView {
  mission: MissionRow;
  tasks: TaskRow[];
  /** Run currently executing for this mission, for approvals and the live stream. */
  activeRunId: string | null;
}

interface Active {
  taskId: string;
  runId: string;
  unsubscribe: (() => void) | undefined;
  usage: Record<string, unknown> | null;
  failure: string | null;
  apiKeySource: string | null;
}

export interface MissionServiceOptions {
  changes?: (cwd: string) => Promise<string | null>;
}

const MAX_PREVIOUS_RESULT = 2000;

export function buildTaskPrompt(
  mission: MissionRow,
  task: TaskRow,
  tasks: readonly TaskRow[],
): string {
  const agent = agentById(task.agentId);
  const earlier = tasks
    .filter((t) => task.dependsOn.includes(t.id) && t.resultText)
    .map((t) => `- ${t.title}:\n${(t.resultText ?? "").slice(0, MAX_PREVIOUS_RESULT)}`);
  return [
    `You are the ${agent?.name ?? "agent"} in a Noburi mission. ${agent?.role ?? ""}`.trim(),
    `Mission objective: ${mission.objective}`,
    `Your task (${task.position + 1} of ${tasks.length}): ${task.title}`,
    task.instructions,
    earlier.length > 0 ? `Results from the tasks this one depends on:\n${earlier.join("\n")}` : "",
    "Work only inside the current folder. When you are done, reply with a short summary: what you did, the files you changed, and the commands or tests you ran with their real results. Say clearly if something was not done or not verified.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Runs missions: a validated plan of up to three tasks executed one at a time through Claude Code,
 * each starting only when the tasks it depends on succeeded. All state lives in the Store.
 */
export class MissionService {
  readonly #listeners = new Map<string, Set<(event: EventRow) => void>>();
  readonly #active = new Map<string, Active>();
  readonly #changes: (cwd: string) => Promise<string | null>;

  constructor(
    private readonly store: Store,
    private readonly runs: RunManager,
    options: MissionServiceOptions = {},
  ) {
    this.#changes = options.changes ?? gitChanges;
  }

  view(missionId: string): MissionView | undefined {
    const mission = this.store.getMission(missionId);
    if (!mission) return undefined;
    return {
      mission,
      tasks: this.store.listTasks(missionId),
      activeRunId: this.#active.get(missionId)?.runId ?? null,
    };
  }

  list(): MissionRow[] {
    return this.store.listMissions();
  }

  create(input: {
    workspacePath: string;
    objective: string;
    title?: string | undefined;
    budgetTokens?: number | undefined;
    environment?: AgentEnvironment | undefined;
    issueRef?: string | undefined;
  }): MissionView {
    const title =
      input.title?.trim() || input.objective.trim().split("\n")[0]?.slice(0, 80) || "Mission";
    const mission = this.store.createMission({
      workspacePath: input.workspacePath,
      title,
      objective: input.objective.trim(),
      budgetTokens: input.budgetTokens,
      environment: input.environment,
      issueRef: input.issueRef,
    });
    // A starting point the user reviews and edits; nothing runs until they start the mission.
    this.store.replacePlan(mission.id, [
      {
        title: "Carry out the objective",
        instructions: mission.objective,
        agentId: "developer",
        dependsOn: [],
      },
    ]);
    this.#emit(mission.id, "mission.created", { title, workspacePath: mission.workspacePath });
    return this.#viewOrThrow(mission.id);
  }

  setPlan(missionId: string, plan: readonly PlannedTask[]): MissionView {
    const mission = this.#require(missionId);
    if (mission.status !== "DRAFT")
      throw new MissionError("only a draft mission can be re-planned", "not_draft");
    this.store.replacePlan(missionId, plan);
    this.#emit(missionId, "mission.planned", {
      tasks: plan.map((t) => ({ title: t.title, agentId: t.agentId, dependsOn: t.dependsOn })),
    });
    return this.#viewOrThrow(missionId);
  }

  setEnvironment(missionId: string, environment: AgentEnvironment): MissionView {
    const mission = this.#require(missionId);
    if (mission.status !== "DRAFT")
      throw new MissionError("only a draft mission can change its environment", "not_draft");
    this.store.setEnvironment(missionId, environment);
    return this.#viewOrThrow(missionId);
  }

  start(missionId: string): MissionView {
    const mission = this.#require(missionId);
    if (mission.status !== "DRAFT")
      throw new MissionError("this mission has already run", "not_draft");
    if (this.store.listTasks(missionId).length === 0)
      throw new MissionError("the plan is empty", "empty_plan");
    this.store.setMissionStatus(missionId, "RUNNING");
    this.#emit(missionId, "mission.started", {});
    this.#advance(missionId);
    return this.#viewOrThrow(missionId);
  }

  /** Requests a stop. The mission only becomes CANCELLED once the running task has really ended. */
  cancel(missionId: string): MissionView {
    const mission = this.#require(missionId);
    if (mission.status !== "RUNNING")
      throw new MissionError("this mission is not running", "not_running");
    const active = this.#active.get(missionId);
    if (active) this.runs.cancel(active.runId);
    else this.#finishCancelled(missionId);
    return this.#viewOrThrow(missionId);
  }

  delete(missionId: string): void {
    const mission = this.#require(missionId);
    if (mission.status === "RUNNING")
      throw new MissionError("stop the mission before deleting it", "running");
    this.store.deleteMission(missionId);
  }

  subscribe(missionId: string, afterSeq: number, listener: (event: EventRow) => void): () => void {
    for (const event of this.store.listEvents(missionId, afterSeq)) listener(event);
    const set = this.#listeners.get(missionId) ?? new Set();
    set.add(listener);
    this.#listeners.set(missionId, set);
    return () => set.delete(listener);
  }

  #viewOrThrow(missionId: string): MissionView {
    const view = this.view(missionId);
    if (!view) throw new MissionError("mission not found", "not_found", 404);
    return view;
  }

  #require(missionId: string): MissionRow {
    const mission = this.store.getMission(missionId);
    if (!mission) throw new MissionError("mission not found", "not_found", 404);
    return mission;
  }

  #emit(
    missionId: string,
    type: EventType,
    payload: Record<string, unknown>,
    taskId: string | null = null,
  ): void {
    const event = this.store.appendEvent(missionId, type, payload, taskId);
    for (const listener of this.#listeners.get(missionId) ?? []) listener(event);
  }

  #setTask(
    task: TaskRow,
    status: TaskStatus,
    extra: Partial<Pick<TaskRow, "sessionId" | "resultText" | "error">> = {},
  ): void {
    assertTransition(task.status, status);
    this.store.updateTask(task.id, { status, ...extra });
    task.status = status;
  }

  #advance(missionId: string): void {
    const mission = this.store.getMission(missionId);
    if (!mission || mission.status !== "RUNNING" || this.#active.has(missionId)) return;
    const tasks = this.store.listTasks(missionId);

    if (tasks.some((t) => t.status === "FAILED")) {
      for (const t of tasks) if (t.status === "PENDING") this.#setTask(t, "CANCELLED");
      this.store.setMissionStatus(missionId, "FAILED");
      this.#emit(missionId, "mission.failed", { reason: "a task failed" });
      return;
    }

    const done = new Set(tasks.filter((t) => t.status === "SUCCEEDED").map((t) => t.id));
    const next = tasks.find(
      (t) => t.status === "PENDING" && t.dependsOn.every((id) => done.has(id)),
    );
    if (next) {
      // The budget is checked before each task: a call already running is never cut off.
      const used = processedTokens(missionUsage(this.store.listEvents(missionId)));
      if (mission.budgetTokens !== null && used >= mission.budgetTokens) {
        for (const t of tasks) if (t.status === "PENDING") this.#setTask(t, "CANCELLED");
        this.store.setMissionStatus(missionId, "CANCELLED");
        this.#emit(missionId, "mission.cancelled", {
          reason: "budget",
          usedTokens: used,
          budgetTokens: mission.budgetTokens,
        });
        return;
      }
      this.#launch(mission, next, tasks);
      return;
    }

    if (tasks.every((t) => t.status === "SUCCEEDED")) void this.#complete(mission);
  }

  #launch(mission: MissionRow, task: TaskRow, tasks: TaskRow[]): void {
    const agent = agentById(task.agentId) ?? AGENTS[0];
    this.#setTask(task, "READY");
    this.#setTask(task, "RUNNING");
    const runId = this.runs.create({
      prompt: buildTaskPrompt(mission, task, tasks),
      cwd: mission.workspacePath,
      model: agent?.model,
      environment: mission.environment,
    });
    const active: Active = {
      taskId: task.id,
      runId,
      unsubscribe: undefined,
      usage: null,
      failure: null,
      apiKeySource: null,
    };
    this.#active.set(mission.id, active);
    this.#emit(
      mission.id,
      "task.started",
      { title: task.title, agentId: task.agentId, model: agent?.model, runId },
      task.id,
    );
    this.#emit(
      mission.id,
      "agent.status.changed",
      { agentId: task.agentId, status: "working" },
      task.id,
    );
    active.unsubscribe = this.runs.subscribe(runId, 0, (record) =>
      this.#onRecord(mission.id, task, active, record),
    );
  }

  #onRecord(missionId: string, task: TaskRow, active: Active, { event }: RunRecord): void {
    const id = task.id;
    switch (event.type) {
      case "session":
        this.store.updateTask(id, { sessionId: event.sessionId });
        active.apiKeySource = event.apiKeySource;
        break;
      case "text":
        this.#emit(missionId, "agent.message", { agentId: task.agentId, text: event.text }, id);
        break;
      case "tool.started":
        this.#emit(
          missionId,
          "tool.started",
          {
            toolUseId: event.toolUseId,
            name: event.name,
            summary: event.summary,
            detail: event.detail,
          },
          id,
        );
        break;
      case "tool.completed":
        this.#emit(
          missionId,
          "tool.completed",
          { toolUseId: event.toolUseId, isError: event.isError, text: event.text },
          id,
        );
        break;
      case "approval.requested":
        if (task.status === "RUNNING") this.#setTask(task, "WAITING_APPROVAL");
        this.#emit(
          missionId,
          "approval.requested",
          {
            runId: active.runId,
            approvalId: event.approvalId,
            toolName: event.toolName,
            summary: event.summary,
            detail: event.detail,
            blockedPath: event.blockedPath,
          },
          id,
        );
        this.#emit(
          missionId,
          "agent.status.changed",
          { agentId: task.agentId, status: "waiting_approval" },
          id,
        );
        break;
      case "approval.resolved":
        if (task.status === "WAITING_APPROVAL") this.#setTask(task, "RUNNING");
        this.#emit(
          missionId,
          "approval.resolved",
          { approvalId: event.approvalId, approved: event.approved },
          id,
        );
        this.#emit(
          missionId,
          "agent.status.changed",
          { agentId: task.agentId, status: "working" },
          id,
        );
        break;
      case "result":
        active.usage = {
          ...event.usage,
          costUsdEstimated: event.costUsdEstimated,
          measurementSource: event.measurementSource,
          apiKeySource: active.apiKeySource ?? "unknown",
        };
        this.#emit(missionId, "usage.updated", { agentId: task.agentId, ...active.usage }, id);
        if (event.ok) this.store.updateTask(id, { resultText: event.text });
        else active.failure = event.text ?? "Claude reported an error.";
        break;
      case "error":
        active.failure = event.message;
        break;
      case "run.finished":
        this.#onRunFinished(missionId, task, active, event.status);
        break;
      default:
        break;
    }
  }

  #onRunFinished(missionId: string, task: TaskRow, active: Active, status: string): void {
    active.unsubscribe?.();
    this.#active.delete(missionId);
    if (task.status === "WAITING_APPROVAL") this.#setTask(task, "RUNNING");

    if (status === "cancelled") {
      this.#setTask(task, "CANCELLED");
      this.#emit(missionId, "task.cancelled", {}, task.id);
      this.#emit(
        missionId,
        "agent.status.changed",
        { agentId: task.agentId, status: "idle" },
        task.id,
      );
      this.#finishCancelled(missionId);
      return;
    }

    if (status === "succeeded") {
      const resultText =
        this.store.listTasks(missionId).find((t) => t.id === task.id)?.resultText ?? "";
      this.#setTask(task, "SUCCEEDED");
      this.#emit(missionId, "task.succeeded", {}, task.id);
      this.#emit(
        missionId,
        "agent.status.changed",
        { agentId: task.agentId, status: "done" },
        task.id,
      );
      if (resultText) {
        const artifact = this.store.addArtifact({
          missionId,
          taskId: task.id,
          kind: "summary",
          title: task.title,
          content: resultText,
        });
        this.#emit(
          missionId,
          "artifact.created",
          { artifactId: artifact.id, kind: artifact.kind, title: artifact.title },
          task.id,
        );
      }
    } else {
      const error = active.failure ?? "The run ended without a result.";
      this.#setTask(task, "FAILED", { error });
      this.#emit(missionId, "task.failed", { error }, task.id);
      this.#emit(
        missionId,
        "agent.status.changed",
        { agentId: task.agentId, status: "error" },
        task.id,
      );
    }
    this.#advance(missionId);
  }

  #finishCancelled(missionId: string): void {
    for (const t of this.store.listTasks(missionId)) {
      if (t.status === "PENDING" || t.status === "READY") this.#setTask(t, "CANCELLED");
    }
    this.store.setMissionStatus(missionId, "CANCELLED");
    this.#emit(missionId, "mission.cancelled", {});
  }

  async #complete(mission: MissionRow): Promise<void> {
    const changes = await this.#changes(mission.workspacePath).catch(() => null);
    // The mission may have been stopped while the changes were being read.
    if (this.store.getMission(mission.id)?.status !== "RUNNING") return;
    if (changes) {
      const artifact = this.store.addArtifact({
        missionId: mission.id,
        taskId: null,
        kind: "diff",
        title: "Changes in the workspace (git)",
        content: changes,
      });
      this.#emit(mission.id, "artifact.created", {
        artifactId: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
      });
    }
    this.store.setMissionStatus(mission.id, "COMPLETED");
    this.#emit(mission.id, "mission.completed", {});
  }
}

export class MissionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
