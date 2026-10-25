import { useState } from "react";
import { ENVIRONMENT_PRESETS, presetOf, type EnvironmentPreset } from "@noburi/core";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AgentEnvironment } from "@/lib/runtime";
import { cn } from "@/lib/utils";

const PRESETS: { id: EnvironmentPreset; label: string; description: string }[] = [
  {
    id: "project",
    label: "Project only",
    description:
      "The project's own settings and CLAUDE.md. None of your global plugins, hooks or rules.",
  },
  {
    id: "isolated",
    label: "Isolated",
    description: "No settings file, no hook, no MCP server, no skill. Just the workspace.",
  },
  {
    id: "terminal",
    label: "Like my terminal",
    description:
      "Everything `claude` loads for you: global plugins, hooks, MCP servers and skills.",
  },
];

const SWITCHES: {
  key: "userSettings" | "projectSettings" | "hooks" | "mcpServers";
  label: string;
  hint: string;
}[] = [
  {
    key: "userSettings",
    label: "Your Claude Code settings",
    hint: "~/.claude: plugins, hooks, permission rules, global CLAUDE.md",
  },
  {
    key: "projectSettings",
    label: "Project settings",
    hint: ".claude/settings*.json and the project's CLAUDE.md",
  },
  { key: "hooks", label: "Hooks", hint: "Off disables every hook, whichever settings define it" },
  { key: "mcpServers", label: "MCP servers", hint: "From loaded settings, plugins and .mcp.json" },
];

export const PRESET_LABEL: Record<EnvironmentPreset | "custom", string> = {
  project: "Project only",
  isolated: "Isolated",
  terminal: "Like my terminal",
  custom: "Custom",
};

interface Props {
  value: AgentEnvironment;
  onChange: (value: AgentEnvironment) => void;
  disabled?: boolean;
}

/** Chooses what a mission's agents inherit from the user's Claude Code setup. */
export function EnvironmentPicker({ value, onChange, disabled = false }: Props) {
  const preset = presetOf(value);
  const [customizing, setCustomizing] = useState(preset === "custom");

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={customizing ? "custom" : preset}
        onValueChange={(v) => {
          if (v === "custom") {
            setCustomizing(true);
            return;
          }
          const next = PRESETS.find((p) => p.id === v);
          if (!next) return;
          setCustomizing(false);
          onChange(ENVIRONMENT_PRESETS[next.id]);
        }}
        className="grid gap-2 sm:grid-cols-2"
        aria-label="Agent environment"
        disabled={disabled}
      >
        {[
          ...PRESETS,
          { id: "custom" as const, label: "Custom", description: "Pick each part yourself." },
        ].map((p) => (
          <Label
            key={p.id}
            htmlFor={`env-${p.id}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 font-normal",
              (customizing ? "custom" : preset) === p.id
                ? "border-primary"
                : "border-transparent bg-card hover:border-border",
            )}
          >
            <RadioGroupItem id={`env-${p.id}`} value={p.id} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{p.label}</span>
              <span className="text-xs text-muted-foreground">{p.description}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      {customizing && (
        <div className="flex flex-col gap-3 rounded-lg bg-card p-4">
          {SWITCHES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`env-switch-${s.key}`}>{s.label}</Label>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </div>
              <Switch
                id={`env-switch-${s.key}`}
                checked={value[s.key]}
                disabled={disabled}
                onCheckedChange={(checked) => onChange({ ...value, [s.key]: checked })}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="env-skills">Skills</Label>
              <p className="text-xs text-muted-foreground">
                A filter on what agents see, not a sandbox
              </p>
            </div>
            <Select
              value={value.skills}
              disabled={disabled}
              onValueChange={(v) => {
                if (v === "none" || v === "default" || v === "all")
                  onChange({ ...value, skills: v });
              }}
            >
              <SelectTrigger id="env-skills" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="default">Claude Code default</SelectItem>
                <SelectItem value="all">All discovered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
