import { describe, expect, it } from "vite-plus/test";
import { ENVIRONMENT_PRESETS, presetOf } from "@noburi/core";
import { sdkEnvironmentOptions } from "./environment.ts";

describe("sdkEnvironmentOptions", () => {
  it("isolated reads no settings file, runs no hook, loads no MCP server and no skill", () => {
    expect(sdkEnvironmentOptions(ENVIRONMENT_PRESETS.isolated)).toEqual({
      settingSources: [],
      settings: { disableAllHooks: true },
      strictMcpConfig: true,
      skills: [],
    });
  });

  it("project keeps the workspace's own settings and CLAUDE.md, not the user's", () => {
    expect(sdkEnvironmentOptions(ENVIRONMENT_PRESETS.project)).toEqual({
      settingSources: ["project", "local"],
    });
  });

  it("terminal loads exactly what the CLI loads", () => {
    expect(sdkEnvironmentOptions(ENVIRONMENT_PRESETS.terminal)).toEqual({
      settingSources: ["user", "project", "local"],
    });
  });

  it("maps each switch on its own", () => {
    const env = { ...ENVIRONMENT_PRESETS.terminal, hooks: false, skills: "all" as const };
    expect(sdkEnvironmentOptions(env)).toMatchObject({
      settings: { disableAllHooks: true },
      skills: "all",
    });
    expect(presetOf(env)).toBe("custom");
    expect(presetOf(ENVIRONMENT_PRESETS.isolated)).toBe("isolated");
  });
});
