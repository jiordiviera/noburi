/** Display-ready view of a Claude Code transcript. Thinking blocks are left out on purpose. */
export type TranscriptPart =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; toolUseId: string; name: string; summary: string }
  | { kind: "tool_result"; toolUseId: string; text: string; isError: boolean };

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

const MAX_DETAIL = 8000;

/**
 * Everything the player needs to judge a tool call before approving it: the whole command, or the
 * file and the exact text an edit replaces. The one-line summary is for lists; this is for decisions.
 */
export function describeToolInput(name: string, input: unknown): string {
  if (!isRecord(input)) return name;
  const command = str(input["command"]);
  if (command) return clip(command, MAX_DETAIL);
  const path = str(input["file_path"]) ?? str(input["path"]);
  const oldText = str(input["old_string"]);
  const newText = str(input["new_string"]);
  if (path && oldText !== null && newText !== null)
    return clip(
      `${path}\n\n- ${oldText.split("\n").join("\n- ")}\n+ ${newText.split("\n").join("\n+ ")}`,
      MAX_DETAIL,
    );
  const content = str(input["content"]);
  if (path && content !== null) return clip(`${path}\n\n${content}`, MAX_DETAIL);
  return clip(JSON.stringify(input, null, 2), MAX_DETAIL);
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (isRecord(block) && block["type"] === "text" ? (str(block["text"]) ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

function toParts(content: unknown): TranscriptPart[] {
  if (typeof content === "string")
    return content.trim() ? [{ kind: "text", text: clip(content, MAX_TEXT) }] : [];
  if (!Array.isArray(content)) return [];
  const parts: TranscriptPart[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    const type = block["type"];
    if (type === "text") {
      const text = str(block["text"]);
      if (text?.trim()) parts.push({ kind: "text", text: clip(text, MAX_TEXT) });
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
    const parts = toParts(content);
    if (parts.length === 0) continue;
    const raw: unknown = m;
    const timestamp = isRecord(raw) ? str(raw["timestamp"]) : null;
    const fromSubagent = m.parent_tool_use_id !== null;

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
