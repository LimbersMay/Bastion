// ¿Qué pesa en una batalla grande? La misma batalla de unos 200 contra 200, con una sola cosa cambiada cada vez.
// Los cambios se aplican solo a la copia de los packs del servidor, nunca al repositorio.
// Uso: node tools/lab/cost.mjs <carpeta-del-mundo> [variante ...]   (sin variantes, las mide todas)
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [world, ...only] = process.argv.slice(2);
if (!world) throw new Error("Falta la carpeta del mundo (Old Fallen Castle descomprimido)");
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const base = process.env.BDS_LOG_DIR ?? resolve(here, "../../../../BedrockServer");
const bp = `${base}/server/behavior_packs/bastion_bp`;
const spots = JSON.parse(readFileSync(`${here}/spots.json`, "utf8"));
const fronts = JSON.parse(readFileSync(`${here}/fronts.json`, "utf8"));
const out = `${here}/cost.log`;
const say = (t) => { console.log(t); appendFileSync(out, t + "\n"); };
const cmd = (l) => appendFileSync(`${base}/cmd.txt`, l + "\n");
const log = () => (existsSync(`${base}/serve.log`) ? readFileSync(`${base}/serve.log`, "latin1") : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UNITS = ["ally_soldier", "ally_wizard", "invader_soldier", "invader_wizard"];
function walk(node, fn) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, fn));
  else if (node && typeof node === "object") {
    fn(node);
    for (const v of Object.values(node)) walk(v, fn);
  }
}
function patchUnits(fn) {
  for (const name of UNITS) {
    const p = `${bp}/entities/${name}.json`;
    const d = JSON.parse(readFileSync(p, "utf8"));
    fn(name, d["minecraft:entity"]);
    writeFileSync(p, JSON.stringify(d));
  }
}
const TARGETERS = ["minecraft:behavior.nearest_attackable_target", "minecraft:behavior.nearest_prioritized_attackable_target"];

const variants = {
  actual: () => {},
  sinExigirCamino: () => patchUnits((_, e) => walk(e, (n) => { delete n.must_reach; })),
  escaneoRapido: () => patchUnits((_, e) => walk(e, (n) => { for (const k of TARGETERS) if (n[k]) delete n[k].scan_interval; })),
  sinAdornos: () =>
    patchUnits((_, e) =>
      walk(e, (n) => {
        delete n["minecraft:behavior.look_at_player"];
        delete n["minecraft:behavior.random_look_around"];
      })
    ),
  sinScripts: () => {
    const p = `${bp}/manifest.json`;
    const m = JSON.parse(readFileSync(p, "utf8"));
    m.modules = m.modules.filter((x) => x.type !== "script");
    m.dependencies = (m.dependencies ?? []).filter((x) => !x.module_name);
    writeFileSync(p, JSON.stringify(m));
  },
};

const BRIDGE = [];
for (const [x, y, z] of [[49, 108, -368], [51, 107, -362], [54, 107, -356]]) {
  for (const dx of [-2, -1, 0, 1, 2]) for (const dz of [-2, 0, 2]) BRIDGE.push([x + dx, y, z + dz]);
}
let cursor = 0;
async function place(type, list, count, event = "") {
  for (let i = 0; i < count; i++) {
    const [x, y, z] = list[cursor++ % list.length];
    const a = (x + (Math.random() - 0.5) * 0.4).toFixed(2);
    const c = (z + (Math.random() - 0.5) * 0.4).toFixed(2);
    cmd(event ? `summon bastion:${type} ${a} ${y} ${c} 0 0 ${event}` : `summon bastion:${type} ${a} ${y} ${c}`);
    if ((i + 1) % 10 === 0) await sleep(300);
  }
}

async function tps(seconds) {
  const mark = log().length;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { cmd("time query gametime"); await sleep(5000); }
  await sleep(4000);
  const rd = [...log().slice(mark).matchAll(/ (\d+):(\d+):(\d+):(\d+) INFO\] Gametime is (\d+)/g)].map((m) => ({ t: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, g: +m[5] }));
  if (rd.length < 2) return { avg: NaN, min: NaN };
  const rates = rd.slice(1).map((r, i) => (r.g - rd[i].g) / (r.t - rd[i].t)).filter(Number.isFinite);
  return { avg: (rd[rd.length - 1].g - rd[0].g) / (rd[rd.length - 1].t - rd[0].t), min: Math.min(...rates) };
}

async function count() {
  const mark = log().length;
  cmd("testfor @e[family=bastion_unit]");
  for (let i = 0; i < 30 && !/Found|No targets/.test(log().slice(mark)); i++) await sleep(1000);
  const line = log().slice(mark).split("\n").find((l) => l.includes("Found")) ?? "";
  return line ? line.split("Found")[1].split(",").length : 0;
}

async function runVariant(name) {
  execFileSync("node", [`${repo}/tools/bds.mjs`, "setup", world], { stdio: "ignore" });
  variants[name]();
  writeFileSync(`${base}/cmd.txt`, "");
  writeFileSync(`${base}/serve.log`, "");
  const child = spawn("node", [`${repo}/tools/bds.mjs`, "serve"], { stdio: "ignore" });
  const exited = new Promise((r) => child.on("exit", r));
  for (let i = 0; i < 120 && !/Server started/.test(log()); i++) await sleep(1000);
  await sleep(3000);
  cmd("scriptevent bastion:start");
  await sleep(20000);
  cmd("scriptevent bastion:reserve 0 0 0");
  cmd("tickingarea add circle -49 120 -440 4 coste_castillo true");
  cmd("tickingarea add circle 125 100 -410 3 coste_este true");
  cmd("tickingarea add circle 65 100 -335 3 coste_sur true");
  cmd("tickingarea add circle -30 110 -490 3 coste_norte true");
  await sleep(4000);
  cursor = 0;
  await place("ally_soldier", spots.courtyard, 90);
  await place("ally_soldier", spots.deck, 35);
  await place("ally_soldier", spots.west, 25);
  await place("ally_soldier", spots.north, 26);
  await place("ally_wizard", spots.high, 20);
  await place("invader_soldier", fronts.bosqueNorte, 50);
  await place("invader_soldier", spots.hillW, 26);
  await place("invader_soldier", fronts.costaEste, 30);
  await place("invader_soldier", fronts.bosqueSur, 40);
  await place("invader_soldier", BRIDGE, 20);
  await place("invader_wizard", fronts.bosqueNorte, 6, "bastion:assault");
  await place("invader_wizard", spots.hillW, 3, "bastion:assault");
  await place("invader_wizard", fronts.costaEste, 3, "bastion:assault");
  await place("invader_wizard", fronts.bosqueSur, 3);
  await place("invader_wizard", BRIDGE, 3);
  if (name !== "sinScripts") cmd("scriptevent bastion:order sortie");
  await sleep(20000);
  const a = await tps(60);
  const n1 = await count();
  const b = await tps(60);
  const n2 = await count();
  say(`${name}: primer minuto ${a.avg.toFixed(1)} ticks/s (minimo ${a.min.toFixed(1)}), ${n1} unidades | segundo minuto ${b.avg.toFixed(1)} ticks/s (minimo ${b.min.toFixed(1)}), ${n2} unidades`);
  cmd("stop");
  await Promise.race([exited, sleep(60000)]);
  if (child.exitCode === null) child.kill();
  await sleep(4000);
}

writeFileSync(out, "");
for (const name of only.length ? only : Object.keys(variants)) await runVariant(name);
say("TERMINADO");
