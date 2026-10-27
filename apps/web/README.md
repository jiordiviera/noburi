# Noburi website

The public site at https://noburi.jiordiviera.me: `index.html` (landing) and `download.html`, two
static pages built with Vite+. Pixel art comes from the repository's `assets/`.

```bash
pnpm --filter @noburi/web dev
pnpm --filter @noburi/web build
```

Deploys run on Vercel (project `noburi`, team `jiordiviera`) from GitHub: every push to `main`
goes to production and every pull request gets a preview. A build is skipped when nothing under
`apps/web`, `assets/` or `pnpm-lock.yaml` changed.
