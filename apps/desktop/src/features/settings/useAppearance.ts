import { useCallback, useEffect, useState } from "react";
import { applyAppearance, parseAppearance, type Appearance } from "@noburi/ui";

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

  const update = useCallback(
    <K extends keyof Appearance>(key: K, value: Appearance[K]) => setAppearance((a) => ({ ...a, [key]: value })),
    [],
  );
  const reset = useCallback(() => setAppearance(parseAppearance({})), []);

  return { appearance, update, reset };
}
