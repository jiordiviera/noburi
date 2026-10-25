import { useCallback, useEffect, useRef, useState } from "react";
import { step, type Point, type Walker } from "./scene";

/** Background pixels per second. */
const SPEED = 48;

/**
 * Staged movement of one character: walks a path frame by frame, then calls `onArrive`. Only the
 * walk is staged; callers decide where to go from real events.
 */
export function useWalker(start: Point) {
  const [walker, setWalker] = useState<Walker>({ pos: start, path: [], facing: "right" });
  const ref = useRef(walker);
  const arrive = useRef<(() => void) | null>(null);
  const frame = useRef<number | null>(null);

  const go = useCallback((path: Point[], onArrive?: () => void) => {
    ref.current = { ...ref.current, path };
    arrive.current = onArrive ?? null;
    if (frame.current !== null) return;
    const loop = (last: number) => {
      frame.current = requestAnimationFrame((now) => {
        const next = step(ref.current, SPEED, Math.min(0.1, (now - last) / 1000));
        ref.current = next;
        setWalker(next);
        if (next.path.length > 0) {
          loop(now);
          return;
        }
        frame.current = null;
        const done = arrive.current;
        arrive.current = null;
        done?.();
      });
    };
    loop(performance.now());
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return { walker, go, moving: walker.path.length > 0 };
}
