import { useCallback, useEffect, useMemo, useState } from "react";
import { runtime, type Agent, type Issue, type MissionView } from "@/lib/runtime";
import { pullRequestUrl } from "./scene";

const REPO_KEY = "noburi.game.repo";
const WANDER_KEY = "noburi.game.wander";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A convenience only: the game still works without remembering it.
  }
}

/** The issue number a mission works on, when it belongs to `repo`. */
export function issueNumber(ref: string | null, repo: string): number | null {
  if (!ref?.startsWith(`${repo}#`)) return null;
  const n = Number(ref.slice(repo.length + 1));
  return Number.isInteger(n) ? n : null;
}

export interface Finished {
  mission: MissionView["mission"];
  pullRequest: string | null;
}

/**
 * State the whole studio shares: the repository, its open issues, the missions run on it and the
 * agents. Missions are local and cheap to list, so a short poll keeps every screen current.
 */
export function useStudio() {
  const [repo, setRepoState] = useState(() => read(REPO_KEY) ?? "");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionView[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [wander, setWanderState] = useState(() => read(WANDER_KEY) !== "off");

  const loadIssues = useCallback(
    (name: string) =>
      runtime.issues(name).then(
        (r) => {
          setIssues(r.issues);
          setBoardError(null);
        },
        (e: unknown) =>
          setBoardError(e instanceof Error ? e.message : "Could not read the issues."),
      ),
    [],
  );

  const refreshMissions = useCallback(
    () =>
      runtime.missions().then(
        (r) => setMissions(r.missions),
        () => {},
      ),
    [],
  );

  useEffect(() => {
    if (repo) void loadIssues(repo);
  }, [repo, loadIssues]);

  useEffect(() => {
    void refreshMissions();
    const timer = setInterval(() => void refreshMissions(), 3000);
    return () => clearInterval(timer);
  }, [refreshMissions]);

  useEffect(() => {
    let current = true;
    runtime.agents().then(
      (r) => {
        if (current) setAgents(r.agents);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);

  const setRepo = useCallback(
    (next: string) => {
      write(REPO_KEY, next);
      if (next === repo) void loadIssues(next);
      else setRepoState(next);
    },
    [repo, loadIssues],
  );

  const setWander = useCallback((on: boolean) => {
    write(WANDER_KEY, on ? "on" : "off");
    setWanderState(on);
  }, []);

  const repoMissions = useMemo(
    () => missions.filter((m) => issueNumber(m.mission.issueRef, repo) !== null),
    [missions, repo],
  );
  // Delivered only when the agent reported a pull request; a stop after a refusal is listed apart.
  const finished: Finished[] = useMemo(
    () =>
      repoMissions
        .filter((m) => m.mission.status === "COMPLETED")
        .map((m) => ({
          mission: m.mission,
          pullRequest: pullRequestUrl(m.tasks.map((t) => t.resultText ?? "").join("\n")),
        })),
    [repoMissions],
  );

  return {
    repo,
    setRepo,
    issues,
    boardError,
    reloadIssues: () => (repo ? loadIssues(repo) : Promise.resolve()),
    missions: repoMissions,
    refreshMissions,
    finished,
    delivered: finished.filter((f) => f.pullRequest !== null),
    agents,
    wander,
    setWander,
  };
}

export type Studio = ReturnType<typeof useStudio>;
