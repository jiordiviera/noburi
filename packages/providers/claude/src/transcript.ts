/** Display-ready view of a Claude Code transcript. Thinking blocks are left out on purpose. */
export type TranscriptPart =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; toolUseId: string; name: string; summary: string }
  | { kind: "tool_result"; toolUseId: string; text: string; isError: boolean }
  /** Claude Code's summary of the messages it compacted away. */
  | { kind: "summary"; text: string };

export interface TranscriptEntry {
  id: string;
  /** "tool" holds results whose call is not in the loaded page. */
  role: "user" | "assistant" | "system" | "tool";
  timestamp: string | null;
  /** True for messages produced inside a sub-agent rather than the main conversation. */
  fromSubagent: boolean;
  parts: TranscriptPart[];
}

/** Shape returned by the SDK's getSessionMessages; `message` is untyped there. */
export interface RawSessionMessage {
  type: "user" | "assistant" | "system";
  uuid: string;
  message: unknown;
  parent_tool_use_id: string | null;
  /** Set on the summary Claude Code writes when it compacts a conversation. */
  isCompactSummary?: boolean;
  /** Set on context Claude Code injects as a user message (skill bodies, caveats, the summary). */
  is_meta?: boolean;
}

const MAX_TEXT = 4000;
const MAX_SUMMARY = 160;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** One-line description of a tool call's input, e.g. the command or file path. */
export function summarizeToolInput(name: string, input: unknown): string {
  if (!isRecord(input)) return name;
  const preferred = [
    "command",
    "file_path",
    "path",
    "pattern",
    "url",
    "query",
    "description",
    "prompt",
  ];
  for (const key of preferred) {
    const value = str(input[key]);
    if (value) return clip(value.replace(/\s+/g, " ").trim(), MAX_SUMMARY);
  }
  return name;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (isRecord(block) && block["type"] === "text" ? (str(block["text"]) ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * Removes what Claude Code adds around a person's words before sending them to the model:
 * reminders, artifact context, and the markup of slash commands.
 */
export function stripInjected(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<artifact-view-context[^>]*>[\s\S]*?<\/artifact-view-context>/g, "")
    .replace(/<artifact-content-authored-by-others\/>/g, "")
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
    .replace(/<command-name>([\s\S]*?)<\/command-name>/g, "$1")
    .replace(/\s*<command-args>([\s\S]*?)<\/command-args>/g, (_, args: string) =>
      args.trim() ? ` ${args.trim()}` : "",
    )
    .trim();
}

function textPart(text: string, role: RawSessionMessage["type"]): TranscriptPart[] {
  const shown = role === "user" ? stripInjected(text) : text;
  return shown.trim() ? [{ kind: "text", text: clip(shown, MAX_TEXT) }] : [];
}

function toParts(content: unknown, role: RawSessionMessage["type"]): TranscriptPart[] {
  if (typeof content === "string") return textPart(content, role);
  if (!Array.isArray(content)) return [];
  const parts: TranscriptPart[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    const type = block["type"];
    if (type === "text") {
      const text = str(block["text"]);
      if (text) parts.push(...textPart(text, role));
    } else if (type === "tool_use") {
      const name = str(block["name"]) ?? "tool";
      parts.push({
        kind: "tool_use",
        toolUseId: str(block["id"]) ?? "",
        name,
        summary: summarizeToolInput(name, block["input"]),
      });
    } else if (type === "tool_result") {
      parts.push({
        kind: "tool_result",
        toolUseId: str(block["tool_use_id"]) ?? "",
        text: clip(resultText(block["content"]), MAX_SUMMARY),
        isError: block["is_error"] === true,
      });
    }
  }
  return parts;
}

/**
 * Builds the display transcript. Claude Code stores tool results as "user" messages; they are not
 * something the person typed, so each result is placed right after the tool call it answers, and
 * consecutive Claude messages are merged into one turn. A result whose call is on an earlier page
 * stays on its own with the "tool" role.
 */
export function normalizeTranscript(messages: readonly RawSessionMessage[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const callOwner = new Map<string, TranscriptEntry>();

  for (const m of messages) {
    const content = isRecord(m.message) ? m.message["content"] : undefined;
    const raw: unknown = m;
    const timestamp = isRecord(raw) ? str(raw["timestamp"]) : null;
    const fromSubagent = m.parent_tool_use_id !== null;

    // Neither is something the person typed: the summary gets its own collapsed entry, other
    // injected context is left out.
    if (m.isCompactSummary) {
      const text = typeof content === "string" ? content : resultText(content);
      entries.push({
        id: m.uuid,
        role: "system",
        timestamp,
        fromSubagent,
        parts: [{ kind: "summary", text: clip(stripInjected(text), MAX_TEXT) }],
      });
      continue;
    }
    if (m.is_meta) continue;

    const parts = toParts(content, m.type);
    if (parts.length === 0) continue;

    const onlyResults = parts.every((p) => p.kind === "tool_result");
    if (m.type === "user" && onlyResults) {
      const orphans: TranscriptPart[] = [];
      for (const part of parts) {
        const owner = part.kind === "tool_result" ? callOwner.get(part.toolUseId) : undefined;
        if (!owner) {
          orphans.push(part);
          continue;
        }
        const callIndex = owner.parts.findIndex(
          (p) =>
            p.kind === "tool_use" && part.kind === "tool_result" && p.toolUseId === part.toolUseId,
        );
        owner.parts.splice(callIndex + 1, 0, part);
      }
      if (orphans.length > 0) {
        entries.push({ id: m.uuid, role: "tool", timestamp, fromSubagent, parts: orphans });
      }
      continue;
    }

    const previous = entries.at(-1);
    let entry: TranscriptEntry;
    if (
      m.type === "assistant" &&
      previous?.role === "assistant" &&
      previous.fromSubagent === fromSubagent
    ) {
      previous.parts.push(...parts);
      entry = previous;
    } else {
      entry = { id: m.uuid, role: m.type, timestamp, fromSubagent, parts };
      entries.push(entry);
    }
    for (const part of parts) if (part.kind === "tool_use") callOwner.set(part.toolUseId, entry);
  }
  return entries;
}
