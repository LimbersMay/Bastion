import { GameMode, system, world, type Dimension, type Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY, HUNT_TRAILS, huntTrailTag } from "../constants";
import type { SiegeDef, Vec3 } from "../maps/types";
import { advanceProgress, firstPending, markerStep, nearest } from "./huntLogic";
import { isReturning } from "./returnPath";
import { classifyBlock, routeSearch, SOLID, type RouteCell, type RouteStep } from "./routeLogic";
import { inBox } from "./wallLogic";

/** Casillas que puede explorar una búsqueda. Si no llega, el grupo avanza hasta donde pudo y se busca otra. */
const MAX_NODES = 12000;
const MEMBERS_MAX = 12;
/** A esta distancia del punto por donde va un rastro, un soldado atascado se suma a él. */
const JOIN_H = 8;
const JOIN_V = 3;
/** Quien se aleja tanto del marcador, porque está peleando o se cayó, deja el rastro. */
const STRAY = 40;
const TRAIL_MAX_SECONDS = 90;
/** Tantos segundos sin avanzar ni romper y el rastro no sirve: se anota el sitio y se busca otro. */
const IDLE_SECONDS = 12;
/** Si la presa se aleja tanto del final de la ruta, hay que buscarla de nuevo. */
const PREY_MOVED = 16;
/** Tras un intento fallido, tantos ticks hasta el siguiente de ese soldado. */
const RETRY_TICKS = 15 * 20;
/** Cada cuánto se olvidan los sitios por donde no se pudo pasar: el terreno cambia con la batalla. */
const FORGET_TICKS = 60 * 20;
const REACH = 3.6;
const HEAD_HEIGHT = 1;
const BITES_PER_SECOND = 2;

type Strike = (at: Vec3) => "none" | "hit" | "broken";

interface Trail {
  readonly slot: number;
  readonly marker: Entity;
  readonly steps: readonly RouteStep[];
  readonly preyId: string;
  readonly goal: Vec3;
  readonly members: Set<string>;
  progress: number;
  seconds: number;
  idle: number;
}

const cellKey = (x: number, y: number, z: number) => (x + 4096) * 8192 * 512 + (z + 4096) * 512 + (y + 64);
const center = (s: Vec3): Vec3 => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });

/**
 * La caza: el soldado que no puede llegar hasta un enemigo vivo se abre camino hasta él.
 * Una sola búsqueda a la vez, repartida entre ticks. Su ruta se convierte en un rastro: un marcador que los
 * soldados cercanos siguen y que no pasa de un bloque hasta que lo derriban.
 */
export class Hunts {
  private readonly trails = new Map<number, Trail>();
  private readonly slotOf = new Map<string, number>();
  private readonly retryAt = new Map<string, number>();
  private avoid = new Set<number>();
  private forgetAt = 0;
  private searching = false;
  /** Sube al reiniciar la partida, para descartar la búsqueda que hubiera en curso. */
  private generation = 0;

  constructor(
    private readonly dimension: Dimension,
    private readonly siege: SiegeDef,
    private readonly isProtected: (at: Vec3) => boolean,
    private readonly strike: Strike
  ) {}

  /** Revisión de cada segundo. `stalled` son los soldados atascados; `soldiers`, todos. */
  tick(stalled: readonly Entity[], soldiers: readonly Entity[]): void {
    const now = system.currentTick;
    if (now >= this.forgetAt) {
      this.avoid = new Set();
      this.forgetAt = now + FORGET_TICKS;
    }
    const byId = new Map(soldiers.map((s) => [s.id, s]));
    for (const trail of [...this.trails.values()]) this.updateTrail(trail, byId, now);

    let requester: Entity | undefined;
    for (const unit of stalled) {
      if (this.slotOf.has(unit.id) || now < (this.retryAt.get(unit.id) ?? 0)) continue;
      if (!this.joinNearbyTrail(unit)) requester ??= unit;
    }
    if (requester && !this.searching && this.freeSlot() !== undefined) this.startSearch(requester, now);
  }

