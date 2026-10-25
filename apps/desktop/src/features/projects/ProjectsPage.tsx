import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  runtime,
  runtimeConfigured,
  type Discovery,
  type ProjectSummary,
  type SessionSummary,
} from "@/lib/runtime";
import { ProjectList } from "./ProjectList";
import { SessionView } from "./SessionView";

const CONSENT_KEY = "noburi.discovery.consent.v1";

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function ProjectsPage() {
  const [consent, setConsent] = useState(readConsent);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const showDiscovery = (d: Discovery) => {
    setDiscovery(d);
    setError(null);
  };
  const showError = (e: unknown) =>
    setError(e instanceof Error ? e.message : "Could not scan sessions.");

  useEffect(() => {
    if (!consent || !runtimeConfigured) return undefined;
    let current = true;
    runtime.discovery().then(
      (d) => {
        if (!current) return;
        setDiscovery(d);
        setError(null);
      },
      (e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : "Could not scan sessions.");
      },
    );
    return () => {
      current = false;
    };
  }, [consent]);

  const rescan = async () => {
    setScanning(true);
    try {
      showDiscovery(await runtime.discovery());
    } catch (e) {
      showError(e);
    } finally {
      setScanning(false);
    }
  };

  let selected: { session: SessionSummary; project: ProjectSummary } | null = null;
  for (const project of discovery?.projects ?? []) {
    const session = project.sessions.find((s) => s.id === selectedId);
    if (session) selected = { session, project };
  }

  if (!runtimeConfigured) {
    return (
      <Centered>
        <Alert>
          <AlertTitle>The Noburi runtime is not connected</AlertTitle>
          <AlertDescription>
            Start the app with <code className="font-mono">pnpm dev</code> from the repository root:
            it launches the local runtime and this interface together.
          </AlertDescription>
        </Alert>
      </Centered>
    );
  }

  if (!consent) {
    return (
      <Centered>
        <Card>
          <CardHeader>
            <CardTitle>Find your Claude Code projects</CardTitle>
            <CardDescription>
              Noburi can list the projects and conversations you already have in the Claude Code
              CLI, so you can read and continue them here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              It reads <span className="font-mono text-foreground">~/.claude/projects</span> (or{" "}
              <span className="font-mono text-foreground">$CLAUDE_CONFIG_DIR/projects</span>)
              through the official Claude Agent SDK.
            </p>
            <p>Read-only: nothing is copied, changed or deleted, and nothing is sent anywhere.</p>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => {
                try {
                  localStorage.setItem(CONSENT_KEY, "granted");
                } catch {
                  // Without storage the question simply comes back next launch.
                }
                setConsent(true);
              }}
            >
              Scan my sessions
            </Button>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  if (!discovery) {
    return (
      <Centered>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not scan sessions</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              {error}
              <Button size="sm" variant="outline" onClick={() => void rescan()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">Looking for Claude Code sessions…</p>
        )}
      </Centered>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <ProjectList
        discovery={discovery}
        selectedId={selectedId}
        onSelect={(s) => setSelectedId(s.id)}
        onRescan={() => void rescan()}
        scanning={scanning}
      />
      {selected ? (
        <SessionView
          key={selected.session.id}
          session={selected.session}
          projectPath={selected.project.path}
          projectExists={selected.project.exists}
          onRunFinished={() => void rescan()}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Pick a session to read its history.
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      {<div className="w-full max-w-lg">{children}</div>}
    </div>
  );
}
