/**
 * Geometry of the game office, in background pixels (the scene is 320 × 160), and the staged
 * movement of characters. Where a character walks is staged; what it is doing is never: the state
 * shown comes from real mission events (see officeState.ts).
 */
export interface Point {
  x: number;
  y: number;
}

export const SCENE = { w: 320, h: 160 } as const;
export const CHARACTER = 16;
export const DESK = { w: 36, h: 30 } as const;

/** The whiteboard drawn in the background; the board's cards are laid over its white area. */
export const BOARD = { x: 112, y: 12, w: 72, h: 40 } as const;

/** Desks: the developer's (from the background's first slot) and the player's (the third). */
export const DEV_DESK: Point = { x: 52, y: 96 };
export const PLAYER_DESK: Point = { x: 232, y: 96 };

/** Where a character stands, as the top-left corner of its 16 × 16 sprite. */
export const SPOTS = {
  devSeat: { x: DEV_DESK.x + 10, y: DEV_DESK.y - 4 },
  board: { x: BOARD.x + BOARD.w / 2 - CHARACTER / 2, y: 60 },
  playerDesk: { x: PLAYER_DESK.x - 14, y: 82 },
  coffee: { x: 279, y: 58 },
  window: { x: 44, y: 60 },
} as const satisfies Record<string, Point>;

/** The lane between the wall and the desks; characters walk along it to avoid the furniture. */
const LANE_Y = 74;

/** Waypoints from one spot to another, through the lane. */
export function route(from: Point, to: Point): Point[] {
  return [
    { x: from.x, y: LANE_Y },
    { x: to.x, y: LANE_Y },
    { x: to.x, y: to.y },
  ];
}

export interface Walker {
  pos: Point;
  /** Remaining waypoints; empty when the character stands still. */
  path: Point[];
  /** Last horizontal direction, so a standing character keeps facing where it walked. */
  facing: "left" | "right";
}

/** Moves a walker along its path by `speed × dt` pixels, passing through waypoints exactly. */
export function step(walker: Walker, speed: number, dt: number): Walker {
  let { pos, facing } = walker;
  const path = [...walker.path];
  let budget = speed * dt;
  while (budget > 0 && path.length > 0) {
    const target = path[0];
    if (!target) break;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dx !== 0) facing = dx < 0 ? "left" : "right";
    if (dist <= budget) {
      pos = { ...target };
      path.shift();
      budget -= dist;
    } else {
      pos = { x: pos.x + (dx / dist) * budget, y: pos.y + (dy / dist) * budget };
      budget = 0;
    }
  }
  return { pos, path, facing };
}

/** Card colour from the issue's first known label; GitHub's own label colour otherwise. */
export function cardColor(labels: readonly { name: string; color: string }[]): string {
  const known: Record<string, string> = {
    bug: "#F2867A",
    enhancement: "#8EC5FF",
    documentation: "#7DD3B0",
  };
  for (const label of labels) {
    const colour = known[label.name.toLowerCase()];
    if (colour) return colour;
  }
  const first = labels[0];
  return first && /^[0-9a-f]{6}$/i.test(first.color) ? `#${first.color}` : "#F0BE79";
}

/** The first pull request URL in a text, such as an agent's final summary. */
export function pullRequestUrl(text: string): string | null {
  return /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.exec(text)?.[0] ?? null;
}

/** Whole-number zoom that fits the scene in a container, so pixels stay crisp. */
export function sceneScale(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / SCENE.w, height / SCENE.h)));
}
