import { z } from "zod";

/**
 * What a mission's agents inherit from the user's Claude Code setup. Missions run unattended, so a
 * global hook or plugin that suits an interactive terminal can derail them or waste tokens.
 */
export const AgentEnvironment = z.strictObject({
  /** ~/.claude/settings.json: the user's plugins, hooks, permission rules and global CLAUDE.md. */
  userSettings: z.boolean(),
  /** The workspace's .claude/settings*.json and its CLAUDE.md files. */
  projectSettings: z.boolean(),
  /** Run hooks from whichever settings are loaded; false disables every hook. */
  hooks: z.boolean(),
  /** MCP servers from loaded settings, plugins and .mcp.json; false ignores them all. */
  mcpServers: z.boolean(),
  /** "none" hides every skill, "all" enables every discovered one, "default" leaves Claude Code's choice. */
  skills: z.enum(["none", "default", "all"]),
});
export type AgentEnvironment = z.infer<typeof AgentEnvironment>;

export const ENVIRONMENT_PRESETS = {
  /** Nothing from the user's setup; only the workspace files themselves. */
  isolated: {
    userSettings: false,
    projectSettings: false,
    hooks: false,
    mcpServers: false,
    skills: "none",
  },
  /** The project's own rules and CLAUDE.md, none of the user's global plugins or hooks. */
  project: {
    userSettings: false,
    projectSettings: true,
    hooks: true,
    mcpServers: true,
    skills: "default",
  },
  /** Exactly what `claude` would load in a terminal. */
  terminal: {
    userSettings: true,
    projectSettings: true,
    hooks: true,
    mcpServers: true,
    skills: "default",
  },
} as const satisfies Record<string, AgentEnvironment>;

export type EnvironmentPreset = keyof typeof ENVIRONMENT_PRESETS;

export const DEFAULT_ENVIRONMENT: AgentEnvironment = ENVIRONMENT_PRESETS.project;

const PRESET_NAMES: readonly EnvironmentPreset[] = ["isolated", "project", "terminal"];

/** The preset an environment matches, or "custom". */
export function presetOf(env: AgentEnvironment): EnvironmentPreset | "custom" {
  for (const name of PRESET_NAMES) {
    const preset = ENVIRONMENT_PRESETS[name];
    if (
      preset.userSettings === env.userSettings &&
      preset.projectSettings === env.projectSettings &&
      preset.hooks === env.hooks &&
      preset.mcpServers === env.mcpServers &&
      preset.skills === env.skills
    ) {
      return name;
    }
  }
  return "custom";
}
