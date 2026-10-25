import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute } from "node:path";
import { z } from "zod";
import {
  claudeProjectsDir,
  groupSessions,
  nodeFs,
  normalizeTranscript,
  RECENT_ACTIVITY_MS,
  type DiscoveryFs,
  type SessionSource,
} from "@noburi/provider-claude";
import { AGENTS, agentById } from "./agents.ts";
import { MissionError, type MissionService } from "./missions.ts";
import type { RunManager } from "./runs.ts";
import type { Store } from "./store.ts";

export interface ApiDeps {
  sessions: SessionSource;
  runs: RunManager;
  /** Missions are optional so session-only setups and tests can omit them. */
  missions?: { service: MissionService; store: Store };
  fs?: DiscoveryFs;
  now?: () => number;
}

export type ApiHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;

const MAX_BODY_BYTES = 64 * 1024;
const SESSION_ID = /^[0-9a-f-]{8,64}$/i;

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "body too large");
    chunks.push(buf);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const CreateRunBody = z.strictObject({
  prompt: z.string().trim().min(1).max(20_000),
  /** Resume this native Claude Code session; omit to start a new one in `cwd`. */
  sessionId: z.string().regex(SESSION_ID).optional(),
  /** Only for new sessions; a resumed session always runs in the folder it was recorded in. */
  cwd: z.string().min(1).optional(),
  fork: z.boolean().default(false),
  /** Resume even though the session was written to moments ago, possibly by another process. */
  force: z.boolean().default(false),
});

const DecisionBody = z.strictObject({ approved: z.boolean() });

const MISSION_ID = /^[0-9a-f-]{36}$/i;

const CreateMissionBody = z.strictObject({
  workspacePath: z.string().min(1),
  objective: z.string().trim().min(1).max(4000),
  title: z.string().trim().max(120).optional(),
});

const PlanBody = z
  .strictObject({
    tasks: z
      .array(
        z.strictObject({
          title: z.string().trim().min(1).max(120),
          instructions: z.string().trim().min(1).max(8000),
          agentId: z.string().refine((id) => agentById(id) !== undefined, "unknown agent"),
          dependsOn: z.array(z.number().int().nonnegative()).max(2).default([]),
        }),
      )
      .min(1, "a plan needs at least one task")
      .max(3, "the alpha runs at most three tasks per mission"),
  })
  .superRefine((plan, ctx) => {
    // Depending only on earlier tasks keeps the plan acyclic by construction.
    plan.tasks.forEach((task, index) => {
      if (task.dependsOn.some((dep) => dep >= index)) {
        ctx.addIssue({
          code: "custom",
          message: `task ${index + 1} can only depend on earlier tasks`,
        });
      }
    });
  });

function sse(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}

