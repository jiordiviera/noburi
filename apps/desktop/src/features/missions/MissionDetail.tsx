import { useState } from "react";
import { ExclamationCircleIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  runtime,
  RuntimeError,
  type Agent,
  type MissionEvent,
  type MissionTask,
  type PlanTask,
} from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { PlanEditor } from "./PlanEditor";
import { MISSION_STATUS, TASK_STATUS } from "./status";
import { useMission } from "./useMission";

interface Props {
  missionId: string;
  agents: Agent[];
  onChanged: () => void;
  onDeleted: () => void;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);

function toPlan(tasks: MissionTask[]): PlanTask[] {
  const index = new Map(tasks.map((t, i) => [t.id, i]));
  return tasks.map((t) => ({
    title: t.title,
    instructions: t.instructions,
    agentId: t.agentId,
    dependsOn: t.dependsOn.flatMap((id) => {
      const i = index.get(id);
      return i === undefined ? [] : [i];
    }),
  }));
}

export function MissionDetail({ missionId, agents, onChanged, onDeleted }: Props) {
  const { view, events, error } = useMission(missionId);
  const [plan, setPlan] = useState<PlanTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTitle>Could not load this mission</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!view) return <p className="p-8 text-sm text-muted-foreground">Loading the mission…</p>;

  const { mission, tasks, artifacts } = view;
  const draft = mission.status === "DRAFT";
  const editable = plan ?? toPlan(tasks);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const planValid = editable.every((t) => t.title.trim() && t.instructions.trim());

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setActionError(e instanceof RuntimeError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resolved = new Set(
    events.filter((e) => e.type === "approval.resolved").map((e) => str(e.payload["approvalId"])),
  );
  const pending = events.filter(
    (e) =>
      e.type === "approval.requested" &&
      !resolved.has(str(e.payload["approvalId"])) &&
      mission.status === "RUNNING",
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-lg font-semibold">{mission.title}</h1>
            <Badge className={cn("border-0", MISSION_STATUS[mission.status].className)}>
              {stopping && mission.status === "RUNNING"
                ? "Stopping…"
                : MISSION_STATUS[mission.status].label}
            </Badge>
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {mission.workspacePath}
          </p>
        </div>
        {draft && (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await runtime.deleteMission(mission.id);
                  onDeleted();
                })
              }
            >
              Delete
            </Button>
            <Button
              disabled={busy || !planValid}
              onClick={() =>
                void act(async () => {
                  await runtime.setPlan(mission.id, editable);
                  await runtime.startMission(mission.id);
                  setPlan(null);
                })
              }
            >
              Start mission
            </Button>
          </>
        )}
        {mission.status === "RUNNING" && (
          <Button
            variant="destructive"
            disabled={stopping}
            onClick={() => {
              setStopping(true);
              void act(() => runtime.cancelMission(mission.id));
            }}
          >
            Stop mission
          </Button>
        )}
        {!draft && mission.status !== "RUNNING" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await runtime.deleteMission(mission.id);
                onDeleted();
              })
            }
          >
            Delete
          </Button>
        )}
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>That did not work</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Objective</h2>
            <p className="font-reading text-sm leading-relaxed whitespace-pre-wrap">
              {mission.objective}
            </p>
          </section>

          {draft ? (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold">Plan</h2>
                <p className="text-sm text-muted-foreground">
                  Review the tasks before starting. Each task is a separate Claude Code run in the
                  workspace. Reading files is automatic; edits, shell commands and web access wait
                  for your approval.
                </p>
              </div>
              <PlanEditor plan={editable} agents={agents} onChange={setPlan} />
            </section>
          ) : (
            <>
              {mission.status === "INTERRUPTED" && (
                <Alert>
                  <AlertTitle>This mission was interrupted</AlertTitle>
                  <AlertDescription>
                    Noburi stopped while it was running. Nothing is restarted automatically; the
                    history below is what happened before the interruption.
                  </AlertDescription>
                </Alert>
              )}
              {pending.map((e) => (
                <div
                  key={e.seq}
                  role="alertdialog"
                  aria-label={`Approve ${str(e.payload["toolName"])}?`}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-warning/15 p-4 ring-1 ring-warning/50"
                >
                  <ExclamationCircleIcon aria-hidden="true" className="size-5 text-warning" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {agentName(tasks.find((t) => t.id === e.taskId)?.agentId ?? "")} wants to use{" "}
                      {str(e.payload["toolName"])}
                    </div>
                    <code className="block truncate font-mono text-xs text-muted-foreground">
                      {str(e.payload["summary"])}
                    </code>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void runtime.decide(
                        str(e.payload["runId"]),
                        str(e.payload["approvalId"]),
                        false,
                      )
                    }
                  >
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void runtime.decide(
                        str(e.payload["runId"]),
                        str(e.payload["approvalId"]),
                        true,
                      )
                    }
                  >
                    Approve once
                  </Button>
                </div>
              ))}
              <TaskList tasks={tasks} events={events} agentName={agentName} />
            </>
          )}

          {artifacts.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Deliverables</h2>
              {artifacts.map((a) => (
                <article key={a.id} className="flex flex-col gap-2 rounded-xl bg-card p-4">
                  <h3 className="text-sm font-medium">
                    {a.kind === "diff" ? a.title : `Summary · ${a.title}`}
                  </h3>
                  {a.kind === "diff" ? (
                    <pre className="overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs">
                      {a.content}
                    </pre>
                  ) : (
                    <p className="font-reading text-sm leading-relaxed whitespace-pre-wrap">
                      {a.content}
                    </p>
                  )}
                </article>
              ))}
              <p className="text-xs text-muted-foreground">
                Summaries are written by the agents. Changes stay in your working tree: nothing is
                committed or merged.
              </p>
            </section>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}

