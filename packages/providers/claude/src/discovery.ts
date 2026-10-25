import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** What Noburi needs from one Claude Code CLI session; mirrors the SDK's SDKSessionInfo. */
export interface SessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  fileSize?: number | undefined;
  customTitle?: string | undefined;
  firstPrompt?: string | undefined;
  gitBranch?: string | undefined;
  cwd?: string | undefined;
  createdAt?: number | undefined;
}

export interface SessionSummary {
  id: string;
  title: string;
  firstPrompt: string | null;
  gitBranch: string | null;
  lastModified: number;
  createdAt: number | null;
  sizeBytes: number | null;
  /** Written to very recently: another Claude Code process may still be appending to it. */
  recentlyActive: boolean;
}

export interface ProjectSummary {
  /** Stable id derived from the path, safe to put in URLs. */
  id: string;
  /** Working directory recorded by Claude Code, or null when the session did not record one. */
  path: string | null;
  name: string;
  exists: boolean;
  gitRoot: string | null;
  lastModified: number;
  sessions: SessionSummary[];
}

export const RECENT_ACTIVITY_MS = 2 * 60 * 1000;

export interface DiscoveryFs {
  isDirectory(path: string): boolean;
  exists(path: string): boolean;
}

export const nodeFs: DiscoveryFs = {
  isDirectory: (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  exists: (p) => existsSync(p),
};

function projectId(path: string | null): string {
  return createHash("sha256")
    .update(path ?? "<no-cwd>")
    .digest("base64url")
    .slice(0, 16);
}

/** Walks up from `start` looking for a `.git` entry (directory, or file for worktrees). */
export function findGitRoot(start: string, fs: DiscoveryFs): string | null {
  let dir = resolve(start);
  for (;;) {
    if (fs.exists(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function toSummary(s: SessionInfo, now: number): SessionSummary {
  return {
    id: s.sessionId,
    title: s.customTitle ?? s.summary,
    firstPrompt: s.firstPrompt ?? null,
    gitBranch: s.gitBranch ?? null,
    lastModified: s.lastModified,
    createdAt: s.createdAt ?? null,
    sizeBytes: s.fileSize ?? null,
    recentlyActive: now - s.lastModified < RECENT_ACTIVITY_MS,
  };
}

/**
 * Groups sessions by the working directory Claude Code recorded. Read-only: missing folders are
 * reported, never removed, and nothing here writes to Claude's storage.
 */
export function groupSessions(
  sessions: readonly SessionInfo[],
  fs: DiscoveryFs = nodeFs,
  now = Date.now(),
): ProjectSummary[] {
  const byPath = new Map<string | null, SessionInfo[]>();
  for (const s of sessions) {
    const key = s.cwd ? resolve(s.cwd) : null;
    const list = byPath.get(key) ?? [];
    list.push(s);
    byPath.set(key, list);
  }

  const projects: ProjectSummary[] = [];
  for (const [path, list] of byPath) {
    const exists = path !== null && fs.isDirectory(path);
    const summaries = list
      .map((s) => toSummary(s, now))
      .toSorted((a, b) => b.lastModified - a.lastModified);
    projects.push({
      id: projectId(path),
      path,
      name: path === null ? "Unknown folder" : basename(path) || path,
      exists,
      gitRoot: exists && path !== null ? findGitRoot(path, fs) : null,
      lastModified: summaries[0]?.lastModified ?? 0,
      sessions: summaries,
    });
  }
  return projects.toSorted((a, b) => b.lastModified - a.lastModified);
}
