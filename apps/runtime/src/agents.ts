/**
 * Built-in agent profiles. The model is a Claude Code alias ("sonnet", "opus", "haiku") so it follows
 * whatever the user's Claude Code and plan resolve it to; Noburi does not hard-code model versions.
 */
export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  model: "sonnet" | "opus" | "haiku";
  /** Official avatar set in assets/avatars/official. */
  avatar: "developer" | "reviewer" | "researcher";
}

export const AGENTS: readonly AgentProfile[] = [
  {
    id: "developer",
    name: "Developer",
    role: "Implements changes in the workspace and runs the tests.",
    model: "sonnet",
    avatar: "developer",
  },
  {
    id: "architect",
    name: "Architect",
    role: "Analyses the codebase, weighs options and writes a precise plan; changes nothing.",
    model: "opus",
    avatar: "reviewer",
  },
  {
    id: "researcher",
    name: "Researcher",
    role: "Reads code and docs to answer questions quickly; changes nothing.",
    model: "haiku",
    avatar: "researcher",
  },
];

export function agentById(id: string): AgentProfile | undefined {
  return AGENTS.find((a) => a.id === id);
}