  /** Quita los rastros y olvida lo aprendido (al reiniciar la partida). */
  clear(): void {
    this.generation++;
    this.searching = false;
    for (const trail of [...this.trails.values()]) this.endTrail(trail);
    this.slotOf.clear();
    this.retryAt.clear();
    this.avoid = new Set();
  }

  private freeSlot(): number | undefined {
    for (let slot = 0; slot < HUNT_TRAILS; slot++) if (!this.trails.has(slot)) return slot;
    return undefined;
  }

  private joinNearbyTrail(unit: Entity): boolean {
    for (const trail of this.trails.values()) {
      if (trail.members.size >= MEMBERS_MAX) continue;
      const here = trail.steps[trail.progress];
      if (Math.hypot(unit.location.x - here.x, unit.location.z - here.z) > JOIN_H || Math.abs(unit.location.y - here.y) > JOIN_V) continue;
      this.join(trail, unit);
      return true;
    }
    return false;
  }

  private join(trail: Trail, unit: Entity): void {
    unit.addTag(huntTrailTag(trail.slot));
    trail.members.add(unit.id);
    this.slotOf.set(unit.id, trail.slot);
  }

  private leave(trail: Trail, id: string, unit: Entity | undefined): void {
    trail.members.delete(id);
    this.slotOf.delete(id);
    if (unit?.isValid) unit.removeTag(huntTrailTag(trail.slot));
  }

  private preys(): Entity[] {
    const alive: Entity[] = [
      ...this.dimension.getEntities({ families: [FAMILY.ally] }),
      ...this.dimension.getPlayers({ excludeGameModes: [GameMode.Creative, GameMode.Spectator] }),
    ];
    return alive.filter((e) => e.isValid && !e.isInWater);
  }

  private cellAt(avoid: ReadonlySet<number>): (x: number, y: number, z: number) => RouteCell {
    const cache = new Map<number, RouteCell>();
    return (x, y, z) => {
      const key = cellKey(x, y, z);
      let cell = cache.get(key);
      if (cell) return cell;
      cell = avoid.has(key) ? SOLID : this.readCell({ x, y, z });
      cache.set(key, cell);
      return cell;
    };
  }

  /** Lo rompible fuera de la zona de asedio, o lo que protege una puerta, cuenta como si no se pudiera romper. */
  private readCell(at: Vec3): RouteCell {
    let cell: RouteCell;
    try {
      const block = this.dimension.getBlock(at);
      cell = block ? classifyBlock(block.typeId) : SOLID;
    } catch {
      return SOLID;
    }
    const breakable = cell.cost > 0 && cell.cost !== Infinity;
    return breakable && (!inBox(at, this.siege.zone) || this.isProtected(at)) ? SOLID : cell;
  }

  private startSearch(unit: Entity, now: number): void {
    const prey = nearest(unit.location, this.preys());
    if (!prey) {
      this.retryAt.set(unit.id, now + RETRY_TICKS);
      return;
    }
    const generation = this.generation;
    const start = unit.location;
    const goal = prey.location;
    const preyId = prey.id;
    const search = routeSearch(start, goal, this.cellAt(this.avoid), { maxNodes: MAX_NODES });
    const hunts = this;
    this.searching = true;
    const started = Date.now();
    system.runJob(
      (function* () {
        try {
          let step = search.next();
          while (!step.done) {
            yield;
            if (generation !== hunts.generation) return;
            step = search.next();
          }
          hunts.searching = false;
          const route = step.value;
          if (!route || route.steps.length < 2) {
            hunts.retryAt.set(unit.id, system.currentTick + RETRY_TICKS);
            return;
          }
          hunts.openTrail(route.steps, preyId, goal, unit);
          const breaks = route.steps.reduce((n, s) => n + s.breaks.length, 0);
          console.log(`[bastion] Caza: ruta de ${route.steps.length} pasos, rompe ${breaks}, ${route.complete ? "llega" : "parcial"}, ${route.nodes} casillas, ${Date.now() - started} ms.`);
        } catch (e) {
          if (generation === hunts.generation) hunts.searching = false;
          console.warn(`[bastion] Error buscando ruta: ${e instanceof Error ? e.message : String(e)}`);
        }
      })()
    );
  }

