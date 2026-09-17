# amirradjou-site

Recruiter-facing, single-page professional site for Amirreza Radjou (Astro, static, zero client JS).

## Stack

- Language/runtime: TypeScript + Astro 7 (static output), Node 22
- Package manager: pnpm
- Tests: none yet — `pnpm check` (astro check) + `pnpm build` are the gate
- Lint/format: `pnpm format:check` (Prettier with prettier-plugin-astro)

## Commands

| Task          | Command                             |
| ------------- | ----------------------------------- |
| Install deps  | `pnpm install`                      |
| Run           | `pnpm dev`                          |
| Build         | `pnpm build`                        |
| Check         | `pnpm check`                        |
| Lint + format | `pnpm format:check` / `pnpm format` |

## Layout

- `content/profile.yaml` — the single source of truth for every fact on the page
- `src/lib/profile.ts` — strict zod schema + loader (build fails on invalid content)
- `src/pages/index.astro`, `src/components/`, `src/layouts/Base.astro`, `src/styles/global.css`
- `public/` — `cv.pdf`, `favicon.svg`, `og.png`, `robots.txt`; `scripts/og/og.html` — OG image template

## Conventions

- See global preferences in `~/.claude/CLAUDE.md` (conventional commits, feature branches, etc.).
- Every fact in `content/profile.yaml` must match the CV (`~/Documents/CV/<latest>/main.tex`). Do not invent numbers.
- Keep the page free of client-side JavaScript and third-party requests (no analytics, no web fonts).
- Print output must stay readable: check `@media print` rules when touching styles.

## Gotchas / decisions

- The YAML is imported with Vite's `?raw` so it is inlined at build time (a `fs.readFileSync` relative to
  `import.meta.url` breaks in the bundled prerender chunk).
- `pnpm-workspace.yaml` allows esbuild's postinstall (pnpm 12 blocks build scripts by default).
- The terminal site link in the footer points at `links.terminal`; flip it to `https://terminal.amirradjou.com`
  once DNS moves.
