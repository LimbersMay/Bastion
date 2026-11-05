import { system, world, type Dimension, type Entity } from "@minecraft/server";
import { ENTITY_IDS } from "../constants";
import { hitsToBreak } from "../systems/digLogic";
import { classifyBlock, planRoute, routeSearch, SOLID, type RouteCell, type RouteStep } from "../systems/routeLogic";

/**
 * Laboratorio de la investigación de IA: mide en el juego lo que no se puede saber leyendo documentación.
 * Solo responde a `/scriptevent bastion:lab ...`; no se usa en la partida. Se retira al acabar la investigación.
 */

type V3 = { x: number; y: number; z: number };
const ZONE = { x0: -125, x1: 28, y0: 90, y1: 145, z0: -510, z1: -395 };
const inZone = (p: V3) => p.x >= ZONE.x0 && p.x <= ZONE.x1 && p.y >= ZONE.y0 && p.y <= ZONE.y1 && p.z >= ZONE.z0 && p.z <= ZONE.z1;
const say = (t: string) => console.log(`[lab] ${t}`);
const dim = (): Dimension => world.getDimension("overworld");

const cellKey = (x: number, y: number, z: number) => (x + 4096) * 8192 * 512 + (z + 4096) * 512 + (y + 64);

function cells(dimension: Dimension, avoid?: ReadonlySet<number>) {
  const cache = new Map<number, RouteCell>();
  let reads = 0;
  const at = (x: number, y: number, z: number): RouteCell => {
    const key = cellKey(x, y, z);
    let cell = cache.get(key);
    if (cell) return cell;
    reads++;
    if (avoid?.has(key)) {
      cache.set(key, SOLID);
      return SOLID;
    }
    try {
      const block = dimension.getBlock({ x, y, z });
      cell = block ? classifyBlock(block.typeId) : SOLID;
    } catch {
      cell = SOLID;
    }
    if (cell.cost > 0 && cell.cost !== Infinity && !inZone({ x, y, z })) cell = SOLID;
    cache.set(key, cell);
    return cell;
  };
  return { at, reads: () => reads };
}

/** Cuánto cuesta de verdad leer bloques y calcular rutas dentro del juego. */
function bench(): void {
  const d = dim();
  const started = Date.now();
  let count = 0;
  for (let round = 0; round < 5; round++) {
    for (let x = -60; x < -40; x++) {
      for (let z = -445; z < -425; z++) {
        for (let y = 115; y < 135; y++) {
          const block = d.getBlock({ x, y, z });
          if (block?.typeId) count++;
        }
      }
    }
  }
  const ms = Date.now() - started;
  say(`bench lecturas: ${count} en ${ms} ms = ${((ms * 1000) / Math.max(count, 1)).toFixed(1)} us por bloque`);

  const HEART = { x: -49.5, y: 124, z: -437.5 };
  const cases: [string, V3, V3][] = [
    ["bosque_norte->corazon", { x: -42.5, y: 115, z: -475.5 }, HEART],
    ["ladera_oeste->corazon", { x: -92.5, y: 118.5, z: -449.5 }, HEART],
    ["patio->bosque_norte", { x: -50.5, y: 124, z: -435.5 }, { x: -42.5, y: 115, z: -475.5 }],
    ["patio->cubierta", { x: -50.5, y: 124, z: -435.5 }, { x: 37.5, y: 114, z: -422.5 }],
    ["techo->patio", { x: -47.5, y: 143, z: -424.5 }, HEART],
  ];
  for (const [name, from, to] of cases) {
    const c = cells(d);
    const t = Date.now();
    const route = planRoute(from, to, c.at, { maxNodes: 6000 });
    say(`bench ruta ${name}: ${Date.now() - t} ms, ${c.reads()} lecturas, ${route?.nodes ?? 0} casillas, ${route?.complete ? "llega" : "no llega"}, rompe ${route?.steps.flatMap((s) => s.breaks).length ?? 0}`);
  }
}

