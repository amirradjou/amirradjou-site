// The cable below the hero. Pick a skill and a message leaves its button, enters the top of the bus and
// runs down it; at each junction it turns into the branch and reaches that peer (a project or a job).
// Every peer passes it on; the ones whose data-uses include the skill light up and stay lit until another
// skill is picked. Pulses are drawn on a canvas the size of the window (never the page, which phones
// cannot allocate); the cable itself is plain CSS, so it is there without this script.
//
// Also here: demo clips that play on hover (pointer devices) or on their button (everyone).

const SPEED = 2.4; // px per simulated millisecond, along every wire
const SAFFRON = "245, 183, 49";
const PAPER = "244, 247, 251";

const board = document.querySelector<HTMLElement>("[data-switchboard]");
const bus = document.querySelector<HTMLElement>("[data-bus]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type Peer = { el: HTMLElement; x: number; y: number; junction: number; at: number; hit: boolean };
type Run = {
  from: { x: number; y: number };
  entry: { x: number; y: number };
  entryAt: number;
  end: number;
  peers: Peer[];
  done: number;
  t0: number;
  label: string;
};

if (board && bus) {
  const line = bus.querySelector<HTMLElement>(".bus-line")!;
  const peerEls = [...bus.querySelectorAll<HTMLElement>("[data-peer]")];
  const status = board.querySelector<HTMLElement>("[data-bus-status]");
  const clear = board.querySelector<HTMLButtonElement>("[data-skill-clear]");
  const buttons = [...board.querySelectorAll<HTMLButtonElement>("[data-skill]")];

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "no-print";
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "5",
  });
  document.body.append(canvas);
  const ctx = canvas.getContext("2d")!;

  let run: Run | null = null;
  let frame = 0;
  const timers: number[] = [];

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Page coordinates (not viewport), measured when a message is sent.
  function bottom(el: Element) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 + window.scrollX, y: r.bottom + window.scrollY };
  }

  // The wire from a skill button to the top of the cable: a cubic curve that leaves the button going
  // down and arrives at the cable going down. The pulse follows the same curve as the drawn wire.
  type Pt = { x: number; y: number };
  function wirePoint(a: Pt, b: Pt, k: number): Pt {
    const dy = (b.y - a.y) / 2;
    const c1 = { x: a.x, y: a.y + dy };
    const c2 = { x: b.x, y: b.y - dy };
    const u = 1 - k;
    return {
      x: u * u * u * a.x + 3 * u * u * k * c1.x + 3 * u * k * k * c2.x + k * k * k * b.x,
      y: u * u * u * a.y + 3 * u * u * k * c1.y + 3 * u * k * k * c2.y + k * k * k * b.y,
    };
  }
  function wireLength(a: Pt, b: Pt) {
    let length = 0;
    let prev = a;
    for (let i = 1; i <= 24; i++) {
      const next = wirePoint(a, b, i / 24);
      length += Math.hypot(next.x - prev.x, next.y - prev.y);
      prev = next;
    }
    return length;
  }

  // The wires themselves, as SVG in the page (no script, no wires; the board is hidden then too).
  const wires = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  wires.setAttribute("aria-hidden", "true");
  wires.classList.add("wires", "no-print");
  board.after(wires);
  function drawWires() {
    const host = wires.parentElement!.getBoundingClientRect();
    const cable = line.getBoundingClientRect();
    const entry = { x: cable.left + cable.width / 2 - host.left, y: cable.top - host.top };
    const paths = buttons.map((button) => {
      const r = button.getBoundingClientRect();
      const a = { x: r.left + r.width / 2 - host.left, y: r.bottom - host.top };
      const dy = (entry.y - a.y) / 2;
      return `<path data-wire="${button.dataset.skill}" d="M${a.x} ${a.y} C${a.x} ${a.y + dy} ${entry.x} ${entry.y - dy} ${entry.x} ${entry.y}"/>`;
    });
    wires.setAttribute("width", String(host.width));
    wires.setAttribute("height", String(host.height));
    wires.innerHTML = paths.join("");
  }

  function centre(el: Element) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY };
  }

  function plan(button: HTMLButtonElement): Omit<Run, "t0"> {
    const skill = button.dataset.skill!;
    const cable = line.getBoundingClientRect();
    const busX = cable.left + cable.width / 2 + window.scrollX;
    const top = cable.top + window.scrollY;
    const end = cable.bottom + window.scrollY;
    const from = bottom(button);
    const entry = { x: busX, y: top };
    const entryAt = wireLength(from, entry) / SPEED;
    const peers = peerEls.map((el) => {
      const port = centre(el.querySelector(".port")!);
      const junction = entryAt + (port.y - top) / SPEED;
      return {
        el,
        x: port.x,
        y: port.y,
        junction,
        at: junction + Math.abs(port.x - busX) / SPEED,
        hit: (el.dataset.uses ?? "").split(" ").includes(skill),
      };
    });
    const done = Math.max(...peers.map((p) => p.at));
    const label = button.dataset.label ?? skill;
    return { from, entry, entryAt, end: entryAt + (end - top) / SPEED, peers, done, label };
  }

  function reset() {
    timers.splice(0).forEach((t) => window.clearTimeout(t));
    cancelAnimationFrame(frame);
    run = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    peerEls.forEach((el) => el.classList.remove("reached", "lit"));
    buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
    wires.querySelectorAll(".hot").forEach((w) => w.classList.remove("hot"));
    delete bus!.dataset.skillActive;
  }

  function report(r: Omit<Run, "t0">) {
    const projects = r.peers.filter((p) => p.hit && p.el.dataset.kind === "project").length;
    const jobs = r.peers.filter((p) => p.hit && p.el.dataset.kind === "job").length;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    if (status) {
      status.textContent = `${r.label}: ${plural(projects, "project")} and ${plural(jobs, "job")} lit up. The message reached all ${r.peers.length} peers in ${Math.round(r.done).toLocaleString("en-CA")} ms.`;
    }
  }

  function arrive(p: Peer) {
    p.el.classList.remove("reached");
    void p.el.offsetWidth; // restart the ping animation
    p.el.classList.add("reached");
    if (p.hit) p.el.classList.add("lit");
  }

  function send(button: HTMLButtonElement) {
    reset();
    button.setAttribute("aria-pressed", "true");
    wires.querySelector(`[data-wire="${button.dataset.skill}"]`)?.classList.add("hot");
    bus!.dataset.skillActive = button.dataset.skill;
    if (clear) clear.hidden = false;
    size();
    const sim = plan(button);
    if (reduceMotion.matches) {
      sim.peers.forEach(arrive);
      report(sim);
      return;
    }
    if (status) status.textContent = "Sending…";
    const current: Run = { ...sim, t0: performance.now() };
    run = current;
    for (const p of current.peers)
      timers.push(window.setTimeout(() => run === current && arrive(p), p.at));
    timers.push(window.setTimeout(() => run === current && report(current), current.done));
    const tick = (now: number) => {
      if (run !== current) return;
      draw(current, now - current.t0);
      if (now - current.t0 < Math.max(current.done, current.end) + 400)
        frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    frame = requestAnimationFrame(tick);
  }

  function dot(x: number, y: number, r: number, alpha: number) {
    ctx.fillStyle = `rgba(${SAFFRON}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x - window.scrollX, y - window.scrollY, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function segment(x1: number, y1: number, x2: number, y2: number, alpha: number) {
    const g = ctx.createLinearGradient(
      x1 - window.scrollX,
      y1 - window.scrollY,
      x2 - window.scrollX,
      y2 - window.scrollY
    );
    g.addColorStop(0, `rgba(${SAFFRON}, 0)`);
    g.addColorStop(1, `rgba(${SAFFRON}, ${alpha})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1 - window.scrollX, y1 - window.scrollY);
    ctx.lineTo(x2 - window.scrollX, y2 - window.scrollY);
    ctx.stroke();
  }

  function draw(r: Run, t: number) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    // From the button to the top of the cable, along its wire.
    if (t < r.entryAt + 200) {
      const k = Math.min(1, t / r.entryAt);
      const head = wirePoint(r.from, r.entry, k);
      for (let i = 1; i <= 8; i++) {
        const back = wirePoint(r.from, r.entry, Math.max(0, k - i * 0.03));
        dot(back.x, back.y, 3.2 - i * 0.3, (1 - i / 9) * 0.8);
      }
      dot(head.x, head.y, 4, 1);
    }
    // Down the cable, with a fading tail.
    if (t >= r.entryAt && t <= r.end + 200) {
      const y = Math.min(
        r.entry.y + (t - r.entryAt) * SPEED,
        r.entry.y + (r.end - r.entryAt) * SPEED
      );
      segment(r.entry.x, Math.max(r.entry.y, y - 180), r.entry.x, y, 0.95);
      dot(r.entry.x, y, 4.5, 1);
    }
    // Into each branch, then a short ring at the port.
    for (const p of r.peers) {
      if (t >= p.junction && t <= p.at) {
        const k = (t - p.junction) / Math.max(1, p.at - p.junction);
        dot(r.entry.x + (p.x - r.entry.x) * k, p.y, p.hit ? 4 : 3, p.hit ? 1 : 0.55);
      }
      const age = t - p.at;
      if (age >= 0 && age < 700) {
        ctx.strokeStyle = `rgba(${p.hit ? SAFFRON : PAPER}, ${1 - age / 700})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x - window.scrollX, p.y - window.scrollY, 8 + (age / 700) * 18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  buttons.forEach((b) =>
    b.addEventListener("click", () =>
      b.getAttribute("aria-pressed") === "true" ? clearAll() : send(b)
    )
  );

  function clearAll() {
    reset();
    if (clear) clear.hidden = true;
    if (status) status.textContent = "";
  }
  clear?.addEventListener("click", clearAll);
  board.hidden = false;
  drawWires();
  void document.fonts.ready.then(drawWires);
  new ResizeObserver(drawWires).observe(document.body);
  window.addEventListener("resize", size);
}

// Demo clips: the poster shows the moment picked in scripts/media; playing starts from there.
for (const video of document.querySelectorAll<HTMLVideoElement>("video[data-start]")) {
  const figure = video.closest("figure");
  const button = figure?.querySelector<HTMLButtonElement>("[data-play]");
  if (!figure || !button) continue;
  video.controls = false;
  button.hidden = false;
  let primed = false;
  // Whether someone wants it playing right now. The first play waits for the clip's metadata, and
  // the pointer may have left by then: only start if it is still wanted.
  let wanted = false;

  const play = () => {
    wanted = true;
    if (!primed) {
      primed = true;
      video.preload = "auto";
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.currentTime = Number(video.dataset.start) || 0;
          if (wanted) void video.play();
        },
        { once: true }
      );
      video.load();
    } else {
      void video.play();
    }
  };
  const pause = () => {
    wanted = false;
    video.pause();
  };

  video.addEventListener("play", () => (button.textContent = "Pause"));
  video.addEventListener("pause", () => (button.textContent = "Play the demo"));
  button.addEventListener("click", () => (video.paused ? play() : pause()));

  // Hover plays on devices with a real pointer, unless motion is reduced.
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion.matches) {
    figure.addEventListener("mouseenter", play);
    figure.addEventListener("mouseleave", pause);
  }
}

// A module, so its types (Run, Peer) stay private to this file.
export {};
