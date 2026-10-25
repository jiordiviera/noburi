import { z } from "zod";
import { AgentRunStatus, MissionStatus, TaskStatus } from "./status.ts";

const Id = z.string().min(1);
const Timestamp = z.iso.datetime();

export const Workspace = z.object({
  id: Id,
  name: z.string().min(1),
  rootPath: z.string().min(1),
  createdAt: Timestamp,
});
export type Workspace = z.infer<typeof Workspace>;

export const Mission = z.object({
  id: Id,
  workspaceId: Id,
  title: z.string().min(1),
  objective: z.string().min(1),
  status: MissionStatus,
  createdAt: Timestamp,
  startedAt: Timestamp.optional(),
  finishedAt: Timestamp.optional(),
});
export type Mission = z.infer<typeof Mission>;

export const Task = z.object({
  id: Id,
  missionId: Id,
  title: z.string().min(1),
  instructions: z.string(),
  dependsOn: z.array(Id),
  assignedAgentId: Id,
  status: TaskStatus,
  outputRefs: z.array(z.string()),
  error: z.string().optional(),
});
export type Task = z.infer<typeof Task>;

export const Permissions = z.object({
  read: z.boolean(),
  write: z.boolean(),
  shell: z.enum(["deny", "ask", "allow"]),
  network: z.enum(["deny", "ask", "allow"]),
  git: z.enum(["deny", "ask", "allow"]),
  destructive: z.literal("ask").or(z.literal("deny")),
});
export type Permissions = z.infer<typeof Permissions>;

export const AgentProfile = z.object({
  id: Id,
  name: z.string().min(1),
  role: z.string().min(1),
  providerId: Id,
  modelId: z.string().min(1),
  avatarId: Id,
  permissions: Permissions,
  tools: z.array(z.string()),
});
export type AgentProfile = z.infer<typeof AgentProfile>;

export const AgentRun = z.object({
  id: Id,
  taskId: Id,
  providerSessionId: z.string().optional(),
  modelId: z.string(),
  status: AgentRunStatus,
  startedAt: Timestamp.optional(),
  endedAt: Timestamp.optional(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const Artifact = z.object({
  id: Id,
  missionId: Id,
  taskId: Id.optional(),
  kind: z.enum(["file", "diff", "summary", "test-report", "log"]),
  pathOrUri: z.string().min(1),
  createdAt: Timestamp,
});
export type Artifact = z.infer<typeof Artifact>;

export const Approval = z.object({
  id: Id,
  runId: Id,
  requestedAction: z.string().min(1),
  scope: z.enum(["read", "write", "shell", "network", "git", "destructive"]),
  status: z.enum(["PENDING", "APPROVED", "DENIED", "EXPIRED"]),
  decidedAt: Timestamp.optional(),
});
export type Approval = z.infer<typeof Approval>;

/** Every field is optional: absent means "unavailable", never zero. */
export const UsageSample = z.object({
  id: Id,
  runId: Id,
  modelId: z.string(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  costUsdEstimated: z.number().nonnegative().optional(),
  measurementSource: z.string().min(1),
});
export type UsageSample = z.infer<typeof UsageSample>;
