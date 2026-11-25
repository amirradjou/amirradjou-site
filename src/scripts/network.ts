// The hero's toy network: peers on a cyanotype plate. Click the plate (or the button) and a message
// floods from the nearest peer: each peer forwards it once to every neighbour, and the page reports
// how many peers it reached, how long that took and how many copies were sent. Times are simulated
// milliseconds, played back at real speed.

type Peer = { x: number; y: number; nbrs: number[] };
type Delivery = { from: number; to: number; start: number; end: number; dup: boolean };
type Run = { origin: number; got: number[]; deliveries: Delivery[]; done: number; t0: number };

const PAPER = "244, 247, 251";
const SAFFRON = "245, 183, 49";
const FORWARD_MS = 14; // time a peer takes to pass a message on

const plate = document.querySelector<HTMLElement>("[data-network]");
const canvas = plate?.querySelector<HTMLCanvasElement>("canvas");
const ctx = canvas?.getContext("2d");

if (plate && canvas && ctx) {
  const statusEl = plate.querySelector<HTMLElement>("[data-network-status]");
  const sendButton = plate.querySelector<HTMLButtonElement>("[data-network-send]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let peers: Peer[] = [];
  let latency = new Map<string, number>();
  let width = 0;
  let height = 0;
  let run: Run | null = null;
  let frame = 0;

  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Rectangles (in canvas coordinates) the network keeps clear of, so the text stays easy to read.
  function keepClear(): DOMRect[] {
    const origin = plate!.getBoundingClientRect();
    return [...plate!.querySelectorAll<HTMLElement>("[data-network-avoid]")].map((el) => {
      const r = el.getBoundingClientRect();
      return new DOMRect(
        r.left - origin.left - 28,
        r.top - origin.top - 28,
        r.width + 56,
        r.height + 56
      );
    });
  }

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = plate!.clientWidth;
    height = plate!.clientHeight;
    canvas!.width = Math.round(width * dpr);
    canvas!.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rand = rng(7);
    const clear = keepClear();
    const margin = 22;
    const count = Math.max(16, Math.min(44, Math.round((width * height) / 26000)));
    const inside = (x: number, y: number) =>
      clear.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom);

    // Best-candidate sampling spreads peers evenly without a visible grid.
    peers = [];
    let guard = 0;
    while (peers.length < count && guard++ < count * 40) {
      let best: { x: number; y: number } | null = null;
      let bestDist = -1;
      for (let k = 0; k < 12; k++) {
        const x = margin + rand() * (width - 2 * margin);
        const y = margin + rand() * (height - 2 * margin);
        if (inside(x, y)) continue;
        const d = peers.reduce((m, p) => Math.min(m, (p.x - x) ** 2 + (p.y - y) ** 2), Infinity);
        if (d > bestDist) {
          bestDist = d;
          best = { x, y };
        }
      }
      if (best) peers.push({ ...best, nbrs: [] });
    }

    // A link may not pass through the text, so the network frames the words instead of crossing them.
    const crosses = (a: number, b: number) =>
      clear.some((r) => segmentHitsRect(peers[a]!, peers[b]!, r));

    // Each peer links to its three nearest; then components are joined by their closest pair.
    const link = (a: number, b: number) => {
      if (a === b || peers[a]!.nbrs.includes(b)) return;
      peers[a]!.nbrs.push(b);
      peers[b]!.nbrs.push(a);
    };
    const dist = (a: number, b: number) =>
      Math.hypot(peers[a]!.x - peers[b]!.x, peers[a]!.y - peers[b]!.y);
    peers.forEach((_, i) => {
      peers
        .map((_, j) => j)
        .filter((j) => j !== i && !crosses(i, j))
        .sort((a, b) => dist(i, a) - dist(i, b))
        .slice(0, 3)
        .forEach((j) => link(i, j));
    });
    for (;;) {
      const comp = components();
      if (comp.length <= 1) break;
      let pair: [number, number] = [0, 0];
      let bestD = Infinity;
      for (const a of comp[0]!) {
        for (const other of comp.slice(1)) {
          for (const b of other) {
            // Crossing the text is allowed only as a last resort, to keep the network connected.
            const d = dist(a, b) * (crosses(a, b) ? 1000 : 1);
            if (d < bestD) {
              bestD = d;
              pair = [a, b];
            }
          }
        }
      }
      link(pair[0], pair[1]);
    }

    latency = new Map();
    peers.forEach((p, a) =>
      p.nbrs.forEach((b) => {
        if (!latency.has(key(a, b))) latency.set(key(a, b), 40 + dist(a, b) * 0.85 + rand() * 50);
      })
    );
    run = null;
    draw(0);
  }

  function segmentHitsRect(a: { x: number; y: number }, b: { x: number; y: number }, r: DOMRect) {
    // Liang-Barsky clipping: does the segment a-b enter the rectangle?
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const edges: [number, number][] = [
      [-dx, a.x - r.left],
      [dx, r.right - a.x],
      [-dy, a.y - r.top],
      [dy, r.bottom - a.y],
    ];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
    return true;
  }

  function components(): number[][] {
    const seen = new Set<number>();
    const out: number[][] = [];
    peers.forEach((_, start) => {
      if (seen.has(start)) return;
      const stack = [start];
      const comp: number[] = [];
      seen.add(start);
      while (stack.length) {
        const n = stack.pop()!;
        comp.push(n);
        for (const m of peers[n]!.nbrs) {
          if (!seen.has(m)) {
            seen.add(m);
            stack.push(m);
          }
        }
      }
      out.push(comp);
    });
    return out;
  }

  // Flooding, simulated up front: a peer forwards a message only the first time it hears it.
  function simulate(origin: number): Omit<Run, "t0"> {
    const got = peers.map(() => -1);
    const deliveries: Delivery[] = [];
    const queue: { to: number; from: number; at: number }[] = [];
    got[origin] = 0;
    const forward = (from: number, at: number, skip: number) => {
      for (const to of peers[from]!.nbrs) {
        if (to === skip) continue;
        const start = at + FORWARD_MS;
        const end = start + latency.get(key(from, to))!;
        queue.push({ to, from, at: end });
        deliveries.push({ from, to, start, end, dup: false });
      }
    };
    forward(origin, 0, -1);
    while (queue.length) {
      queue.sort((a, b) => a.at - b.at);
      const { to, from, at } = queue.shift()!;
      if (got[to]! >= 0) {
        const d = deliveries.find((x) => x.from === from && x.to === to && x.end === at);
        if (d) d.dup = true;
        continue;
      }
      got[to] = at;
      forward(to, at, from);
    }
    return { origin, got, deliveries, done: Math.max(...got) };
  }

  function report(r: Omit<Run, "t0">) {
    if (!statusEl) return;
    const reached = r.got.filter((t) => t >= 0).length;
    statusEl.textContent = `That message reached ${reached} of ${peers.length} peers in ${Math.round(
      r.done
    )} ms, using ${r.deliveries.length} messages.`;
  }

  function send(origin: number) {
    if (!peers.length) return;
    const sim = simulate(origin);
    if (reduceMotion.matches) {
      run = { ...sim, t0: performance.now() - sim.done - 1 };
      draw(performance.now());
      report(sim);
      return;
    }
    if (statusEl) statusEl.textContent = "Sending…";
    run = { ...sim, t0: performance.now() };
    cancelAnimationFrame(frame);
    const tick = (now: number) => {
      draw(now);
      if (run && now - run.t0 < run.done + 1800) {
        frame = requestAnimationFrame(tick);
      } else if (run) {
        report(run);
      }
    };
    frame = requestAnimationFrame(tick);
    window.setTimeout(() => run && report(run), sim.done);
  }

  function draw(now: number) {
    const c = ctx!;
    c.clearRect(0, 0, width, height);
    const t = run ? now - run.t0 : -1;

    c.lineWidth = 1;
    c.strokeStyle = `rgba(${PAPER}, 0.2)`;
    c.beginPath();
    peers.forEach((p, a) =>
      p.nbrs.forEach((b) => {
        if (b < a) return;
        c.moveTo(p.x, p.y);
        c.lineTo(peers[b]!.x, peers[b]!.y);
      })
    );
    c.stroke();

    if (run) {
      c.lineWidth = 1.5;
      for (const d of run.deliveries) {
        if (d.dup || t < d.end) continue;
        const fade = reduceMotion.matches ? 0.6 : Math.max(0, 1 - (t - d.end) / 1400) * 0.85;
        if (fade <= 0) continue;
        c.strokeStyle = `rgba(${SAFFRON}, ${fade})`;
        c.beginPath();
        c.moveTo(peers[d.from]!.x, peers[d.from]!.y);
        c.lineTo(peers[d.to]!.x, peers[d.to]!.y);
        c.stroke();
      }
    }

    if (run && !reduceMotion.matches) {
      for (const d of run.deliveries) {
        if (t < d.start || t > d.end) continue;
        const k = (t - d.start) / (d.end - d.start);
        const a = peers[d.from]!;
        const b = peers[d.to]!;
        c.fillStyle = `rgba(${SAFFRON}, ${d.dup ? 0.35 : 1})`;
        c.beginPath();
        c.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, d.dup ? 1.8 : 3, 0, Math.PI * 2);
        c.fill();
      }
    }

    peers.forEach((p, i) => {
      const at = run ? run.got[i]! : -1;
      const heard = run !== null && at >= 0 && t >= at;
      const age = heard ? t - at : Infinity;
      if (heard && age < 700 && !reduceMotion.matches) {
        c.strokeStyle = `rgba(${SAFFRON}, ${1 - age / 700})`;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(p.x, p.y, 4 + (age / 700) * 12, 0, Math.PI * 2);
        c.stroke();
      }
      // A peer that heard the message stays saffron for a while, then fades back to paper.
      const warm = heard ? (reduceMotion.matches ? 1 : Math.max(0, 1 - age / 2600)) : 0;
      c.fillStyle = warm > 0 ? `rgba(${SAFFRON}, ${0.55 + warm * 0.45})` : `rgba(${PAPER}, 0.85)`;
      c.beginPath();
      c.arc(p.x, p.y, i === run?.origin ? 4 : 2.6, 0, Math.PI * 2);
      c.fill();
    });
  }

  function nearest(x: number, y: number): number {
    let best = 0;
    let bestD = Infinity;
    peers.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  plate.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a, button, [data-network-avoid]")) return;
    const r = plate.getBoundingClientRect();
    send(nearest(event.clientX - r.left, event.clientY - r.top));
  });
  sendButton?.addEventListener("click", () => send(Math.floor(Math.random() * peers.length)));

  // Re-lay the network only for real size changes: a phone's toolbar or a status line wrapping
  // nudges the height, and re-laying would throw away the message in flight.
  let resizeTimer = 0;
  new ResizeObserver(() => {
    if (plate.clientWidth === width && Math.abs(plate.clientHeight - height) < 80) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 150);
  }).observe(plate);

  plate.dataset.networkReady = "";
  layout();
  // One message on arrival, from the peer nearest the top right, so the idea is visible at once.
  if (!reduceMotion.matches) window.setTimeout(() => send(nearest(width, 0)), 900);
}
