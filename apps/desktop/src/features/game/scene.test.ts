import { describe, expect, it } from "vite-plus/test";
import { cardColor, pullRequestUrl, route, sceneScale, SPOTS, step, type Walker } from "./scene";

describe("walking", () => {
  it("follows the lane and stops exactly on the spot", () => {
    let walker: Walker = {
      pos: SPOTS.devSeat,
      path: route(SPOTS.devSeat, SPOTS.board),
      facing: "right",
    };
    for (let i = 0; i < 1000 && walker.path.length > 0; i++) walker = step(walker, 40, 0.05);
    expect(walker.pos).toEqual(SPOTS.board);
    expect(walker.path).toEqual([]);
    expect(walker.facing).toBe("right");
  });

  it("does not overshoot a waypoint and keeps leftover distance for the next one", () => {
    const walker: Walker = {
      pos: { x: 0, y: 0 },
      path: [
        { x: 3, y: 0 },
        { x: 3, y: 10 },
      ],
      facing: "right",
    };
    expect(step(walker, 5, 1).pos).toEqual({ x: 3, y: 2 });
    expect(step({ ...walker, path: [{ x: -4, y: 0 }] }, 1, 1).facing).toBe("left");
  });
});

describe("board and deliverables", () => {
  it("colours cards by label", () => {
    expect(cardColor([{ name: "bug", color: "d73a4a" }])).toBe("#F2867A");
    expect(cardColor([{ name: "triage", color: "123abc" }])).toBe("#123abc");
    expect(cardColor([])).toBe("#F0BE79");
  });

  it("finds the pull request an agent reports", () => {
    expect(pullRequestUrl("Done.\nhttps://github.com/o/r/pull/12\n")).toBe(
      "https://github.com/o/r/pull/12",
    );
    expect(pullRequestUrl("no link")).toBeNull();
  });

  it("zooms by whole numbers only", () => {
    expect(sceneScale(1000, 600)).toBe(3);
    expect(sceneScale(200, 100)).toBe(1);
  });
});
