import { useEffect, useState } from "react";
import { DeskScreen } from "@/features/game/DeskScreen";
import { HiringScreen } from "@/features/game/HiringScreen";
import { OfficeScreen } from "@/features/game/OfficeScreen";
import { StudioScreen } from "@/features/game/StudioScreen";
import { useStudio } from "@/features/game/useStudio";
import { useAppearance } from "@/features/settings/useAppearance";
import { runtime } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import "@/features/game/game.css";

type Page = "office" | "hiring" | "desk" | "studio";

const NAV: { id: Page; label: string; key: string }[] = [
  { id: "office", label: "Office", key: "1" },
  { id: "hiring", label: "Hiring", key: "2" },
  { id: "desk", label: "Your desk", key: "3" },
  { id: "studio", label: "Studio", key: "4" },
];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Tokens processed by missions so far, as the engines reported them. */
function useTokens(): number | null {
  const [tokens, setTokens] = useState<number | null>(null);
  useEffect(() => {
    let current = true;
    const load = () =>
      runtime.usage().then(
        ({ totals: t }) => {
          if (current)
            setTokens(t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens);
        },
        () => {},
      );
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);
  return tokens;
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** The game shell: a HUD with the studio's state, four screens, keys 1 to 4 to switch. */
export function App() {
  const [page, setPage] = useState<Page>("office");
  const appearance = useAppearance();
  const studio = useStudio();
  const tokens = useTokens();
  const clock = useClock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      const next = NAV.find((n) => n.key === e.key);
      if (next) setPage(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[#0C131A] font-pixel text-[#F6F0E5]">
      <header className="relative z-10 flex h-[76px] shrink-0 items-center gap-5 bg-[#101820] px-6 shadow-[0_4px_0_#0C131A,0_8px_0_#26323D]">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-11" />
          <div className="flex flex-col">
            <span className="text-xl font-bold">Noburi</span>
            <button
              type="button"
              onClick={() => setPage("studio")}
              className="text-left font-mono text-xs text-[#A7B3BE] hover:text-[#F6F0E5]"
            >
              {studio.repo || "no repository yet"}
            </button>
          </div>
        </div>

        <nav aria-label="Game menu" className="mx-auto flex gap-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => setPage(n.id)}
              className={cn(
                "game-tab flex h-11 items-center gap-2 px-3.5 text-base",
                page === n.id
                  ? "bg-[#26323D] font-semibold shadow-[0_0_0_2px_#F0BE79]"
                  : "bg-[#16202A] shadow-[0_0_0_2px_#26323D]",
              )}
            >
              <span className="game-key">{n.key}</span>
              {n.label}
              {n.id === "desk" && studio.delivered.length > 0 && (
                <span className="bg-[#F0BE79] px-1.5 text-sm font-bold text-[#101820]">
                  {studio.delivered.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span
            title="Tokens processed by missions so far"
            className="flex h-11 items-center gap-2 bg-[#16202A] px-3 shadow-[0_0_0_2px_#26323D]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 10 10"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <rect x="3" y="0" width="4" height="1" fill="#A9844F" />
              <rect x="1" y="1" width="8" height="8" fill="#F0BE79" />
              <rect x="0" y="3" width="1" height="4" fill="#A9844F" />
              <rect x="9" y="3" width="1" height="4" fill="#A9844F" />
              <rect x="3" y="9" width="4" height="1" fill="#A9844F" />
              <rect x="4" y="3" width="2" height="4" fill="#A9844F" />
            </svg>
            <span className="font-mono text-sm font-bold">
              {tokens === null ? "…" : `${compact.format(tokens)} tokens`}
            </span>
          </span>
          <span className="font-mono text-base font-bold text-[#A7B3BE]">{clock}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {page === "office" ? (
          <OfficeScreen
            studio={studio}
            onOpenDesk={() => setPage("desk")}
            onOpenStudio={() => setPage("studio")}
          />
        ) : page === "hiring" ? (
          <HiringScreen studio={studio} />
        ) : page === "desk" ? (
          <DeskScreen studio={studio} />
        ) : (
          <StudioScreen studio={studio} appearance={appearance} />
        )}
      </div>
    </div>
  );
}