/** La misma ruta, repartida entre ticks con runJob: cuánto tarda y cuánto ocupa el peor tick. */
function benchJob(): void {
  const d = dim();
  const c = cells(d);
  const search = routeSearch({ x: -92.5, y: 118.5, z: -449.5 }, { x: -49.5, y: 124, z: -437.5 }, c.at, { maxNodes: 6000 });
  const firstTick = system.currentTick;
  const perTick = new Map<number, number>();
  system.runJob(
    (function* () {
      for (;;) {
        const t = Date.now();
        const step = search.next();
        const tick = system.currentTick;
        perTick.set(tick, (perTick.get(tick) ?? 0) + Date.now() - t);
        if (step.done) {
          const worst = Math.max(...perTick.values());
          const total = [...perTick.values()].reduce((a, b) => a + b, 0);
          say(`bench trozos: ${system.currentTick - firstTick} ticks, ${total} ms en total, peor tick ${worst} ms, ${step.value?.complete ? "llega" : "no llega"}`);
          return;
        }
        yield;
      }
    })()
  );
}

type Variant = "direct" | "hops" | "leader";
interface Run {
  variant: Variant;
  units: Entity[];
  steps: readonly RouteStep[];
  goal: V3;
  marker: Entity;
  markIndex: number;
  progress: number;
  started: number;
  hits: Map<string, number>;
  broken: number;
  lastLog: number;
  nextUnit: number;
  count: number;
  from: V3;
  /** Sitios por los que el grupo no consiguió pasar: la ruta nueva los evita. */
  avoid: Set<number>;
  lastAdvance: number;
  replans: number;
}

const HOP = 8;
const ARRIVED_H = 6;
const ARRIVED_V = 3;
const TIMEOUT_TICKS = 180 * 20;
const STALL_TICKS = 12 * 20;
const MAX_REPLANS = 6;
let run: Run | undefined;

const dist2 = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
let arriveH = ARRIVED_H;
const hasArrived = (u: Entity, goal: V3) => dist2(u.location, goal) <= arriveH && Math.abs(u.location.y - goal.y) <= ARRIVED_V;
const center = (s: V3): V3 => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });

function start(variant: Variant, count: number, from: V3, goal: V3): void {
  const d = dim();
  clean();
  const c = cells(d);
  const t = Date.now();
  const route = planRoute(from, goal, c.at, { maxNodes: 12000 });
  const planMs = Date.now() - t;
  if (!route) {
    say("sin ruta");
    return;
  }
  const marker = d.spawnEntity(ENTITY_IDS.waypoint, variant === "direct" ? goal : center(route.steps[0]));
  marker.addTag("lab_mark");
  run = {
    variant,
    units: [],
    steps: route.steps,
    goal,
    marker,
    markIndex: 0,
    progress: 0,
    started: system.currentTick,
    hits: new Map(),
    broken: 0,
    lastLog: system.currentTick,
    nextUnit: 0,
    count,
    from,
    avoid: new Set(),
    lastAdvance: system.currentTick,
    replans: 0,
  };
  say(`inicio ${variant} ${count} unidades, ruta ${route.steps.length} pasos, rompe ${route.steps.flatMap((s) => s.breaks).length}, ${route.complete ? "completa" : "parcial"}, calculada en ${planMs} ms`);
}

function spawnSome(r: Run): void {
  const d = dim();
  for (let i = 0; i < 4 && r.nextUnit < r.count; i++) {
    const n = r.nextUnit++;
    const a = (n / 7) * Math.PI * 2;
    const radius = 0.5 + n * 0.06;
    const at = { x: r.from.x + Math.cos(a) * radius, y: r.from.y, z: r.from.z + Math.sin(a) * radius };
    const leader = r.variant === "leader" && n === 0;
    const u = d.spawnEntity(r.variant === "leader" && !leader ? "bastion:lab_follower" : "bastion:lab_walker", at);
    if (leader) u.addTag("lab_leader");
    r.units.push(u);
  }
}

function isStillThere(d: Dimension, at: V3): boolean {
  const block = d.getBlock(at);
  return !!block && classifyBlock(block.typeId).cost !== 0;
}

/** Primer paso, desde el avance actual, que aún tiene bloques por quitar. */
function firstPending(r: Run): number | undefined {
  const d = dim();
  const last = Math.min(r.steps.length - 1, r.progress + HOP + 1);
  for (let i = r.progress; i <= last; i++) {
    if (r.steps[i].breaks.some((b) => isStillThere(d, b))) return i;
  }
  return undefined;
}

