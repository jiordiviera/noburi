import type { EventRow, MissionRow, Store } from "./store.ts";

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface UsageLine extends TokenCounts {
  /** Runs that reported usage; a run that never reported is not counted as zero. */
  runs: number;
  /** SDK estimate at API prices; meaningless for subscription accounts. */
  costUsdEstimated: number;
}

export interface AgentModelUsage extends UsageLine {
  agentId: string;
  model: string;
}

export interface MissionUsage extends UsageLine {
  missionId: string;
  title: string;
  status: MissionRow["status"];
  createdAt: string;
  budgetTokens: number | null;
}

export interface UsageSummary {
  totals: UsageLine;
  byAgentModel: AgentModelUsage[];
  missions: MissionUsage[];
  /** Where the numbers come from, e.g. ["sdk.result"]. */
  sources: string[];
  /** How Claude Code authenticated for these runs ("none" or OAuth = subscription). */
  apiKeySources: string[];
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function emptyLine(): UsageLine {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    runs: 0,
    costUsdEstimated: 0,
  };
}

/** Every token the model processed, cache reads included: what a mission budget is measured in. */
export function processedTokens(line: TokenCounts): number {
  return line.inputTokens + line.outputTokens + line.cacheReadTokens + line.cacheWriteTokens;
}

function add(target: UsageLine, payload: Record<string, unknown>): void {
  target.inputTokens += num(payload["inputTokens"]);
  target.outputTokens += num(payload["outputTokens"]);
  target.cacheReadTokens += num(payload["cacheReadTokens"]);
  target.cacheWriteTokens += num(payload["cacheWriteTokens"]);
  target.costUsdEstimated += num(payload["costUsdEstimated"]);
  target.runs += 1;
}

/** Usage of one mission, from its persisted `usage.updated` events only. */
export function missionUsage(events: readonly EventRow[]): UsageLine {
  const line = emptyLine();
  for (const e of events) if (e.type === "usage.updated") add(line, e.payload);
  return line;
}

/**
 * Aggregates what the SDK actually reported. Nothing is estimated from text length; a run without a
 * usage report simply does not appear.
 */
export function usageSummary(store: Store): UsageSummary {
  const totals = emptyLine();
  const byKey = new Map<string, AgentModelUsage>();
  const missions: MissionUsage[] = [];
  const sources = new Set<string>();
  const apiKeySources = new Set<string>();

  for (const mission of store.listMissions()) {
    const events = store.listEvents(mission.id);
    const taskModel = new Map<string, { agentId: string; model: string }>();
    for (const e of events) {
      if (e.type === "task.started" && e.taskId) {
        taskModel.set(e.taskId, {
          agentId: str(e.payload["agentId"]),
          model: str(e.payload["model"]) || "unknown",
        });
      }
    }
    const line = emptyLine();
    for (const e of events) {
      if (e.type !== "usage.updated") continue;
      add(line, e.payload);
      add(totals, e.payload);
      sources.add(str(e.payload["measurementSource"]) || "unknown");
      apiKeySources.add(str(e.payload["apiKeySource"]) || "unknown");
      const who = (e.taskId ? taskModel.get(e.taskId) : undefined) ?? {
        agentId: str(e.payload["agentId"]),
        model: "unknown",
      };
      const key = `${who.agentId}\u0000${who.model}`;
      const entry = byKey.get(key) ?? { agentId: who.agentId, model: who.model, ...emptyLine() };
      add(entry, e.payload);
      byKey.set(key, entry);
    }
    missions.push({
      missionId: mission.id,
      title: mission.title,
      status: mission.status,
      createdAt: mission.createdAt,
      budgetTokens: mission.budgetTokens,
      ...line,
    });
  }

  return {
    totals,
    byAgentModel: [...byKey.values()].toSorted((a, b) => processedTokens(b) - processedTokens(a)),
    missions,
    sources: [...sources],
    apiKeySources: [...apiKeySources],
  };
}
