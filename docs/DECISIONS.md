# Decisions

Versions were checked on npm on 2026-10-25.

## D1 — Toolchain

- Node 22 (local v22.23.4), pnpm 12.15.0 workspaces, Rust 1.99.1 for Tauri later.
- TypeScript **6.0.3**. It was first chosen because `typescript-eslint` capped TypeScript at `<6.1`; ESLint is
  gone (D8) and `vp check` type-checks with typescript-go, so `typescript` 6 only serves editors now.
- Vite 8.3.5, React 19.3.1, Vitest 5.0.5, Zod 4.6.7, Vite+ 1.4 toolchain (see D8).
- Internal packages export their TypeScript source directly (`"exports": "./src/index.ts"`); the runtime runs
  through `tsx`. No build step per package until packaging needs one.
- `esbuild` is the only dependency allowed to run install scripts (`allowBuilds` in `pnpm-workspace.yaml`).

## D2 — Claude integration: `@anthropic-ai/claude-agent-sdk` 0.3.310

Checked in the package's type definitions:

- `listSessions({ dir?, limit?, offset? })` → `SDKSessionInfo[]` (`sessionId`, `summary`, `lastModified`, `cwd?`,
  `gitBranch?`, `firstPrompt?`, `customTitle?`, `createdAt?`). Covers discovery without a hand-written JSONL parser.
- `getSessionMessages(sessionId, { dir?, limit?, offset? })` for lazy history reads.
- `query({ options: { resume, forkSession, cwd, model, permissionMode, canUseTool, abortController } })` for
  running, resuming, forking, approvals and cancellation.
- `system/session_state_changed` messages (`idle | running | requires_action`) can drive agent status.
- `deleteSession` / `renameSession` exist: Noburi must never call them from the scanner (AC-17).

Still to confirm before coding the adapter: how usage is reported on result messages, and the auth/terms for
using the SDK with a subscription plan (spec R1).

## D3 — Runtime API

- Plain `node:http` for now (one endpoint); revisit if routes grow.
- Binds `127.0.0.1` only, port chosen by the OS, ephemeral bearer token generated at start and printed once on
  stdout as `{"event":"runtime.ready","port","token"}` for the desktop shell to read.
- Origin allowlist: Vite dev server `http://localhost:1420` and the Tauri webview origins.

## D4 — Scope of this scaffold

Created now: `packages/core` (domain schemas, task state machine, event schema), `packages/ui` (tokens),
`packages/assets` (pack manifest schema), `apps/runtime` (authenticated loopback server), `apps/desktop`
(Vite + React shell, no Tauri yet).

Not created yet, on purpose (no empty packages): `packages/providers/claude`, `packages/tools`, `apps/landing`,
`src-tauri`, SQLite persistence, `scripts/build-icons.mjs`. Each lands with the milestone that uses it.

## D5 — Design phase

`/design` and `/design-sync` were not available in this session; the design was made on a Claude Design canvas
instead. See `docs/DESIGN.md`.

## D6 — Office map format

`assets/worlds/cozy-office/map.json` uses a pre-rendered `backgroundImage` plus a `deskSprite` and agent slots,
instead of the tile layers in spec §30. Reason: the scene is generated as one crisp SVG, which is simpler to
render and to validate. Tile layers can be added later for user-made maps; the pack schema will accept both.

## D7 — shadcn/ui and appearance settings

- `apps/desktop` uses Tailwind CSS 4.3 and shadcn/ui (CLI 4.22, Radix base, `radix-nova` style). Components live
  in `apps/desktop/src/components/ui` as owned source.
- shadcn variables are filled by Noburi themes in `packages/ui/src/themes.css`: Cozy Night (default), Cozy Day,
  Matcha, High contrast. `data-theme`, `data-accent`, `data-density`, `data-motion` sit on `<html>`; dark themes
  also set the `.dark` class that shadcn's `dark:` variant expects.
- `packages/ui/src/appearance.ts` holds the settings schema (theme, accent, UI font, mono font, text size,
  density, corners, office zoom, reduce motion). Stored values are repaired field by field, never trusted.
- Fonts are bundled through `@fontsource` (all SIL OFL 1.1): Geist, Inter, IBM Plex Sans, Atkinson Hyperlegible
  Next, Geist Mono, JetBrains Mono, IBM Plex Mono, Pixelify Sans. No font is fetched at runtime.
