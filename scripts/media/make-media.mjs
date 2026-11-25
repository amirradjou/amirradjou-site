// Builds the project pictures for the site from their original sources, without recolouring them:
//   still  a README image, cropped if asked, as WebP at 800 and 1600 wide
//   video  a README GIF as a short H.264 clip (ffmpeg) plus a poster frame
//   svg    a README chart, copied as it is
//   html   a page in scripts/media (for example a real terminal run), screenshotted by Chromium
// Output: public/media/*, and src/data/media.json with sizes for the page (so nothing jumps while
// pictures load). Downloads are cached in .cache/media. Everything is committed; CI fetches nothing.
//
//   pnpm media            rebuild everything
//   pnpm media leash      rebuild one
import { execFileSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const outDir = join(root, "public", "media");
const cacheDir = join(root, ".cache", "media");
const manifestPath = join(root, "src", "data", "media.json");

async function fetchCached(url) {
  await mkdir(cacheDir, { recursive: true });
  const file = join(cacheDir, url.replace(/[^a-z0-9.]+/gi, "_"));
  try {
    await access(file);
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

async function writeStill(id, input) {
  const meta = await sharp(input).metadata();
  // 800 and 1600 wide, never enlarged: a small source gets one file at its own width.
  const widths = [...new Set([800, 1600].map((w) => Math.min(w, meta.width)))];
  for (const width of widths) {
    await sharp(input)
      .resize({ width })
      .webp({ quality: 82, effort: 6 })
      .toFile(join(outDir, `${id}-${width}.webp`));
  }
  return {
    src: `/media/${id}-${widths[0]}.webp`,
    srcset: widths.map((w) => `/media/${id}-${w}.webp ${w}w`).join(", "),
    width: meta.width,
    height: meta.height,
  };
}

async function still(spec) {
  const file = await fetchCached(spec.url);
  let img = sharp(file).flatten({ background: "#ffffff" });
  if (spec.extract) img = img.extract(spec.extract);
  return writeStill(spec.id, await img.png().toBuffer());
}

async function video(spec) {
  const file = await fetchCached(spec.url);
  const meta = await sharp(file).metadata();
  const delays = (meta.delay ?? []).map((d) => (d > 0 ? d : 100));
  const at = (frame) => delays.slice(0, frame).reduce((a, b) => a + b, 0) / 1000;
  const args = ["-y", "-v", "error", "-i", file];
  if (spec.frames) args.push("-t", String(at(spec.frames)));
  args.push(
    "-vf",
    // H.264 in yuv420p needs even dimensions.
    "scale='trunc(min(1280,iw)/2)*2':-2:flags=lanczos,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "23",
    "-movflags",
    "+faststart",
    "-an",
    join(outDir, `${spec.id}.mp4`)
  );
  execFileSync("ffmpeg", args);
  const poster = await sharp(file, { page: spec.poster ?? 0 })
    .png()
    .toBuffer();
  return {
    ...(await writeStill(spec.id, poster)),
    video: `/media/${spec.id}.mp4`,
    start: at(spec.poster ?? 0),
  };
}

async function svg(spec) {
  const file = await fetchCached(spec.url);
  await copyFile(file, join(outDir, `${spec.id}.svg`));
  const text = await readFile(file, "utf8");
  const [, , , w, h] = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(text) ?? [];
  return { src: `/media/${spec.id}.svg`, width: Number(w), height: Number(h) };
}

async function html(spec) {
  const shot = join(cacheDir, `${spec.id}.png`);
  await mkdir(cacheDir, { recursive: true });
  execFileSync("chromium-browser", [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${join(cacheDir, "chromium")}`,
    `--window-size=${spec.width},${spec.height}`,
    `--screenshot=${shot}`,
    `file://${join(here, spec.html)}`,
  ]);
  return writeStill(spec.id, shot);
}

const kinds = { still, video, svg, html };
const { media } = JSON.parse(await readFile(join(here, "sources.json"), "utf8"));
const only = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  // first run
}
for (const spec of media) {
  if (only.length && !only.includes(spec.id)) continue;
  const { readdir } = await import("node:fs/promises");
  for (const name of await readdir(outDir)) {
    if (name.startsWith(`${spec.id}.`) || name.startsWith(`${spec.id}-`))
      await rm(join(outDir, name));
  }
  manifest[spec.id] = await kinds[spec.kind](spec);
  console.log(`${spec.kind} ${spec.id}`);
}
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
