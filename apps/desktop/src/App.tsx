import { FolderIcon } from "@heroicons/react/24/outline";

// Shell only: projects come from the runtime's session discovery (next milestone).
export function App() {
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <img src="/logo.svg" alt="Noburi" className="logo" />
        <a href="#projects" aria-current="page" className="nav-item">
          <FolderIcon aria-hidden="true" width={18} height={18} />
          Projects
        </a>
      </nav>
      <main id="projects" className="main">
        <h1>Projects</h1>
        <div className="empty">
          <p>Session discovery is not connected yet.</p>
          <p className="muted">Noburi will list your local Claude Code projects here, read-only.</p>
        </div>
      </main>
    </div>
  );
}
