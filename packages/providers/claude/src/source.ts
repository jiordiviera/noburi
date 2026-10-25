import { getSessionInfo, getSessionMessages, listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionInfo } from "./discovery.ts";
import type { RawSessionMessage } from "./transcript.ts";

/**
 * Read-only access to local Claude Code CLI sessions. Only the SDK's listing and reading functions
 * are used: never renameSession, tagSession, deleteSession or anything else that writes.
 */
export interface SessionSource {
  list(): Promise<SessionInfo[]>;
  info(sessionId: string): Promise<SessionInfo | undefined>;
  messages(
    sessionId: string,
    page: { offset: number; limit: number },
  ): Promise<RawSessionMessage[]>;
}

export const sdkSessionSource: SessionSource = {
  list: () => listSessions(),
  info: (sessionId) => getSessionInfo(sessionId),
  messages: (sessionId, page) => getSessionMessages(sessionId, page),
};

/** Where Claude Code keeps CLI sessions, for showing the scan scope to the user. */
export function claudeProjectsDir(
  env: NodeJS.ProcessEnv = process.env,
  home = process.env["HOME"] ?? "~",
): string {
  const base = env["CLAUDE_CONFIG_DIR"] ?? `${home}/.claude`;
  return `${base}/projects`;
}
