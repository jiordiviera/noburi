import { useState, type ReactNode } from "react";
import { MissionsPage } from "@/features/missions/MissionsPage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import type { useAppearance } from "@/features/settings/useAppearance";
import { UsagePage } from "@/features/usage/UsagePage";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, useConnections } from "./useConnections";
import type { Studio } from "./useStudio";
import "./game.css";

type Tab = "connections" | "options" | "sessions" | "missions" | "usage";

const TABS: { id: Tab; label: string }[] = [
  { id: "connections", label: "Connections" },
  { id: "options", label: "Options" },
  { id: "sessions", label: "Sessions" },
  { id: "missions", label: "Missions" },
  { id: "usage", label: "Usage" },
];

function Lamp({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={cn("flex items-center gap-2 text-base", on ? "text-[#7DD3B0]" : "text-[#A7B3BE]")}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5",
          on ? "bg-[#7DD3B0] shadow-[0_0_0_3px_rgba(125,211,176,0.25)]" : "bg-[#34424E]",
        )}
      />
      {children}
    </span>
  );
}

function Row({
  title,
  detail,
  status,
  action,
}: {
  title: string;
  detail: string;
  status: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 bg-[#16202A] px-4 py-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-lg font-bold">{title}</span>
        <span className="truncate font-mono text-xs text-[#A7B3BE]">{detail}</span>
      </span>
      {status}
      {action}
    </div>
  );
}

/** The pause menu: connections, options, and the detailed tools from before the game. */
export function StudioScreen({
  studio,
  appearance,
}: {
  studio: Studio;
  appearance: ReturnType<typeof useAppearance>;
}) {
  const [tab, setTab] = useState<Tab>("connections");
  const [draftRepo, setDraftRepo] = useState(studio.repo);
  const { connections, checking, check } = useConnections();

  const tool = tab === "sessions" || tab === "missions" || tab === "usage";
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0C131A] font-pixel text-[#F6F0E5]">
      <nav aria-label="Studio" className="flex gap-1.5 px-7 pt-5 shadow-[0_4px_0_#26323D]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={cn(
              "game-tab px-4 py-2.5 text-base",
              tab === t.id
                ? "bg-[#26323D] font-bold shadow-[inset_0_-4px_0_#F0BE79]"
                : "text-[#A7B3BE]",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tool ? (
        <div className="flex min-h-0 flex-1 font-sans">
          {tab === "sessions" ? (
            <ProjectsPage />
          ) : tab === "missions" ? (
            <MissionsPage />
          ) : (
            <UsagePage />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          {tab === "connections" ? (
            <div className="mx-auto flex max-w-4xl flex-col gap-7">
              <section aria-labelledby="c-repo" className="flex flex-col gap-2.5">
                <h2 id="c-repo" className="text-sm tracking-[0.16em] text-[#F0BE79]">
                  THE BOARD
                </h2>
                <form
                  className="flex flex-wrap items-center gap-3 bg-[#16202A] px-4 py-3.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    studio.setRepo(draftRepo.trim());
                  }}
                >
                  <label htmlFor="studio-repo" className="text-lg font-bold">
                    GitHub repository
                  </label>
                  <input
                    id="studio-repo"
                    value={draftRepo}
                    onChange={(e) => setDraftRepo(e.target.value)}
                    placeholder="owner/name"
                    className="h-11 min-w-64 flex-1 bg-[#0C131A] px-3 font-mono text-sm text-[#F6F0E5] shadow-[inset_0_0_0_2px_#34424E] outline-none focus:shadow-[inset_0_0_0_2px_#F0BE79]"
                  />
                  <button type="submit" className="game-btn game-btn-honey">
                    Pin its issues
                  </button>
                </form>
                {studio.boardError && <p className="text-sm text-[#F2867A]">{studio.boardError}</p>}
              </section>

              <section aria-labelledby="c-forges" className="flex flex-col gap-2.5">
                <h2 id="c-forges" className="text-sm tracking-[0.16em] text-[#F0BE79]">
                  TICKETS · FORGES
                </h2>
                <Row
                  title="GitHub"
                  detail={
                    connections?.github.account
                      ? `gh · signed in as @${connections.github.account}`
                      : connections?.github.installed
                        ? "gh is installed but not signed in: run gh auth login"
                        : "install the GitHub CLI, then run gh auth login"
                  }
                  status={
                    <Lamp on={Boolean(connections?.github.account)}>
                      {connections?.github.account ? "Connected" : "Not connected"}
                    </Lamp>
                  }
                />
                <Row
                  title="GitLab"
                  detail={
                    connections?.gitlab.installed
                      ? "glab is installed · merge requests come in a later version"
                      : "glab auth login · not supported yet"
                  }
                  status={
                    <Lamp on={false}>
                      {connections?.gitlab.installed ? "Installed" : "Not installed"}
                    </Lamp>
                  }
                />
              </section>

              <section aria-labelledby="c-engines" className="flex flex-col gap-2.5">
                <h2 id="c-engines" className="text-sm tracking-[0.16em] text-[#F0BE79]">
                  AGENTS · AI ENGINES
                </h2>
                {(connections?.engines ?? []).map((e) => (
                  <Row
                    key={e.id}
                    title={ENGINE_LABEL[e.id]}
                    detail={
                      e.path ??
                      (e.installed
                        ? "installed · Noburi cannot drive it yet"
                        : e.id === "codex"
                          ? "npm install -g @openai/codex"
                          : e.id === "gemini"
                            ? "npm install -g @google/gemini-cli"
                            : "install Claude Code and sign in")
                    }
                    status={
                      <Lamp on={e.installed && e.supported}>
                        {!e.installed
                          ? "Not installed"
                          : e.supported
                            ? "Ready"
                            : "Not supported yet"}
                      </Lamp>
                    }
                  />
                ))}
                <button
                  type="button"
                  className="game-btn game-btn-slate self-start"
                  disabled={checking}
                  onClick={() => void check()}
                >
                  {checking ? "Checking…" : "Check again"}
                </button>
                <p className="text-sm text-[#A7B3BE]">
                  Noburi uses the CLIs you installed and their own logins. It stores no token.
                </p>
              </section>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-7">
              <section aria-labelledby="o-game" className="flex flex-col gap-2.5">
                <h2 id="o-game" className="text-sm tracking-[0.16em] text-[#F0BE79]">
                  GAME
                </h2>
                <div className="flex items-center gap-4 bg-[#16202A] px-4 py-3.5">
                  <label htmlFor="o-wander" className="flex flex-1 flex-col gap-0.5">
                    <span className="text-lg">Coffee breaks when idle</span>
                    <span className="text-sm text-[#A7B3BE]">
                      Staged walks only; work states never are.
                    </span>
                  </label>
                  <input
                    id="o-wander"
                    type="checkbox"
                    checked={studio.wander}
                    onChange={(e) => studio.setWander(e.target.checked)}
                    className="size-6 accent-[#7DD3B0]"
                  />
                  <span
                    className={cn(
                      "w-10 font-bold",
                      studio.wander ? "text-[#7DD3B0]" : "text-[#A7B3BE]",
                    )}
                  >
                    {studio.wander ? "ON" : "OFF"}
                  </span>
                </div>
              </section>
              <section aria-labelledby="o-look" className="flex flex-col gap-2.5 font-sans">
                <h2 id="o-look" className="font-pixel text-sm tracking-[0.16em] text-[#F0BE79]">
                  PANELS &amp; TEXT
                </h2>
                <AppearanceSettings
                  appearance={appearance.appearance}
                  update={appearance.update}
                  selectTheme={appearance.selectTheme}
                  reset={appearance.reset}
                />
              </section>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
