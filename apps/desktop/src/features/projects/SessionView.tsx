import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  runtime,
  RuntimeError,
  type SessionSummary,
  type TranscriptEntry,
  type TranscriptPage,
} from "@/lib/runtime";
import { RunPanel } from "./RunPanel";
import { TranscriptView } from "./Transcript";
import { useRun } from "./useRun";

const PAGE = 100;

interface Props {
  session: SessionSummary;
  projectPath: string | null;
  projectExists: boolean;
  onRunFinished: () => void;
}

export function SessionView({ session, projectPath, projectExists, onRunFinished }: Props) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [startError, setStartError] = useState<RuntimeError | null>(null);
  const { run, follow, cancel, decide } = useRun();

  const showPage = (page: TranscriptPage, append: boolean) => {
    setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
    setHasMore(page.hasMore);
    setLoadError(null);
  };
  const showError = (error: unknown) =>
    setLoadError(error instanceof Error ? error.message : "Could not read this session.");

  // The parent keys this view by session id, so each session mounts with fresh state.
  useEffect(() => {
    let current = true;
    runtime
      .messages(session.id, 0, PAGE)
      .then(
        (page) => {
          if (!current) return;
          setEntries(page.entries);
          setHasMore(page.hasMore);
        },
        (error: unknown) => {
          if (current)
            setLoadError(error instanceof Error ? error.message : "Could not read this session.");
        },
      )
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [session.id]);

  const loadMore = async () => {
    setLoading(true);
    try {
      showPage(await runtime.messages(session.id, entries.length, PAGE), true);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const finished = run !== null && run.status !== "running" && run.status !== "cancelling";
  useEffect(() => {
    if (finished) onRunFinished();
  }, [finished, onRunFinished]);

  const start = async (options: { fork?: boolean; force?: boolean }) => {
    setStartError(null);
    try {
      const { runId } = await runtime.createRun({ sessionId: session.id, prompt, ...options });
      follow(runId);
      setPrompt("");
    } catch (error) {
      setStartError(
        error instanceof RuntimeError ? error : new RuntimeError(0, String(error), null),
      );
    }
  };

  const busy = run?.status === "running" || run?.status === "cancelling";
  const canContinue = projectExists && projectPath !== null && prompt.trim().length > 0 && !busy;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{session.title}</h1>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {session.id} · {projectPath ?? "no recorded folder"}
            {session.gitBranch ? ` · ${session.gitBranch}` : ""}
          </p>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
          {loadError && (
            <Alert variant="destructive">
              <AlertTitle>Could not read this session</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}
          <TranscriptView entries={entries} />
          {loading && <p className="text-sm text-muted-foreground">Reading the transcript…</p>}
          {hasMore && !loading && (
            <Button variant="secondary" className="self-center" onClick={() => void loadMore()}>
              Load more messages
            </Button>
          )}
          {run && <RunPanel run={run} onDecide={decide} onCancel={() => void cancel()} />}
        </div>
      </ScrollArea>

      <footer className="flex flex-col gap-3 border-t px-6 py-4">
        {!projectExists && (
          <Alert>
            <AlertTitle>The project folder is missing</AlertTitle>
            <AlertDescription>
              The history stays readable, but Claude cannot continue without its folder.
            </AlertDescription>
          </Alert>
        )}
        {startError?.code === "recently_active" ? (
          <Alert>
            <AlertTitle>This session may be open elsewhere</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              It was written to in the last two minutes. Continuing it from two places at once can
              mix up its history. Fork it to experiment safely, or continue anyway if nothing else
              is using it.
              <span className="flex gap-2">
                <Button size="sm" onClick={() => void start({ fork: true })}>
                  Fork instead
                </Button>
                <Button size="sm" variant="outline" onClick={() => void start({ force: true })}>
                  Continue anyway
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          startError && (
            <Alert variant="destructive">
              <AlertTitle>Could not start Claude</AlertTitle>
              <AlertDescription>{startError.message}</AlertDescription>
            </Alert>
          )
        )}
        <label htmlFor="resume-prompt" className="sr-only">
          Message for Claude
        </label>
        <Textarea
          id="resume-prompt"
          placeholder={projectExists ? "Continue this conversation…" : "Folder missing: read-only"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!projectExists || busy}
          rows={3}
        />
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Runs Claude Code in this session&apos;s folder. Reading files is automatic; edits, shell
            commands and web access wait for your approval.
          </p>
          <Button
            variant="secondary"
            disabled={!canContinue}
            onClick={() => void start({ fork: true })}
          >
            Fork
          </Button>
          <Button disabled={!canContinue} onClick={() => void start({})}>
            Continue session
          </Button>
        </div>
      </footer>
    </main>
  );
}
