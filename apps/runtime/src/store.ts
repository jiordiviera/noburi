import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EventType, MissionStatus, TaskStatus } from "@noburi/core";
import { z } from "zod";

export interface MissionRow {
  id: string;
  workspacePath: string;
  title: string;
  objective: string;
  status: MissionStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Optional token budget; no new task starts once the mission has used this many. */
  budgetTokens: number | null;
}

export interface TaskRow {
  id: string;
  missionId: string;
  position: number;
  title: string;
  instructions: string;
  dependsOn: string[];
  agentId: string;
  status: TaskStatus;
  /** Claude Code session this task ran in, once known. */
  sessionId: string | null;
  resultText: string | null;
  error: string | null;
}

export interface EventRow {
  missionId: string;
  seq: number;
  taskId: string | null;
  type: EventType;
  payload: Record<string, unknown>;
  at: string;
}

export interface ArtifactRow {
  id: string;
  missionId: string;
  taskId: string | null;
  kind: "summary" | "diff" | "log";
  title: string;
  content: string;
  createdAt: string;
}

export interface PlannedTask {
  title: string;
  instructions: string;
  agentId: string;
  /** Positions (0-based) of earlier tasks this one waits for. */
  dependsOn: number[];
}

const SCHEMA = `
create table if not exists missions (
  id text primary key,
  workspace_path text not null,
  title text not null,
  objective text not null,
  status text not null,
  created_at text not null,
  started_at text,
  finished_at text
);
create table if not exists tasks (
  id text primary key,
  mission_id text not null references missions(id) on delete cascade,
  position integer not null,
  title text not null,
  instructions text not null,
  depends_on text not null,
  agent_id text not null,
  status text not null,
  session_id text,
  result_text text,
  error text
);
create index if not exists tasks_by_mission on tasks(mission_id, position);
create table if not exists events (
  mission_id text not null references missions(id) on delete cascade,
  seq integer not null,
  task_id text,
  type text not null,
  payload text not null,
  at text not null,
  primary key (mission_id, seq)
);
create table if not exists artifacts (
  id text primary key,
  mission_id text not null references missions(id) on delete cascade,
  task_id text,
  kind text not null,
  title text not null,
  content text not null,
  created_at text not null
);
`;

/** Default data location per OS; NOBURI_DATA_DIR overrides it. */
export function defaultDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env["NOBURI_DATA_DIR"]) return join(env["NOBURI_DATA_DIR"], "noburi.db");
  const home = homedir();
  if (process.platform === "darwin")
    return join(home, "Library", "Application Support", "Noburi", "noburi.db");
  if (process.platform === "win32")
    return join(env["APPDATA"] ?? join(home, "AppData", "Roaming"), "Noburi", "noburi.db");
  return join(env["XDG_DATA_HOME"] ?? join(home, ".local", "share"), "noburi", "noburi.db");
}

