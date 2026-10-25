import background from "../../../../../assets/worlds/cozy-office/background.svg?url";
import desk from "../../../../../assets/worlds/cozy-office/objects/desk.svg?url";
import bubbleApproval from "../../../../../assets/worlds/cozy-office/objects/bubble-approval.svg?url";
import bubbleThinking from "../../../../../assets/worlds/cozy-office/objects/bubble-thinking.svg?url";
import map from "../../../../../assets/worlds/cozy-office/map.json";
import { cn } from "@/lib/utils";
import type { AgentVisual, OfficeAgent } from "./officeState";
import "./office.css";

// Official avatars: assets/avatars/official/<avatar>/<state>.svg, bundled at build time.
const sprites = import.meta.glob<string>("../../../../../assets/avatars/official/*/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

function sprite(avatar: string, visual: AgentVisual): string {
  return (
    sprites[`../../../../../assets/avatars/official/${avatar}/${visual}.svg`] ??
    sprites[`../../../../../assets/avatars/official/${avatar}/idle.svg`] ??
    ""
  );
}

/** Scene size in art pixels; the office is drawn at a whole-number zoom so pixels stay crisp. */
const SCENE = { w: map.width * map.tileSize, h: map.height * map.tileSize };
const DESK = { w: 36, h: 30 };
const CHARACTER = 16;

const px = (n: number) => `calc(${n}px * var(--nb-office-scale, 3))`;

const BADGE: Record<AgentVisual, string> = {
  idle: "bg-background/85 text-muted-foreground",
  thinking: "bg-background/85 text-info",
  working: "bg-background/85 text-success",
  waiting: "bg-primary text-primary-foreground font-semibold",
  done: "bg-background/85 text-success",
  error: "bg-background/85 text-destructive",
};

interface Props {
  agents: OfficeAgent[];
  onSelect?: (agent: OfficeAgent) => void;
}

/**
 * The cozy office. Purely a view of real state: each character's sprite, bubble and label come from
 * `deriveOffice`, and nothing moves unless its agent is actually working.
 */
export function Office({ agents, onSelect }: Props) {
  const byAvatar = new Map(agents.map((a) => [a.avatar, a]));
  const slotAvatar: Record<string, OfficeAgent["avatar"]> = {
    developer: "developer",
    reviewer: "reviewer",
    researcher: "researcher",
  };

  return (
    <section aria-label="Office" className="overflow-x-auto rounded-xl bg-[#101820]">
      <div className="office relative mx-auto" style={{ width: px(SCENE.w), height: px(SCENE.h) }}>
        <img src={background} alt="" className="office-px absolute inset-0 size-full" />
        {map.agentSlots.map((slot) => {
          const agent = byAvatar.get(slotAvatar[slot.id] ?? "developer");
          if (!agent) return null;
          const bubble =
            agent.visual === "waiting"
              ? bubbleApproval
              : agent.visual === "thinking"
                ? bubbleThinking
                : null;
          return (
            <div key={slot.id}>
              <img
                src={sprite(agent.avatar, agent.visual)}
                alt=""
                className={cn("office-px absolute", agent.visual === "working" && "office-working")}
                style={{
                  left: px(slot.x + 10),
                  top: px(slot.y - 4),
                  width: px(CHARACTER),
                  height: px(CHARACTER),
                }}
              />
              <img
                src={desk}
                alt=""
                className="office-px absolute"
                style={{ left: px(slot.x), top: px(slot.y), width: px(DESK.w), height: px(DESK.h) }}
              />
              {bubble && (
                <img
                  src={bubble}
                  alt=""
                  className="office-px absolute"
                  style={{
                    left: px(slot.x + 13),
                    top: px(slot.y - 17),
                    width: px(11),
                    height: px(agent.visual === "waiting" ? 9 : 7),
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect?.(agent)}
                aria-label={`${agent.name}, ${agent.label}${agent.detail ? `: ${agent.detail}` : ""}`}
                title={agent.detail ?? undefined}
                className={cn(
                  "absolute flex -translate-x-1/2 items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-sm",
                  BADGE[agent.visual],
                )}
                style={{ left: px(slot.x + DESK.w / 2), top: px(slot.y + DESK.h + 2) }}
              >
                <span className="font-medium">{agent.name}</span>
                <span aria-hidden="true">·</span>
                <span>{agent.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
