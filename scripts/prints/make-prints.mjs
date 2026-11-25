// Turns each project's README image (or a drawn diagram) into a cyanotype print for the site.
// Output: public/prints/<id>-{600,1200}.webp, plus public/prints/edge-{1,2,3}.svg, the brushed edges
// used as CSS masks. The output is committed, so CI and Netlify never fetch anything.
//
//   pnpm prints            regenerate everything (downloads are cached in .cache/prints)
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const outDir = join(root, "public", "prints");
const cacheDir = join(root, ".cache", "prints");
const W = 1200;
const H = 800;

// Cyanotype ramp: deep Prussian blue in the shadows, a lighter cerulean in the mids, paper in the highlights.
const RAMP = [
  [0.0, [11, 42, 91]],
  [0.5, [41, 90, 156]],
  [0.82, [170, 196, 228]],
  [1.0, [244, 247, 251]],
];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Smooth value noise on a coarse grid, for the uneven coat of a brushed-on sensitiser.
function mottle(rand, cells = 9) {
  const gw = cells + 1;
  const gh = Math.ceil((cells * H) / W) + 1;
  const grid = Array.from({ length: gw * gh }, () => rand());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = (x / W) * cells;
    const gy = (y / W) * cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const at = (i, j) => grid[Math.min(j, gh - 1) * gw + Math.min(i, gw - 1)];
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

function ramp(t) {
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    const [t0, c0] = RAMP[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return RAMP[RAMP.length - 1][1];
}

async function fetchCached(url) {
  await mkdir(cacheDir, { recursive: true });
  const file = join(cacheDir, url.replace(/[^a-z0-9.]+/gi, "_"));
  try {
    await access(file);
    return file;
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    return file;
  }
}

// Greyscale W x H luminance (0..255) for one source.
async function luminance(spec) {
  if (spec.diagram) {
    // White lines on transparent: luminance is the line coverage over black.
    const svg = await readFile(join(here, spec.diagram));
    return sharp(svg).resize(W, H).flatten({ background: "#000" }).greyscale().raw().toBuffer();
  }
  const file = await fetchCached(spec.url);
  const options = {};
  if (spec.page !== undefined) options.page = spec.page;
  // SVG sources are rasterised at this density (dpi) so their lines stay crisp after resizing.
  if (spec.density !== undefined) options.density = spec.density;
  const input = sharp(file, options);
  let img = input.flatten({ background: "#fff" });
  if (spec.extract) img = img.extract(spec.extract);
  return (
    img
      // "contain" pads a wide diagram with the page colour instead of cropping it.
      .resize(W, H, { fit: spec.fit ?? "cover", background: "#fff" })
      .greyscale()
      .normalise({ lower: 2, upper: 98 })
      .raw()
      .toBuffer()
  );
}

async function makePrint(spec) {
  const lum = await luminance(spec);
  const rand = mulberry32(seedOf(spec.id));
  const coat = mottle(rand);
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let t = lum[i] / 255;
      if (spec.invert) t = 1 - t;
      // Diagrams are pure line work: keep the ground a touch lighter so it reads as exposed paper.
      if (spec.diagram) t = 0.06 + t * 0.94;
      // Uneven coating darkens or lifts the blue a little; grain adds tooth.
      t = t + (coat(x, y) - 0.5) * 0.1 + (rand() - 0.5) * 0.05;
      t = Math.min(1, Math.max(0, t));
      const [r, g, b] = ramp(t);
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    }
  }
  const base = sharp(rgb, { raw: { width: W, height: H, channels: 3 } });
  for (const width of [600, 1200]) {
    await base
      .clone()
      .resize(width)
      .webp({ quality: 78, effort: 6 })
      .toFile(join(outDir, `${spec.id}-${width}.webp`));
  }
  console.log(`print ${spec.id}`);
}

// A rectangle whose edges wander like a brush stroke, with a few bristle marks. Used as a CSS mask.
function edgeSvg(seed) {
  const rand = mulberry32(seed);
  const inset = 16;
  const pts = [];
  const side = (x0, y0, x1, y1, steps) => {
    let drift = 0;
    for (let s = 0; s < steps; s++) {
      const k = s / steps;
      drift = drift * 0.82 + (rand() - 0.5) * 5;
      const spike = rand() < 0.05 ? (rand() - 0.3) * 14 : 0;
      const off = drift + spike;
      const x = x0 + (x1 - x0) * k;
      const y = y0 + (y1 - y0) * k;
      // Offset outwards/inwards along the side's normal.
      const nx = y1 === y0 ? 0 : x1 === x0 ? (y1 > y0 ? 1 : -1) : 0;
      const ny = x1 === x0 ? 0 : x1 > x0 ? -1 : 1;
      pts.push([x + nx * off, y + ny * off]);
    }
  };
  side(inset, inset, W - inset, inset, 120);
  side(W - inset, inset, W - inset, H - inset, 80);
  side(W - inset, H - inset, inset, H - inset, 120);
  side(inset, H - inset, inset, inset, 80);
  const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="#fff"/></svg>\n`;
}

const { prints } = JSON.parse(await readFile(join(here, "sources.json"), "utf8"));
await mkdir(outDir, { recursive: true });
const only = process.argv.slice(2);
for (const spec of prints) {
  if (only.length && !only.includes(spec.id)) continue;
  await makePrint(spec);
}
for (const n of [1, 2, 3]) {
  await writeFile(join(outDir, `edge-${n}.svg`), edgeSvg(1000 + n * 7919));
}
console.log("edges 1-3");
