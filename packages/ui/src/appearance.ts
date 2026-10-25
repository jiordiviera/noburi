import { z } from "zod";

export const ThemeId = z.enum([
  "cozy-night",
  "cozy-day",
  "matcha",
  "high-contrast",
  "claude-dark",
  "claude-light",
  "codex",
  "github-dark",
  "github-light",
  "vercel",
  "dracula",
  "nord",
  "catppuccin-mocha",
  "tokyo-night",
  "solarized-light",
]);
/** "theme" follows the active theme's own accent; the others override it everywhere. */
export const AccentId = z.enum(["theme", "honey", "mint", "sky", "coral"]);
export const UiFontId = z.enum([
  "geist",
  "inter",
  "ibm-plex-sans",
  "mona-sans",
  "atkinson",
  "system",
]);
export const MonoFontId = z.enum([
  "geist-mono",
  "jetbrains-mono",
  "ibm-plex-mono",
  "monaspace-neon",
  "fira-code",
  "system-mono",
]);
/** Font for conversation text; "ui" reuses the interface font. */
export const ReadingFontId = z.enum(["ui", "source-serif"]);

type ThemeIdT = z.infer<typeof ThemeId>;
type UiFont = z.infer<typeof UiFontId>;
type MonoFont = z.infer<typeof MonoFontId>;
type ReadingFont = z.infer<typeof ReadingFontId>;

export interface ThemePreset {
  id: ThemeIdT;
  label: string;
  group: "noburi" | "inspired" | "community";
  dark: boolean;
  /** Fonts applied with the theme; the user can change them afterwards. */
  fonts: { ui: UiFont; mono: MonoFont; reading: ReadingFont };
  /** Literal colours for the picker swatch, independent of the active theme. */
  preview: { bg: string; card: string; fg: string; accent: string };
  /** Shown under the swatch: where the palette comes from. */
  note?: string;
}

export const THEMES = [
  {
    id: "cozy-night",
    label: "Cozy Night",
    group: "noburi",
    dark: true,
    fonts: { ui: "geist", mono: "geist-mono", reading: "ui" },
    preview: { bg: "#0c131a", card: "#16202a", fg: "#f6f0e5", accent: "#f0be79" },
  },
  {
    id: "cozy-day",
    label: "Cozy Day",
    group: "noburi",
    dark: false,
    fonts: { ui: "geist", mono: "geist-mono", reading: "ui" },
    preview: { bg: "#f6f0e5", card: "#fffdf8", fg: "#101820", accent: "#f0be79" },
  },
  {
    id: "matcha",
    label: "Matcha",
    group: "noburi",
    dark: true,
    fonts: { ui: "geist", mono: "geist-mono", reading: "ui" },
    preview: { bg: "#0d1613", card: "#14201b", fg: "#f2f0e6", accent: "#7dd3b0" },
  },
  {
    id: "high-contrast",
    label: "High contrast",
    group: "noburi",
    dark: true,
    fonts: { ui: "atkinson", mono: "jetbrains-mono", reading: "ui" },
    preview: { bg: "#000000", card: "#0b0b0b", fg: "#ffffff", accent: "#ffd27a" },
  },
  {
    id: "claude-dark",
    label: "Claude Dark",
    group: "inspired",
    dark: true,
    fonts: { ui: "inter", mono: "jetbrains-mono", reading: "source-serif" },
    preview: { bg: "#262624", card: "#30302e", fg: "#faf9f5", accent: "#d97757" },
    note: "Warm neutrals and clay; serif for conversations",
  },
  {
    id: "claude-light",
    label: "Claude Light",
    group: "inspired",
    dark: false,
    fonts: { ui: "inter", mono: "jetbrains-mono", reading: "source-serif" },
    preview: { bg: "#faf9f5", card: "#ffffff", fg: "#141413", accent: "#d97757" },
    note: "Ivory, slate and clay; serif for conversations",
  },
  {
    id: "codex",
    label: "Codex",
    group: "inspired",
    dark: true,
    fonts: { ui: "inter", mono: "fira-code", reading: "ui" },
    preview: { bg: "#0d0d0d", card: "#1a1a1a", fg: "#ececec", accent: "#ececec" },
    note: "Monochrome, terminal-first",
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    group: "inspired",
    dark: true,
    fonts: { ui: "mona-sans", mono: "monaspace-neon", reading: "ui" },
    preview: { bg: "#0d1117", card: "#151b23", fg: "#f0f6fc", accent: "#238636" },
    note: "Primer dark, with Mona Sans and Monaspace",
  },
  {
    id: "github-light",
    label: "GitHub Light",
    group: "inspired",
    dark: false,
    fonts: { ui: "mona-sans", mono: "monaspace-neon", reading: "ui" },
    preview: { bg: "#ffffff", card: "#f6f8fa", fg: "#1f2328", accent: "#1f883d" },
    note: "Primer light, with Mona Sans and Monaspace",
  },
  {
    id: "vercel",
    label: "Vercel",
    group: "inspired",
    dark: true,
    fonts: { ui: "geist", mono: "geist-mono", reading: "ui" },
    preview: { bg: "#000000", card: "#0a0a0a", fg: "#ededed", accent: "#ededed" },
    note: "Black and white, Geist",
  },
  {
    id: "dracula",
    label: "Dracula",
    group: "community",
    dark: true,
    fonts: { ui: "inter", mono: "fira-code", reading: "ui" },
    preview: { bg: "#282a36", card: "#343746", fg: "#f8f8f2", accent: "#bd93f9" },
  },
  {
    id: "nord",
    label: "Nord",
    group: "community",
    dark: true,
    fonts: { ui: "ibm-plex-sans", mono: "ibm-plex-mono", reading: "ui" },
    preview: { bg: "#2e3440", card: "#3b4252", fg: "#eceff4", accent: "#88c0d0" },
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    group: "community",
    dark: true,
    fonts: { ui: "inter", mono: "jetbrains-mono", reading: "ui" },
    preview: { bg: "#1e1e2e", card: "#313244", fg: "#cdd6f4", accent: "#cba6f7" },
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    group: "community",
    dark: true,
    fonts: { ui: "inter", mono: "jetbrains-mono", reading: "ui" },
    preview: { bg: "#1a1b26", card: "#24283b", fg: "#c0caf5", accent: "#7aa2f7" },
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    group: "community",
    dark: false,
    fonts: { ui: "ibm-plex-sans", mono: "ibm-plex-mono", reading: "ui" },
    preview: { bg: "#fdf6e3", card: "#eee8d5", fg: "#073642", accent: "#1f6ea8" },
  },
] as const satisfies readonly ThemePreset[];

