import { randomUUID } from "node:crypto";
import type { ClaudeRunOptions, RunEvent } from "@noburi/provider-claude";

export type RunStatus = "running" | "cancelling" | "succeeded" | "failed" | "cancelled";

export type RunStreamEvent = RunEvent | { type: "run.finished"; status: RunStatus };

export interface RunRecord {
  seq: number;
  at: string;
  event: RunStreamEvent;
}

export type StartRun = (options: ClaudeRunOptions) => AsyncIterable<RunEvent>;

export interface CreateRunInput {
  prompt: string;
  cwd: string;
  resumeSessionId?: string | undefined;
  fork?: boolean | undefined;
}

interface Run {
  id: string;
  input: CreateRunInput;
  status: RunStatus;
  records: RunRecord[];
  listeners: Set<(record: RunRecord) => void>;
  approvals: Map<string, (approved: boolean) => void>;
  abort: AbortController;
}

/**
 * Owns live Claude runs: buffers their events so a UI can reconnect and replay, holds pending
 * approvals, and only reports "cancelled" once the run has actually stopped.
 */
export class RunManager {
  readonly #runs = new Map<string, Run>();

  constructor(private readonly start: StartRun) {}

  create(input: CreateRunInput): string {
    const run: Run = {
      id: randomUUID(),
      input,
      status: "running",
      records: [],
      listeners: new Set(),
      approvals: new Map(),
      abort: new AbortController(),
    };
    this.#runs.set(run.id, run);
    void this.#drive(run);
    return run.id;
  }

  /** Session ids a run started by Noburi is currently writing to. */
  activeSessionIds(): Set<string> {
    const ids = new Set<string>();
    for (const run of this.#runs.values()) {
      if (
        run.input.resumeSessionId &&
        !run.input.fork &&
        (run.status === "running" || run.status === "cancelling")
      ) {
        ids.add(run.input.resumeSessionId);
      }
    }
    return ids;
  }

  status(runId: string): RunStatus | undefined {
    return this.#runs.get(runId)?.status;
  }

  /** Replays everything after `afterSeq`, then streams live records. Returns an unsubscribe function. */
  subscribe(
    runId: string,
    afterSeq: number,
    listener: (record: RunRecord) => void,
  ): (() => void) | undefined {
    const run = this.#runs.get(runId);
    if (!run) return undefined;
    for (const record of run.records) if (record.seq > afterSeq) listener(record);
    run.listeners.add(listener);
    return () => run.listeners.delete(listener);
  }

  decide(runId: string, approvalId: string, approved: boolean): boolean {
    const resolve = this.#runs.get(runId)?.approvals.get(approvalId);
    if (!resolve) return false;
    resolve(approved);
    return true;
  }

  cancel(runId: string): boolean {
    const run = this.#runs.get(runId);
    if (!run || run.status !== "running") return false;
    run.status = "cancelling";
    for (const resolve of run.approvals.values()) resolve(false);
    run.abort.abort();
    return true;
  }

  #emit(run: Run, event: RunStreamEvent): void {
    const record: RunRecord = { seq: run.records.length + 1, at: new Date().toISOString(), event };
    run.records.push(record);
    for (const listener of run.listeners) listener(record);
  }

  async #drive(run: Run): Promise<void> {
    let finalStatus: RunStatus = "failed";
    try {
      const events = this.start({
        ...run.input,
        signal: run.abort.signal,
        requestApproval: (request) =>
          new Promise<boolean>((resolve) => {
            run.approvals.set(request.approvalId, (approved) => {
              if (!run.approvals.delete(request.approvalId)) return;
              this.#emit(run, {
                type: "approval.resolved",
                approvalId: request.approvalId,
                approved,
              });
              resolve(approved);
            });
            this.#emit(run, { type: "approval.requested", ...request });
          }),
      });
      for await (const event of events) {
        this.#emit(run, event);
        if (event.type === "result") finalStatus = event.ok ? "succeeded" : "failed";
      }
    } catch (error) {
      this.#emit(run, {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      finalStatus = "failed";
    }
    // Only now is the run really over; a cancel request becomes "cancelled" here, not before.
    run.status = run.abort.signal.aborted ? "cancelled" : finalStatus;
    this.#emit(run, { type: "run.finished", status: run.status });
    run.listeners.clear();
  }
}