function TaskList({
  tasks,
  events,
  agentName,
}: {
  tasks: MissionTask[];
  events: MissionEvent[];
  agentName: (id: string) => string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Tasks</h2>
      {tasks.map((task) => {
        const own = events.filter((e) => e.taskId === task.id);
        const usage = own.filter((e) => e.type === "usage.updated").at(-1)?.payload;
        return (
          <article key={task.id} className="flex flex-col gap-3 rounded-xl bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent font-mono text-xs">
                {task.position + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{task.title}</div>
                <div className="text-xs text-muted-foreground">{agentName(task.agentId)}</div>
              </div>
              <Badge className={cn("border-0", TASK_STATUS[task.status].className)}>
                {TASK_STATUS[task.status].label}
              </Badge>
            </div>
            {own.length > 0 && (
              <ol className="flex flex-col gap-1.5 border-l pl-4">
                {own.map((e) => {
                  if (e.type === "agent.message") {
                    return (
                      <li
                        key={e.seq}
                        className="font-reading text-sm leading-relaxed whitespace-pre-wrap"
                      >
                        {str(e.payload["text"])}
                      </li>
                    );
                  }
                  if (e.type === "tool.started") {
                    return (
                      <li
                        key={e.seq}
                        className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
                      >
                        <WrenchScrewdriverIcon aria-hidden="true" className="size-3.5 text-info" />
                        <span className="text-info">{str(e.payload["name"])}</span>
                        <span className="min-w-0 truncate">{str(e.payload["summary"])}</span>
                      </li>
                    );
                  }
                  if (e.type === "approval.resolved") {
                    return (
                      <li key={e.seq} className="text-xs text-muted-foreground">
                        {e.payload["approved"] === true ? "Approved." : "Denied."}
                      </li>
                    );
                  }
                  if (e.type === "task.failed") {
                    return (
                      <li key={e.seq} className="text-sm text-destructive">
                        {str(e.payload["error"])}
                      </li>
                    );
                  }
                  return null;
                })}
              </ol>
            )}
            {usage && (
              <p className="font-mono text-xs text-muted-foreground">
                in {num(usage["inputTokens"])} · out {num(usage["outputTokens"])} · cache read{" "}
                {num(usage["cacheReadTokens"])} · cache write {num(usage["cacheWriteTokens"])}{" "}
                tokens · source {str(usage["measurementSource"])}
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