export function createApi(deps: ApiDeps): ApiHandler {
  const fs = deps.fs ?? nodeFs;
  const now = deps.now ?? Date.now;

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/discovery") {
      const sessions = await deps.sessions.list();
      json(res, 200, { scope: claudeProjectsDir(), projects: groupSessions(sessions, fs, now()) });
      return true;
    }

    if (
      method === "GET" &&
      parts[0] === "sessions" &&
      parts[2] === "messages" &&
      parts.length === 3
    ) {
      const id = parts[1] ?? "";
      if (!SESSION_ID.test(id)) throw new HttpError(400, "invalid session id");
      const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
      // Ask for one extra message to know whether another page exists.
      const raw = await deps.sessions.messages(id, { offset, limit: limit + 1 });
      json(res, 200, {
        offset,
        limit,
        hasMore: raw.length > limit,
        entries: normalizeTranscript(raw.slice(0, limit)),
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/runs") {
      const body = CreateRunBody.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "invalid body");
      const { prompt, sessionId, fork, force } = body.data;
      let cwd: string;
      if (sessionId) {
        // Never trust a client-supplied folder for an existing session: use what Claude recorded.
        const info = await deps.sessions.info(sessionId);
        if (!info) throw new HttpError(404, "session not found");
        if (!info.cwd) throw new HttpError(409, "this session has no recorded folder", "no_cwd");
        cwd = info.cwd;
        if (!fork && deps.runs.activeSessionIds().has(sessionId)) {
          throw new HttpError(409, "Noburi is already continuing this session", "already_running");
        }
        if (!fork && !force && now() - info.lastModified < RECENT_ACTIVITY_MS) {
          throw new HttpError(409, "this session was written to moments ago", "recently_active");
        }
      } else {
        if (!body.data.cwd || !isAbsolute(body.data.cwd))
          throw new HttpError(400, "an absolute cwd is required");
        cwd = body.data.cwd;
      }
      if (!fs.isDirectory(cwd))
        throw new HttpError(409, "the project folder is missing", "missing_folder");
      const runId = deps.runs.create({ prompt, cwd, resumeSessionId: sessionId, fork });
      json(res, 201, { runId, cwd });
      return true;
    }

    if (method === "GET" && url.pathname === "/agents") {
      json(res, 200, { agents: AGENTS });
      return true;
    }

    if (parts[0] === "missions" && deps.missions) {
      const { service, store } = deps.missions;

      if (parts.length === 1 && method === "GET") {
        json(res, 200, {
          missions: service
            .list()
            .map((mission) => ({ mission, tasks: store.listTasks(mission.id) })),
        });
        return true;
      }

      if (parts.length === 1 && method === "POST") {
        const body = CreateMissionBody.safeParse(await readJson(req));
        if (!body.success)
          throw new HttpError(400, body.error.issues[0]?.message ?? "invalid body");
        const { workspacePath } = body.data;
        if (!isAbsolute(workspacePath))
          throw new HttpError(400, "the workspace must be an absolute path");
        if (!fs.isDirectory(workspacePath))
          throw new HttpError(409, "the workspace folder does not exist", "missing_folder");
        json(res, 201, service.create(body.data));
        return true;
      }

      const missionId = parts[1] ?? "";
      if (!MISSION_ID.test(missionId)) throw new HttpError(400, "invalid mission id");

      if (parts.length === 2 && method === "GET") {
        const view = service.view(missionId);
        if (!view) throw new HttpError(404, "mission not found");
        json(res, 200, { ...view, artifacts: store.listArtifacts(missionId) });
        return true;
      }

      if (parts.length === 2 && method === "DELETE") {
        service.delete(missionId);
        json(res, 200, { ok: true });
        return true;
      }

      if (parts.length === 3 && parts[2] === "plan" && method === "PUT") {
        const body = PlanBody.safeParse(await readJson(req));
        if (!body.success)
          throw new HttpError(400, body.error.issues[0]?.message ?? "invalid plan");
        json(res, 200, service.setPlan(missionId, body.data.tasks));
        return true;
      }

      if (parts.length === 3 && parts[2] === "start" && method === "POST") {
        json(res, 200, service.start(missionId));
        return true;
      }

      if (parts.length === 3 && parts[2] === "cancel" && method === "POST") {
        // 202: the mission reports CANCELLED only once its running task has really stopped.
        json(res, 202, service.cancel(missionId));
        return true;
      }

      if (parts.length === 3 && parts[2] === "events" && method === "GET") {
        if (!service.view(missionId)) throw new HttpError(404, "mission not found");
        const after = Number(url.searchParams.get("after") ?? 0) || 0;
        sse(res);
        const unsubscribe = service.subscribe(missionId, after, (event) => {
          res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
        });
        req.on("close", unsubscribe);
        return true;
      }
    }

    if (parts[0] === "runs" && parts[1]) {
      const runId = parts[1];
      if (deps.runs.status(runId) === undefined) throw new HttpError(404, "run not found");

      if (method === "GET" && parts[2] === "events" && parts.length === 3) {
        const after = Number(url.searchParams.get("after") ?? 0) || 0;
        sse(res);
        const unsubscribe = deps.runs.subscribe(runId, after, (record) => {
          res.write(`id: ${record.seq}\ndata: ${JSON.stringify(record)}\n\n`);
          if (record.event.type === "run.finished") res.end();
        });
        req.on("close", () => unsubscribe?.());
        return true;
      }

      if (method === "POST" && parts[2] === "approvals" && parts[3] && parts.length === 4) {
        const body = DecisionBody.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "approved must be a boolean");
        if (!deps.runs.decide(runId, parts[3], body.data.approved)) {
          throw new HttpError(409, "this approval is no longer pending");
        }
        json(res, 200, { ok: true });
        return true;
      }

      if (method === "POST" && parts[2] === "cancel" && parts.length === 3) {
        const requested = deps.runs.cancel(runId);
        // 202: cancellation is requested; the event stream reports when the run has really stopped.
        json(res, requested ? 202 : 409, { status: deps.runs.status(runId) });
        return true;
      }
    }

    return false;
  }

  return async (req, res, url) => {
    try {
      return await route(req, res, url);
    } catch (error) {
      if (error instanceof MissionError) {
        json(res, error.status, { error: error.message, code: error.code });
        return true;
      }
      if (error instanceof HttpError) {
        json(res, error.status, {
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
        return true;
      }
      json(res, 500, { error: "internal error" });
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      return true;
    }
  };
}
