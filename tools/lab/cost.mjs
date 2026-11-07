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
const packs = process.env.PACKS ? resolve(process.env.PACKS) : repo;
const label =
  (process.env.PACKS ? `[${packs.split(/[\\/]/).pop()}] ` : "") + (process.env.FICHAS ? `[fichas ${resolve(process.env.FICHAS).split(/[\\/]/).pop()}] ` : "");
const say = (t) => { console.log(t); appendFileSync(out, t + "\n"); };
const cmd = (l) => appendFileSync(`${base}/cmd.txt`, l + "\n");
const log = () => (existsSync(`${base}/serve.log`) ? readFileSync(`${base}/serve.log`, "latin1") : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UNITS = ["ally_soldier", "ally_warrior", "ally_archer", "ally_wizard", "invader_soldier", "invader_archer", "invader_wizard"];
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
const PRIORITIZED = "minecraft:behavior.nearest_prioritized_attackable_target";
/** Quita, en el modo `group` de las unidades cuyo nombre casa con `unit`, las entradas del buscador prioritario que cumplen `drop`. */
function prune(unit, group, drop) {
  patchUnits((name, e) => {
    if (!unit.test(name)) return;
    const c = e.component_groups?.[group]?.[PRIORITIZED];
    if (!c) return;
    const types = Array.isArray(c.entity_types) ? c.entity_types : [c.entity_types];
    c.entity_types = types.filter((t) => !drop(JSON.stringify(t.filters), t));
  });
}

/**
 * Devuelve a la versión de otra copia del repo (REF=<carpeta>, por ejemplo la Fase 2 sacada con git worktree) los
 * componentes que cumplen `pick(clave)`, en las fichas medidas: para saber qué cambio de las fichas pesa.
 */
function transplant(pick) {
  const ref = process.env.REF;
  if (!ref) throw new Error("Esta variante necesita REF=<carpeta de otra copia del repo>");
  patchUnits((name, e) => {
    const p = `${resolve(ref)}/behavior_packs/bastion/entities/${name}.json`;
    if (!existsSync(p)) return;
    const old = JSON.parse(readFileSync(p, "utf8"))["minecraft:entity"];
    const swap = (now, before) => {
      for (const k of new Set([...Object.keys(now), ...Object.keys(before ?? {})])) {
        if (!pick(k)) continue;
        if (before && k in before) now[k] = before[k];
        else delete now[k];
      }
    };
    swap(e.components, old.components);
    for (const [g, c] of Object.entries(e.component_groups ?? {})) swap(c, old.component_groups?.[g]);
  });
}

const variants = {
  actual: () => {},
  // Con REF: cada bloque de cambios de las fichas, devuelto a su versión de REF.
  refBuscadores: () => transplant((k) => TARGETERS.includes(k)),
  refExigeCamino: () => transplant((k) => k === "minecraft:behavior.nearest_attackable_target"),
  refPrioritario: () => transplant((k) => k === PRIORITIZED),
  refHerido: () => transplant((k) => k === "minecraft:behavior.hurt_by_target"),
  refVidaGolpe: () => transplant((k) => k === "minecraft:health" || k === "minecraft:attack"),
  // Con `reselect_targets`, quien ya tiene objetivo revisa todas las entradas en cada tick buscando uno mejor
  // (tools/lab/entries.mjs: 400 unidades con 17 entradas, 3,5 ticks/s; sin él, 20).
  sinReselectPrioritario: () => patchUnits((_, e) => walk(e, (n) => { if (n[PRIORITIZED]) n[PRIORITIZED].reselect_targets = false; })),
  sinReselect: () => patchUnits((_, e) => walk(e, (n) => { for (const k of TARGETERS) if (n[k]) n[k].reselect_targets = false; })),
  // Sin el director de grupos ni la moral (`scriptevent bastion:squads off`, tras empezar): sin grupos no hay
  // casos de inalcanzables, así que también queda fuera ese director, con sus rutas y escaleras.
  sinGrupos: () => {},
  sinExigirCamino: () => patchUnits((_, e) => walk(e, (n) => { delete n.must_reach; })),
  escaneoRapido: () => patchUnits((_, e) => walk(e, (n) => { for (const k of TARGETERS) if (n[k]) delete n[k].scan_interval; })),
  sinAdornos: () =>
    patchUnits((_, e) =>
      walk(e, (n) => {
        delete n["minecraft:behavior.look_at_player"];
        delete n["minecraft:behavior.random_look_around"];
      })
    ),
  // Hipótesis de la v0.1.54: perseguir a un enemigo que se mueve, a 256 bloques, obliga a rehacer el camino sin parar.
  // Los aliados en salida sin la entrada «cualquier invasor a 256» (van a su grupo, a monstruos o al punto de salida).
  salidaSinLejano: () => prune(/^ally_/, "bastion:sortie", (f, t) => t.max_dist === 256 && f.includes("bastion_invader")),
  // Los aliados en salida como en la v0.1.24: solo al punto de salida (y a 24 bloques, con camino, el invasor cercano).
  // (El mago no espera en el punto de salida: a él solo se le quita el invasor a 256.)
  salidaComoV024: () => {
    prune(/^ally_(soldier|warrior)$/, "bastion:sortie", (f) => !f.includes("bastion_sortie"));
    prune(/^ally_(wizard|archer)$/, "bastion:sortie", (f, t) => t.max_dist === 256 && f.includes("bastion_invader"));
  },
  // El buscador que exige camino (`must_reach`) con una sola entrada, la de 24, como en la v0.1.24 (hoy hay otra de 8
  // para quien va en grupo). Si el motor comprueba el camino antes de mirar los filtros, dos entradas cuestan el doble.
  unaExigencia: () =>
    patchUnits((_, e) =>
      walk(e, (n) => {
        const c = n["minecraft:behavior.nearest_attackable_target"];
        if (c?.must_reach && Array.isArray(c.entity_types) && c.entity_types.length > 1) c.entity_types = c.entity_types.filter((t) => t.max_dist !== 8);
      })
    ),
  // Los invasores en marcha sin la entrada «cualquier aliado a 256» (rastro, grupo y meta siguen).
  marchaSinLejano: () => prune(/^invader_/, "bastion:march", (f, t) => t.max_dist === 256 && f.includes("bastion_ally")),
  // Las dos cosas: nadie persigue a un enemigo lejano.
  nadieLejano: () => {
    prune(/^ally_/, "bastion:sortie", (f, t) => t.max_dist === 256 && f.includes("bastion_invader"));
    prune(/^invader_/, "bastion:march", (f, t) => t.max_dist === 256 && f.includes("bastion_ally"));
  },
  // Sin las 16 entradas de marcador de grupo en ningún modo: mide lo que cuestan los filtros por sí solos.
  sinEntradasDeGrupo: () => {
    for (const g of ["bastion:sortie", "bastion:march"]) prune(/./, g, (f) => /bastion_sq_\d/.test(f));
  },
  // ¿Cuesta el número de entradas o su alcance? Las 16 de grupo, a 32 bloques en vez de 256.
  grupoCerca: () =>
    patchUnits((_, e) =>
      walk(e, (n) => {
        const c = n[PRIORITIZED];
        if (!Array.isArray(c?.entity_types)) return;
        for (const t of c.entity_types) if (/bastion_sq_\d/.test(JSON.stringify(t.filters))) t.max_dist = 32;
      })
    ),
  // Solo 4 de las 16 entradas de grupo, a 256.
  cuatroGrupos: () => {
    for (const g of ["bastion:sortie", "bastion:march"]) prune(/./, g, (f) => /bastion_sq_(\d+)"/.test(f) && +f.match(/bastion_sq_(\d+)"/)[1] >= 4);
  },
  // Sin entradas de grupo ni de rastro de la caza: el techo de lo que se puede ganar quitando entradas.
  sinGruposNiRastros: () => {
    for (const g of ["bastion:sortie", "bastion:march"]) prune(/./, g, (f) => /bastion_sq_\d|bastion_trail_\d/.test(f));
  },
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

// Con CENSO=1, cada 10 s se cuenta cuántas entidades hay de cada clase, junto a los ticks/s de ese rato
// (en tools/lab/cost-censo.log): para ver qué crece cuando el servidor se frena.
const CENSUS = [
  ["unidades", "@e[family=bastion_unit]"],
  ["regresan", "@e[family=bastion_unit,tag=bastion_returning]"],
  ["enGrupo", "@e[family=bastion_unit,tag=bastion_squad]"],
  ["reserva", "@e[family=bastion_unit,tag=bastion_squad_wait]"],
  ["aguantan", "@e[family=bastion_unit,tag=bastion_hold_line]"],
  ["balsas", "@e[family=bastion_raft]"],
  ["marcadores", "@e[family=bastion_waypoint]"],
  ["proyectiles", "@e[family=bastion_bolt]"],
  ["objetos", "@e[type=item]"],
  ["todas", "@e"],
];
const censusOut = `${here}/cost-censo.log`;

async function tps(seconds, tag = "") {
  const mark = log().length;
  const end = Date.now() + seconds * 1000;
  const census = process.env.CENSO === "1";
  const plan = [];
  for (let i = 0; Date.now() < end; i++) {
    cmd("time query gametime");
    plan.push("time");
    if (census && i % 2 === 0) for (const [name, sel] of CENSUS) { cmd(`testfor ${sel}`); plan.push(name); }
    await sleep(5000);
  }
  await sleep(4000);
  if (census) {
    const replies = [...log().slice(mark).matchAll(/Gametime is (\d+)|Found (.*)|No targets matched/g)];
    const head = /(\d+):(\d+):(\d+):(\d+) INFO\] Gametime is/;
    const lines = log().slice(mark).split("\n");
    const times = lines.filter((l) => head.test(l)).map((l) => { const m = l.match(head); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; });
    let r = 0, ti = 0, row, prev;
    const rows = [];
    for (const what of plan) {
      const m = replies[r++];
      if (!m) break;
      if (what === "time") {
        const now = { g: +m[1], t: times[ti++] };
        if (row) rows.push(row);
        row = { tps: prev ? (now.g - prev.g) / (now.t - prev.t) : NaN, at: now };
        prev = now;
      } else if (row) row[what] = m[2] ? m[2].split(",").length : 0;
    }
    if (row) rows.push(row);
    const t0 = rows[0]?.at.t ?? 0;
    for (const x of rows.filter((x) => "unidades" in x)) {
      appendFileSync(censusOut, `${tag} t=${(x.at.t - t0).toFixed(0)}s ${x.tps.toFixed(1)} t/s | ${CENSUS.map(([n]) => `${n} ${x[n] ?? "?"}`).join(", ")}\n`);
    }
  }
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
  // PACKS=<otra copia del repo> mide los packs de esa copia (por ejemplo, una versión antigua sacada con git worktree).
  // Si el servidor anterior aún no ha soltado el mundo, la copia falla: se reintenta unas veces.
  for (let tries = 1; ; tries++) {
    try {
      execFileSync("node", [`${packs}/tools/bds.mjs`, "setup", world], { stdio: "ignore", env: { ...process.env, BDS_DIR: `${base}/server` } });
      break;
    } catch (e) {
      if (tries >= 6) throw e;
      await sleep(10000);
    }
  }
  variants[name]();
  // FICHAS=<otra copia del repo> pone las fichas de las unidades de esa copia sobre los packs medidos: con PACKS, cruza
  // los scripts de una versión con las fichas de otra.
  if (process.env.FICHAS) for (const u of UNITS) { const src = `${resolve(process.env.FICHAS)}/behavior_packs/bastion/entities/${u}.json`; if (existsSync(src) && existsSync(`${bp}/entities/${u}.json`)) writeFileSync(`${bp}/entities/${u}.json`, readFileSync(src)); }
  writeFileSync(`${base}/cmd.txt`, "");
  writeFileSync(`${base}/serve.log`, "");
  const child = spawn("node", [`${repo}/tools/bds.mjs`, "serve"], { stdio: "ignore" });
  const exited = new Promise((r) => child.on("exit", r));
  for (let i = 0; i < 120 && !/Server started/.test(log()); i++) await sleep(1000);
  await sleep(3000);
  // Un mundo recién preparado empieza con el primer mapa (The Combat Castle): la batalla es en Old Fallen Castle.
  cmd("scriptevent bastion:map old-fallen-castle");
  await sleep(2000);
  cmd("scriptevent bastion:start");
  if (name === "sinGrupos") cmd("scriptevent bastion:squads off");
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
  // Con PERFIL=1, el perfilador de scripts del servidor graba el primer minuto (un .cpuprofile; la ruta sale en serve.log).
  const profile = process.env.PERFIL === "1";
  if (profile) cmd("script profiler start");
  const a = await tps(60, `${label}${name} m1`);
  if (profile) cmd("script profiler stop");
  const n1 = await count();
  const b = await tps(60, `${label}${name} m2`);
  const n2 = await count();
  say(`${label}${name}: primer minuto ${a.avg.toFixed(1)} ticks/s (minimo ${a.min.toFixed(1)}), ${n1} unidades | segundo minuto ${b.avg.toFixed(1)} ticks/s (minimo ${b.min.toFixed(1)}), ${n2} unidades`);
  cmd("stop");
  await Promise.race([exited, sleep(60000)]);
  if (child.exitCode === null) child.kill();
  await sleep(4000);
}

if (process.env.SEGUIR !== "1") writeFileSync(out, "");
for (const name of only.length ? only : Object.keys(variants)) await runVariant(name);
say("TERMINADO");
