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
import type { RunManager } from "./runs.ts";

export interface ApiDeps {
  sessions: SessionSource;
  runs: RunManager;
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

    if (parts[0] === "runs" && parts[1]) {
      const runId = parts[1];
      if (deps.runs.status(runId) === undefined) throw new HttpError(404, "run not found");

      if (method === "GET" && parts[2] === "events" && parts.length === 3) {
        const after = Number(url.searchParams.get("after") ?? 0) || 0;
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
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
