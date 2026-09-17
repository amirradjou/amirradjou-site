# amirradjou-site

Professional, single-page site for Amirreza Radjou — the conventional, recruiter-facing counterpart to the terminal site.
Static HTML built with [Astro](https://astro.build), no client-side JavaScript, printable, light/dark via `prefers-color-scheme`.

- Live (planned): https://amirradjou.com — the terminal site moves to https://terminal.amirradjou.com
- Content lives in **one file**: [`content/profile.yaml`](content/profile.yaml). Every fact there must match the CV.

## Getting started

```sh
pnpm install
pnpm dev          # http://localhost:4321
```

## Development

```sh
pnpm build        # static output in dist/
pnpm preview      # serve dist/ locally
pnpm check        # astro check (TypeScript)
pnpm format:check # prettier --check .
pnpm format       # prettier --write .
```

CI (`.github/workflows/ci.yml`) runs install, Prettier, `astro check` and the build on every push and PR.

## Updating content

1. Edit `content/profile.yaml` (name, title, location, links, summary, experience, projects, education, skills).
   The schema in `src/lib/profile.ts` is strict — a typo or missing field fails `pnpm build` with a clear message.
2. Replace `public/cv.pdf` with the new CV and bump `cv_date` in the YAML.
3. If the name or headline changed, regenerate the Open Graph image:

   ```sh
   npx playwright screenshot --viewport-size=1200,630 scripts/og/og.html public/og.png
   ```

## Layout

- `content/profile.yaml` — the single source of truth
- `src/lib/profile.ts` — loads + validates the YAML at build time
- `src/pages/index.astro` — the one page; `src/components/*` — header, section, experience entry, project card
- `src/styles/global.css` — tokens (light, dark, print) and base styles
- `public/` — `cv.pdf`, `favicon.svg`, `og.png`, `robots.txt`
- `netlify.toml` — build command, publish dir, security headers

## Deploy

Netlify, static: `pnpm build` → `dist/`. See `netlify.toml`. No analytics, no third-party requests.