type Row = Record<string, unknown>;
const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "bigint" ? String(v) : "";
const ArtifactKind = z.enum(["summary", "diff", "log"]);
/** Rows are re-validated on read: a hand-edited or corrupted database fails loudly, not subtly. */
function payloadOf(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
const maybe = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Durable mission state. Every status change and event is written before it is broadcast, so a
 * restart finds exactly what the UI last saw.
 */
export class Store {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
    this.#db.exec(SCHEMA);
    this.#migrate();
  }

  close(): void {
    this.#db.close();
  }

  #now(): string {
    return new Date().toISOString();
  }

  /** Runs `fn` atomically. */
  transaction<T>(fn: () => T): T {
    this.#db.exec("begin immediate");
    try {
      const result = fn();
      this.#db.exec("commit");
      return result;
    } catch (error) {
      this.#db.exec("rollback");
      throw error;
    }
  }

  /** Additive, idempotent schema changes for databases created by earlier versions. */
  #migrate(): void {
    const columns = this.#db
      .prepare("pragma table_info(missions)")
      .all()
      .map((r) => text(r["name"]));
    if (!columns.includes("budget_tokens"))
      this.#db.exec("alter table missions add column budget_tokens integer");
  }

  createMission(input: {
    workspacePath: string;
    title: string;
    objective: string;
    budgetTokens?: number | null | undefined;
  }): MissionRow {
    const mission: MissionRow = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      title: input.title,
      objective: input.objective,
      status: "DRAFT",
      createdAt: this.#now(),
      startedAt: null,
      finishedAt: null,
      budgetTokens: input.budgetTokens ?? null,
    };
    this.#db
      .prepare(
        "insert into missions (id, workspace_path, title, objective, status, created_at, budget_tokens) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        mission.id,
        mission.workspacePath,
        mission.title,
        mission.objective,
        mission.status,
        mission.createdAt,
        mission.budgetTokens,
      );
    return mission;
  }

  #mission(row: Row): MissionRow {
    return {
      id: text(row["id"]),
      workspacePath: text(row["workspace_path"]),
      title: text(row["title"]),
      objective: text(row["objective"]),
      status: MissionStatus.parse(row["status"]),
      createdAt: text(row["created_at"]),
      startedAt: maybe(row["started_at"]),
      finishedAt: maybe(row["finished_at"]),
      budgetTokens: typeof row["budget_tokens"] === "number" ? row["budget_tokens"] : null,
    };
  }

  getMission(id: string): MissionRow | undefined {
    const row = this.#db.prepare("select * from missions where id = ?").get(id);
    return row ? this.#mission(row) : undefined;
  }

  listMissions(): MissionRow[] {
    return this.#db
      .prepare("select * from missions order by created_at desc")
      .all()
      .map((r) => this.#mission(r));
  }

  setMissionStatus(id: string, status: MissionStatus): void {
    const now = this.#now();
    this.#db
      .prepare(
        `update missions set status = ?,
           started_at = case when ? = 'RUNNING' and started_at is null then ? else started_at end,
           finished_at = case when ? in ('COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED') then ? else finished_at end
         where id = ?`,
      )
      .run(status, status, now, status, now, id);
  }

  deleteMission(id: string): void {
    this.#db.prepare("delete from missions where id = ?").run(id);
  }

  /** Replaces a draft's plan. */
  replacePlan(missionId: string, plan: readonly PlannedTask[]): TaskRow[] {
    return this.transaction(() => {
      this.#db.prepare("delete from tasks where mission_id = ?").run(missionId);
      const ids = plan.map(() => randomUUID());
      const insert = this.#db.prepare(
        "insert into tasks (id, mission_id, position, title, instructions, depends_on, agent_id, status) values (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      plan.forEach((task, position) => {
        const deps = task.dependsOn.flatMap((i) => {
          const id = ids[i];
          return id ? [id] : [];
        });
        insert.run(
          ids[position] ?? "",
          missionId,
          position,
          task.title,
          task.instructions,
          JSON.stringify(deps),
          task.agentId,
          "PENDING",
        );
      });
      return this.listTasks(missionId);
    });
  }

  #task(row: Row): TaskRow {
    const deps: unknown = JSON.parse(text(row["depends_on"]) || "[]");
    return {
      id: text(row["id"]),
      missionId: text(row["mission_id"]),
      position: Number(row["position"]),
      title: text(row["title"]),
      instructions: text(row["instructions"]),
      dependsOn: Array.isArray(deps) ? deps.map(String) : [],
      agentId: text(row["agent_id"]),
      status: TaskStatus.parse(row["status"]),
      sessionId: maybe(row["session_id"]),
      resultText: maybe(row["result_text"]),
      error: maybe(row["error"]),
    };
  }

  listTasks(missionId: string): TaskRow[] {
    return this.#db
      .prepare("select * from tasks where mission_id = ? order by position")
      .all(missionId)
      .map((r) => this.#task(r));
  }

  updateTask(
    id: string,
    fields: Partial<Pick<TaskRow, "status" | "sessionId" | "resultText" | "error">>,
  ): void {
    const columns: Record<string, string> = {
      status: "status",
      sessionId: "session_id",
      resultText: "result_text",
      error: "error",
    };
    const entries = Object.entries(fields).filter(([key]) => key in columns);
    if (entries.length === 0) return;
    const set = entries.map(([key]) => `${columns[key]} = ?`).join(", ");
    this.#db
      .prepare(`update tasks set ${set} where id = ?`)
      .run(...entries.map(([, value]) => (value === undefined ? null : value)), id);
  }

  appendEvent(
    missionId: string,
    type: EventType,
    payload: Record<string, unknown>,
    taskId: string | null = null,
  ): EventRow {
    return this.transaction(() => {
      const last = this.#db
        .prepare("select coalesce(max(seq), 0) as seq from events where mission_id = ?")
        .get(missionId);
      const event: EventRow = {
        missionId,
        seq: Number(last?.["seq"] ?? 0) + 1,
        taskId,
        type,
        payload,
        at: this.#now(),
      };
      this.#db
        .prepare(
          "insert into events (mission_id, seq, task_id, type, payload, at) values (?, ?, ?, ?, ?, ?)",
        )
        .run(missionId, event.seq, taskId, type, JSON.stringify(payload), event.at);
      return event;
    });
  }

  listEvents(missionId: string, afterSeq = 0): EventRow[] {
    return this.#db
      .prepare("select * from events where mission_id = ? and seq > ? order by seq")
      .all(missionId, afterSeq)
      .map((row) => ({
        missionId: text(row["mission_id"]),
        seq: Number(row["seq"]),
        taskId: maybe(row["task_id"]),
        type: EventType.parse(row["type"]),
        payload: payloadOf(text(row["payload"])),
        at: text(row["at"]),
      }));
  }

  addArtifact(input: Omit<ArtifactRow, "id" | "createdAt">): ArtifactRow {
    const artifact: ArtifactRow = { id: randomUUID(), createdAt: this.#now(), ...input };
    this.#db
      .prepare(
        "insert into artifacts (id, mission_id, task_id, kind, title, content, created_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        artifact.id,
        artifact.missionId,
        artifact.taskId,
        artifact.kind,
        artifact.title,
        artifact.content,
        artifact.createdAt,
      );
    return artifact;
  }

  listArtifacts(missionId: string): ArtifactRow[] {
    return this.#db
      .prepare("select * from artifacts where mission_id = ? order by created_at")
      .all(missionId)
      .map((row) => ({
        id: text(row["id"]),
        missionId: text(row["mission_id"]),
        taskId: maybe(row["task_id"]),
        kind: ArtifactKind.parse(row["kind"]),
        title: text(row["title"]),
        content: text(row["content"]),
        createdAt: text(row["created_at"]),
      }));
  }

  /**
   * After a crash or restart nothing is still running: active work is marked INTERRUPTED and is
   * never restarted automatically. Returns the affected mission ids.
   */
  reconcileAfterRestart(): string[] {
    return this.transaction(() => {
      const active = this.#db
        .prepare("select id from missions where status = 'RUNNING'")
        .all()
        .map((r) => text(r["id"]));
      this.#db
        .prepare(
          "update tasks set status = 'INTERRUPTED' where status in ('RUNNING', 'WAITING_APPROVAL')",
        )
        .run();
      for (const id of active) this.setMissionStatus(id, "INTERRUPTED");
      return active;
    });
  }
}
