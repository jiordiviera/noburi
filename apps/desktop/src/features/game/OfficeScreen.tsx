import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import background from "../../../../../assets/worlds/cozy-office/background.svg?url";
import desk from "../../../../../assets/worlds/cozy-office/objects/desk.svg?url";
import bubbleApproval from "../../../../../assets/worlds/cozy-office/objects/bubble-approval.svg?url";
import bubbleThinking from "../../../../../assets/worlds/cozy-office/objects/bubble-thinking.svg?url";
import { useMission } from "@/features/missions/useMission";
import { deriveOffice, type AgentVisual, type OfficeAgent } from "@/features/office/officeState";
import { openExternal } from "@/lib/external";
import { runtime, type Issue, type MissionEvent } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { questSteps, type StepState } from "./quest";
import {
  BOARD,
  CHARACTER,
  cardColor,
  DESK,
  DEV_DESK,
  PLAYER_DESK,
  route,
  SCENE,
  sceneScale,
  SPOTS,
  type Point,
} from "./scene";
import { issueNumber, type Studio } from "./useStudio";
import { useWalker } from "./useWalker";
import "../office/office.css";
import "./game.css";

const sprites = import.meta.glob<string>("../../../../../assets/avatars/official/*/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
export const sprite = (avatar: string, visual: AgentVisual) =>
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

const CARD = 10;
const CARD_GAP = 2;
const CARDS_PER_ROW = Math.floor((BOARD.w - CARD_GAP) / (CARD + CARD_GAP));
const MAX_CARDS = CARDS_PER_ROW * Math.floor((BOARD.h - CARD_GAP) / (CARD + CARD_GAP));

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function pendingApprovals(events: readonly MissionEvent[]): MissionEvent[] {
  const resolved = new Set(
    events.filter((e) => e.type === "approval.resolved").map((e) => str(e.payload["approvalId"])),
  );
  return events.filter(
    (e) => e.type === "approval.requested" && !resolved.has(str(e.payload["approvalId"])),
  );
}

const STEP_STYLE: Record<StepState, string> = {
  done: "text-[#A7B3BE]",
  waiting: "font-bold text-[#F0BE79]",
  active: "font-bold text-[#F6F0E5]",
  todo: "text-[#A7B3BE]",
};
const STEP_BOX: Record<StepState, string> = {
  done: "bg-[#7DD3B0]",
  waiting: "game-blink bg-[#F0BE79]",
  active: "bg-[#8EC5FF]",
  todo: "shadow-[inset_0_0_0_2px_#34424E]",
};

/**
 * The office: the board of real issues, the developer, your desk. Dropping a card on the developer
 * starts a real mission; the label, bubbles, quest log and the dialog box all come from that
 * mission's events. Only the walking and the idle trips are staged.
 */
export function OfficeScreen({
  studio,
  onOpenDesk,
  onOpenStudio,
}: {
  studio: Studio;
  onOpenDesk: () => void;
  onOpenStudio: () => void;
}) {
  const { repo, issues, missions, agents, delivered, wander } = studio;
  const [scale, setScale] = useState(3);
  const [carrying, setCarrying] = useState<number | null>(null);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const { walker, go, moving } = useWalker(SPOTS.devSeat);

  useEffect(() => {
    const el = container.current;
    if (!el) return () => {};
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(sceneScale(entry.contentRect.width, entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const active = missions.find((m) => m.mission.status === "RUNNING") ?? null;
  const shown = active ?? missions[0] ?? null;
  const { view, events } = useMission(shown?.mission.id ?? null);
  const busy = active !== null;

  const developer = agents.find((a) => a.id === "developer");
  const derived: OfficeAgent | undefined = developer
    ? deriveOffice([developer], view?.tasks ?? [], events, view?.mission.status ?? null)[0]
    : undefined;
  const office = derived && !view ? { ...derived, label: "Available", detail: null } : derived;
  const approvals = pendingApprovals(events);
  const ask = approvals[0];
  const lastWords = events.filter((e) => e.type === "agent.message").at(-1);
  const shownNumber = issueNumber(view?.mission.issueRef ?? null, repo);
  const shownPr = delivered.find((d) => d.mission.id === view?.mission.id)?.pullRequest ?? null;
  const steps = view
    ? questSteps({ events, status: view.mission.status, pullRequest: shownPr })
    : [];

  // Staged: a finished mission is carried to your desk, then the developer sits back down.
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

  // Staged: with nothing to do, the developer sometimes stretches its legs (off in Options).
  useEffect(() => {
    if (busy || !wander || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return () => {};
    const timer = setInterval(() => {
      if (moving || Math.random() < 0.5) return;
      const spot = Math.random() < 0.5 ? SPOTS.coffee : SPOTS.window;
      go(route(SPOTS.devSeat, spot), () => setTimeout(() => go(route(spot, SPOTS.devSeat)), 2500));
    }, 9000);
    return () => clearInterval(timer);
  }, [busy, moving, wander, go]);

  const assign = useCallback(
    async (issue: Issue) => {
      if (assigning) return;
      setActionError(null);
      setAssigning(true);
      try {
        await runtime.workOnIssue(repo, issue.number);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "The developer could not take this issue.");
        return;
      } finally {
        setAssigning(false);
      }
      setSelected(null);
      // The mission already runs; walking to the board to fetch the card is staged.
      go(route(walker.pos, SPOTS.board), () => {
        setCarrying(issue.number);
        setTimeout(() => go(route(SPOTS.board, SPOTS.devSeat), () => setCarrying(null)), 500);
      });
      await studio.refreshMissions();
    },
    [repo, go, walker.pos, assigning, studio],
  );

  const decide = useCallback((event: MissionEvent, approved: boolean) => {
    void runtime.decide(str(event.payload["runId"]), str(event.payload["approvalId"]), approved);
  }, []);

  // Enter approves, Escape refuses, like a game dialog; never while typing in a field.
  useEffect(() => {
    if (!ask) return () => {};
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      if (e.key === "Enter") {
        e.preventDefault();
        decide(ask, true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        decide(ask, false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, decide]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const n = Number(event.dataTransfer.getData("text/plain"));
    const issue = issues.find((i) => i.number === n);
    if (issue && !busy && !assigning) void assign(issue);
  };

  const takenBy = new Set(
    missions
      .filter((m) => m.mission.status === "RUNNING")
      .map((m) => issueNumber(m.mission.issueRef, repo)),
  );
  const seated = !moving && walker.pos.x === SPOTS.devSeat.x && walker.pos.y === SPOTS.devSeat.y;
  const visual: AgentVisual = moving ? "idle" : (office?.visual ?? "idle");

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[#0C131A] font-pixel text-[#F6F0E5]">
      <div ref={container} className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div
          className="office relative shadow-[0_0_0_4px_#0C131A,0_0_0_8px_#26323D]"
          style={{
            width: px(SCENE.w),
            height: px(SCENE.h),
            ["--nb-office-scale" as string]: String(scale),
          }}
        >
          <img src={background} alt="" className="office-px absolute inset-0 size-full" />

          {/* The board: real open issues, over the background's whiteboard. */}
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
                    setSelected(issue);
                  }}
                  title={`#${issue.number} ${issue.title}`}
                  aria-label={`Issue ${issue.number}: ${issue.title}${taken ? ", taken" : ""}`}
                  className={cn(
                    "absolute flex items-center justify-center font-mono font-bold text-[#101820] shadow-[0_3px_0_rgba(16,24,32,0.35)]",
                    taken && "opacity-30",
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
                    fontSize: px(3.4),
                  }}
                >
                  #{issue.number}
                </button>
              );
            })}
          </div>

          {office && (
            <button
              type="button"
              aria-label={`${office.name}, ${office.label}${office.detail ? `: ${office.detail}` : ""}`}
              title={office.detail ?? undefined}
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
              className="absolute max-w-72 -translate-x-1/2 truncate bg-[#101820] px-2 py-0.5 font-mono text-xs text-[#7DD3B0] shadow-[0_0_0_2px_#7DD3B0]"
              style={{ left: px(walker.pos.x + CHARACTER / 2), top: px(walker.pos.y - 12) }}
            >
              {office.detail}
            </span>
          )}
          {office && (
            <span
              className={cn(
                "absolute -translate-x-1/2 px-2 py-0.5 text-sm whitespace-nowrap",
                visual === "waiting"
                  ? "bg-[#F0BE79] font-bold text-[#101820]"
                  : "bg-[#101820]/90 text-[#F6F0E5]",
              )}
              style={{ left: px(DEV_DESK.x + DESK.w / 2), top: px(DEV_DESK.y + DESK.h + 2) }}
            >
              {office.name} · {visual === "waiting" ? "needs you" : office.label}
            </span>
          )}

          <img
            src={desk}
            alt=""
            className="office-px absolute"
            style={at(PLAYER_DESK, DESK.w, DESK.h)}
          />
          <button
            type="button"
            onClick={onOpenDesk}
            aria-label={`Your desk: ${delivered.length} to review`}
            className="absolute bg-[#A7B3BE] shadow-[0_0_0_3px_#34424E]"
            style={at({ x: PLAYER_DESK.x + 4, y: PLAYER_DESK.y + 2 }, 15, 6)}
          >
            {delivered.length > 0 && (
              <span className="absolute -top-3 -right-3 flex size-6 items-center justify-center bg-[#F2867A] text-sm font-bold text-[#101820] shadow-[0_0_0_3px_#101820]">
                {delivered.length}
              </span>
            )}
          </button>
          <span
            className="absolute -translate-x-1/2 bg-[#101820]/90 px-2 py-0.5 text-sm whitespace-nowrap"
            style={{ left: px(PLAYER_DESK.x + DESK.w / 2), top: px(PLAYER_DESK.y + DESK.h + 2) }}
          >
            You
          </span>
        </div>
      </div>

      {/* Quest log: the real steps of the issue on the desk. */}
      {view && shownNumber !== null && (
        <section
          aria-label="Quest"
          className="game-win absolute top-7 left-7 flex w-72 flex-col gap-2.5 p-4"
        >
          <span className="text-xs tracking-[0.14em] text-[#F0BE79]">
            QUEST · ISSUE #{shownNumber}
          </span>
          <span className="text-base leading-tight font-bold">
            {view.mission.title.replace(/^#\d+\s*/, "")}
          </span>
          <ol className="flex flex-col gap-1.5 text-sm">
            {steps.map((step) => (
              <li key={step.id} className={cn("flex items-center gap-2.5", STEP_STYLE[step.state])}>
                <span
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0", STEP_BOX[step.state])}
                />
                {step.label}
                {step.state === "waiting" && " · you"}
                <span className="sr-only">: {step.state}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Bottom dialog box: a real request, an issue you picked, or the guide. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center px-7">
        {ask && office ? (
          <section
            aria-label={`${office.name} asks`}
            className="game-win-honey pointer-events-auto flex w-full max-w-[1040px] gap-6 p-5"
          >
            <div className="flex shrink-0 flex-col items-center gap-2">
              <img
                src={sprite(office.avatar, "waiting")}
                alt=""
                className="office-px size-28 bg-[#26323D] shadow-[0_0_0_4px_#0C131A]"
              />
              <span className="bg-[#F0BE79] px-2.5 text-sm font-bold text-[#101820]">
                {office.name.toUpperCase()}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {lastWords && (
                <p className="line-clamp-2 text-xl leading-snug">
                  {str(lastWords.payload["text"])}
                </p>
              )}
              <pre className="max-h-40 overflow-auto bg-[#0C131A] px-3.5 py-2.5 font-mono text-sm break-all whitespace-pre-wrap shadow-[inset_0_0_0_2px_#26323D]">
                <span className="text-[#A7B3BE]">{str(ask.payload["toolName"])} · </span>
                {str(ask.payload["detail"]) || str(ask.payload["summary"])}
              </pre>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="game-btn game-btn-honey"
                  onClick={() => decide(ask, true)}
                >
                  Approve once{" "}
                  <span className="game-key bg-[#A9844F] text-[#101820] shadow-none">ENTER</span>
                </button>
                <button
                  type="button"
                  className="game-btn game-btn-slate"
                  onClick={() => decide(ask, false)}
                >
                  Refuse <span className="game-key">ESC</span>
                </button>
                {approvals.length > 1 && (
                  <span className="text-sm text-[#A7B3BE]">
                    +{approvals.length - 1} more after this
                  </span>
                )}
              </div>
            </div>
          </section>
        ) : selected ? (
          <section
            aria-label={`Issue ${selected.number}`}
            className="game-win pointer-events-auto flex w-full max-w-[1040px] flex-col gap-3 p-5"
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-1 size-5 shrink-0"
                style={{ background: cardColor(selected.labels) }}
                aria-hidden="true"
              />
              <h2 className="flex-1 text-xl font-bold">
                #{selected.number} {selected.title}
              </h2>
              <button
                type="button"
                className="game-btn game-btn-slate min-h-9 px-3 text-sm"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <p className="line-clamp-3 font-sans text-sm whitespace-pre-wrap text-[#A7B3BE]">
              {selected.body.trim() || "No description."}
            </p>
            {actionError && <p className="text-sm text-[#F2867A]">{actionError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="game-btn game-btn-honey"
                disabled={busy || assigning}
                onClick={() => void assign(selected)}
              >
                {busy
                  ? "The developer is busy"
                  : assigning
                    ? "Cloning the repository…"
                    : "Give to the developer"}
              </button>
              <button
                type="button"
                className="game-btn game-btn-slate"
                onClick={() => void openExternal(selected.url)}
              >
                Open on GitHub
              </button>
              <span className="text-sm text-[#A7B3BE]">
                Works on a branch in Noburi&apos;s own clone. Every push asks you first.
              </span>
            </div>
          </section>
        ) : !repo || studio.boardError ? (
          <section className="game-win-honey pointer-events-auto flex w-full max-w-[1040px] items-center gap-6 p-5">
            <img src="/favicon.svg" alt="" className="size-20 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <span className="self-start bg-[#F0BE79] px-2.5 text-sm font-bold text-[#101820]">
                NOBURI
              </span>
              <p className="text-xl leading-snug">
                {studio.boardError
                  ? `I could not read the board: ${studio.boardError}`
                  : "The board is empty. Pick the GitHub repository whose issues we work on."}
              </p>
            </div>
            <button
              type="button"
              className="game-btn game-btn-honey self-end"
              onClick={onOpenStudio}
            >
              Open Studio
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
