# amirradjou-site

Single-page site for Amirreza Radjou, live at https://amirradjou.com (the terminal version is
https://terminal.amirradjou.com).

The look is a cyanotype: a Prussian-blue first screen with a small peer-to-peer network you can
click (a message floods from the nearest peer and the page reports how far it got and how fast), and
each project shown as a blue-and-white print of its own README picture. Static HTML built with
[Astro](https://astro.build); the only script is the network (about 5 KB). Printable, dark mode,
respects reduced motion.

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

4. A new project needs a print: add it to `scripts/prints/sources.json` (the README image, which GIF
   frame, the crop) and run `pnpm prints`. The output in `public/prints/` is committed, so the build
   never downloads anything.

## Layout

- `content/profile.yaml` — the single source of truth
- `src/lib/profile.ts` — loads + validates the YAML at build time
- `src/pages/index.astro` — the one page; `src/components/*` — hero, section, experience entry, project card
- `src/scripts/network.ts` — the hero's network (canvas, no libraries)
- `src/styles/global.css` — tokens (light, dark, print) and base styles; Archivo via Fontsource
- `scripts/prints/` — makes the cyanotype prints and their brushed edges (sharp)
- `public/` — `cv.pdf`, `favicon.svg`, `og.png`, `prints/`, `robots.txt`
- `netlify.toml` — build command, publish dir, security headers

## Deploy

Netlify, static: `pnpm build` → `dist/`. See `netlify.toml`. No analytics, no third-party requests.