  private openTrail(steps: readonly RouteStep[], preyId: string, goal: Vec3, unit: Entity): void {
    const slot = this.freeSlot();
    if (slot === undefined || !unit.isValid) return;
    const marker = this.dimension.spawnEntity(ENTITY_IDS.waypoint, center(steps[0]));
    marker.addTag(huntTrailTag(slot));
    const trail: Trail = { slot, marker, steps, preyId, goal, members: new Set(), progress: 0, seconds: 0, idle: 0 };
    this.trails.set(slot, trail);
    this.join(trail, unit);
  }

  private endTrail(trail: Trail): void {
    for (const id of [...trail.members]) this.leave(trail, id, world.getEntity(id));
    if (trail.marker.isValid) trail.marker.remove();
    this.trails.delete(trail.slot);
  }

  private updateTrail(trail: Trail, soldiers: ReadonlyMap<string, Entity>, now: number): void {
    const alive: Entity[] = [];
    const marker = trail.marker.isValid ? trail.marker.location : undefined;
    for (const id of [...trail.members]) {
      const unit = soldiers.get(id);
      const lost = !unit || !marker || isReturning(unit) || unit.isInWater || Math.hypot(unit.location.x - marker.x, unit.location.z - marker.z) > STRAY;
      if (lost) this.leave(trail, id, unit);
      else alive.push(unit);
    }
    trail.seconds++;
    const prey = world.getEntity(trail.preyId);
    const preyGone = !prey || Math.hypot(prey.location.x - trail.goal.x, prey.location.y - trail.goal.y, prey.location.z - trail.goal.z) > PREY_MOVED;
    if (alive.length === 0 || !marker || preyGone || trail.seconds > TRAIL_MAX_SECONDS) {
      this.endTrail(trail);
      return;
    }

    const isSolid = (at: Vec3) => {
      const block = this.dimension.getBlock(at);
      return !!block && classifyBlock(block.typeId).cost !== 0;
    };
    const positions = alive.map((u) => u.location);
    const before = trail.progress;
    trail.progress = advanceProgress(trail.steps, trail.progress, firstPending(trail.steps, trail.progress, isSolid), positions);
    const pending = firstPending(trail.steps, trail.progress, isSolid);
    const digging = pending !== undefined && this.bite(trail.steps[pending], positions, isSolid);
    trail.idle = digging || trail.progress !== before ? 0 : trail.idle + 1;

    const lastIndex = trail.steps.length - 1;
    if (trail.progress >= lastIndex) {
      this.endTrail(trail);
      return;
    }
    if (trail.idle >= IDLE_SECONDS) {
      for (const s of trail.steps.slice(trail.progress + 1, trail.progress + 3)) {
        if (s.breaks.length === 0) this.avoid.add(cellKey(s.x, s.y, s.z));
      }
      this.endTrail(trail);
      return;
    }
    const target = center(trail.steps[markerStep(trail.progress, pending, lastIndex)]);
    if (Math.hypot(marker.x - target.x, marker.y - target.y, marker.z - target.z) > 0.1) trail.marker.teleport(target);
  }

  /** Hasta dos golpes por segundo a lo que corta el paso, si algún soldado del rastro lo tiene al alcance. */
  private bite(step: RouteStep, positions: readonly Vec3[], isSolid: (at: Vec3) => boolean): boolean {
    let bites = BITES_PER_SECOND;
    let reached = false;
    for (const at of step.breaks) {
      if (bites <= 0 || !isSolid(at)) continue;
      const inReach = positions.some((p) => Math.hypot(p.x - (at.x + 0.5), p.y + HEAD_HEIGHT - (at.y + 0.5), p.z - (at.z + 0.5)) <= REACH);
      if (!inReach) continue;
      reached = true;
      bites--;
      this.strike(at);
    }
    return reached;
  }
}
