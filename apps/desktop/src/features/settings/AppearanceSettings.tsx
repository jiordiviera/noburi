import {
  ACCENTS,
  FONT_SCALES,
  MONO_FONTS,
  READING_FONTS,
  THEME_GROUPS,
  THEMES,
  themePreset,
  UI_FONTS,
  type Appearance,
} from "@noburi/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const ACCENT_SWATCH: Record<Exclude<Appearance["accent"], "theme">, string> = {
  honey: "#f0be79",
  mint: "#7dd3b0",
  sky: "#8ec5ff",
  coral: "#f2867a",
};

const fontLabel = (id: string, list: readonly { id: string; label: string }[]) =>
  list.find((f) => f.id === id)?.label ?? id;

interface Props {
  appearance: Appearance;
  update: (key: keyof Appearance, value: unknown) => void;
  selectTheme: (id: unknown) => void;
  reset: () => void;
}

export function AppearanceSettings({ appearance, update, selectTheme, reset }: Props) {
  const themeAccent = themePreset(appearance.theme).preview.accent;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Applies to the whole app. The pixel office keeps its own colours.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <RadioGroup
            value={appearance.theme}
            onValueChange={selectTheme}
            className="flex flex-col gap-5"
            aria-label="Theme"
          >
            {THEME_GROUPS.map((group) => (
              <div key={group.id} className="flex flex-col gap-2.5">
                <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {THEMES.filter((t) => t.group === group.id).map((t) => {
                    const p = t.preview;
                    return (
                      <Label
                        key={t.id}
                        htmlFor={`theme-${t.id}`}
                        className={cn(
                          "flex cursor-pointer flex-col items-stretch gap-2 rounded-lg border-2 p-2",
                          appearance.theme === t.id
                            ? "border-primary"
                            : "border-transparent hover:border-border",
                        )}
                      >
                        <span
                          className="flex h-16 flex-col gap-1.5 rounded-md p-2"
                          style={{ background: p.bg }}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-10 rounded-sm" style={{ background: p.fg }} />
                            <span
                              className="size-2 rounded-full"
                              style={{ background: p.accent }}
                            />
                          </span>
                          <span className="flex-1 rounded-sm" style={{ background: p.card }} />
                        </span>
                        <span className="flex items-center gap-2 text-sm">
                          <RadioGroupItem id={`theme-${t.id}`} value={t.id} />
                          {t.label}
                        </span>
                        <span className="text-xs leading-snug font-normal text-muted-foreground">
                          {fontLabel(t.fonts.ui, UI_FONTS)} · {fontLabel(t.fonts.mono, MONO_FONTS)}
                          {t.fonts.reading !== "ui" &&
                            ` · ${fontLabel(t.fonts.reading, READING_FONTS)}`}
                        </span>
                      </Label>
                    );
                  })}
                </div>
              </div>
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Choosing a theme also picks its fonts; you can change them below. Themes inspired by
            other tools use their colour schemes only, with open-licence fonts.
          </p>

          <div className="flex flex-col gap-3">
            <Label>Accent</Label>
            <ToggleGroup
              type="single"
              value={appearance.accent}
              onValueChange={(v) => v && update("accent", v)}
              aria-label="Accent colour"
              className="justify-start"
            >
              {ACCENTS.map((a) => (
                <ToggleGroupItem
                  key={a.id}
                  value={a.id}
                  aria-label={a.label}
                  className="gap-2 px-3"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ background: a.id === "theme" ? themeAccent : ACCENT_SWATCH[a.id] }}
                  />
                  {a.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <CardDescription>All fonts are bundled with Noburi and work offline.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ui-font">Interface font</Label>
              <Select value={appearance.uiFont} onValueChange={(v) => update("uiFont", v)}>
                <SelectTrigger id="ui-font" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UI_FONTS.map((f) => (
                    <SelectItem key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mono-font">Code &amp; metrics font</Label>
              <Select value={appearance.monoFont} onValueChange={(v) => update("monoFont", v)}>
                <SelectTrigger id="mono-font" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONO_FONTS.map((f) => (
                    <SelectItem key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reading-font">Conversation font</Label>
              <Select
                value={appearance.readingFont}
                onValueChange={(v) => update("readingFont", v)}
              >
                <SelectTrigger id="reading-font" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {READING_FONTS.map((f) => (
                    <SelectItem
                      key={f.id}
                      value={f.id}
                      style={f.stack ? { fontFamily: f.stack } : undefined}
                    >
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label id="font-size-label">Text size</Label>
              <span className="font-mono text-sm text-muted-foreground">
                {Math.round(appearance.fontScale * 100)} %
              </span>
            </div>
            <Slider
              aria-labelledby="font-size-label"
              min={0}
              max={FONT_SCALES.length - 1}
              step={1}
              value={[FONT_SCALES.indexOf(appearance.fontScale)]}
              onValueChange={([i]) => update("fontScale", FONT_SCALES[i ?? -1])}
            />
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="font-reading text-sm">
              Developer finished task 2 and is waiting for review.
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              tool.completed Edit · 1.8 s · source sdk
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Layout &amp; motion</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <SettingRow label="Density" description="Compact fits more rows on small screens.">
            <ToggleGroup
              type="single"
              variant="outline"
              value={appearance.density}
              onValueChange={(v) => v && update("density", v)}
              aria-label="Density"
            >
              <ToggleGroupItem value="comfortable">Comfortable</ToggleGroupItem>
              <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
            </ToggleGroup>
          </SettingRow>
          <Separator />
          <SettingRow label="Corners">
            <ToggleGroup
              type="single"
              variant="outline"
              value={appearance.radius}
              onValueChange={(v) => v && update("radius", v)}
              aria-label="Corner radius"
            >
              <ToggleGroupItem value="sharp">Sharp</ToggleGroupItem>
              <ToggleGroupItem value="default">Default</ToggleGroupItem>
              <ToggleGroupItem value="round">Round</ToggleGroupItem>
            </ToggleGroup>
          </SettingRow>
          <Separator />
          <SettingRow
            label="Office zoom"
            description="Pixel art stays crisp at whole-number zoom levels."
          >
            <ToggleGroup
              type="single"
              variant="outline"
              value={String(appearance.officeScale)}
              onValueChange={(v) => v && update("officeScale", Number(v))}
              aria-label="Office zoom"
            >
              <ToggleGroupItem value="2">2×</ToggleGroupItem>
              <ToggleGroupItem value="3">3×</ToggleGroupItem>
              <ToggleGroupItem value="4">4×</ToggleGroupItem>
            </ToggleGroup>
          </SettingRow>
          <Separator />
          <SettingRow
            label="Reduce motion"
            description="Agents change state without walking or bouncing."
            htmlFor="reduce-motion"
          >
            <Switch
              id="reduce-motion"
              checked={appearance.reduceMotion}
              onCheckedChange={(v) => update("reduceMotion", v)}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <div>
        <Button variant="ghost" onClick={reset}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