- Compact density works by lowering Tailwind's `--spacing`; text size scales the root font size.
- Appearance is per-device and kept in `localStorage` for now; it moves to the runtime settings store with SQLite.
- shadcn primitives keep their internal lucide icons (chevrons, checks). App-level icons stay Heroicons.
- `cn` comes from shadcn's own `cn` package (replaces clsx + tailwind-merge).

## D8 — Vite+ as the single toolchain

`vite-plus` 1.4 (`vp`) replaces ESLint, standalone Oxlint, Vitest and tsx:

- `pnpm check` runs `vp check --deny-warnings`: Oxfmt formatting, Oxlint rules and TypeScript type checks
  (tsgolint on typescript-go, `typeAware` + `typeCheck`) in one pass. Per-package `tsc` scripts are gone.
- `pnpm test` runs `vp test`; tests import from `vite-plus/test`. The runtime runs through `vpx`.
- All lint, format and test settings live in the root `vite.config.ts`; `vite` resolves to
  `@voidzero-dev/vite-plus-core` through the pnpm catalog set up by `vp migrate`.
- Lint plugins: typescript, react, jsx-a11y, import, vitest, unicorn. `correctness` = error, `suspicious` = warn,
  warnings fail the check. Turned off on purpose: `react/react-in-jsx-scope` (automatic JSX runtime), unassigned
  `.css` imports, and `no-underscore-dangle` / `no-unsafe-type-assertion` inside generated shadcn components.
- The type-aware pass found unchecked `as` casts in our own code; they were replaced by Zod validation instead of
  being silenced. UI controls now hand raw values to `parseAppearance`, which keeps the current value when one is
  invalid.
- Biome was considered: it lints and formats but does not type-check, so `tsc` would have stayed.

## D9 — Licence

Apache-2.0 (official text, SHA-256 `cfc7749b…d30`) with a `NOTICE` file. Chosen over MIT for the explicit patent
grant from contributors and because section 6 states the licence gives no trademark rights, which keeps the
Noburi name and logo out of the code licence as the spec asks. Third-party logos and fonts keep their own terms.
The original pixel art is covered by Apache-2.0 for now; a separate asset licence (CC-BY-4.0) can be added later.

## D10 — Existing Claude Code sessions

- Discovery and reading use only `listSessions`, `getSessionInfo` and `getSessionMessages` from
  `@anthropic-ai/claude-agent-sdk` 0.3.310; no hand-written JSONL parser. A test fails if the session source
  ever imports a writing function (`deleteSession`, `renameSession`, `tagSession`, `forkSession`, …).
- Sessions are grouped by the working directory Claude Code recorded. Missing folders are flagged, never
  removed; sessions without a recorded folder go to "Unknown folder". The git root is found by walking up.
- Transcripts are normalised for display (text, tool calls, tool results); thinking blocks are not shown. Pages
  of 100 messages are read lazily, from the start of the conversation.
- Continue = `query({ resume })`, Fork = `query({ resume, forkSession: true })`. The runtime takes the folder
  from the session's own record, never from the client. It refuses to continue a session written to in the last
  2 minutes (it may be open in a terminal) unless the user forks or explicitly forces it, and refuses a second
  Noburi run on the same session.
- Permissions: `permissionMode: "default"` plus `canUseTool`. Read-only tools (Read, Glob, Grep, LS,
  NotebookRead, TodoWrite) run directly unless they touch a path outside the project; every other tool waits for
  Approve / Deny in the UI. Nothing bypasses permissions. The user's own Claude Code allow rules still apply.
- Runs are streamed to the UI as server-sent events read with `fetch` (EventSource cannot send the auth header),
  buffered so a reconnecting UI replays them. "Stopped" is shown only after the SDK run has actually ended.
- Usage comes from the SDK `result` message (input, output, cache read, cache write tokens). The SDK's
  `total_cost_usd` is kept as an API-price estimate and is not presented as a bill.
- `pnpm dev` (scripts/dev.mjs) starts the runtime, reads its ready line and passes URL and token to Vite as
  `VITE_NOBURI_RUNTIME_*`. Tauri will do the same without env variables.
- Consent: the first scan waits for the user to accept, and the screen states the folder that is read.
- Not done yet: real end-to-end resume test against Claude on a real account, detecting a CLI process that holds
  a session (only the 2-minute heuristic exists), and reading the newest messages first in very long sessions.

## D11 — Theme presets

