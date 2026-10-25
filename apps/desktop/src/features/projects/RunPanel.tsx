import { ExclamationCircleIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RunStatus } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import type { RunState } from "./useRun";

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  running: { label: "Running", className: "bg-success/15 text-success" },
  cancelling: { label: "Stopping…", className: "bg-warning/15 text-warning" },
  succeeded: { label: "Finished", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Stopped", className: "bg-muted text-muted-foreground" },
};

interface Props {
  run: RunState;
  onDecide: (approvalId: string, approved: boolean) => void;
  onCancel: () => void;
}

export function RunPanel({ run, onDecide, onCancel }: Props) {
  const resolved = new Set(
    run.records.flatMap((r) => (r.event.type === "approval.resolved" ? [r.event.approvalId] : [])),
  );
  const finished = !(run.status === "running" || run.status === "cancelling");
  const session = run.records.find((r) => r.event.type === "session")?.event;

  return (
    <section
      aria-label="Live run"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl bg-card p-4"
    >
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">This run</h3>
        <Badge className={cn("border-0", STATUS[run.status].className)}>
          {STATUS[run.status].label}
        </Badge>
        {session?.type === "session" && (
          <span className="font-mono text-xs text-muted-foreground">{session.model}</span>
        )}
        <div className="flex-1" />
        {run.status === "running" && (
          <Button variant="destructive" size="sm" onClick={onCancel}>
            Stop
          </Button>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {run.records.map(({ seq, event }) => {
          switch (event.type) {
            case "text":
              return (
                <li key={seq} className="text-sm leading-relaxed whitespace-pre-wrap">
                  {event.text}
                </li>
              );
            case "tool.started":
              return (
                <li
                  key={seq}
                  className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
                >
                  <WrenchScrewdriverIcon aria-hidden="true" className="size-3.5 text-info" />
                  <span className="text-info">{event.name}</span>
                  <span className="min-w-0 truncate">{event.summary}</span>
                </li>
              );
            case "tool.completed":
              return event.isError ? (
                <li key={seq} className="font-mono text-xs text-destructive">
                  error: {event.text || "tool failed"}
                </li>
              ) : null;
            case "approval.requested": {
              const pending = !resolved.has(event.approvalId) && !finished;
              return (
                <li
                  key={seq}
                  role={pending ? "alertdialog" : undefined}
                  aria-label={pending ? `Approve ${event.toolName}?` : undefined}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-lg p-3",
                    pending ? "bg-warning/15 ring-1 ring-warning/50" : "bg-muted",
                  )}
                >
                  <ExclamationCircleIcon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-warning"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Claude wants to use {event.toolName}</div>
                    <code className="block truncate font-mono text-xs text-muted-foreground">
                      {event.summary}
                      {event.blockedPath ? ` · outside the project: ${event.blockedPath}` : ""}
                    </code>
                  </div>
                  {pending ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDecide(event.approvalId, false)}
                      >
                        Deny
                      </Button>
                      <Button size="sm" onClick={() => onDecide(event.approvalId, true)}>
                        Approve once
                      </Button>
                    </>
                  ) : null}
                </li>
              );
            }
            case "approval.resolved":
              return (
                <li key={seq} className="text-xs text-muted-foreground">
                  {event.approved ? "Approved." : "Denied."}
                </li>
              );
            case "result":
              return (
                <li
                  key={seq}
                  className="mt-1 rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground"
                >
                  {event.ok ? "Completed" : "Ended with an error"} · {event.numTurns} turns ·{" "}
                  {(event.durationMs / 1000).toFixed(1)} s · in {event.usage.inputTokens} / out{" "}
                  {event.usage.outputTokens} / cache read {event.usage.cacheReadTokens} / cache
                  write {event.usage.cacheWriteTokens} tokens · source {event.measurementSource}
                </li>
              );
            case "error":
              return (
                <li key={seq} className="text-sm text-destructive">
                  {event.message}
                </li>
              );
            default:
              return null;
          }
        })}
        {run.records.length === 0 && (
          <li className="text-sm text-muted-foreground">Starting Claude Code…</li>
        )}
      </ol>
    </section>
  );
}
