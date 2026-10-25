import { z } from "zod";

export const EventType = z.enum([
  "mission.created",
  "mission.planned",
  "mission.started",
  "task.started",
  "agent.status.changed",
  "agent.message",
  "tool.started",
  "tool.completed",
  "approval.requested",
  "approval.resolved",
  "usage.updated",
  "artifact.created",
  "task.succeeded",
  "task.failed",
  "task.cancelled",
  "task.interrupted",
  "mission.completed",
  "mission.failed",
  "mission.cancelled",
  "mission.interrupted",
]);
export type EventType = z.infer<typeof EventType>;

export const NoburiEvent = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  runId: z.string().optional(),
  type: EventType,
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.iso.datetime(),
  /** Monotonic per mission; used to order and de-duplicate. */
  sequence: z.number().int().nonnegative(),
});
export type NoburiEvent = z.infer<typeof NoburiEvent>;
