# amirradjou-site

Single-page site for Amirreza Radjou, live at https://amirradjou.com (the terminal version is
https://terminal.amirradjou.com).

The page is one network. The first screen is a small peer-to-peer network you can click (a message
floods from the nearest peer, and the page reports how far it got and how fast). Below it, a cable runs
down the page and every project and job is a peer wired to it. Pick a skill and a message runs down
the cable; every peer passes it on, and the ones that used that skill light up. Projects are shown with
their own pictures and demos, which play on hover or tap. Static HTML built with
[Astro](https://astro.build), two small scripts and no libraries. Printable; respects reduced motion.

- Content lives in [`content/profile.yaml`](content/profile.yaml). The CV sections must match the CV;
  the projects come from each project's README.

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
3. If the name or tagline changed, regenerate the Open Graph image (headless Chromium):

   ```sh
   pnpm og
   ```

4. A new project: add it to `content/profile.yaml` with the skill ids it `uses` (from `skill_map`),
   then its picture to `scripts/media/sources.json` (the README image or GIF, which frame is the
   poster, the crop) and run `pnpm media`. The output in `public/media/` and `src/data/media.json` is
   committed, so the build never downloads anything.

## Layout

- `content/profile.yaml` — the single source of truth
- `src/lib/profile.ts` — loads + validates the YAML at build time
- `src/pages/index.astro` — the one page; `src/components/*` — hero, section, experience entry, project card
- `src/scripts/network.ts` — the hero's network (canvas, no libraries)
- `src/scripts/bus.ts` — the skill messages along the cable, and the demo clips
- `src/styles/global.css` — tokens (screen and print) and base styles; Archivo via Fontsource
- `scripts/media/` — makes the project pictures and clips from their READMEs (sharp, ffmpeg)
- `public/` — `cv.pdf`, `favicon.svg`, `og.png`, `media/`, `robots.txt`
- `netlify.toml` — build command, publish dir, security headers

## Deploy

Netlify, static: `pnpm build` → `dist/`. See `netlify.toml`. No analytics, no third-party requests.
