import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vite-plus/test";
import { mapSdkMessage } from "./run.ts";
import {
  describeToolInput,
  normalizeTranscript,
  summarizeToolInput,
  type RawSessionMessage,
} from "./transcript.ts";

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

  it("puts each tool result right after its call, in Claude's turn", () => {
    const entries = normalizeTranscript(messages);
    expect(entries.map((e) => [e.id, e.role])).toEqual([
      ["u1", "user"],
      ["a1", "assistant"],
    ]);
    expect(entries[1]?.parts).toEqual([
      { kind: "text", text: "Running them." },
      { kind: "tool_use", toolUseId: "t1", name: "Bash", summary: "pnpm test --run" },
      { kind: "tool_result", toolUseId: "t1", text: "1 failed", isError: true },
    ]);
  });

  it("merges consecutive Claude messages into one turn", () => {
    const entries = normalizeTranscript([
      ...messages,
      {
        type: "assistant",
        uuid: "a3",
        parent_tool_use_id: null,
        message: {
          content: [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "/x" } }],
        },
      },
      {
        type: "user",
        uuid: "u3",
        parent_tool_use_id: null,
        message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "ok" }] },
      },
      {
        type: "assistant",
        uuid: "a4",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "Fixed." }] },
      },
    ]);
    expect(entries.map((e) => e.id)).toEqual(["u1", "a1"]);
    expect(entries[1]?.parts.map((p) => p.kind)).toEqual([
      "text",
      "tool_use",
      "tool_result",
      "tool_use",
      "tool_result",
      "text",
    ]);
  });

  it("labels a result whose call is on an earlier page as a tool entry, not the user", () => {
    const entries = normalizeTranscript([
      {
        type: "user",
        uuid: "u9",
        parent_tool_use_id: null,
        message: { content: [{ type: "tool_result", tool_use_id: "elsewhere", content: "done" }] },
      },
    ]);
    expect(entries).toEqual([expect.objectContaining({ id: "u9", role: "tool" })]);
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

  it("keeps Claude Code's injected context out of the person's messages", () => {
    const entries = normalizeTranscript([
      {
        type: "user",
        uuid: "c1",
        parent_tool_use_id: null,
        isCompactSummary: true,
        is_meta: true,
        message: {
          role: "user",
          content: "<artifact-content-authored-by-others/>\nSummary: built X",
        },
      },
      {
        type: "user",
        uuid: "m1",
        parent_tool_use_id: null,
        is_meta: true,
        message: {
          role: "user",
          content: [{ type: "text", text: "Base directory for this skill" }],
        },
      },
      {
        type: "user",
        uuid: "u1",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content:
            '<system-reminder>\nnoise\n</system-reminder>\n<artifact-view-context artifact="a">{}</artifact-view-context>\nhow do I start the app?',
        },
      },
      {
        type: "user",
        uuid: "u2",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content:
            "<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>main</command-args>",
        },
      },
    ]);
    expect(entries.map((e) => [e.role, e.parts])).toEqual([
      ["system", [{ kind: "summary", text: "Summary: built X" }]],
      ["user", [{ kind: "text", text: "how do I start the app?" }]],
      ["user", [{ kind: "text", text: "/review main" }]],
    ]);
  });
});

describe("describeToolInput", () => {
  it("keeps the whole command and the exact text an edit replaces", () => {
    const long = `git commit -m "${"x".repeat(300)}" && git push`;
    expect(describeToolInput("Bash", { command: long })).toBe(long);
    expect(
      describeToolInput("Edit", { file_path: "/w/a.js", old_string: "a\nb", new_string: "c" }),
    ).toBe("/w/a.js\n\n- a\n- b\n+ c");
  });
});
