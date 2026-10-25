import type { Agent, MissionEvent, MissionStatus, MissionTask } from "@/lib/runtime";

/** Sprite states drawn in assets/avatars/official/<avatar>/<state>.svg. */
export type AgentVisual = "idle" | "thinking" | "working" | "waiting" | "done" | "error";

export interface OfficeAgent {
  agentId: string;
  name: string;
  model: string;
  avatar: Agent["avatar"];
  visual: AgentVisual;
  /** Short status text; the sprite is never the only signal. */
  label: string;
  /** What the agent is doing or waiting on, from real events only. */
  detail: string | null;
  taskId: string | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The last tool this task started and has not finished yet, if any. */
function openTool(events: MissionEvent[]): MissionEvent | undefined {
  const finished = new Set(
    events.filter((e) => e.type === "tool.completed").map((e) => str(e.payload["toolUseId"])),
  );
  return events
    .filter((e) => e.type === "tool.started" && !finished.has(str(e.payload["toolUseId"])))
    .at(-1);
}

/**
 * Derives what each agent's character shows. Every state comes from the mission's persisted tasks and
 * events: nobody "works" unless a run is active, and only a pending approval shows "Needs you".
 */
export function deriveOffice(
  agents: readonly Agent[],
  tasks: readonly MissionTask[],
  events: readonly MissionEvent[],
  missionStatus: MissionStatus | null,
): OfficeAgent[] {
  const eventsFor = (taskId: string) => events.filter((e) => e.taskId === taskId);
  return agents.map((agent) => {
    const base = {
      agentId: agent.id,
      name: agent.name,
      model: agent.model,
      avatar: agent.avatar,
    };
    const own = tasks.filter((t) => t.agentId === agent.id);
    const active = own.find((t) => t.status === "RUNNING" || t.status === "WAITING_APPROVAL");

    if (active && missionStatus === "RUNNING") {
      const taskEvents = eventsFor(active.id);
      if (active.status === "WAITING_APPROVAL") {
        const request = taskEvents.filter((e) => e.type === "approval.requested").at(-1);
        return {
          ...base,
          visual: "waiting",
          label: "Needs you",
          detail: request
            ? `${str(request.payload["toolName"])} · ${str(request.payload["summary"])}`
            : active.title,
          taskId: active.id,
        };
      }
      const tool = openTool(taskEvents);
      return tool
        ? {
            ...base,
            visual: "working",
            label: "Working",
            detail: `${str(tool.payload["name"])} · ${str(tool.payload["summary"])}`,
            taskId: active.id,
          }
        : {
            ...base,
            visual: "thinking",
            label: "Thinking",
            detail: active.title,
            taskId: active.id,
          };
    }

    const failed = own.find((t) => t.status === "FAILED");
    if (failed)
      return {
        ...base,
        visual: "error",
        label: "Failed",
        detail: failed.error ?? failed.title,
        taskId: failed.id,
      };

    const interrupted = own.find((t) => t.status === "INTERRUPTED");
    if (interrupted)
      return {
        ...base,
        visual: "idle",
        label: "Interrupted",
        detail: interrupted.title,
        taskId: interrupted.id,
      };

    if (own.length > 0 && own.every((t) => t.status === "SUCCEEDED")) {
      const last = own.at(-1);
      return {
        ...base,
        visual: "done",
        label: "Done",
        detail: last?.title ?? null,
        taskId: last?.id ?? null,
      };
    }

    const next = own.find((t) => t.status === "PENDING" || t.status === "READY");
    if (next && missionStatus === "RUNNING") {
      return { ...base, visual: "idle", label: "Up next", detail: next.title, taskId: next.id };
    }
    return {
      ...base,
      visual: "idle",
      label: own.length > 0 ? "Idle" : "Not on this mission",
      detail: null,
      taskId: null,
    };
  });
}
