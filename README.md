# Noburi

**Your agents, at work.** A local-first, open source desktop studio for directing Claude Code agents from a cozy pixel office.

> Status: early scaffold. Nothing below the "Develop" section is usable yet. See `docs/DECISIONS.md`.

## Develop

Requirements: Node 22+, pnpm 12.

```bash
pnpm install
pnpm test        # unit tests
pnpm typecheck
pnpm lint
pnpm dev:runtime # local API on 127.0.0.1, prints its port and session token
pnpm dev:desktop # UI on http://localhost:1420
```

## Layout

```
apps/desktop      React + Vite UI (Tauri shell to come)
apps/runtime      local orchestration API (loopback only, token-protected)
packages/core     domain schemas, task state machine, event schema
packages/ui       Cozy Pixel design tokens
packages/assets   avatar pack manifest schema
assets/brand      logo and app icon sources
docs              design and decisions
```

## Licence

To be chosen (MIT or Apache-2.0) after a dependency licence review.