/** Da hasta dos golpes a lo que corta el paso en ese escalón. Devuelve si alguien lo tenía al alcance. */
function bite(r: Run, index: number, alive: Entity[]): boolean {
  const d = dim();
  let bites = 2;
  let reached = false;
  for (const b of r.steps[index].breaks.filter((at) => isStillThere(d, at))) {
    const near = alive.some((u) => Math.hypot(u.location.x - (b.x + 0.5), u.location.y + 1 - (b.y + 0.5), u.location.z - (b.z + 0.5)) <= 3.6);
    if (!near) continue;
    reached = true;
    if (bites <= 0) break;
    bites--;
    const block = d.getBlock(b);
    if (!block) continue;
    const key = `${b.x},${b.y},${b.z}`;
    const hits = (r.hits.get(key) ?? 0) + 1;
    if (hits < hitsToBreak(block.typeId)) {
      r.hits.set(key, hits);
      continue;
    }
    block.setType("minecraft:air");
    r.broken++;
  }
  return reached;
}

/** El grupo no avanza: recuerda que por ahí no se pasa y calcula otra ruta desde quien va delante. */
function replan(r: Run, alive: Entity[]): void {
  r.replans++;
  for (let i = r.progress + 1; i <= Math.min(r.steps.length - 1, r.progress + 2); i++) {
    const s = r.steps[i];
    if (s.breaks.length === 0) r.avoid.add(cellKey(s.x, s.y, s.z));
  }
  const here = center(r.steps[r.progress]);
  const leader = alive.reduce<Entity | undefined>((best, u) => (!best || dist2(u.location, here) < dist2(best.location, here) ? u : best), undefined);
  const from = leader?.location ?? r.from;
  const c = cells(dim(), r.avoid);
  const t = Date.now();
  const route = planRoute(from, r.goal, c.at, { maxNodes: 12000 });
  say(`replan ${r.replans}: atasco en paso ${r.progress} (${r.steps[r.progress].x},${r.steps[r.progress].y},${r.steps[r.progress].z}); nueva ruta ${route?.steps.length ?? 0} pasos, rompe ${route?.steps.flatMap((s) => s.breaks).length ?? 0}, ${Date.now() - t} ms`);
  r.lastAdvance = system.currentTick;
  if (!route) return;
  r.steps = route.steps;
  r.progress = 0;
  r.markIndex = 0;
}

function tick(): void {
  const r = run;
  if (!r) return;
  if (r.nextUnit < r.count) spawnSome(r);
  const alive = r.units.filter((u) => u.isValid);
  if (r.variant !== "direct") {
    // Nadie avanza más allá de un escalón con bloques aún sin quitar.
    let pending = firstPending(r);
    const top = Math.min(r.steps.length - 1, pending === undefined ? r.progress + HOP + 4 : pending - 1);
    for (let i = top; i > r.progress; i--) {
      const s = center(r.steps[i]);
      if (alive.some((u) => dist2(u.location, s) <= 2 && Math.abs(u.location.y - s.y) <= 1.2)) {
        r.progress = i;
        r.lastAdvance = system.currentTick;
        break;
      }
    }
    pending = firstPending(r);
    const digging = pending !== undefined && bite(r, pending, alive);
    if (digging) r.lastAdvance = system.currentTick;
    r.markIndex = pending === undefined ? Math.min(r.steps.length - 1, r.progress + HOP) : Math.max(r.progress, pending - 1);
    if (system.currentTick - r.lastAdvance >= STALL_TICKS && r.replans < MAX_REPLANS && r.progress < r.steps.length - 1) replan(r, alive);
    if (r.marker.isValid) {
      const s = center(r.steps[r.markIndex]);
      if (dist2(r.marker.location, s) > 0.1 || Math.abs(r.marker.location.y - s.y) > 0.1) r.marker.teleport(s);
    }
  }
  const arrived = alive.filter((u) => hasArrived(u, r.goal)).length;
  const elapsed = system.currentTick - r.started;
  if (system.currentTick - r.lastLog >= 200) {
    r.lastLog = system.currentTick;
    const dists = alive.map((u) => dist2(u.location, r.goal)).sort((a, b) => a - b);
    say(`t=${(elapsed / 20).toFixed(0)}s llegaron ${arrived}/${r.count} | progreso ${r.progress}/${r.steps.length - 1} | distancia mediana ${(dists[dists.length >> 1] ?? 0).toFixed(0)}, peor ${(dists[dists.length - 1] ?? 0).toFixed(0)} | rotos ${r.broken}`);
  }
  if ((r.nextUnit >= r.count && arrived >= Math.ceil(r.count * 0.9)) || elapsed >= TIMEOUT_TICKS) {
    const late = alive.filter((u) => !hasArrived(u, r.goal)).map((u) => `${u.location.x.toFixed(0)},${u.location.y.toFixed(0)},${u.location.z.toFixed(0)}`);
    say(`FIN ${r.variant}: llegaron ${arrived}/${r.count} en ${(elapsed / 20).toFixed(0)} s, rotos ${r.broken}, recalculos ${r.replans}${late.length ? `, sin llegar en ${late.join(" ")}` : ""}`);
    clean();
  }
}

