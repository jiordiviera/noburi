import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AgentEnvironment } from "@noburi/core";
import type { ProjectSummary, RunEvent, TranscriptEntry } from "@noburi/provider-claude";

export type { AgentEnvironment, ProjectSummary, RunEvent, TranscriptEntry };
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

export type MissionStatus =
  | "DRAFT"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED";
export type TaskStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED";

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  avatar: "developer" | "reviewer" | "researcher";
}

export interface Mission {
  id: string;
  workspacePath: string;
  title: string;
  objective: string;
  status: MissionStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  budgetTokens: number | null;
  environment: AgentEnvironment;
  /** The GitHub issue this mission works on, as "owner/name#number". */
  issueRef: string | null;
}

export interface MissionTask {
  id: string;
  missionId: string;
  position: number;
  title: string;
  instructions: string;
  dependsOn: string[];
  agentId: string;
  status: TaskStatus;
  sessionId: string | null;
  resultText: string | null;
  error: string | null;
}

export interface MissionArtifact {
  id: string;
  taskId: string | null;
  kind: "summary" | "diff" | "log";
  title: string;
  content: string;
  createdAt: string;
}

export interface MissionView {
  mission: Mission;
  tasks: MissionTask[];
  activeRunId: string | null;
  artifacts?: MissionArtifact[];
}

export interface MissionEvent {
  seq: number;
  taskId: string | null;
  type: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface PlanTask {
  title: string;
  instructions: string;
  agentId: string;
  dependsOn: number[];
}

/** An open GitHub issue: a card on the office board. */
export interface Issue {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: { name: string; color: string }[];
}

/** A pull request as the desk shows it, read through the player's gh. */
export interface PullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  branch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  checks: { name: string; state: "pass" | "fail" | "pending" }[];
  diff: string;
}

export interface ToolStatus {
  installed: boolean;
  account: string | null;
}

export interface Connections {
  github: ToolStatus;
  gitlab: ToolStatus;
  engines: {
    id: "claude" | "codex" | "gemini";
    installed: boolean;
    path: string | null;
    supported: boolean;
  }[];
}

export interface UsageLine {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  runs: number;
  costUsdEstimated: number;
}

export interface UsageSummary {
  totals: UsageLine;
  byAgentModel: (UsageLine & { agentId: string; model: string })[];
  missions: (UsageLine & {
    missionId: string;
    title: string;
    status: MissionStatus;
    createdAt: string;
    budgetTokens: number | null;
  })[];
  sources: string[];
  apiKeySources: string[];
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

interface Connection {
  url: string;
  token: string;
}

const ENV_URL = import.meta.env.VITE_NOBURI_RUNTIME_URL;
const ENV_TOKEN = import.meta.env.VITE_NOBURI_RUNTIME_TOKEN;
const IN_TAURI = isTauri();

/** True when a runtime can be reached: inside the desktop shell, or via `pnpm dev` in a browser. */
export const runtimeConfigured = IN_TAURI || Boolean(ENV_URL && ENV_TOKEN);

let connection: Promise<Connection> | null = null;

/** The desktop shell starts the runtime and hands over its address and token; the browser dev setup uses env. */
function connect(): Promise<Connection> {
  connection ??= IN_TAURI
    ? invoke<Connection>("runtime_info").catch((error: unknown) => {
        connection = null;
        throw new RuntimeError(0, String(error), "no_runtime");
      })
    : Promise.resolve({ url: ENV_URL ?? "", token: ENV_TOKEN ?? "" });
  return connection;
}

function headers(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!runtimeConfigured)
    throw new RuntimeError(0, "The Noburi runtime is not running.", "no_runtime");
  const { url, token } = await connect();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, { ...init, headers: headers(token) });
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
  streamEvents: (runId: string, onRecord: (record: RunRecord) => void, signal: AbortSignal) =>
    readEvents<RunRecord>(`/runs/${runId}/events?after=0`, onRecord, signal),

  agents: () => call<{ agents: Agent[] }>("/agents"),
  missions: () => call<{ missions: MissionView[] }>("/missions"),
  mission: (id: string) => call<MissionView & { artifacts: MissionArtifact[] }>(`/missions/${id}`),
  usage: () => call<UsageSummary>("/usage"),
  createMission: (body: {
    workspacePath: string;
    objective: string;
    title?: string;
    budgetTokens?: number;
    environment?: AgentEnvironment;
  }) => call<MissionView>("/missions", { method: "POST", body: JSON.stringify(body) }),
  setPlan: (id: string, tasks: PlanTask[]) =>
    call<MissionView>(`/missions/${id}/plan`, { method: "PUT", body: JSON.stringify({ tasks }) }),
  setEnvironment: (id: string, environment: AgentEnvironment) =>
    call<MissionView>(`/missions/${id}/environment`, {
      method: "PUT",
      body: JSON.stringify(environment),
    }),
  startMission: (id: string) => call<MissionView>(`/missions/${id}/start`, { method: "POST" }),
  cancelMission: (id: string) => call<MissionView>(`/missions/${id}/cancel`, { method: "POST" }),
  deleteMission: (id: string) => call<{ ok: true }>(`/missions/${id}`, { method: "DELETE" }),
  issues: (repo: string) =>
    call<{ repo: string; issues: Issue[] }>(`/forge/issues?repo=${encodeURIComponent(repo)}`),
  pullRequest: (repo: string, number: number) =>
    call<PullRequest>(`/forge/pull?repo=${encodeURIComponent(repo)}&number=${number}`),
  connections: () => call<Connections>("/connections"),
  /** The developer takes the issue: a mission in a clone of the repository, started at once. */
  workOnIssue: (repo: string, number: number) =>
    call<MissionView>("/forge/work", { method: "POST", body: JSON.stringify({ repo, number }) }),
  streamMission: (id: string, onEvent: (event: MissionEvent) => void, signal: AbortSignal) =>
    readEvents<MissionEvent>(`/missions/${id}/events?after=0`, onEvent, signal),
};

/** Server-sent events reader; T is the shape the runtime sends on this stream. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
async function readEvents<T>(
  path: string,
  onData: (data: T) => void,
  signal: AbortSignal,
): Promise<void> {
  const { url, token } = await connect();
  const res = await fetch(`${url}${path}`, { headers: headers(token), signal });
  if (!res.ok || !res.body)
    throw new RuntimeError(res.status, "Cannot open the event stream.", null);
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
      // Same trust boundary as `call`: events come from our own runtime.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      if (data) onData(JSON.parse(data) as T);
      end = buffer.indexOf("\n\n");
    }
  }
}
