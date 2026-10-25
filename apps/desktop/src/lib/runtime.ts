import type { ProjectSummary, RunEvent, TranscriptEntry } from "@noburi/provider-claude";

export type { ProjectSummary, RunEvent, TranscriptEntry };
export type { SessionSummary, TranscriptPart } from "@noburi/provider-claude";

export type RunStatus = "running" | "cancelling" | "succeeded" | "failed" | "cancelled";
export type RunStreamEvent = RunEvent | { type: "run.finished"; status: RunStatus };
export interface RunRecord {
  seq: number;
  at: string;
  event: RunStreamEvent;
}

export interface Discovery {
  scope: string;
  projects: ProjectSummary[];
}

export interface TranscriptPage {
  offset: number;
  limit: number;
  hasMore: boolean;
  entries: TranscriptEntry[];
}

export class RuntimeError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_NOBURI_RUNTIME_URL;
const TOKEN = import.meta.env.VITE_NOBURI_RUNTIME_TOKEN;

export const runtimeConfigured = Boolean(BASE && TOKEN);

function headers(): HeadersInit {
  return { authorization: `Bearer ${TOKEN ?? ""}`, "content-type": "application/json" };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!runtimeConfigured)
    throw new RuntimeError(0, "The Noburi runtime is not running.", "no_runtime");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: headers() });
  } catch {
    throw new RuntimeError(0, "Cannot reach the Noburi runtime.", "unreachable");
  }
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body === "object" && body !== null ? Reflect.get(body, "error") : null;
    const code = typeof body === "object" && body !== null ? Reflect.get(body, "code") : null;
    throw new RuntimeError(
      res.status,
      typeof message === "string" ? message : `Request failed (${res.status})`,
      typeof code === "string" ? code : null,
    );
  }
  // The runtime ships with this UI from the same repository; its responses are typed by the
  // shared provider package, so they are not re-validated here.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return body as T;
}

export const runtime = {
  discovery: () => call<Discovery>("/discovery"),

  messages: (sessionId: string, offset: number, limit = 100) =>
    call<TranscriptPage>(
      `/sessions/${encodeURIComponent(sessionId)}/messages?offset=${offset}&limit=${limit}`,
    ),

  createRun: (body: { sessionId: string; prompt: string; fork?: boolean; force?: boolean }) =>
    call<{ runId: string; cwd: string }>("/runs", { method: "POST", body: JSON.stringify(body) }),

  decide: (runId: string, approvalId: string, approved: boolean) =>
    call<{ ok: true }>(`/runs/${runId}/approvals/${approvalId}`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }),

  cancel: (runId: string) =>
    call<{ status: RunStatus }>(`/runs/${runId}/cancel`, { method: "POST" }),

  /** Reads the run's server-sent events with the auth header (EventSource cannot send one). */
  async streamEvents(
    runId: string,
    onRecord: (record: RunRecord) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const res = await fetch(`${BASE}/runs/${runId}/events?after=0`, { headers: headers(), signal });
    if (!res.ok || !res.body)
      throw new RuntimeError(res.status, "Cannot open the run stream.", null);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("\n");
        // Same trust boundary as `call`: records come from our own runtime.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        if (data) onRecord(JSON.parse(data) as RunRecord);
        end = buffer.indexOf("\n\n");
      }
    }
  },
};