- 15 themes in three groups: Noburi (Cozy Night, Cozy Day, Matcha, High contrast), inspired by developer
  tools (Claude Dark/Light, Codex, GitHub Dark/Light, Vercel) and community classics (Dracula, Nord,
  Catppuccin Mocha, Tokyo Night, Solarized Light).
- A theme is a palette plus suggested fonts (interface, code, conversation). Picking one applies its fonts and
  its own accent; the user can then change each font or force a fixed accent.
- "Inspired by" themes reuse colour schemes only: no logos, and no proprietary fonts. Claude and OpenAI fonts
  are not open, so Claude themes use Inter + Source Serif 4 (conversations) and Codex uses Inter + Fira Code.
  GitHub themes use GitHub's own open fonts, Mona Sans and Monaspace Neon (OFL 1.1).
- A conversation font (`readingFont`) was added: Claude themes read in serif, everything else follows the
  interface font.
- `packages/ui/src/themes.test.ts` computes WCAG contrast for every theme from `themes.css`: text, secondary
  text, button text, error/success/warning/info text, and dark text on the fixed accents must reach 4.5:1. It
  caught Solarized's button (4.08:1), now a darker blue with white text.

## D12 — Tauri 2 shell

- `apps/desktop/src-tauri` (Tauri 2.12). `pnpm desktop` runs `tauri dev`: Vite serves the UI on port 1420 and
  the shell opens it in a native window (1440×900, min 1024×640).
- The shell owns the runtime's lifetime. In development it starts `pnpm --filter @noburi/runtime start` from
  the workspace in its own process group, reads the `runtime.ready` line, and serves `{ url, token }` through
  the `runtime_info` command; the webview never sees an environment variable and the token is never logged.
- On exit the whole process group gets SIGTERM. The runtime is also started with a stdin pipe and
  `NOBURI_EXIT_ON_STDIN_CLOSE=1`, so it exits by itself if the shell crashes.
- Packaged builds are not done yet: they need the runtime bundled as a sidecar (Node or a single executable).
- CSP for packaged builds allows only the app itself, the IPC bridge and `http://127.0.0.1:*`.
- App icons in `src-tauri/icons` are generated with `tauri icon` from `assets/brand/source/noburi-app-icon.svg`.
- CI compiles and tests the Rust shell on Ubuntu (`cargo test --locked`) with the Tauri system libraries.

## D13 — Missions and persistence

- Storage: `node:sqlite` (built into Node 22+, no native module to compile), one file per user:
  `$XDG_DATA_HOME/noburi/noburi.db` on Linux, `~/Library/Application Support/Noburi` on macOS,
  `%APPDATA%\\Noburi` on Windows; `NOBURI_DATA_DIR` overrides. Node prints an "experimental" warning for it.
- Tables: missions, tasks, events (sequence per mission), artifacts. Rows read back are validated with the
  `@noburi/core` schemas. Every state change and event is written before it is broadcast.
- On start, `reconcileAfterRestart()` marks running missions and tasks INTERRUPTED. Nothing restarts by itself.
- Profiles: Developer (sonnet), Architect (opus), Researcher (haiku). Models are Claude Code aliases, so
  they follow what the user's Claude Code and plan resolve them to.
- A new mission starts as a DRAFT with a one-task plan the user edits: 1–3 tasks, a known agent each, and
  dependencies only on earlier tasks (acyclic by construction). The plan is not LLM-generated yet.
- Scheduler: one task at a time, started only when all its dependencies SUCCEEDED; transitions go through
  `assertTransition`. Each task is a new Claude Code session in the workspace, with a prompt that states the
  role, the objective, results of the tasks it depends on, and asks for an honest summary.
- A failed task fails the mission and cancels the tasks after it. Stop asks the run to cancel and the mission
  becomes CANCELLED only once the run has ended.
- Deliverables: each task's own summary, plus `git status --short` and `git diff --stat HEAD` of the workspace
  when it is a repository (read-only). Nothing is committed or merged.
- Fixed along the way: a stop requested before a run had started was ignored by `runClaude`.

## D14 — The pixel office

- Drawn with plain DOM images (`apps/desktop/src/features/office/`), not PixiJS: three characters, three desks
  and a static background do not need a WebGL scene, and DOM elements stay accessible (each nameplate is a
  button with a text status) and themable. PixiJS can come back if the office gets walking, pathfinding or
  many sprites.
