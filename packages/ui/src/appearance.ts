import { z } from "zod";

export const ThemeId = z.enum(["cozy-night", "cozy-day", "matcha", "high-contrast"]);
export const AccentId = z.enum(["honey", "mint", "sky", "coral"]);
export const UiFontId = z.enum(["geist", "inter", "ibm-plex-sans", "atkinson", "system"]);
export const MonoFontId = z.enum(["geist-mono", "jetbrains-mono", "ibm-plex-mono", "system-mono"]);

export const THEMES = [
  { id: "cozy-night", label: "Cozy Night", dark: true },
  { id: "cozy-day", label: "Cozy Day", dark: false },
  { id: "matcha", label: "Matcha", dark: true },
  { id: "high-contrast", label: "High contrast", dark: true },
] as const satisfies readonly { id: z.infer<typeof ThemeId>; label: string; dark: boolean }[];

export const ACCENTS = [
  { id: "honey", label: "Honey" },
  { id: "mint", label: "Mint" },
  { id: "sky", label: "Sky" },
  { id: "coral", label: "Coral" },
] as const satisfies readonly { id: z.infer<typeof AccentId>; label: string }[];

// Every font is bundled locally (@fontsource), so changing it never hits the network.
export const UI_FONTS = [
  { id: "geist", label: "Geist", stack: '"Geist Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: "inter", label: "Inter", stack: '"Inter Variable", ui-sans-serif, system-ui, sans-serif' },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    stack: '"IBM Plex Sans Variable", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    stack: '"Atkinson Hyperlegible Next Variable", ui-sans-serif, system-ui, sans-serif',
  },
  { id: "system", label: "System", stack: "ui-sans-serif, system-ui, sans-serif" },
] as const satisfies readonly { id: z.infer<typeof UiFontId>; label: string; stack: string }[];

export const MONO_FONTS = [
  {
    id: "geist-mono",
    label: "Geist Mono",
    stack: '"Geist Mono Variable", ui-monospace, monospace',
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack: '"IBM Plex Mono", ui-monospace, monospace',
  },
  { id: "system-mono", label: "System", stack: "ui-monospace, monospace" },
] as const satisfies readonly { id: z.infer<typeof MonoFontId>; label: string; stack: string }[];

export const FONT_SCALES: readonly number[] = [0.875, 0.9375, 1, 1.0625, 1.125];

export const Appearance = z.object({
  theme: ThemeId.default("cozy-night"),
  accent: AccentId.default("honey"),
  uiFont: UiFontId.default("geist"),
  monoFont: MonoFontId.default("geist-mono"),
  fontScale: z
    .number()
    .refine((n) => FONT_SCALES.includes(n))
    .default(1),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  radius: z.enum(["sharp", "default", "round"]).default("default"),
  reduceMotion: z.boolean().default(false),
  officeScale: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
});
export type Appearance = z.infer<typeof Appearance>;

export const DEFAULT_APPEARANCE: Appearance = Appearance.parse({});

/**
 * Reads untrusted settings (storage, UI events) field by field: a missing field takes its default,
 * an invalid one keeps `fallback`'s value, so one bad value never resets or breaks the rest.
 */
export function parseAppearance(
  raw: unknown,
  fallback: Appearance = DEFAULT_APPEARANCE,
): Appearance {
  const read = (key: keyof Appearance): unknown =>
    typeof raw === "object" && raw !== null ? Reflect.get(raw, key) : undefined;
  const pick = <T>(schema: z.ZodType<T>, key: keyof Appearance, current: T): T => {
    const result = schema.safeParse(read(key));
    return result.success ? result.data : current;
  };
  const s = Appearance.shape;
  return {
    theme: pick(s.theme, "theme", fallback.theme),
    accent: pick(s.accent, "accent", fallback.accent),
    uiFont: pick(s.uiFont, "uiFont", fallback.uiFont),
    monoFont: pick(s.monoFont, "monoFont", fallback.monoFont),
    fontScale: pick(s.fontScale, "fontScale", fallback.fontScale),
    density: pick(s.density, "density", fallback.density),
    radius: pick(s.radius, "radius", fallback.radius),
    reduceMotion: pick(s.reduceMotion, "reduceMotion", fallback.reduceMotion),
    officeScale: pick(s.officeScale, "officeScale", fallback.officeScale),
  };
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
  root.style.setProperty(
    "--nb-font-ui",
    (UI_FONTS.find((f) => f.id === a.uiFont) ?? UI_FONTS[0]).stack,
  );
  root.style.setProperty(
    "--nb-font-code",
    (MONO_FONTS.find((f) => f.id === a.monoFont) ?? MONO_FONTS[0]).stack,
  );
  root.style.setProperty("--nb-font-scale", String(a.fontScale));
  root.style.setProperty("--radius", RADIUS[a.radius]);
  root.style.setProperty("--nb-office-scale", String(a.officeScale));
}
