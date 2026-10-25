import { describe, expect, it } from "vite-plus/test";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  parseAppearance,
  type AppearanceTarget,
} from "./appearance.ts";

function fakeRoot() {
  const classes = new Set<string>();
  const props = new Map<string, string>();
  const root: AppearanceTarget = {
    dataset: {},
    classList: { toggle: (t: string, on: boolean) => (on ? classes.add(t) : classes.delete(t)) },
    style: { setProperty: (n: string, v: string) => void props.set(n, v) },
  };
  return { root, classes, props };
}

describe("appearance", () => {
  it("defaults to Cozy Night with Geist", () => {
    expect(DEFAULT_APPEARANCE.theme).toBe("cozy-night");
    expect(DEFAULT_APPEARANCE.uiFont).toBe("geist");
  });

  it("repairs bad stored values field by field", () => {
    const a = parseAppearance({
      theme: "neon",
      uiFont: "inter",
      fontScale: 7,
      reduceMotion: "yes",
    });
    expect(a.theme).toBe("cozy-night");
    expect(a.uiFont).toBe("inter");
    expect(a.fontScale).toBe(1);
    expect(a.reduceMotion).toBe(false);
    expect(parseAppearance("garbage")).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps the current value when a UI event sends something invalid", () => {
    const current = { ...DEFAULT_APPEARANCE, theme: "matcha" as const, officeScale: 4 as const };
    const next = parseAppearance({ ...current, theme: "neon", officeScale: 5 }, current);
    expect(next.theme).toBe("matcha");
    expect(next.officeScale).toBe(4);
  });

  it("applies a light theme without the dark class", () => {
    const { root, classes, props } = fakeRoot();
    applyAppearance(root, {
      ...DEFAULT_APPEARANCE,
      theme: "cozy-day",
      monoFont: "jetbrains-mono",
      radius: "round",
    });
    expect(root.dataset.theme).toBe("cozy-day");
    expect(classes.has("dark")).toBe(false);
    expect(props.get("--nb-font-code")).toContain("JetBrains Mono");
    expect(props.get("--radius")).toBe("0.875rem");
  });

  it("applies dark themes with the dark class", () => {
    const { root, classes } = fakeRoot();
    applyAppearance(root, { ...DEFAULT_APPEARANCE, theme: "matcha", reduceMotion: true });
    expect(classes.has("dark")).toBe(true);
    expect(root.dataset.motion).toBe("reduce");
  });
});
