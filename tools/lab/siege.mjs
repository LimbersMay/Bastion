// Asedio sin piromanos: soldados invasores por todos los frentes contra aliados dentro del castillo.
// Mide si se abren paso: bajas, bloques derribados, y dónde acaba cada uno. Uso: node siege.mjs <etiqueta> [minutos] [sortie]
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [label = "prueba", minutesArg = "6", orderArg = ""] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const dir = process.env.BDS_LOG_DIR ?? resolve(here, "../../../../BedrockServer");
const spots = JSON.parse(readFileSync(`${here}/spots.json`, "utf8"));
const fronts = JSON.parse(readFileSync(`${here}/fronts.json`, "utf8"));
const cmd = (l) => appendFileSync(`${dir}/cmd.txt`, l + "\n");
const log = () => readFileSync(`${dir}/serve.log`, "latin1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = `${here}/siege-${label}.log`;
writeFileSync(out, "");
const say = (t) => { console.log(t); appendFileSync(out, t + "\n"); };

let cursor = 0;
async function place(type, list, count) {
  for (let i = 0; i < count; i++) {
    const [x, y, z] = list[cursor++ % list.length];
    cmd(`summon bastion:${type} ${(x + (Math.random() - 0.5) * 0.4).toFixed(2)} ${y} ${(z + (Math.random() - 0.5) * 0.4).toFixed(2)}`);
    if ((i + 1) % 10 === 0) await sleep(300);
  }
}
const countOf = (text, kind) => {
  const found = text.split("\n").filter((l) => l.includes("Found") && l.includes(kind));
  return found.length ? found[found.length - 1].split(",").length : 0;
};
async function where(selector, name) {
  const mark = log().length;
  cmd(`execute as ${selector} at @s run tp @s ~ ~ ~`);
  await sleep(2500);
  const pts = [...log().slice(mark).matchAll(/Teleported .*? to (-?[\d.]+), (-?[\d.]+), (-?[\d.]+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const zones = new Map();
  for (const [x, y, z] of pts) {
    const zone = y < 84 ? "agua" : x > 105 ? "costa este" : z > -360 && x >= 0 ? "bosque sur" : x >= 28 && z > -418 ? "puente" : x >= 28 ? "cubierta" : z < -465 ? "bosque norte" : x < -92 ? "ladera oeste" : Math.hypot(x + 49, z + 436) <= 22 ? "patio" : "castillo";
    zones.set(zone, (zones.get(zone) ?? 0) + 1);
  }
  const nearHeart = pts.filter(([x, y, z]) => Math.hypot(x + 49.5, z + 437.5) <= 5 && Math.abs(y - 124) <= 3).length;
  say(`${name}: a 5 bloques o menos de la meta del corazon ${nearHeart}`);
  say(`${name}: ${pts.length} | ${[...zones].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
}

await sleep(3000);
const mark0 = log().length;
cmd("scriptevent bastion:start");
for (let i = 0; i < 40 && !/-> wave#/.test(log().slice(mark0)); i++) await sleep(1000);
cmd("scriptevent bastion:reserve 0 0 0");
cmd("tickingarea add circle 125 100 -410 3 frente_este true");
cmd("tickingarea add circle 65 100 -335 3 frente_sur true");
cmd("tickingarea add circle -30 110 -490 3 frente_norte true");
await place("ally_soldier", spots.courtyard, 20);
await place("ally_soldier", spots.west, 5);
await place("ally_soldier", spots.north, 5);
await place("invader_soldier", fronts.bosqueNorte, 20);
await place("invader_soldier", spots.hillW, 15);
await place("invader_soldier", fronts.costaEste, 10);
await place("invader_soldier", fronts.bosqueSur, 15);
if (orderArg) cmd(`scriptevent bastion:order ${orderArg}`);
say(`Inicio ${label}: 30 aliados contra 60 soldados invasores, sin piromanos`);

const start = log().length;
const minutes = +minutesArg;
for (let i = 1; i <= minutes * 2; i++) {
  const mark = log().length;
  for (let s = 0; s < 6; s++) { cmd("kill @e[type=bastion:invader_wizard]"); cmd("time query gametime"); await sleep(5000); }
  cmd("testfor @e[family=bastion_invader]");
  await sleep(600);
  cmd("testfor @e[family=bastion_ally]");
  await sleep(1200);
  const text = log().slice(mark);
  const dug = [...text.matchAll(/Paredes: (\d+) bloques/g)].reduce((a, m) => a + +m[1], 0);
  const rd = [...text.matchAll(/ (\d+):(\d+):(\d+):(\d+) INFO\] Gametime is (\d+)/g)].map((m) => ({ t: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, g: +m[5] }));
  const tps = rd.length > 1 ? (rd[rd.length - 1].g - rd[0].g) / (rd[rd.length - 1].t - rd[0].t) : NaN;
  const stuck = [...text.matchAll(/Atascados: ([^\r\n]*)/g)].map((m) => m[1]).pop() ?? "";
  say(`Min ${(i / 2).toFixed(1)}: invasores ${countOf(text, "invader")}, aliados ${countOf(text, "ally")}, derribados ${dug}, ${tps.toFixed(1)} t/s${stuck ? " | " + stuck : ""}`);
}
const all = log().slice(start);
const kills = { ally: 0, invader: 0 };
for (const m of all.matchAll(/Bajas: ([^\r\n]*)/g)) {
  for (const [k, l] of [["ally", "aliados"], ["invader", "invasores"]]) { const n = m[1].match(new RegExp(`${l} (\\d+)`)); if (n) kills[k] += +n[1]; }
}
say(`Bajas totales: aliados ${kills.ally}, invasores ${kills.invader}`);
say(`Bloques derribados: ${[...all.matchAll(/Paredes: (\d+) bloques/g)].reduce((a, m) => a + +m[1], 0)}`);
await where("@e[family=bastion_invader]", "Invasores al final");
await where("@e[family=bastion_ally]", "Aliados al final");
say("Fin.");
