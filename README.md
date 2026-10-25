# Noburi

**Your agents, at work.** A local-first, open source desktop studio for directing Claude Code agents from a cozy pixel office.

> Status: early alpha. Working today: finding your local Claude Code CLI projects and sessions, reading their
> history, continuing or forking a session with approvals, and missions of up to three tasks run by Claude
> Code agents, saved locally in SQLite, with a pixel office that shows what each agent is really doing.
> See `docs/DECISIONS.md`.

## Develop

Requirements: Node 22+, pnpm 12. The toolchain is [Vite+](https://viteplus.dev) (`vp`), installed as a dev dependency.
The desktop window also needs Rust (stable) and, on Debian/Ubuntu, the Tauri system libraries:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

```bash
pnpm install
pnpm check       # format, lint and type-check in one pass (vp check)
pnpm fix         # format and apply safe lint fixes
pnpm test        # unit tests (vp test)
pnpm build
pnpm desktop     # desktop app (Tauri): opens the window and starts the runtime itself
pnpm dev         # same UI in a browser at http://localhost:1420, with the runtime
pnpm dev:runtime # runtime alone: local API on 127.0.0.1, prints its port and session token
```

## Layout

```
apps/desktop      React + shadcn/ui UI, Tauri 2 shell in src-tauri/
apps/runtime      local orchestration API (loopback only, token-protected)
packages/core     domain schemas, task state machine, event schema
packages/ui       Cozy Pixel tokens, themes and appearance settings
packages/assets   avatar pack manifest schema
packages/providers/claude  Claude Code adapter: session discovery, transcripts, runs (Agent SDK)
assets/brand      logo and app icon sources
docs              design and decisions
```

## Licence

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

The Noburi name, logo and app icon are not covered by the licence. Third-party logos in
`assets/vendor/svgl/` belong to their owners.

## Support

Noburi is free. If it helps you, you can [buy the maintainer a coffee](https://buymeacoffee.com/jiordiviera) —
entirely optional, nothing is locked behind it.
