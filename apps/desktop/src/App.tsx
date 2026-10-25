import { useState } from "react";
import { Cog6ToothIcon, FolderIcon } from "@heroicons/react/24/outline";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { useAppearance } from "@/features/settings/useAppearance";
import { cn } from "@/lib/utils";

type Page = "projects" | "settings";

const NAV: { id: Page; label: string; Icon: typeof FolderIcon }[] = [
  { id: "projects", label: "Projects", Icon: FolderIcon },
  { id: "settings", label: "Settings", Icon: Cog6ToothIcon },
];

export function App() {
  const [page, setPage] = useState<Page>("projects");
  const { appearance, update, reset } = useAppearance();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-sidebar-border bg-sidebar px-4">
        <img src="/favicon.svg" alt="Noburi" className="size-8" />
        <span className="text-sm font-medium">{NAV.find((n) => n.id === page)?.label}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-sidebar-border bg-sidebar pt-3">
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
        <main className="min-w-0 flex-1 overflow-y-auto p-8">
          {page === "projects" ? (
            <section className="max-w-3xl rounded-xl border border-dashed bg-card p-6">
              <h1 className="text-lg font-semibold">Projects</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Session discovery is not connected yet. Noburi will list your local Claude Code projects here, read-only.
              </p>
            </section>
          ) : (
            <>
              <h1 className="mb-6 text-2xl font-semibold">Appearance</h1>
              <AppearanceSettings appearance={appearance} update={update} reset={reset} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
