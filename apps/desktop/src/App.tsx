import { useState } from "react";
import {
  ChartBarIcon,
  Cog6ToothIcon,
  FolderIcon,
  HomeModernIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { GamePage } from "@/features/game/GamePage";
import { MissionsPage } from "@/features/missions/MissionsPage";
import { UsagePage } from "@/features/usage/UsagePage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { useAppearance } from "@/features/settings/useAppearance";
import { cn } from "@/lib/utils";

type Page = "office" | "projects" | "missions" | "usage" | "settings";

const NAV: { id: Page; label: string; Icon: typeof FolderIcon }[] = [
  { id: "office", label: "Office", Icon: HomeModernIcon },
  { id: "projects", label: "Projects", Icon: FolderIcon },
  { id: "missions", label: "Missions", Icon: RocketLaunchIcon },
  { id: "usage", label: "Usage", Icon: ChartBarIcon },
  { id: "settings", label: "Settings", Icon: Cog6ToothIcon },
];

export function App() {
  const [page, setPage] = useState<Page>("office");
  const { appearance, update, selectTheme, reset } = useAppearance();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-sidebar-border bg-sidebar px-4">
        <img src="/favicon.svg" alt="Noburi" className="size-8" />
        <span className="text-sm font-medium">{NAV.find((n) => n.id === page)?.label}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Main"
          className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-sidebar-border bg-sidebar pt-3"
        >
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
              className={cn(
                "flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground",
                page === id && "bg-sidebar-accent text-primary",
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
            </button>
          ))}
        </nav>
        {page === "office" ? (
          <GamePage />
        ) : page === "projects" ? (
          <ProjectsPage />
        ) : page === "missions" ? (
          <MissionsPage />
        ) : page === "usage" ? (
          <UsagePage />
        ) : (
          <main className="min-w-0 flex-1 overflow-y-auto p-8">
            <h1 className="mb-6 text-2xl font-semibold">Appearance</h1>
            <AppearanceSettings
              appearance={appearance}
              update={update}
              selectTheme={selectTheme}
              reset={reset}
            />
          </main>
        )}
      </div>
    </div>
  );
}
