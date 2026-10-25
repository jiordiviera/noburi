import { z } from "zod";

export const EventType = z.enum([
  "mission.created",
  "task.started",
  "agent.status.changed",
  "tool.started",
  "tool.completed",
  "approval.requested",
  "usage.updated",
  "artifact.created",
  "task.failed",
  "mission.completed",
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
