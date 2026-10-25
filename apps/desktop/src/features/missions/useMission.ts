import { useCallback, useEffect, useState } from "react";
import { runtime, type MissionArtifact, type MissionEvent, type MissionView } from "@/lib/runtime";

type Loaded = MissionView & { artifacts: MissionArtifact[] };

/** Events after which the mission's tasks, status or deliverables may have changed. */
const REFRESH = /^(mission|task|approval|artifact)\./;

/** Loads one mission and follows its event stream (replayed from the start, then live). */
export function useMission(missionId: string) {
  const [view, setView] = useState<Loaded | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      runtime.mission(missionId).then(
        (v) => {
          setView(v);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load the mission."),
      ),
    [missionId],
  );

  useEffect(() => {
    // The stream replays every event, then follows live; each state change reloads the mission.
    const controller = new AbortController();
    void load();
    runtime
      .streamMission(
        missionId,
        (event) => {
          setEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
          if (REFRESH.test(event.type)) void load();
        },
        controller.signal,
      )
      .catch(() => {
        // Closed on unmount; the mission keeps running in the runtime.
      });
    return () => controller.abort();
  }, [missionId, load]);

  return { view, events, error, refresh: load };
}
