import idle from "../../../assets/avatars/official/developer/idle.svg?url";
import thinking from "../../../assets/avatars/official/developer/thinking.svg?url";
import waiting from "../../../assets/avatars/official/developer/waiting.svg?url";
import working from "../../../assets/avatars/official/developer/working.svg?url";
import done from "../../../assets/avatars/official/developer/done.svg?url";

/**
 * The landing page's office plays one loop of the real game: take a card, work, ask, deliver.
 * Positions are percentages of the 320 × 160 scene, matching the app's spots.
 */
type Spot = { x: number; y: number };

const SEAT: Spot = { x: 19.375, y: 57.5 };
const LANE = 46.25;
const BOARD: Spot = { x: 43.75, y: 37.5 };
const DESK: Spot = { x: 68.125, y: 51.25 };
/** Scene widths per second; about the app's walking speed. */
const SPEED = 16;

const TOOLS = ["Read · todo.js", "Edit · todo.js", "Bash · npm test"];

const $ = (id: string) => document.getElementById(id);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function start() {
  const scene = $("hero-scene");
  const devEl = $("hero-dev");
  const dev = devEl instanceof HTMLImageElement ? devEl : null;
  const carry = $("hero-carry");
  const bubble = $("hero-bubble");
  const tool = $("hero-tool");
  const dialog = $("hero-dialog");
  const cmd = $("hero-cmd");
  const btn = $("hero-btn");
  const count = $("hero-count");
  if (!scene || !dev || !carry || !bubble || !tool || !dialog || !cmd || !btn || !count) return;

  let pos: Spot = { ...SEAT };
  const view = { visible: true };
  new IntersectionObserver(([entry]) => {
    view.visible = entry?.isIntersecting ?? true;
  }).observe(scene);
  const paused = () => !view.visible || document.hidden;

  /** Waits while the scene is off screen or the tab is hidden, so the loop costs nothing. */
  async function awake() {
    while (paused()) await sleep(400);
  }

  function place(p: Spot) {
    dev!.style.left = `${p.x}%`;
    dev!.style.top = `${p.y}%`;
    carry!.style.left = `${p.x + 3}%`;
    carry!.style.top = `${p.y + 3.5}%`;
    bubble!.style.left = `${p.x + 0.9}%`;
    bubble!.style.top = `${p.y - 8}%`;
    tool!.style.left = `${p.x + 2.5}%`;
    tool!.style.top = `${p.y - 7.5}%`;
  }

  async function walkTo(target: Spot) {
    dev!.src = idle;
    dev!.classList.add("walking");
    for (const p of [{ x: pos.x, y: LANE }, { x: target.x, y: LANE }, target]) {
      const dist = Math.hypot(p.x - pos.x, (p.y - pos.y) * 2);
      const ms = (dist / SPEED) * 1000;
      if (p.x !== pos.x) dev!.classList.toggle("left", p.x < pos.x);
      for (const el of [dev!, carry!]) el.style.transitionDuration = `${ms}ms`;
      place(p);
      pos = p;
      await sleep(ms);
    }
    dev!.classList.remove("walking");
  }

  async function type(text: string) {
    cmd!.textContent = "";
    for (const ch of text) {
      cmd!.textContent += ch;
      await sleep(38);
    }
  }

  async function loop() {
    let delivered = 0;
    for (;;) {
      for (let n = 1; n <= 4; n++) {
        await awake();
        const card = scene!.querySelector<HTMLElement>(`[data-card="${n}"]`);
        dev!.src = idle;
        await sleep(900);

        // Take the card from the board.
        await walkTo(BOARD);
        card?.classList.add("taken");
        carry!.style.background = card?.style.background ?? "";
        carry!.hidden = false;
        await sleep(400);
        await walkTo(SEAT);
        carry!.hidden = true;

        // Work: thinking, then real-looking tool calls.
        dev!.src = thinking;
        await sleep(900);
        dev!.src = working;
        tool!.hidden = false;
        for (const t of TOOLS) {
          tool!.textContent = t;
          await sleep(1100);
        }
        tool!.hidden = true;

        // Ask: the "!" and the dialog with the full command.
        await awake();
        dev!.src = waiting;
        bubble!.hidden = false;
        dialog!.classList.add("open");
        await type(`$ git push -u origin noburi/issue-${n}`);
        await sleep(800);
        btn!.classList.add("pressed");
        await sleep(450);
        btn!.classList.remove("pressed");
        dialog!.classList.remove("open");
        bubble!.hidden = true;

        // Deliver the pull request to your desk.
        dev!.src = working;
        tool!.textContent = "Bash · gh pr create";
        tool!.hidden = false;
        await sleep(1200);
        tool!.hidden = true;
        carry!.style.background = "#f0be79";
        carry!.hidden = false;
        await walkTo(DESK);
        carry!.hidden = true;
        delivered += 1;
        count!.textContent = String(delivered);
        count!.hidden = false;
        count!.classList.remove("pop");
        void count!.offsetWidth;
        count!.classList.add("pop");
        dev!.src = done;
        await sleep(700);
        await walkTo(SEAT);
      }
      // A new day: the board fills again.
      await sleep(1500);
      for (const c of scene!.querySelectorAll(".card")) c.classList.remove("taken");
      delivered = 0;
      count!.hidden = true;
    }
  }

  place(pos);
  void loop();
}

/** Sections slide in with a few hard steps, like a game menu. */
function reveal() {
  const targets = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("shown");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 },
  );
  for (const t of targets) io.observe(t);
}

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("still");
} else {
  document.documentElement.classList.add("animated");
  start();
  reveal();
}