function clean(): void {
  const d = dim();
  for (const e of d.getEntities({ families: ["bastion_lab"] })) e.remove();
  for (const e of d.getEntities({ tags: ["lab_mark"] })) e.remove();
  run = undefined;
}

type FightMode = "vanilla" | "cap" | "pair";
interface Fight {
  mode: FightMode;
  started: number;
  samples: number;
  engagedTargets: number;
  attackersTotal: number;
  piled3: number;
  piled5: number;
  fightersSeen: number;
  fightersEngaged: number;
  /** Por cada objetivo, quién le pegó y cuándo. */
  hits: Map<string, Map<string, number>>;
  hitCount: number;
  crowdSeen: number;
  crowdTotal: number;
  crowd3: number;
  crowd5: number;
  slots: Map<number, Set<string>>;
  slotOf: Map<string, number>;
  startA: number;
  startB: number;
}
const REACH = 2.4;
const FIGHT_TIMEOUT = 150 * 20;
const HIT_WINDOW = 60;
const PAIR_SLOTS = 30;
let fight: Fight | undefined;

world.afterEvents.entityHurt.subscribe(
  (ev) => {
    const attacker = ev.damageSource.damagingEntity;
    if (!fight || !attacker) return;
    fight.hitCount++;
    let recent = fight.hits.get(ev.hurtEntity.id);
    if (!recent) {
      recent = new Map();
      fight.hits.set(ev.hurtEntity.id, recent);
    }
    recent.set(attacker.id, system.currentTick);
  },
  { entityTypes: ["bastion:lab_a", "bastion:lab_b"] }
);

function startFight(mode: FightMode): void {
  const d = dim();
  fight = {
    mode,
    started: system.currentTick,
    samples: 0,
    engagedTargets: 0,
    attackersTotal: 0,
    piled3: 0,
    piled5: 0,
    fightersSeen: 0,
    fightersEngaged: 0,
    hits: new Map(),
    hitCount: 0,
    crowdSeen: 0,
    crowdTotal: 0,
    crowd3: 0,
    crowd5: 0,
    slots: new Map(),
    slotOf: new Map(),
    startA: d.getEntities({ families: ["lab_a"] }).length,
    startB: d.getEntities({ families: ["lab_b"] }).length,
  };
  for (const u of d.getEntities({ families: ["bastion_lab"] })) u.triggerEvent(`lab:${mode}`);
  say(`pelea ${mode}: ${fight.startA} contra ${fight.startB}`);
}

const within = (a: Entity, b: Entity) => {
  const p = a.location;
  const q = b.location;
  return Math.hypot(p.x - q.x, p.z - q.z) <= REACH && Math.abs(p.y - q.y) <= 1.5;
};

/** Empareja a quien esté libre con el enemigo libre más cercano; si no queda ninguno, con quien solo tenga uno encima. */
function assignPairs(f: Fight, as: Entity[], bs: Entity[]): void {
  const alive = new Set([...as, ...bs].map((u) => u.id));
  for (const [slot, members] of f.slots) {
    for (const id of members) {
      if (alive.has(id)) continue;
      members.delete(id);
      f.slotOf.delete(id);
    }
    const remaining = [...members];
    const unitsA = as.filter((u) => members.has(u.id)).length;
    const unitsB = bs.filter((u) => members.has(u.id)).length;
    if (unitsA > 0 && unitsB > 0) continue;
    for (const id of remaining) {
      const u = world.getEntity(id);
      u?.removeTag(`lab_pair_${slot}`);
      f.slotOf.delete(id);
    }
    f.slots.delete(slot);
  }
  const join = (u: Entity, slot: number) => {
    u.addTag(`lab_pair_${slot}`);
    f.slotOf.set(u.id, slot);
    if (!f.slots.has(slot)) f.slots.set(slot, new Set());
    f.slots.get(slot)?.add(u.id);
  };
  const free = (list: Entity[]) => list.filter((u) => !f.slotOf.has(u.id));
  const distance = (a: Entity, b: Entity) => Math.hypot(a.location.x - b.location.x, a.location.y - b.location.y, a.location.z - b.location.z);
  for (const a of free(as)) {
    const candidates = free(bs).sort((x, y) => distance(a, x) - distance(a, y));
    const b = candidates[0];
    if (!b) break;
    let slot = 0;
    while (slot < PAIR_SLOTS && f.slots.has(slot)) slot++;
    if (slot >= PAIR_SLOTS) break;
    join(a, slot);
    join(b, slot);
  }
  // Los que sobran se suman a una pareja que aún sea 1 contra 1: 1 contra 2, nunca más.
  for (const [mine, theirs] of [[as, bs], [bs, as]] as const) {
    for (const u of free(mine)) {
      let best: number | undefined;
      let bestD = Infinity;
      for (const [slot, members] of f.slots) {
        const own = mine.filter((m) => members.has(m.id));
        const foe = theirs.find((m) => members.has(m.id));
        if (own.length !== 1 || !foe) continue;
        const dd = distance(u, foe);
        if (dd < bestD) {
          best = slot;
          bestD = dd;
        }
      }
      if (best !== undefined) join(u, best);
    }
  }
}

