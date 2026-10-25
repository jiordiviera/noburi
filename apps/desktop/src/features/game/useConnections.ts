import { useCallback, useEffect, useState } from "react";
import { runtime, type Connections } from "@/lib/runtime";

export const ENGINE_LABEL: Record<Connections["engines"][number]["id"], string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
};

/** Which CLIs this machine has, as the runtime finds them; checked again on demand. */
export function useConnections() {
  const [connections, setConnections] = useState<Connections | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(() => {
    setChecking(true);
    return runtime.connections().then(
      (c) => {
        setConnections(c);
        setChecking(false);
      },
      () => setChecking(false),
    );
  }, []);

  useEffect(() => {
    let current = true;
    runtime.connections().then(
      (c) => {
        if (current) setConnections(c);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);

  return { connections, checking, check };
}
