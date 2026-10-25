import { z } from "zod";

export const TaskStatus = z.enum([
  "PENDING",
  "READY",
  "RUNNING",
  "WAITING_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  // Set after a crash when the provider run cannot be reconciled.
  "INTERRUPTED",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "INTERRUPTED",
]);

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  PENDING: ["READY", "CANCELLED"],
  READY: ["RUNNING", "CANCELLED"],
  RUNNING: ["WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED"],
  WAITING_APPROVAL: ["RUNNING", "FAILED", "CANCELLED", "INTERRUPTED"],
  SUCCEEDED: [],
  // Retry is a manual action that creates a new run on the same task.
  FAILED: ["READY"],
  CANCELLED: [],
  INTERRUPTED: ["READY"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal task transition ${from} -> ${to}`);
  }
}

export const MissionStatus = z.enum(["DRAFT", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", "INTERRUPTED"]);
export type MissionStatus = z.infer<typeof MissionStatus>;

export const AgentRunStatus = z.enum(["STARTING", "RUNNING", "WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLING", "CANCELLED", "INTERRUPTED"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;
