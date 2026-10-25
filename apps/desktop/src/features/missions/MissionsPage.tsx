import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { runtime, runtimeConfigured, type Agent, type MissionView } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { relativeTime } from "../projects/time";
import { MissionDetail } from "./MissionDetail";
import { MISSION_STATUS } from "./status";

export function MissionsPage() {
  const [missions, setMissions] = useState<MissionView[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      Promise.all([runtime.missions(), runtime.agents()]).then(
        ([m, a]) => {
          setMissions(m.missions);
          setAgents(a.agents);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load missions."),
      ),
    [],
  );

  useEffect(() => {
    if (runtimeConfigured) void reload();
  }, [reload]);

  useEffect(() => {
    // Suggest folders from the projects the user already allowed Noburi to scan.
    let current = true;
    let consented = false;
    try {
      consented = localStorage.getItem("noburi.discovery.consent.v1") === "granted";
    } catch {
      consented = false;
    }
    if (!consented || !runtimeConfigured) return undefined;
    runtime.discovery().then(
      (d) => {
        if (current)
          setFolders(d.projects.filter((p) => p.exists && p.path).map((p) => p.path ?? ""));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, []);

  if (!runtimeConfigured) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg">
          <AlertTitle>The Noburi runtime is not connected</AlertTitle>
          <AlertDescription>
            Open the desktop app with pnpm desktop, or pnpm dev for the browser.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label="Missions"
        className="flex min-h-0 w-[340px] shrink-0 flex-col border-r bg-sidebar"
      >
        <div className="flex items-center gap-2 border-b p-4">
          <h1 className="flex-1 text-sm font-semibold">Missions</h1>
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden="true" className="size-4" />
            New mission
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="p-2">
            {error && <li className="p-3 text-sm text-destructive">{error}</li>}
            {missions?.length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">
                No mission yet. Start one in a project folder.
              </li>
            )}
            {missions?.map(({ mission, tasks }) => (
              <li key={mission.id}>
                <button
                  type="button"
                  aria-current={selected === mission.id ? "true" : undefined}
                  onClick={() => {
                    setCreating(false);
                    setSelected(mission.id);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left hover:bg-sidebar-accent",
                    selected === mission.id && "bg-sidebar-accent",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{mission.title}</span>
                    <Badge className={cn("border-0", MISSION_STATUS[mission.status].className)}>
                      {MISSION_STATUS[mission.status].label}
                    </Badge>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {tasks.length} task{tasks.length > 1 ? "s" : ""} ·{" "}
                    {relativeTime(Date.parse(mission.createdAt))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </section>

      {creating ? (
        <NewMission
          folders={folders}
          onCreated={(id) => {
            void reload();
            setCreating(false);
            setSelected(id);
          }}
        />
      ) : selected ? (
        <MissionDetail
          key={selected}
          missionId={selected}
          agents={agents}
          onChanged={() => void reload()}
          onDeleted={() => {
            setSelected(null);
            void reload();
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Pick a mission, or start a new one.
        </div>
      )}
    </div>
  );
}

function NewMission({
  folders,
  onCreated,
}: {
  folders: string[];
  onCreated: (id: string) => void;
}) {
  const [workspacePath, setWorkspacePath] = useState(folders[0] ?? "");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const budgetTokens = Number.parseInt(budget.replaceAll(/[\s,_]/g, ""), 10);
      const view = await runtime.createMission({
        workspacePath: workspacePath.trim(),
        objective,
        ...(Number.isFinite(budgetTokens) && budgetTokens > 0 ? { budgetTokens } : {}),
      });
      onCreated(view.mission.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-w-0 flex-1 justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <div>
          <h1 className="text-lg font-semibold">New mission</h1>
          <p className="text-sm text-muted-foreground">
            Describe the goal. Noburi drafts a plan you can edit; nothing runs until you start it.
          </p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not create the mission</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="mission-folder">Workspace folder</Label>
          {folders.length > 0 && (
            <Select
              value={folders.includes(workspacePath) ? workspacePath : ""}
              onValueChange={setWorkspacePath}
            >
              <SelectTrigger aria-label="Pick a known project" className="w-full">
                <SelectValue placeholder="Pick one of your Claude Code projects" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f} value={f} className="font-mono text-xs">
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            id="mission-folder"
            className="font-mono text-xs"
            placeholder="/absolute/path/to/your/project"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Agents work only in this folder. It is not a sandbox: changes land in your working tree.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mission-objective">Objective</Label>
          <Textarea
            id="mission-objective"
            rows={5}
            placeholder="Analyse this repository, propose two improvements and implement the simplest with tests."
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mission-budget">Token budget (optional)</Label>
          <Input
            id="mission-budget"
            inputMode="numeric"
            className="w-48 font-mono"
            placeholder="e.g. 500000"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            All tokens Claude processes count, cache reads included. Checked before each task: once
            reached, no new task starts; a task already running is not cut off.
          </p>
        </div>
        <Button
          className="self-start"
          disabled={busy || !objective.trim() || !workspacePath.trim()}
          onClick={() => void create()}
        >
          Draft the plan
        </Button>
      </div>
    </main>
  );
}
