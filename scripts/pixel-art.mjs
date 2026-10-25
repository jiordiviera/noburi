// Generates the official Cozy Office pixel art as crisp SVGs from character maps.
// Run: node scripts/pixel-art.mjs   (outputs under assets/avatars/official and assets/worlds/cozy-office)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const INK = "#101820";
const FACE = "#F6F0E5";
const SPROUT = "#7DD3B0";
const SPROUT_DARK = "#3F9E7A";
const CHEEK = "#F0BE79";

/** Rows of single-char pixels → SVG with one <rect> per horizontal run. */
function svgFromMap(rows, palette) {
  const h = rows.length;
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`row ${i} is ${r.length} wide, expected ${w}: "${r}"`);
  });
  return svgFromRects(w, h, rectsFromMap(rows, palette));
}

function rectsFromMap(rows, palette, ox = 0, oy = 0) {
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (c !== ".") {
        const fill = palette[c];
        if (!fill) throw new Error(`no colour for "${c}"`);
        rects.push([ox + x, oy + y, end - x, 1, fill]);
      }
      x = end;
    }
  });
  return rects;
}

function svgFromRects(w, h, rects) {
  const body = rects.map(([x, y, rw, rh, f]) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${f}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>\n`;
}

function write(rel, content) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// ---------------------------------------------------------------- characters (16×16)
// S shell, s shell shadow, F face, C cheek, B shirt, b shirt shadow, G/g sprout, K ink.
const HEAD_TOP = [
  ".....GG..GG.....",
  "......GggG......",
  ".......gg.......",
  "...KKKKKKKKKK...",
  "..KSSSSSSSSSSK..",
  ".KSSFFFFFFFFSSK.",
];
const BODY = [
  "..KsSSSSSSSSsK..",
  "...KKBBBBBBKK...",
  "..KBBBBBBBBBBK..",
  ".KBBBBBBBBBBBBK.",
  ".KbbbbbbbbbbbbK.",
];
const BODY_TYPING = [
  "..KsSSSSSSSSsK..",
  "...KKBBBBBBKK...",
  "..KFFBBBBBBFFK..",
  ".KBBBBBBBBBBBBK.",
  ".KbbbbbbbbbbbbK.",
];

const FACES = {
  idle: [
    "KSSFFFFFFFFFFSSK",
    "KSSFFKFFFFKFFSSK",
    "KSSFFKFFFFKFFSSK",
    ".KSFCFFFFFFCFSK.",
    ".KSFFFFKKFFFFSK.",
  ],
  thinking: [
    "KSSFFFKFFFFKFSSK",
    "KSSFFFKFFFFKFSSK",
    "KSSFFFFFFFFFFSSK",
    ".KSFCFFFFFFCFSK.",
    ".KSFFFFFKFFFFSK.",
  ],
  working: [
    "KSSFFFFFFFFFFSSK",
    "KSSFFFFFFFFFFSSK",
    "KSSFFKFFFFKFFSSK",
    ".KSFCKFFFFKCFSK.",
    ".KSFFFFKKFFFFSK.",
  ],
  waiting: [
    "KSSFFKFFFFKFFSSK",
    "KSSFFKFFFFKFFSSK",
    "KSSFFFFFFFFFFSSK",
    ".KSFCFFKKFFCFSK.",
    ".KSFFFFKKFFFFSK.",
  ],
  done: [
    "KSSFFFFFFFFFFSSK",
    "KSSFFKFFFFKFFSSK",
    "KSSFKFKFFKFKFSSK",
    ".KSFCFFFFFFCFSK.",
    ".KSFFKKKKKKFFSK.",
  ],
  error: [
    "KSSFKFKFFKFKFSSK",
    "KSSFFKFFFFKFFSSK",
    "KSSFKFKFFKFKFSSK",
    ".KSFCFFFFFFCFSK.",
    ".KSFFFKKKKFFFSK.",
  ],
};

const COLORWAYS = {
  developer: { S: "#F0BE79", s: "#C9965A", B: "#3D5A73", b: "#2C4356" },
  researcher: { S: "#7DD3B0", s: "#4FA886", B: "#8A6A4A", b: "#6B4F35" },
  reviewer: { S: "#8EC5FF", s: "#5E97D6", B: "#7A5C8E", b: "#5E4570" },
};

for (const [name, cw] of Object.entries(COLORWAYS)) {
  const palette = { K: INK, F: FACE, C: CHEEK, G: SPROUT, g: SPROUT_DARK, ...cw };
  for (const [state, face] of Object.entries(FACES)) {
    const body = state === "working" ? BODY_TYPING : BODY;
    write(`assets/avatars/official/${name}/${state}.svg`, svgFromMap([...HEAD_TOP, ...face, ...body], palette));
  }
}

// ---------------------------------------------------------------- objects
const DESK_W = 36;
const desk = [];
// laptop (back side, facing the agent) on the left of the desk top
desk.push(...rectsFromMap(
  [
    ".KKKKKKKK.",
    "KTTTTTTTTK",
    "KTTTTGGTTK",
    "KTTTTTGTTK",
    "KTTTTTTTTK",
    ".KKKKKKKK.",
    "..KKKKKK..",
  ],
  { K: INK, T: "#34424E", G: SPROUT },
  1, 4,
));
// mug on the right
desk.push(...rectsFromMap(
  [".KKKK.", "KHHHHK", "KFFFFKK", "KFFFFK.K", "KFFFFKK", ".KKKK."].map((r) => r.padEnd(8, ".")),
  { K: INK, H: "#8A6A4A", F: FACE },
  27, 4,
));
desk.push([0, 10, DESK_W, 1, "#C69A6B"]); // top highlight
desk.push([0, 11, DESK_W, 3, "#A47E57"]); // top surface
desk.push([0, 14, DESK_W, 1, "#6B4F35"]); // edge shadow
desk.push([1, 15, DESK_W - 2, 11, "#8A6A4A"]); // front panel
desk.push([3, 17, 13, 7, "#7A5C3F"], [20, 17, 13, 7, "#7A5C3F"]); // drawers
desk.push([9, 20, 2, 1, "#C69A6B"], [26, 20, 2, 1, "#C69A6B"]); // handles
desk.push([2, 26, 4, 4, "#6B4F35"], [DESK_W - 6, 26, 4, 4, "#6B4F35"]); // legs
write("assets/worlds/cozy-office/objects/desk.svg", svgFromRects(DESK_W, 30, desk));

write("assets/worlds/cozy-office/objects/bubble-approval.svg", svgFromMap(
  [
    ".KKKKKKKKK.",
    "KYYYYKYYYYK",
    "KYYYYKYYYYK",
    "KYYYYKYYYYK",
    "KYYYYYYYYYK",
    "KYYYYKYYYYK",
    ".KKKKKKKKK.",
    "...KYK.....",
    "....K......",
  ],
  { K: INK, Y: "#F0BE79" },
));

write("assets/worlds/cozy-office/objects/bubble-thinking.svg", svgFromMap(
  [
    ".KKKKKKKKK.",
    "KFFFFFFFFFK",
    "KFKFFKFFKFK",
    "KFFFFFFFFFK",
    ".KKKKKKKKK.",
    "..KK.......",
    ".KK........",
  ],
  { K: INK, F: "#8EC5FF" },
));

// ---------------------------------------------------------------- background (320×192)
const W = 320;
const H = 160;
const bg = [];
const r = (x, y, w, h, f) => bg.push([x, y, w, h, f]);

// wall
r(0, 0, W, 72, "#26323D");
r(0, 0, W, 3, "#1B252E");
for (let x = 32; x < W; x += 32) r(x, 3, 1, 64, "#2C3946");
r(0, 66, W, 4, "#1B252E");
r(0, 70, W, 2, INK);

// floor planks
for (let row = 0, y = 72; y < H; row++, y += 8) {
  r(0, y, W, 8, row % 2 ? "#74563A" : "#7A5A3C");
  r(0, y + 7, W, 1, "#5E4430");
  for (let x = (row % 3) * 14; x < W; x += 42) r(x, y, 1, 7, "#5E4430");
}

// window with night sky
r(22, 12, 60, 44, "#1B252E");
for (let i = 0; i < 40; i += 4) r(24, 14 + i, 56, 4, ["#1E3550", "#22406A", "#27497A", "#2C5286", "#305A90"][Math.min(4, i / 8 | 0)]);
for (const [sx, sy] of [[30, 18], [44, 24], [36, 34], [58, 20], [72, 38], [52, 44]]) r(sx, sy, 1, 1, FACE);
r(66, 18, 5, 5, FACE);
r(67, 19, 2, 2, "#E3D9C6");
r(51, 14, 2, 40, "#1B252E");
r(24, 33, 56, 2, "#1B252E");
r(20, 56, 64, 3, "#A7B3BE");

// whiteboard / task board
r(110, 10, 76, 44, "#A7B3BE");
r(112, 12, 72, 40, FACE);
r(118, 18, 30, 1, "#34424E");
r(118, 22, 22, 1, "#34424E");
r(118, 26, 26, 1, "#34424E");
r(156, 16, 10, 10, "#F0BE79");
r(168, 16, 10, 10, SPROUT);
r(156, 30, 10, 10, "#8EC5FF");
r(118, 34, 18, 12, "#F2867A");
r(120, 36, 10, 1, "#7A3A33");
r(108, 54, 80, 2, "#6B4F35");

// clock
r(196, 14, 10, 10, INK);
r(197, 15, 8, 8, FACE);
r(200, 16, 1, 4, INK);
r(200, 19, 3, 1, INK);

// bookshelf
r(212, 6, 46, 62, "#6B4F35");
r(214, 8, 42, 58, "#4A3626");
const books = ["#F0BE79", "#7DD3B0", "#8EC5FF", "#F2867A", FACE, "#7A5C8E", "#3D5A73"];
for (const shelfY of [8, 27, 46]) {
  let x = 215;
  let i = shelfY;
  while (x < 252) {
    const bw = 3 + (i % 3);
    const bh = 12 + (i % 5);
    r(x, shelfY + 17 - bh, bw, bh, books[i % books.length]);
    x += bw + 1;
    i += 5;
  }
  r(214, shelfY + 17, 42, 2, "#6B4F35");
}

// coffee corner
r(270, 48, 34, 20, "#34424E");
r(270, 48, 34, 2, "#A7B3BE");
r(276, 32, 16, 16, "#1B252E");
r(278, 34, 12, 6, "#34424E");
r(282, 42, 4, 4, FACE);
r(288, 36, 2, 2, SPROUT);

// plants
for (const px of [6, 300]) {
  r(px, 52, 14, 14, "#C9965A");
  r(px, 52, 14, 2, "#E0B27A");
  r(px + 2, 36, 4, 16, SPROUT_DARK);
  r(px + 6, 30, 4, 22, SPROUT);
  r(px + 9, 38, 4, 14, SPROUT_DARK);
  r(px + 4, 33, 3, 3, SPROUT);
}

// rug
r(84, 132, 152, 22, "#7DD3B0");
r(86, 134, 148, 18, "#2F5C4E");
for (let x = 92; x < 230; x += 12) r(x, 141, 6, 4, "#3F7D63");

// chairs behind each desk slot
const DESK_SLOTS = [52, 142, 232].map((x) => ({ x, y: 96 }));
for (const { x, y } of DESK_SLOTS) {
  r(x + 7, y - 2, 22, 14, "#1B252E");
  r(x + 8, y - 1, 20, 12, "#34424E");
}

write("assets/worlds/cozy-office/background.svg", svgFromRects(W, H, bg));

write(
  "assets/worlds/cozy-office/map.json",
  `${JSON.stringify(
    {
      schemaVersion: "1.0",
      id: "cozy-office",
      name: "Cozy Office",
      tileSize: 16,
      width: W / 16,
      height: H / 16,
      background: "#101820",
      backgroundImage: "background.svg",
      deskSprite: "objects/desk.svg",
      // Desk slot in background pixels; the agent sits at (x + 10, y - 4), behind the desk.
      agentSlots: [
        { id: "developer", x: 52, y: 96 },
        { id: "reviewer", x: 142, y: 96 },
        { id: "researcher", x: 232, y: 96 },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log("pixel art written");
