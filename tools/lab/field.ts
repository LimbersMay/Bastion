import { system, world, type Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY } from "../constants";
import { SQUAD_DEFAULTS, type SquadUnit } from "../systems/squadLogic";
import { Squads } from "../systems/squads";

/**
 * Laboratorio de la Fase 3: pelea en campo abierto con las unidades reales, con y sin el director de grupos.
 * Mide lo mismo que las peleas de `docs/IA.md` («Peleas»), más cuántos focos de pelea hay y lo ancho del frente.
 * `/scriptevent bastion:lab field <sin|grupos|reserva> <aliados> <invasores> [bloque]`. Activarlo: `tools/lab/README.md`.
 *
 * La plataforma es de 48x48, en el cielo sobre el valle de Stonehill (dentro de su área de carga), con una
 * barrera alrededor. Los aliados salen al oeste con la orden de ataque; los invasores al este, en marcha.
 */

const FLOOR_Y = 200;
const X0 = -286;
const X1 = -239;
const Z0 = 151;
const Z1 = 198;
const REACH = 2.4;
const NEIGHBOR = 3;
const CLUSTER_LINK = 4;
const HIT_WINDOW = 60;
const TIMEOUT = 240 * 20;

/** `reserva` = 1 grupo activo por grupo enemigo; `reserva:1.5`, 1,5. */
type Variant = string;

interface Fight {
  variant: Variant;
  block: boolean;
  started: number;
  startedMs: number;
  startAllies: number;
  startInvaders: number;
  hits: Map<string, Map<string, number>>;
  hitCount: number;
  samples: number;
  seen: number;
  engaged: number;
  attackers: number;
  crowdSeen: number;
  crowdTotal: number;
  crowd5: number;
  neighborTotal: number;
  neighborSeen: number;
  clusterTotal: number;
  clusterSamples: number;
  widthTotal: number;
  waitingTotal: number;
  tpsMin: number;
  deaths: Map<string, number>;
  directorMs: number;
  directorWorst: number;
  lastTick: number;
  lastMs: number;
}

let fight: Fight | undefined;
let squads: Squads | undefined;
const say = (t: string) => console.log(`[lab] ${t}`);
const dim = () => world.getDimension("overworld");
const inField = (e: Entity) => e.location.x >= X0 && e.location.x <= X1 + 1 && e.location.z >= Z0 && e.location.z <= Z1 + 1 && e.location.y >= FLOOR_Y - 2;
const flat = (a: Entity, b: Entity) => Math.hypot(a.location.x - b.location.x, a.location.z - b.location.z);

function units(): { allies: Entity[]; invaders: Entity[] } {
  const d = dim();
  return {
    allies: d.getEntities({ families: [FAMILY.ally] }).filter(inField),
    invaders: d.getEntities({ families: [FAMILY.invader] }).filter(inField),
  };
}