function fightTick(): void {
  const f = fight;
  if (!f) return;
  const d = dim();
  const as = d.getEntities({ families: ["lab_a"] });
  const bs = d.getEntities({ families: ["lab_b"] });
  if (f.mode === "pair") assignPairs(f, as, bs);
  f.samples++;
  const now = system.currentTick;
  for (const [targets, attackers] of [[bs, as], [as, bs]] as const) {
    for (const t of targets) {
      const near = attackers.filter((u) => within(u, t)).length;
      if (near > 0) {
        f.crowdSeen++;
        f.crowdTotal += near;
        if (near >= 3) f.crowd3++;
        if (near >= 5) f.crowd5++;
      }
      // Golpes reales en los últimos 3 segundos: un atacante pega cada 1,75 s.
      const recent = f.hits.get(t.id);
      let n = 0;
      if (recent) for (const at of recent.values()) if (now - at <= HIT_WINDOW) n++;
      f.fightersSeen++;
      if (n > 0) {
        f.fightersEngaged++;
        f.engagedTargets++;
        f.attackersTotal += n;
      }
      if (n >= 3) f.piled3++;
      if (n >= 5) f.piled5++;
      if (f.mode === "cap") {
        if (near >= 2) t.addTag("lab_full");
        else t.removeTag("lab_full");
      }
    }
  }
  const elapsed = system.currentTick - f.started;
  if (as.length === 0 || bs.length === 0 || elapsed >= FIGHT_TIMEOUT) {
    const pct = (v: number) => ((100 * v) / Math.max(f.engagedTargets, 1)).toFixed(0);
    say(`FIN pelea ${f.mode}: ${(elapsed / 20).toFixed(0)} s, quedan ${as.length} contra ${bs.length} | golpeadores por objetivo: media ${(f.attackersTotal / Math.max(f.engagedTargets, 1)).toFixed(2)} | con 3 o mas: ${pct(f.piled3)}% | con 5 o mas: ${pct(f.piled5)}% | bajo ataque: ${((100 * f.fightersEngaged) / Math.max(f.fightersSeen, 1)).toFixed(0)}% | golpes ${f.hitCount} | apinados alrededor: media ${(f.crowdTotal / Math.max(f.crowdSeen, 1)).toFixed(2)}, 3 o mas ${((100 * f.crowd3) / Math.max(f.crowdSeen, 1)).toFixed(0)}%, 5 o mas ${((100 * f.crowd5) / Math.max(f.crowdSeen, 1)).toFixed(0)}%`);
    fight = undefined;
    clean();
  }
}

export function handleLab(message: string): void {
  const [cmd, ...args] = message.trim().split(/\s+/);
  if (cmd === "bench") bench();
  else if (cmd === "benchjob") benchJob();
  else if (cmd === "clean") clean();
  else if (cmd === "walk") {
    const n = args.slice(2).map(Number);
    arriveH = n[6] ?? ARRIVED_H;
    start(args[0] as Variant, Number(args[1]), { x: n[0], y: n[1], z: n[2] }, { x: n[3], y: n[4], z: n[5] });
  } else if (cmd === "fight") {
    startFight(args[0] as FightMode);
  }
}

system.runInterval(() => {
  try {
    tick();
  } catch (e) {
    say(`error: ${e instanceof Error ? e.message : String(e)}`);
    run = undefined;
  }
  try {
    fightTick();
  } catch (e) {
    say(`error en pelea: ${e instanceof Error ? e.message : String(e)}`);
    fight = undefined;
  }
}, 20);
