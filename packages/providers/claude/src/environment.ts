import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEnvironment } from "@noburi/core";

/** SDK options that apply a mission's agent environment. Pure, for testing. */
export function sdkEnvironmentOptions(
  env: AgentEnvironment,
): Pick<Options, "settingSources" | "settings" | "strictMcpConfig" | "skills"> {
  return {
    // [] is the SDK's isolation mode: no settings file is read at all.
    settingSources: [
      ...(env.userSettings ? (["user"] as const) : []),
      ...(env.projectSettings ? (["project", "local"] as const) : []),
    ],
    ...(env.hooks ? {} : { settings: { disableAllHooks: true } }),
    ...(env.mcpServers ? {} : { strictMcpConfig: true }),
    ...(env.skills === "none"
      ? { skills: [] }
      : env.skills === "all"
        ? { skills: "all" as const }
        : {}),
  };
}
