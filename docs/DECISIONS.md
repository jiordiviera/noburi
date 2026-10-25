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
