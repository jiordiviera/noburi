import { z } from "zod";

export const THEMES = [
  { id: "cozy-night", label: "Cozy Night", dark: true },
  { id: "cozy-day", label: "Cozy Day", dark: false },
  { id: "matcha", label: "Matcha", dark: true },
  { id: "high-contrast", label: "High contrast", dark: true },
] as const;

export const ACCENTS = [
  { id: "honey", label: "Honey" },
  { id: "mint", label: "Mint" },
  { id: "sky", label: "Sky" },
  { id: "coral", label: "Coral" },
] as const;

// Every font is bundled locally (@fontsource), so changing it never hits the network.
export const UI_FONTS = [
  { id: "geist", label: "Geist", stack: '"Geist Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: "inter", label: "Inter", stack: '"Inter Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", stack: '"IBM Plex Sans Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: "atkinson", label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible Next Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: "system", label: "System", stack: "ui-sans-serif, system-ui, sans-serif" },
] as const;

export const MONO_FONTS = [
  { id: "geist-mono", label: "Geist Mono", stack: '"Geist Mono Variable", ui-monospace, monospace' },
  { id: "jetbrains-mono", label: "JetBrains Mono", stack: '"JetBrains Mono Variable", ui-monospace, monospace' },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", stack: '"IBM Plex Mono", ui-monospace, monospace' },
  { id: "system-mono", label: "System", stack: "ui-monospace, monospace" },
] as const;

export const FONT_SCALES = [0.875, 0.9375, 1, 1.0625, 1.125] as const;

type Ids<T extends readonly { id: string }[]> = T[number]["id"];
const enumOf = <T extends readonly { id: string }[]>(items: T) =>
  z.enum(items.map((i) => i.id) as [Ids<T>, ...Ids<T>[]]);

export const Appearance = z.object({
  theme: enumOf(THEMES).default("cozy-night"),
  accent: enumOf(ACCENTS).default("honey"),
  uiFont: enumOf(UI_FONTS).default("geist"),
  monoFont: enumOf(MONO_FONTS).default("geist-mono"),
  fontScale: z.number().refine((n) => (FONT_SCALES as readonly number[]).includes(n)).default(1),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  radius: z.enum(["sharp", "default", "round"]).default("default"),
  reduceMotion: z.boolean().default(false),
  officeScale: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
});
export type Appearance = z.infer<typeof Appearance>;

export const DEFAULT_APPEARANCE: Appearance = Appearance.parse({});

/** Unknown or corrupted values fall back field by field, never to a broken UI. */
export function parseAppearance(raw: unknown): Appearance {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(Appearance.shape) as (keyof Appearance)[]) {
    const field = Appearance.shape[key].safeParse(source[key]);
    result[key] = field.success ? field.data : DEFAULT_APPEARANCE[key];
  }
  return result as Appearance;
}

const RADIUS = { sharp: "0.375rem", default: "0.625rem", round: "0.875rem" } as const;

/** The subset of an HTML element that appearance touches; keeps this testable without a DOM. */
export interface AppearanceTarget {
  dataset: Record<string, string | undefined>;
  classList: { toggle(token: string, force: boolean): unknown };
  style: { setProperty(name: string, value: string): void };
}

export function applyAppearance(root: AppearanceTarget, a: Appearance): void {
  const theme = THEMES.find((t) => t.id === a.theme) ?? THEMES[0];
  root.dataset.theme = theme.id;
  root.dataset.accent = a.accent;
  root.dataset.density = a.density;
  root.dataset.motion = a.reduceMotion ? "reduce" : "full";
  // shadcn's `dark:` variant keys off the .dark class.
  root.classList.toggle("dark", theme.dark);
  root.style.setProperty("--nb-font-ui", (UI_FONTS.find((f) => f.id === a.uiFont) ?? UI_FONTS[0]).stack);
  root.style.setProperty("--nb-font-code", (MONO_FONTS.find((f) => f.id === a.monoFont) ?? MONO_FONTS[0]).stack);
  root.style.setProperty("--nb-font-scale", String(a.fontScale));
  root.style.setProperty("--radius", RADIUS[a.radius]);
  root.style.setProperty("--nb-office-scale", String(a.officeScale));
}