function build(): void {
  const d = dim();
  d.runCommand(`fill ${X0 - 1} ${FLOOR_Y - 1} ${Z0 - 1} ${X1 + 1} ${FLOOR_Y - 1} ${Z1 + 1} grass_block`);
  d.runCommand(`fill ${X0 - 1} ${FLOOR_Y} ${Z0 - 1} ${X1 + 1} ${FLOOR_Y + 30} ${Z1 + 1} air`);
  for (const [a, b] of [
    [`${X0 - 1} ${FLOOR_Y} ${Z0 - 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z0 - 1}`],
    [`${X0 - 1} ${FLOOR_Y} ${Z1 + 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
    [`${X0 - 1} ${FLOOR_Y} ${Z0 - 1}`, `${X0 - 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
    [`${X1 + 1} ${FLOOR_Y} ${Z0 - 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
  ]) {
    d.runCommand(`fill ${a} ${b} barrier`);
  }
}

function clean(): void {
  squads?.clear();
  squads = undefined;
  const { allies, invaders } = units();
  for (const u of [...allies, ...invaders]) u.remove();
}

/**
 * Filas de unidades a lo largo de z, desde la columna `x` hacia `dx`: en línea, 20 por fila repartidas a lo
 * ancho; en bloque, filas de 8 juntas en el centro (como quien entra por una puerta).
 */
function spawnRows(id: string, count: number, x: number, dx: number, block: boolean): Entity[] {
  const d = dim();
  const perRow = block ? 8 : 20;
  const out: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const z = block ? (Z0 + Z1) / 2 - perRow / 2 + col : Z0 + 4 + col * ((Z1 - Z0 - 8) / (perRow - 1));
    // Las filas de atrás, hacia el borde; la primera, lo bastante dentro para que quepan todas.
    const rows = Math.ceil(count / perRow);
    const first = x - dx * (rows - 1) * 1.5;
    out.push(d.spawnEntity(id, { x: Math.floor(first + row * dx * 1.5) + 0.5, y: FLOOR_Y, z: Math.floor(z) + 0.5 }));
  }
  return out;
}

function start(variant: Variant, allies: number, invaders: number, block: boolean): void {
  clean();
  build();
  const d = dim();
  const a = spawnRows(ENTITY_IDS.allySoldier, allies, X0 + 3 + (block ? 12 : 0), -1, block);
  const b = spawnRows(ENTITY_IDS.invaderSoldier, invaders, X1 - 3 - (block ? 12 : 0), 1, block);
  // Un par de ticks para que apliquen su primer modo antes de cambiarlo.
  system.runTimeout(() => {
    for (const u of a) if (u.isValid) u.triggerEvent("bastion:sortie");
    for (const u of b) if (u.isValid) u.triggerEvent("bastion:march");
  }, 5);
  if (variant !== "sin") {
    const ratio = variant.startsWith("reserva") ? Number(variant.split(":")[1] ?? 1) : Infinity;
    squads = new Squads(d, { ...SQUAD_DEFAULTS, activePerEnemySquad: ratio });
  }
  fight = {
    variant,
    block,
    started: system.currentTick,
    startedMs: Date.now(),
    startAllies: allies,
    startInvaders: invaders,
    hits: new Map(),
    hitCount: 0,
    samples: 0,
    seen: 0,
    engaged: 0,
    attackers: 0,
    crowdSeen: 0,
    crowdTotal: 0,
    crowd5: 0,
    neighborTotal: 0,
    neighborSeen: 0,
    clusterTotal: 0,
    clusterSamples: 0,
    widthTotal: 0,
    waitingTotal: 0,
    tpsMin: 20,
    deaths: new Map(),
    directorMs: 0,
    directorWorst: 0,
    lastTick: system.currentTick,
    lastMs: Date.now(),
  };
  say(`campo ${variant}: ${allies} aliados contra ${invaders} invasores${block ? ", en bloque" : ""}`);
}

world.afterEvents.entityHurt.subscribe((ev) => {
  const f = fight;
  const by = ev.damageSource.damagingEntity;
  if (!f || !by || ev.damageSource.cause !== "entityAttack") return;
  f.hitCount++;
  let recent = f.hits.get(ev.hurtEntity.id);
  if (!recent) {
    recent = new Map();
    f.hits.set(ev.hurtEntity.id, recent);
  }
  recent.set(by.id, system.currentTick);
});

world.afterEvents.entityDie.subscribe((ev) => {
  const f = fight;
  const e = ev.deadEntity;
  if (!f || !e.typeId.startsWith("bastion:")) return;
  const key = `${e.typeId.replace("bastion:", "")}<-${ev.damageSource.cause}/${ev.damageSource.damagingEntity?.typeId.replace("bastion:", "") ?? "-"}`;
  f.deaths.set(key, (f.deaths.get(key) ?? 0) + 1);
});

/** Focos de pelea: grupos de unidades que pelean, unidas si están a `CLUSTER_LINK` o menos. */
function clusters(fighting: Entity[]): number {
  const seen = new Set<number>();
  let count = 0;
  for (let i = 0; i < fighting.length; i++) {
    if (seen.has(i)) continue;
    count++;
    const stack = [i];
    seen.add(i);
    while (stack.length > 0) {
      const k = stack.pop()!;
      for (let j = 0; j < fighting.length; j++) {
        if (seen.has(j) || flat(fighting[k], fighting[j]) > CLUSTER_LINK) continue;
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return count;
}

function tick(): void {
  const f = fight;
  if (!f) return;
  const now = system.currentTick;
  const ms = Date.now();
  if (f.samples > 3) f.tpsMin = Math.min(f.tpsMin, ((now - f.lastTick) * 1000) / Math.max(ms - f.lastMs, 1));
  f.lastTick = now;
  f.lastMs = ms;
  const { allies, invaders } = units();

  if (squads) {
    const all = [...allies, ...invaders];
    const list: SquadUnit[] = all.map((e) => ({ id: e.id, side: allies.includes(e) ? "ally" : "invader", at: e.location, groupable: true }));
    const t0 = Date.now();
    squads.tick(list, new Map(all.map((e) => [e.id, e])));
    const spent = Date.now() - t0;
    f.directorMs += spent;
    f.directorWorst = Math.max(f.directorWorst, spent);
    f.waitingTotal += squads.current.filter((s) => s.state === "wait").reduce((n, s) => n + s.members.length, 0);
  }

  f.samples++;
  const fighting: Entity[] = [];
  for (const [targets, foes] of [
    [invaders, allies],
    [allies, invaders],
  ] as const) {
    for (const t of targets) {
      const near = foes.filter((u) => flat(u, t) <= REACH && Math.abs(u.location.y - t.location.y) <= 1.5).length;
      if (near > 0) {
        f.crowdSeen++;
        f.crowdTotal += near;
        if (near >= 5) f.crowd5++;
      }
      const recent = f.hits.get(t.id);
      let n = 0;
      if (recent) for (const at of recent.values()) if (now - at <= HIT_WINDOW) n++;
      f.seen++;
      if (n > 0) {
        f.engaged++;
        f.attackers += n;
        fighting.push(t);
      }
    }
  }
  for (const t of fighting) {
    f.neighborSeen++;
    f.neighborTotal += [...allies, ...invaders].filter((u) => u !== t && flat(u, t) <= NEIGHBOR).length;
  }
  if (fighting.length > 0) {
    f.clusterSamples++;
    f.clusterTotal += clusters(fighting);
    const zs = fighting.map((u) => u.location.z);
    f.widthTotal += Math.max(...zs) - Math.min(...zs);
  }

  const elapsed = now - f.started;
  if ((elapsed > 100 && (allies.length === 0 || invaders.length === 0)) || elapsed >= TIMEOUT) {
    const avg = (total: number, n: number, digits = 2) => (total / Math.max(n, 1)).toFixed(digits);
    const pct = (v: number, n: number) => `${((100 * v) / Math.max(n, 1)).toFixed(0)}%`;
    say(
      `FIN campo ${f.variant} ${f.startAllies}v${f.startInvaders}${f.block ? " bloque" : ""}: ${(elapsed / 20).toFixed(0)} s (${((Date.now() - f.startedMs) / 1000).toFixed(0)} s reales), ` +
        `quedan ${allies.length} aliados y ${invaders.length} invasores | golpeadores por objetivo ${avg(f.attackers, f.engaged)} | ` +
        `bajo ataque ${pct(f.engaged, f.seen)} | enemigos alrededor ${avg(f.crowdTotal, f.crowdSeen)}, 5 o mas ${pct(f.crowd5, f.crowdSeen)} | ` +
        `vecinos a 3 bloques de quien pelea ${avg(f.neighborTotal, f.neighborSeen)} | focos ${avg(f.clusterTotal, f.clusterSamples, 1)} | ` +
        `ancho del frente ${avg(f.widthTotal, f.clusterSamples, 1)} | en reserva ${avg(f.waitingTotal, f.samples, 1)} | golpes ${f.hitCount} | ticks/s minimo ${f.tpsMin.toFixed(1)} | director ${avg(f.directorMs, f.samples, 1)} ms (peor ${f.directorWorst}) | bajas ${[...f.deaths].map(([k, n]) => `${k} ${n}`).join(", ")}`
    );
    fight = undefined;
    clean();
  }
}

export function handleField(args: readonly string[]): void {
  if (args[0] === "clean") {
    fight = undefined;
    clean();
    return;
  }
  start(args[0] ?? "sin", Number(args[1] ?? 30), Number(args[2] ?? 50), args[3] === "bloque");
}

system.runInterval(() => {
  try {
    tick();
  } catch (e) {
    say(`error en campo: ${e instanceof Error ? e.message : String(e)}`);
    fight = undefined;
  }
}, 20);
