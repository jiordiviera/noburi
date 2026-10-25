import { useMemo, useState } from "react";
import { ArrowPathIcon, ExclamationTriangleIcon, FolderIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Discovery, SessionSummary } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { relativeTime } from "./time";

interface Props {
  discovery: Discovery;
  selectedId: string | null;
  onSelect: (session: SessionSummary, projectPath: string | null) => void;
  onRescan: () => void;
  scanning: boolean;
}

export function ProjectList({ discovery, selectedId, onSelect, onRescan, scanning }: Props) {
  const [query, setQuery] = useState("");

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return discovery.projects;
    return discovery.projects
      .map((p) => ({
        ...p,
        sessions: p.name.toLowerCase().includes(q)
          ? p.sessions
          : p.sessions.filter((s) => `${s.title} ${s.firstPrompt ?? ""}`.toLowerCase().includes(q)),
      }))
      .filter((p) => p.sessions.length > 0);
  }, [discovery.projects, query]);

  const sessionCount = discovery.projects.reduce((n, p) => n + p.sessions.length, 0);

  return (
    <section
      aria-label="Projects"
      className="flex min-h-0 w-[400px] shrink-0 flex-col border-r bg-sidebar"
    >
      <div className="flex flex-col gap-2.5 border-b p-4">
        <label htmlFor="session-search" className="sr-only">
          Search projects and sessions
        </label>
        <Input
          id="session-search"
          type="search"
          placeholder="Search projects and sessions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {discovery.projects.length} projects · {sessionCount} sessions · read-only from{" "}
            <span className="font-mono">{discovery.scope}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onRescan} disabled={scanning}>
            <ArrowPathIcon
              aria-hidden="true"
              className={cn("size-4", scanning && "animate-spin")}
            />
            Rescan
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {projects.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {query
                ? "No session matches this search."
                : "No Claude Code CLI sessions found on this machine."}
            </p>
          )}
          {projects.map((project) => (
            <div key={project.id} className="mb-3">
              <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
                <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span
                  className="min-w-0 flex-1 truncate text-sm font-semibold"
                  title={project.path ?? undefined}
                >
                  {project.name}
                </span>
                {!project.exists && project.path && (
                  <Badge variant="destructive" className="gap-1">
                    <ExclamationTriangleIcon aria-hidden="true" className="size-3" />
                    Folder missing
                  </Badge>
                )}
              </div>
              <ul>
                {project.sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={selectedId === s.id ? "true" : undefined}
                      onClick={() => onSelect(s, project.path)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent",
                        selectedId === s.id && "bg-sidebar-accent",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-0.5 self-stretch rounded-full",
                          selectedId === s.id && "bg-primary",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{s.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {relativeTime(s.lastModified)}
                          {s.gitBranch ? ` · ${s.gitBranch}` : ""}
                        </span>
                      </span>
                      {s.recentlyActive && (
                        <Badge variant="outline" className="border-warning/40 text-warning">
                          Active now
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ScrollArea>

      <p className="border-t p-3 text-xs text-muted-foreground">
        Cloud, Desktop and claude.ai conversations are not stored locally and are not listed.
      </p>
    </section>
  );
}
