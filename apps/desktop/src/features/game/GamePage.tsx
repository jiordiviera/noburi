import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import background from "../../../../../assets/worlds/cozy-office/background.svg?url";
import desk from "../../../../../assets/worlds/cozy-office/objects/desk.svg?url";
import bubbleApproval from "../../../../../assets/worlds/cozy-office/objects/bubble-approval.svg?url";
import bubbleThinking from "../../../../../assets/worlds/cozy-office/objects/bubble-thinking.svg?url";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMission } from "@/features/missions/useMission";
import { deriveOffice, type AgentVisual, type OfficeAgent } from "@/features/office/officeState";
import {
  runtime,
  type Agent,
  type Issue,
  type MissionEvent,
  type MissionView,
} from "@/lib/runtime";
import { cn } from "@/lib/utils";
import {
  BOARD,
  CHARACTER,
  cardColor,
  DESK,
  DEV_DESK,
  PLAYER_DESK,
  pullRequestUrl,
  route,
  SCENE,
  sceneScale,
  SPOTS,
  type Point,
} from "./scene";
import { useWalker } from "./useWalker";
import "../office/office.css";
import "./game.css";

const sprites = import.meta.glob<string>("../../../../../assets/avatars/official/*/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
const sprite = (avatar: string, visual: AgentVisual) =>
  sprites[`../../../../../assets/avatars/official/${avatar}/${visual}.svg`] ??
  sprites[`../../../../../assets/avatars/official/${avatar}/idle.svg`] ??
  "";

const px = (n: number) => `calc(${n}px * var(--nb-office-scale, 3))`;
const at = (p: Point, w: number, h: number) => ({
  left: px(p.x),
  top: px(p.y),
  width: px(w),
  height: px(h),
});

const REPO_KEY = "noburi.game.repo";
const CARD = 10;
const CARD_GAP = 2;
const CARDS_PER_ROW = Math.floor((BOARD.w - CARD_GAP) / (CARD + CARD_GAP));
const MAX_CARDS = CARDS_PER_ROW * Math.floor((BOARD.h - CARD_GAP) / (CARD + CARD_GAP));

function readRepo(): string {
  try {
    return localStorage.getItem(REPO_KEY) ?? "";
  } catch {
    return "";
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Approvals asked for and not answered yet, newest last. */
function pendingApprovals(events: readonly MissionEvent[]): MissionEvent[] {
  const resolved = new Set(
    events.filter((e) => e.type === "approval.resolved").map((e) => str(e.payload["approvalId"])),
  );
  return events.filter(
    (e) => e.type === "approval.requested" && !resolved.has(str(e.payload["approvalId"])),
  );
}

const issueNumber = (ref: string | null, repo: string): number | null => {
  if (!ref?.startsWith(`${repo}#`)) return null;
  const n = Number(ref.slice(repo.length + 1));
  return Number.isInteger(n) ? n : null;
};

/**
 * The game: one office, a board of the repository's open issues, and the developer. Dropping a card
 * on the developer starts a real mission on that issue; everything the developer shows comes from
 * that mission's events. Only walking between spots and idle wandering are staged.
 */
export function GamePage() {
  const [repo, setRepo] = useState(readRepo);
  const [draftRepo, setDraftRepo] = useState(repo);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionView[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scale, setScale] = useState(3);
  const [carrying, setCarrying] = useState<number | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "issue"; issue: Issue } | { kind: "agent" } | { kind: "tray" } | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const { walker, go, moving } = useWalker(SPOTS.devSeat);

  // Board: the repository's open issues, through the runtime's gh.
  const loadIssues = useCallback(
    (name: string) =>
      runtime.issues(name).then(
        (r) => {
          setIssues(r.issues);
          setBoardError(null);
        },
        (e: unknown) =>
          setBoardError(e instanceof Error ? e.message : "Could not read the issues."),
      ),
    [],
  );
  useEffect(() => {
    if (repo) void loadIssues(repo);
  }, [repo, loadIssues]);

  // Missions are local and cheap to list; a short poll keeps the board's "taken" marks current.
  useEffect(() => {
    let current = true;
    const load = () =>
      runtime.missions().then(
        (r) => {
          if (current) setMissions(r.missions);
        },
        () => {},
      );
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let current = true;
    runtime.agents().then(
      (r) => {
        if (current) setAgents(r.agents);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const el = container.current;
    if (!el) return () => {};
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(sceneScale(entry.contentRect.width, entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const repoMissions = useMemo(
    () => missions.filter((m) => issueNumber(m.mission.issueRef, repo) !== null),
    [missions, repo],
  );
  const active = repoMissions.find((m) => m.mission.status === "RUNNING") ?? null;
  const delivered = repoMissions.filter((m) => m.mission.status === "COMPLETED");
  const { view, events } = useMission(active?.mission.id ?? repoMissions[0]?.mission.id ?? null);

  const developer = agents.find((a) => a.id === "developer");
  const derived: OfficeAgent | undefined = developer
    ? deriveOffice([developer], view?.tasks ?? [], events, view?.mission.status ?? null)[0]
    : undefined;
  // In the office, an agent with no issue yet is simply free to take one.
  const office = derived && !view ? { ...derived, label: "Available", detail: null } : derived;
  const approvals = pendingApprovals(events);
  const busy = active !== null;

  // Staged: a finished mission is carried to the player's desk, then the developer sits back down.
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = view?.mission.status ?? null;
    const was = lastStatus.current;
    lastStatus.current = status;
    if (was === "RUNNING" && status === "COMPLETED") {
      go(route(SPOTS.devSeat, SPOTS.playerDesk), () =>
        setTimeout(() => go(route(SPOTS.playerDesk, SPOTS.devSeat)), 700),
      );
    }
  }, [view?.mission.status, go]);

  // Staged: with nothing to do, the developer sometimes stretches its legs.
  useEffect(() => {
    if (busy || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
    const timer = setInterval(() => {
      if (moving || Math.random() < 0.5) return;
      const spot = Math.random() < 0.5 ? SPOTS.coffee : SPOTS.window;
      go(route(SPOTS.devSeat, spot), () => setTimeout(() => go(route(spot, SPOTS.devSeat)), 2500));
    }, 9000);
    return () => clearInterval(timer);
  }, [busy, moving, go]);

  const assign = useCallback(
    async (issue: Issue) => {
      setActionError(null);
      try {
        await runtime.workOnIssue(repo, issue.number);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "The developer could not take this issue.");
        return;
      }
      setDialog(null);
      // The mission is already running; walking to the board to fetch the card is staged.
      go(route(walker.pos, SPOTS.board), () => {
        setCarrying(issue.number);
        setTimeout(() => go(route(SPOTS.board, SPOTS.devSeat), () => setCarrying(null)), 500);
      });
      setMissions((await runtime.missions()).missions);
    },
    [repo, go, walker.pos],
  );

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const n = Number(event.dataTransfer.getData("text/plain"));
    const issue = issues.find((i) => i.number === n);
    if (issue && !busy) void assign(issue);
  };

  const takenBy = new Set(
    repoMissions
      .filter((m) => m.mission.status === "RUNNING")
      .map((m) => issueNumber(m.mission.issueRef, repo)),
  );
  const seated = !moving && walker.pos.x === SPOTS.devSeat.x && walker.pos.y === SPOTS.devSeat.y;
  const visual: AgentVisual = moving ? "idle" : (office?.visual ?? "idle");

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <form
        className="flex items-center gap-2 border-b border-border px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = draftRepo.trim();
          try {
            localStorage.setItem(REPO_KEY, next);
          } catch {
            // Remembering the repository is a convenience; the board still loads.
          }
          if (next === repo) void loadIssues(next);
          else setRepo(next);
        }}
      >
        <label htmlFor="game-repo" className="text-sm text-muted-foreground">
          GitHub repository
        </label>
        <Input
          id="game-repo"
          value={draftRepo}
          onChange={(e) => setDraftRepo(e.target.value)}
          placeholder="owner/name"
          className="h-8 w-72 font-mono text-xs"
        />
        <Button type="submit" size="sm" variant="outline">
          <ArrowPathIcon aria-hidden="true" className="size-4" />
          Load the board
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {repo ? `${issues.length} open issues · read through your gh login` : "No repository yet"}
        </span>
      </form>
      {(boardError || actionError) && (
        <p role="alert" className="border-b border-border px-4 py-2 text-sm text-destructive">
          {actionError ?? boardError}
        </p>
      )}

      <div
        ref={container}
        className="flex min-h-0 flex-1 items-center justify-center bg-[#101820] p-4"
      >
        <div
          className="office relative"
          style={
            {
              width: px(SCENE.w),
              height: px(SCENE.h),
              "--nb-office-scale": String(scale),
            } as React.CSSProperties
          }
        >
          <img src={background} alt="" className="office-px absolute inset-0 size-full" />

          {/* The board: real open issues, laid over the background's whiteboard. */}
          <div
            className="absolute bg-[#F6F0E5]"
            style={at({ x: BOARD.x, y: BOARD.y }, BOARD.w, BOARD.h)}
            aria-label="Issue board"
          >
            {issues.slice(0, MAX_CARDS).map((issue, i) => {
              const taken = takenBy.has(issue.number) || carrying === issue.number;
              return (
                <button
                  key={issue.number}
                  type="button"
                  draggable={!busy}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(issue.number))}
                  onClick={() => {
                    setActionError(null);
                    setDialog({ kind: "issue", issue });
                  }}
                  title={`#${issue.number} ${issue.title}`}
                  aria-label={`Issue ${issue.number}: ${issue.title}${taken ? ", taken" : ""}`}
                  className={cn(
                    "absolute flex items-center justify-center font-mono font-semibold text-[#101820] shadow-[0_2px_0_rgba(16,24,32,0.35)]",
                    taken && "opacity-35",
                  )}
                  style={{
                    ...at(
                      {
                        x: CARD_GAP + (i % CARDS_PER_ROW) * (CARD + CARD_GAP),
                        y: CARD_GAP + Math.floor(i / CARDS_PER_ROW) * (CARD + CARD_GAP),
                      },
                      CARD,
                      CARD,
                    ),
                    background: cardColor(issue.labels),
                    fontSize: px(4),
                  }}
                >
                  #{issue.number}
                </button>
              );
            })}
            {issues.length > MAX_CARDS && (
              <span className="absolute right-1 bottom-0 text-xs text-[#34424E]">
                +{issues.length - MAX_CARDS}
              </span>
            )}
          </div>

          {/* The developer: drawn behind the desk while seated. */}
          {office && (
            <button
              type="button"
              aria-label={`${office.name}, ${office.label}${office.detail ? `: ${office.detail}` : ""}`}
              title={office.detail ?? undefined}
              onClick={() => setDialog({ kind: "agent" })}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="absolute"
              style={at(walker.pos, CHARACTER, CHARACTER)}
            >
              <img
                src={sprite(office.avatar, visual)}
                alt=""
                className={cn(
                  "office-px size-full",
                  moving && "game-walking",
                  !moving && visual === "working" && "office-working",
                  walker.facing === "left" && "game-facing-left",
                )}
              />
              {carrying !== null && (
                <span
                  className="absolute"
                  style={{
                    ...at({ x: 10, y: 6 }, 5, 5),
                    background: cardColor(issues.find((i) => i.number === carrying)?.labels ?? []),
                  }}
                />
              )}
            </button>
          )}
          <img
            src={desk}
            alt=""
            className="office-px absolute"
            style={at(DEV_DESK, DESK.w, DESK.h)}
          />

          {/* Bubbles and badge follow the developer; their content is the real state. */}
          {office && (visual === "waiting" || visual === "thinking") && (
            <img
              src={visual === "waiting" ? bubbleApproval : bubbleThinking}
              alt=""
              className={cn("office-px absolute", visual === "waiting" && "game-needs-you")}
              style={at(
                { x: walker.pos.x + 3, y: walker.pos.y - 13 },
                11,
                visual === "waiting" ? 9 : 7,
              )}
            />
          )}
          {office && visual === "working" && seated && office.detail && (
            <span
              className="absolute max-w-64 -translate-x-1/2 truncate rounded-md bg-background/90 px-2 py-0.5 font-mono text-xs text-success shadow-sm"
              style={{ left: px(walker.pos.x + CHARACTER / 2), top: px(walker.pos.y - 12) }}
            >
              {office.detail}
            </span>
          )}
          {office && (
            <span
              className={cn(
                "absolute -translate-x-1/2 rounded-md px-2 py-0.5 text-xs whitespace-nowrap shadow-sm",
                visual === "waiting"
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "bg-background/85 text-muted-foreground",
              )}
              style={{ left: px(DEV_DESK.x + DESK.w / 2), top: px(DEV_DESK.y + DESK.h + 2) }}
            >
              {office.name} · {office.label}
            </span>
          )}

          {/* The player's desk and its "To review" tray: missions this repository completed. */}
          <img
            src={desk}
            alt=""
            className="office-px absolute"
            style={at(PLAYER_DESK, DESK.w, DESK.h)}
          />
          <button
            type="button"
            onClick={() => setDialog({ kind: "tray" })}
            aria-label={`To review: ${delivered.length} delivered`}
            className="absolute flex items-end justify-center border-[#34424E] bg-[#A7B3BE]"
            style={{
              ...at({ x: PLAYER_DESK.x + 4, y: PLAYER_DESK.y + 2 }, 14, 6),
              borderWidth: px(1),
            }}
          >
            {delivered.length > 0 && (
              <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {delivered.length}
              </span>
            )}
          </button>
          <span
            className="absolute -translate-x-1/2 rounded-md bg-background/85 px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground shadow-sm"
            style={{ left: px(PLAYER_DESK.x + DESK.w / 2), top: px(PLAYER_DESK.y + DESK.h + 2) }}
          >
            You · To review
          </span>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog?.kind === "issue" && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">
                  #{dialog.issue.number} {dialog.issue.title}
                </DialogTitle>
                <DialogDescription>
                  {dialog.issue.labels.map((l) => l.name).join(", ") || "No label"} ·{" "}
                  <a href={dialog.issue.url} target="_blank" rel="noreferrer" className="underline">
                    open on GitHub
                  </a>
                </DialogDescription>
              </DialogHeader>
              <p className="max-h-48 overflow-y-auto text-sm whitespace-pre-wrap">
                {dialog.issue.body.trim() || "No description."}
              </p>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
              <DialogFooter>
                <p className="mr-auto text-xs text-muted-foreground">
                  The developer works on a branch in Noburi&apos;s own clone. Pushing and opening
                  the pull request wait for your approval.
                </p>
                <Button disabled={busy} onClick={() => void assign(dialog.issue)}>
                  {busy ? "The developer is busy" : "Give to the developer"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "agent" && office && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {office.name} · {office.label}
                </DialogTitle>
                <DialogDescription>
                  {view ? view.mission.title : "No issue yet: drop a card on the developer."}
                </DialogDescription>
              </DialogHeader>
              {office.detail && <p className="font-mono text-xs">{office.detail}</p>}
              {approvals.map((e) => (
                <div key={e.seq} className="flex flex-col gap-2 rounded-lg bg-card p-3">
                  <p className="text-sm">The developer asks to run:</p>
                  <code className="font-mono text-xs break-all">
                    {str(e.payload["toolName"])} · {str(e.payload["summary"])}
                  </code>
                  <div className="flex justify-end gap-2">
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
                      Refuse
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
                </div>
              ))}
            </>
          )}

          {dialog?.kind === "tray" && <Tray delivered={delivered} />}
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** Finished issues and the pull request each agent reported, read from the mission's summary. */
function Tray({ delivered }: { delivered: MissionView[] }) {
  const [links, setLinks] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let current = true;
    for (const m of delivered) {
      runtime.mission(m.mission.id).then(
        (v) => {
          if (!current) return;
          const text = [
            ...v.artifacts.map((a) => a.content),
            ...v.tasks.map((t) => t.resultText ?? ""),
          ].join("\n");
          setLinks((prev) => ({ ...prev, [m.mission.id]: pullRequestUrl(text) }));
        },
        () => {},
      );
    }
    return () => {
      current = false;
    };
  }, [delivered]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>To review</DialogTitle>
        <DialogDescription>
          Merging stays your move: open the pull request on GitHub.
        </DialogDescription>
      </DialogHeader>
      {delivered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing delivered yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {delivered.map((m) => {
            const link = links[m.mission.id];
            return (
              <li key={m.mission.id} className="flex items-center gap-3 rounded-lg bg-card p-3">
                <span className="min-w-0 flex-1 truncate text-sm">{m.mission.title}</span>
                {link ? (
                  <a href={link} target="_blank" rel="noreferrer" className="text-sm underline">
                    Pull request
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {link === null ? "No pull request reported" : "…"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
