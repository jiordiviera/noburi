import { useCallback, useEffect, useRef, useState } from "react";
import { runtime, type RunRecord, type RunStatus } from "@/lib/runtime";

export interface RunState {
  runId: string;
  records: RunRecord[];
  status: RunStatus;
  /** Session the run writes to; differs from the source session when forking. */
  sessionId: string | null;
}

/** Follows one live run: replays its events, then streams new ones until it finishes. */
export function useRun() {
  const [run, setRun] = useState<RunState | null>(null);
  const stream = useRef<AbortController | null>(null);

  useEffect(() => () => stream.current?.abort(), []);

  const follow = useCallback((runId: string) => {
    stream.current?.abort();
    const controller = new AbortController();
    stream.current = controller;
    setRun({ runId, records: [], status: "running", sessionId: null });
    runtime
      .streamEvents(
        runId,
        (record) =>
          setRun((current) => {
            if (!current || current.runId !== runId) return current;
            const { event } = record;
            return {
              ...current,
              records: [...current.records, record],
              status: event.type === "run.finished" ? event.status : current.status,
              sessionId: event.type === "session" ? event.sessionId : current.sessionId,
            };
          }),
        controller.signal,
      )
      .catch(() => {
        // Aborted on unmount or replaced by a newer run; the runtime keeps the run either way.
      });
  }, []);

  const cancel = useCallback(async () => {
    if (!run) return;
    setRun({ ...run, status: "cancelling" });
    await runtime.cancel(run.runId).catch(() => undefined);
  }, [run]);

  const decide = useCallback(
    (approvalId: string, approved: boolean) => {
      if (run) void runtime.decide(run.runId, approvalId, approved).catch(() => undefined);
    },
    [run],
  );

  const clear = useCallback(() => {
    stream.current?.abort();
    setRun(null);
  }, []);

  return { run, follow, cancel, decide, clear };
}
