import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vite-plus/test";
import { mapSdkMessage } from "./run.ts";
import { normalizeTranscript, summarizeToolInput, type RawSessionMessage } from "./transcript.ts";

describe("normalizeTranscript", () => {
  const messages: RawSessionMessage[] = [
    {
      type: "user",
      uuid: "u1",
      parent_tool_use_id: null,
      message: { role: "user", content: "Fix the tests" },
    },
    {
      type: "assistant",
      uuid: "a1",
      parent_tool_use_id: null,
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "private" },
          { type: "text", text: "Running them." },
          { type: "tool_use", id: "t1", name: "Bash", input: { command: "pnpm test --run" } },
        ],
      },
    },
    {
      type: "user",
      uuid: "u2",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            is_error: true,
            content: [{ type: "text", text: "1 failed" }],
          },
        ],
      },
    },
    {
      type: "assistant",
      uuid: "a2",
      parent_tool_use_id: null,
      message: { role: "assistant", content: [{ type: "thinking" }] },
    },
  ];

  it("keeps text, tool calls and results, and drops thinking", () => {
    const entries = normalizeTranscript(messages);
    expect(entries.map((e) => e.id)).toEqual(["u1", "a1", "u2"]);
    expect(entries[1]?.parts).toEqual([
      { kind: "text", text: "Running them." },
      { kind: "tool_use", toolUseId: "t1", name: "Bash", summary: "pnpm test --run" },
    ]);
    expect(entries[2]?.parts[0]).toEqual({
      kind: "tool_result",
      toolUseId: "t1",
      text: "1 failed",
      isError: true,
    });
  });

  it("ignores malformed messages instead of throwing", () => {
    const junk = [
      { type: "user", uuid: "x", parent_tool_use_id: null, message: 42 },
    ] as RawSessionMessage[];
    expect(normalizeTranscript(junk)).toEqual([]);
  });
});

describe("summarizeToolInput", () => {
  it("prefers the most telling field and clips it", () => {
    expect(summarizeToolInput("Read", { file_path: "/a/b.ts" })).toBe("/a/b.ts");
    expect(summarizeToolInput("Bash", { command: "x".repeat(400) })).toHaveLength(161);
    expect(summarizeToolInput("Mystery", { other: 1 })).toBe("Mystery");
  });
});

describe("mapSdkMessage", () => {
  it("maps a successful result with its token usage", () => {
    const result = {
      type: "result",
      subtype: "success",
      is_error: false,
      session_id: "s1",
      result: "Done",
      num_turns: 3,
      duration_ms: 1200,
      total_cost_usd: 0.01,
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 40,
      },
    } as unknown as SDKMessage;
    expect(mapSdkMessage(result)).toEqual([
      {
        type: "result",
        ok: true,
        sessionId: "s1",
        text: "Done",
        numTurns: 3,
        durationMs: 1200,
        usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
        costUsdEstimated: 0.01,
        measurementSource: "sdk.result",
      },
    ]);
  });

  it("ignores sub-agent chatter in the main stream", () => {
    const sub = {
      type: "assistant",
      parent_tool_use_id: "task-1",
      message: { content: [{ type: "text", text: "inner" }] },
    } as unknown as SDKMessage;
    expect(mapSdkMessage(sub)).toEqual([]);
  });
});
