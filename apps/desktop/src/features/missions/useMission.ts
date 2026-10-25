import { useCallback, useEffect, useState } from "react";
import { runtime, type MissionArtifact, type MissionEvent, type MissionView } from "@/lib/runtime";

type Loaded = MissionView & { artifacts: MissionArtifact[] };

/** Events after which the mission's tasks, status or deliverables may have changed. */
const REFRESH = /^(mission|task|approval|artifact)\./;

/** Loads one mission and follows its event stream (replayed from the start, then live). */
export function useMission(missionId: string | null) {
  const [view, setView] = useState<Loaded | null>(null);
  // Tagged with the mission they belong to, so switching missions never mixes their events.
  const [stream, setStream] = useState<{ id: string | null; events: MissionEvent[] }>({
    id: missionId,
    events: [],
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      missionId === null
        ? Promise.resolve()
        : runtime.mission(missionId).then(
            (v) => {
              setView(v);
              setError(null);
            },
            (e: unknown) =>
              setError(e instanceof Error ? e.message : "Could not load the mission."),
          ),
    [missionId],
  );

  useEffect(() => {
    // The stream replays every event, then follows live; each state change reloads the mission.
    if (missionId === null) return () => {};
    const controller = new AbortController();
    void load();
    runtime
      .streamMission(
        missionId,
        (event) => {
          setStream((prev) => {
            const events = prev.id === missionId ? prev.events : [];
            return events.some((e) => e.seq === event.seq)
              ? prev
              : { id: missionId, events: [...events, event] };
          });
          if (REFRESH.test(event.type)) void load();
        },
        controller.signal,
      )
      .catch(() => {
        // Closed on unmount; the mission keeps running in the runtime.
      });
    return () => controller.abort();
  }, [missionId, load]);

  const events = stream.id === missionId ? stream.events : [];
  const current = view?.mission.id === missionId ? view : null;
  return { view: current, events, error, refresh: load };
}
