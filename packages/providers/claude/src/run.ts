import { randomUUID } from "node:crypto";
import { query, type PermissionResult, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEnvironment } from "@noburi/core";
import { sdkEnvironmentOptions } from "./environment.ts";
import { describeToolInput, summarizeToolInput } from "./transcript.ts";

/** Tools that only read the workspace; everything else waits for an explicit human decision. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "NotebookRead",
  "TodoWrite",
]);

export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  summary: string;
  /** The full command or edit, so the player can read what they approve. */
  detail: string;
  blockedPath: string | null;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type RunEvent =
  | {
      type: "session";
      sessionId: string;
      model: string;
      cwd: string;
      permissionMode: string;
      /** How the CLI authenticated; "none" and OAuth mean a subscription, not per-token billing. */
      apiKeySource: string;
    }
  | { type: "state"; state: "idle" | "running" | "requires_action" }
  | { type: "text"; text: string }
  | {
      type: "tool.started";
      toolUseId: string;
      name: string;
      summary: string;
      /** The whole command or edit, for views that must match on it (the quest log). */
      detail: string;
    }
  | { type: "tool.completed"; toolUseId: string; isError: boolean; text: string }
  | ({ type: "approval.requested" } & ApprovalRequest)
  | { type: "approval.resolved"; approvalId: string; approved: boolean }
  | {
      type: "result";
      ok: boolean;
      sessionId: string;
      text: string | null;
      numTurns: number;
      durationMs: number;
      usage: RunUsage;
      /** Cost as computed by the SDK at API prices; not what a subscription is charged. */
      costUsdEstimated: number;
      measurementSource: "sdk.result";
    }
  | { type: "error"; message: string };

export interface ClaudeRunOptions {
  prompt: string;
  /** Working directory; for a resumed session it must be the one the session was recorded in. */
  cwd: string;
  resumeSessionId?: string | undefined;
  /** Continue into a new session id, leaving the original transcript untouched. */
  fork?: boolean | undefined;
  model?: string | undefined;
  /** Claude Code CLI to run; when unset the SDK uses the binary it ships in node_modules. */
  executable?: string | undefined;
  /** What the run inherits from the user's Claude Code setup; unset loads everything, like the CLI. */
  environment?: AgentEnvironment | undefined;
  signal: AbortSignal;
  requestApproval: (request: ApprovalRequest) => Promise<boolean>;
}

/** Converts one SDK message into zero or more Noburi run events. Pure, for testing. */
export function mapSdkMessage(message: SDKMessage): RunEvent[] {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        return [
          {
            type: "session",
            sessionId: message.session_id,
            model: message.model,
            cwd: message.cwd,
            permissionMode: message.permissionMode,
            apiKeySource: message.apiKeySource,
          },
        ];
      }
      if (message.subtype === "session_state_changed")
        return [{ type: "state", state: message.state }];
      return [];
    case "assistant": {
      if (message.parent_tool_use_id !== null) return [];
      const events: RunEvent[] = [];
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim())
          events.push({ type: "text", text: block.text });
        if (block.type === "tool_use") {
          events.push({
            type: "tool.started",
            toolUseId: block.id,
            name: block.name,
            summary: summarizeToolInput(block.name, block.input),
            detail: describeToolInput(block.name, block.input),
          });
        }
      }
      return events;
    }
    case "user": {
      if (message.parent_tool_use_id !== null) return [];
      const content: unknown = message.message.content;
      if (!Array.isArray(content)) return [];
      const events: RunEvent[] = [];
      for (const block of content as unknown[]) {
        if (typeof block !== "object" || block === null) continue;
        if (Reflect.get(block, "type") !== "tool_result") continue;
        const raw: unknown = Reflect.get(block, "content");
        const text =
          typeof raw === "string"
            ? raw
            : Array.isArray(raw)
              ? raw
                  .map((b: unknown) =>
                    typeof b === "object" && b !== null && Reflect.get(b, "type") === "text"
                      ? String(Reflect.get(b, "text"))
                      : "",
                  )
                  .join("\n")
              : "";
        events.push({
          type: "tool.completed",
          toolUseId: String(Reflect.get(block, "tool_use_id") ?? ""),
          isError: Reflect.get(block, "is_error") === true,
          text: text.slice(0, 160),
        });
      }
      return events;
    }
    case "result": {
      const ok = message.subtype === "success" && !message.is_error;
      return [
        {
          type: "result",
          ok,
          sessionId: message.session_id,
          text: message.subtype === "success" ? message.result : null,
          numTurns: message.num_turns,
          durationMs: message.duration_ms,
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
            cacheReadTokens: message.usage.cache_read_input_tokens,
            cacheWriteTokens: message.usage.cache_creation_input_tokens,
          },
          costUsdEstimated: message.total_cost_usd,
          measurementSource: "sdk.result",
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Runs Claude Code through the official Agent SDK: a new prompt, a resumed session, or a fork.
 * Read-only tools run directly; any other tool waits for `requestApproval`. Never bypasses permissions.
 */
export async function* runClaude(options: ClaudeRunOptions): AsyncGenerator<RunEvent> {
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  // A stop requested before this point must still stop the run: the listener alone would miss it.
  if (options.signal.aborted) return;
  options.signal.addEventListener("abort", onAbort, { once: true });

  const canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    ctx: { signal: AbortSignal; blockedPath?: string },
  ): Promise<PermissionResult> => {
    if (READ_ONLY_TOOLS.has(toolName) && !ctx.blockedPath)
      return { behavior: "allow", updatedInput: input };
    const approved = await options.requestApproval({
      approvalId: randomUUID(),
      toolName,
      summary: summarizeToolInput(toolName, input),
      detail: describeToolInput(toolName, input),
      blockedPath: ctx.blockedPath ?? null,
    });
    return approved
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "The user denied this action in Noburi." };
  };

  try {
    const stream = query({
      prompt: options.prompt,
      options: {
        cwd: options.cwd,
        abortController,
        permissionMode: "default",
        canUseTool,
        ...(options.resumeSessionId ? { resume: options.resumeSessionId } : {}),
        ...(options.fork ? { forkSession: true } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.executable ? { pathToClaudeCodeExecutable: options.executable } : {}),
        ...(options.environment ? sdkEnvironmentOptions(options.environment) : {}),
      },
    });
    for await (const message of stream) {
      yield* mapSdkMessage(message);
    }
  } catch (error) {
    if (!options.signal.aborted) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  } finally {
    options.signal.removeEventListener("abort", onAbort);
  }
}
