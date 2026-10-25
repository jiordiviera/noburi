# Decisions

Versions were checked on npm on 2026-10-25.

## D1 — Toolchain

- Node 22 (local v22.23.4), pnpm 12.15.0 workspaces, Rust 1.99.1 for Tauri later.
- TypeScript **6.0.3**. It was first chosen because `typescript-eslint` capped TypeScript at `<6.1`; ESLint is
  gone now (D8), so moving to TypeScript 7 is possible once Vite and Vitest typings are checked against it.
- Vite 8.3.5, React 19.3.1, Vitest 5.0.5, Zod 4.6.7, Oxlint 1.89 (see D8).
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

## D8 — Oxlint instead of ESLint

Linting uses Oxlint 1.89 (Rust, from the oxc project), configured in `.oxlintrc.json`: plugins typescript, react,
jsx-a11y, import, vitest and unicorn; `correctness` rules are errors, `suspicious` rules warnings, and
`pnpm lint` fails on any warning. Disabled on purpose: `react/react-in-jsx-scope` (React 19 automatic JSX
runtime), unassigned imports for `.css` files, and `no-underscore-dangle` inside generated shadcn components.
Oxlint does not format code; a formatter (oxfmt or Biome) is still to choose.
