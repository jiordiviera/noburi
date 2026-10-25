import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { THEMES, ThemeId, withTheme, DEFAULT_APPEARANCE } from "./appearance.ts";

const css = readFileSync(new URL("./themes.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Variables declared by `[data-theme="id"]`, on top of the :root defaults like the browser does. */
function themeVars(id: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const apply = (body: string) => {
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      if (name && value) vars[name] = value.trim();
    }
  };
  for (const [, selector = "", body = ""] of blocks)
    if (/(^|,)\s*:root\s*(,|$)/.test(selector.trim())) apply(body);
  for (const [, selector = "", body = ""] of blocks)
    if (selector.includes(`[data-theme="${id}"]`)) apply(body);
  return vars;
}

/** sRGB channel (0–255) to linear light, per WCAG 2. */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("themes.css", () => {
  it("has exactly one palette per theme id", () => {
    const declared = [...css.matchAll(/\[data-theme="([\w-]+)"\]/g)].map((m) => m[1]);
    expect(new Set(declared)).toEqual(new Set(ThemeId.options));
    expect(declared).toHaveLength(ThemeId.options.length);
  });

  for (const id of ThemeId.options) {
    it(`keeps ${id} readable (WCAG AA, 4.5:1)`, () => {
      const v = themeVars(id);
      const pairs: [string, string, string][] = [
        ["--foreground", "--background", "text on background"],
        ["--foreground", "--card", "text on cards"],
        ["--muted-foreground", "--background", "secondary text on background"],
        ["--muted-foreground", "--card", "secondary text on cards"],
        ["--muted-foreground", "--muted", "secondary text on muted fills"],
        ["--nb-theme-primary-foreground", "--nb-theme-primary", "primary button text"],
        ["--destructive", "--background", "error text"],
        ["--nb-success", "--background", "success text"],
        ["--nb-warning", "--background", "warning text"],
        ["--nb-info", "--background", "info text"],
      ];
      const failures: string[] = [];
      for (const [fg, bg, what] of pairs) {
        const ratio = contrast(v[fg] ?? "#000000", v[bg] ?? "#000000");
        if (ratio < 4.5) failures.push(`${what}: ${v[fg]} on ${v[bg]} = ${ratio.toFixed(2)}`);
      }
      for (const accent of ["--nb-honey", "--nb-mint", "--nb-sky", "--nb-coral"]) {
        const ratio = contrast("#101820", v[accent] ?? "#000000");
        if (ratio < 4.5) failures.push(`dark text on ${accent} = ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    });
  }
});

describe("theme presets", () => {
  it("apply their fonts and reset the accent to the theme's own", () => {
    const next = withTheme({ ...DEFAULT_APPEARANCE, accent: "coral" }, "github-dark");
    expect(next).toMatchObject({
      theme: "github-dark",
      accent: "theme",
      uiFont: "mona-sans",
      monoFont: "monaspace-neon",
    });
    expect(withTheme(DEFAULT_APPEARANCE, "claude-light").readingFont).toBe("source-serif");
  });

  it("describe every theme once, with a dark flag matching its background", () => {
    expect(THEMES.map((t) => t.id)).toEqual(ThemeId.options);
    const mismatched = THEMES.filter((t) => t.dark !== luminance(t.preview.bg) < 0.2).map(
      (t) => t.id,
    );
    expect(mismatched).toEqual([]);
  });
});
