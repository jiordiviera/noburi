import { useCallback, useEffect, useState } from "react";
import { applyAppearance, parseAppearance, ThemeId, withTheme, type Appearance } from "@noburi/ui";

// Per-device preference. Kept in localStorage until the runtime settings store exists.
const STORAGE_KEY = "noburi.appearance.v1";

function load(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parseAppearance(raw === null ? {} : JSON.parse(raw));
  } catch {
    return parseAppearance({});
  }
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(load);

  useEffect(() => {
    applyAppearance(document.documentElement, appearance);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // Storage can be unavailable; the choice still applies for this session.
    }
  }, [appearance]);

  // UI controls hand back raw strings and numbers; re-validate them instead of trusting a cast.
  const update = useCallback(
    (key: keyof Appearance, value: unknown) =>
      setAppearance((a) => parseAppearance({ ...a, [key]: value }, a)),
    [],
  );
  const selectTheme = useCallback((value: unknown) => {
    const id = ThemeId.safeParse(value);
    if (id.success) setAppearance((a) => withTheme(a, id.data));
  }, []);
  const reset = useCallback(() => setAppearance(parseAppearance({})), []);

  return { appearance, update, selectTheme, reset };
}
