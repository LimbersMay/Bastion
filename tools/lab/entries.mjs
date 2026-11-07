// ¿Cuánto cuesta cada entrada del buscador de enemigos (`nearest_prioritized_attackable_target`)? Sin batalla:
// 400 invasores quietos, sin scripts, con un buscador de K entradas a 256 bloques que nunca encuentran a nadie.
// Lo único que cambia entre medidas es K, así que la diferencia de ticks/s es el coste de las entradas.
// Uso: node tools/lab/entries.mjs <carpeta-del-mundo> [K ...]        (por defecto 2 10 26 50)
//      CASA=1 hace que la primera prueba de cada entrada se cumpla (como un miembro de grupo con su etiqueta).
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [world, ...ks] = process.argv.slice(2);
if (!world) throw new Error("Falta la carpeta del mundo (Old Fallen Castle descomprimido)");
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const base = process.env.BDS_LOG_DIR ?? resolve(here, "../../../../BedrockServer");
const bp = `${base}/server/behavior_packs/bastion_bp`;
const out = `${here}/entries.log`;
const say = (t) => { console.log(t); appendFileSync(out, t + "\n"); };
const cmd = (l) => appendFileSync(`${base}/cmd.txt`, l + "\n");
const log = () => (existsSync(`${base}/serve.log`) ? readFileSync(`${base}/serve.log`, "latin1") : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const match = process.env.CASA === "1";
// OBJETIVO=1: además, una entrada que sí encuentra a alguien (un marcador en el centro), así todos tienen objetivo.
const goal = process.env.OBJETIVO === "1";
// ALCANCE=<n>: alcance de las entradas que no encuentran a nadie (por defecto 256). RESELECCION=0: reselect_targets false.
const reach = Number(process.env.ALCANCE ?? 256);
const reselect = process.env.RESELECCION !== "0";
const PRIORITIZED = "minecraft:behavior.nearest_prioritized_attackable_target";

function patch(k) {
  const m = JSON.parse(readFileSync(`${bp}/manifest.json`, "utf8"));
  m.modules = m.modules.filter((x) => x.type !== "script");
  m.dependencies = (m.dependencies ?? []).filter((x) => !x.module_name);
  writeFileSync(`${bp}/manifest.json`, JSON.stringify(m));
  const p = `${bp}/entities/invader_soldier.json`;
  const d = JSON.parse(readFileSync(p, "utf8"));
  const e = d["minecraft:entity"];
  e.components["minecraft:movement"] = { value: 0 };
  const march = e.component_groups["bastion:march"];
  delete march["minecraft:behavior.nearest_attackable_target"];
  const types = [];
  for (let i = 0; i < k; i++) {
    const self = match ? { test: "is_family", subject: "self", value: "bastion_invader" } : { test: "has_tag", subject: "self", value: `bench_self_${i}` };
    types.push({ filters: { all_of: [self, { test: "has_tag", subject: "other", value: `bench_other_${i}` }] }, max_dist: reach, priority: 0 });
  }
  if (goal) types.push({ filters: { test: "has_tag", subject: "other", value: "bench_goal" }, max_dist: 256, priority: 1 });
  march[PRIORITIZED] = { priority: 1, must_see: false, reselect_targets: reselect, persist_time: 0, scan_interval: 40, entity_types: types };
  writeFileSync(p, JSON.stringify(d));
}

async function tps(seconds) {
  const mark = log().length;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { cmd("time query gametime"); await sleep(5000); }
  await sleep(4000);
  const rd = [...log().slice(mark).matchAll(/ (\d+):(\d+):(\d+):(\d+) INFO\] Gametime is (\d+)/g)].map((m) => ({ t: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, g: +m[5] }));
  if (rd.length < 2) return NaN;
  return (rd[rd.length - 1].g - rd[0].g) / (rd[rd.length - 1].t - rd[0].t);
}

async function run(k) {
  execFileSync("node", [`${repo}/tools/bds.mjs`, "setup", world], { stdio: "ignore" });
  patch(k);
  writeFileSync(`${base}/cmd.txt`, "");
  writeFileSync(`${base}/serve.log`, "");
  const child = spawn("node", [`${repo}/tools/bds.mjs`, "serve"], { stdio: "ignore" });
  const exited = new Promise((r) => child.on("exit", r));
  for (let i = 0; i < 120 && !/Server started/.test(log()); i++) await sleep(1000);
  await sleep(3000);
  cmd("tickingarea add circle -40 120 -435 4 banco true");
  await sleep(4000);
  if (goal) {
    cmd("summon bastion:waypoint -41 130 -436");
    await sleep(1000);
    cmd("tag @e[type=bastion:waypoint] add bench_goal");
    await sleep(1000);
  }
  // 400 invasores en una rejilla de 20 x 20 sobre el patio de Old Fallen Castle (y 140: en el aire caen al patio o al muro).
  for (let i = 0; i < 400; i++) {
    cmd(`summon bastion:invader_soldier ${-60 + (i % 20) * 2} 135 ${-455 + Math.floor(i / 20) * 2}`);
    if ((i + 1) % 20 === 0) await sleep(300);
  }
  await sleep(15000);
  const a = await tps(40);
  say(`K=${k}${match ? " (casa la primera prueba)" : ""}${goal ? " (con objetivo)" : ""}${reach !== 256 ? ` (alcance ${reach})` : ""}${reselect ? "" : " (sin reselect)"}: ${a.toFixed(1)} ticks/s`);
  cmd("stop");
  await Promise.race([exited, sleep(60000)]);
  if (child.exitCode === null) child.kill();
  await sleep(4000);
}

if (process.env.SEGUIR !== "1") writeFileSync(out, "");
for (const k of ks.length ? ks.map(Number) : [2, 10, 26, 50]) await run(k);
say("TERMINADO");