export const THEME_GROUPS = [
  { id: "noburi", label: "Noburi" },
  { id: "inspired", label: "Inspired by your tools" },
  { id: "community", label: "Community classics" },
] as const;

export const ACCENTS = [
  { id: "theme", label: "Theme" },
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
    id: "mona-sans",
    label: "Mona Sans",
    stack: '"Mona Sans Variable", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    stack: '"Atkinson Hyperlegible Next Variable", ui-sans-serif, system-ui, sans-serif',
  },
  { id: "system", label: "System", stack: "ui-sans-serif, system-ui, sans-serif" },
] as const satisfies readonly { id: UiFont; label: string; stack: string }[];

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
  {
    id: "monaspace-neon",
    label: "Monaspace Neon",
    stack: '"Monaspace Neon", ui-monospace, monospace',
  },
  { id: "fira-code", label: "Fira Code", stack: '"Fira Code Variable", ui-monospace, monospace' },
  { id: "system-mono", label: "System", stack: "ui-monospace, monospace" },
] as const satisfies readonly { id: MonoFont; label: string; stack: string }[];

export const READING_FONTS = [
  { id: "ui", label: "Same as interface", stack: null },
  {
    id: "source-serif",
    label: "Source Serif 4",
    stack: '"Source Serif 4 Variable", ui-serif, Georgia, serif',
  },
] as const satisfies readonly { id: ReadingFont; label: string; stack: string | null }[];

export const FONT_SCALES: readonly number[] = [0.875, 0.9375, 1, 1.0625, 1.125];

export const Appearance = z.object({
  theme: ThemeId.default("cozy-night"),
  accent: AccentId.default("theme"),
  uiFont: UiFontId.default("geist"),
  monoFont: MonoFontId.default("geist-mono"),
  readingFont: ReadingFontId.default("ui"),
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
    readingFont: pick(s.readingFont, "readingFont", fallback.readingFont),
    fontScale: pick(s.fontScale, "fontScale", fallback.fontScale),
    density: pick(s.density, "density", fallback.density),
    radius: pick(s.radius, "radius", fallback.radius),
    reduceMotion: pick(s.reduceMotion, "reduceMotion", fallback.reduceMotion),
    officeScale: pick(s.officeScale, "officeScale", fallback.officeScale),
  };
}

export function themePreset(id: ThemeIdT): ThemePreset {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Picking a theme also picks its fonts and goes back to the theme's own accent. */
export function withTheme(a: Appearance, id: ThemeIdT): Appearance {
  const preset = themePreset(id);
  return {
    ...a,
    theme: preset.id,
    accent: "theme",
    uiFont: preset.fonts.ui,
    monoFont: preset.fonts.mono,
    readingFont: preset.fonts.reading,
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
  const theme = themePreset(a.theme);
  root.dataset.theme = theme.id;
  root.dataset.accent = a.accent;
  root.dataset.density = a.density;
  root.dataset.motion = a.reduceMotion ? "reduce" : "full";
  // shadcn's `dark:` variant keys off the .dark class.
  root.classList.toggle("dark", theme.dark);
  const ui = (UI_FONTS.find((f) => f.id === a.uiFont) ?? UI_FONTS[0]).stack;
  root.style.setProperty("--nb-font-ui", ui);
  root.style.setProperty(
    "--nb-font-code",
    (MONO_FONTS.find((f) => f.id === a.monoFont) ?? MONO_FONTS[0]).stack,
  );
  root.style.setProperty(
    "--nb-font-reading",
    READING_FONTS.find((f) => f.id === a.readingFont)?.stack ?? ui,
  );
  root.style.setProperty("--nb-font-scale", String(a.fontScale));
  root.style.setProperty("--radius", RADIUS[a.radius]);
  root.style.setProperty("--nb-office-scale", String(a.officeScale));
}