- Pixels stay crisp: art is 16 px, scaled by a whole number (`--nb-office-scale`, 2×/3×/4× in Settings) with
  `image-rendering: pixelated`. Sprites and the scene are bundled by Vite from `assets/`.
- `deriveOffice()` maps each agent to a sprite only from persisted mission data: _Working_ while a tool it
  started has not finished, _Thinking_ while its task runs between tools, _Needs you_ only while an approval is
  pending, then _Done_, _Failed_, _Interrupted_, _Up next_ or idle. Nothing animates once the mission is not
  RUNNING. Covered by unit tests.
- The only motion is a one-pixel bob while an agent is really working; it stops with "Reduce motion" in
  Settings or the system preference.
- Slots follow `assets/worlds/cozy-office/map.json`: Developer, Architect (reviewer sprite), Researcher.

## D15 — Usage and budgets

- `GET /usage` aggregates the `usage.updated` events of every mission: input, output, cache read and cache write
  tokens exactly as the SDK `result` message reported them, by mission and by agent + model (the alias Noburi
  asked for). Runs that never reported are absent, not zero; nothing is estimated from text.
- The run's `apiKeySource` is recorded with its usage. `none`/`oauth` mean a Claude subscription: the screen then
  shows no dollar figure, because plans are not billed per token. With an API key it shows the SDK's
  `total_cost_usd` as an estimate at API prices; with mixed or unknown sources it is labelled an upper bound.
- Optional per-mission budget, in processed tokens (all four kinds, cache reads included). Checked before each
  task: once reached, the mission stops with `mission.cancelled { reason: "budget" }` and the remaining tasks are
  cancelled; a call already running is never cut off. The screen warns from 80 %.
- Schema change handled by an idempotent migration (`budget_tokens` column added if missing).
- Not counted yet: sessions continued from Projects (their runs are not persisted).

## D16 — Linux package

- `pnpm package:linux` runs `tauri build` with `src-tauri/tauri.bundle.json`, producing a `.deb` and an AppImage.
  The bundle config is separate so `tauri dev` and the CI shell job do not need the generated runtime files.
- `scripts/bundle-runtime.mjs` (run before the build) bundles `apps/runtime` and its dependencies into one
  `runtime.mjs` with esbuild, and downloads the official Node.js 24.21.0 binary from nodejs.org, checked against
  its pinned SHA-256 (release chosen over six weeks old). Node's licence ships next to it.
- In release builds the shell runs `runtime/node runtime/runtime.mjs` from the app's resources, with
  `NOBURI_PACKAGED=1`; development still runs the workspace runtime through pnpm.
- Claude Code is **not** bundled: the SDK's own CLI binary is 291 MB per platform. The packaged runtime uses the
  user's installed `claude` (`NOBURI_CLAUDE_BIN`, then PATH, then `~/.local/bin`, `~/.claude/local`,
  `/usr/local/bin`). The SDK version (0.3.310, CLI 2.1.310) and the installed CLI can differ; this is a known
  risk to watch.
- Apps started from a desktop menu get a minimal PATH, so agents could not find `npm` or nvm's Node (seen in a
  real packaged run). The packaged runtime reads the login shell's PATH once at start (`$SHELL -ilc`, 5 s
  timeout, output between markers) and merges it in front of the launcher's; about 2 s on a zsh setup.
- Data stays in `~/.local/share/noburi/` for both dev and packaged builds.
- Not done: signing, update channel, macOS/Windows packages.

## D17 — What mission agents inherit from Claude Code

- Missions run unattended, so a global hook or plugin made for an interactive terminal can derail them. Seen in
  real runs: a user-level plugin hook pushed agents into four unrelated `Skill` calls.
- Each mission stores an `AgentEnvironment` (`agent_env` column, JSON): user settings, project settings, hooks,
  MCP servers, and skills (`none` / `default` / `all`). It maps onto SDK options: `settingSources`,
  `settings.disableAllHooks`, `strictMcpConfig`, `skills`.
- Presets: **Project only** (default: the project's `.claude/` settings and CLAUDE.md, nothing from `~/.claude`),
  **Isolated** (nothing), **Like my terminal** (everything `claude` loads). Any other mix shows as Custom.
- The environment can change only while the mission is a draft. Missions created before this column show as
  "Like my terminal", which is what they actually ran with.
- Skills are a visibility filter, not a sandbox; tool approvals still apply in every preset.
- Checked with a real Isolated mission in a throwaway repo: completed, tests passed, no `Skill` call.
