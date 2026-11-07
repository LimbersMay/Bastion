import { GameMode, system, world, type Dimension, type Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY, HUNT_TRAILS, huntTrailTag } from "../constants";
import type { Vec3 } from "../maps/types";
import { advanceWithLadders, firstLadder, firstOf, firstPending, markerStep, nearest } from "./huntLogic";
import { isReturning } from "./returnPath";
import type { RouteJobs } from "./routeJobs";
import { classifyBlock, type RouteStep } from "./routeLogic";

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
const REACH = 3.6;
const HEAD_HEIGHT = 1;
const BITES_PER_SECOND = 2;
/** A esta distancia de la columna de una escalera del rastro, el soldado está subiendo o bajando por ella. */
const LADDER_NEAR = 4;

type Strike = (at: Vec3) => "none" | "hit" | "broken";

interface Trail {
  readonly slot: number;
  readonly marker: Entity;
  readonly steps: readonly RouteStep[];
  /** Vacío en un rastro sin presa (`lead`): termina al llegar al final. */
  readonly preyId: string;
  readonly goal: Vec3;
  readonly members: Set<string>;
  progress: number;
  seconds: number;
  idle: number;
}

const center = (s: Vec3): Vec3 => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });

/**
 * La caza: el soldado que no puede llegar hasta un enemigo vivo se abre camino hasta él.
 * Las búsquedas van por la cola común (`routeJobs.ts`), y la caza pide una sola a la vez. Su ruta se convierte en
 * un rastro: un marcador que los soldados cercanos siguen y que no pasa de un bloque hasta que lo derriban. El
 * director de inalcanzables (`unreachable.ts`) también abre rastros, con una ruta ya calculada (`guide`).
 */
export class Hunts {
  private readonly trails = new Map<number, Trail>();
  private readonly slotOf = new Map<string, number>();
  private readonly retryAt = new Map<string, number>();
  /** La caza tiene una búsqueda en la cola. */
  private searching = false;
  /** Sube al reiniciar la partida, para descartar la búsqueda que hubiera en curso. */
  private generation = 0;

  constructor(
    private readonly dimension: Dimension,
    private readonly jobs: RouteJobs,
    private readonly strike: Strike,
    /**
     * `false` en los mapas sin zona de asedio: nadie se abre camino por su cuenta, y los rastros solo sirven al
     * director de inalcanzables (grupos guiados y bajadas), cuyas rutas ahí no rompen nada.
     */
    private readonly hunting = true
  ) {}

  /** Revisión de cada segundo. `stalled` son los soldados atascados; `soldiers`, todos. */
  tick(stalled: readonly Entity[], soldiers: readonly Entity[]): void {
    const now = system.currentTick;
    const byId = new Map(soldiers.map((s) => [s.id, s]));
    for (const trail of [...this.trails.values()]) this.updateTrail(trail, byId, now);

    let requester: Entity | undefined;
    for (const unit of stalled) {
      if (this.slotOf.has(unit.id) || now < (this.retryAt.get(unit.id) ?? 0)) continue;
      if (!this.joinNearbyTrail(unit)) requester ??= unit;
    }
    if (this.hunting && requester && !this.searching && this.freeSlot() !== undefined) this.startSearch(requester, now);
  }

  /** Quita los rastros y olvida lo aprendido (al reiniciar la partida). */
  clear(): void {
    this.generation++;
    this.searching = false;
    for (const trail of [...this.trails.values()]) this.endTrail(trail);
    this.slotOf.clear();
    this.retryAt.clear();
  }

  /**
   * Abre un rastro con una ruta ya calculada para unos soldados (un grupo del director de inalcanzables). Quien ya
   * iba por otro rastro lo deja. `false` si no queda rastro libre o no queda nadie.
   */
  guide(units: readonly Entity[], prey: Entity, steps: readonly RouteStep[]): boolean {
    const alive = units.filter((u) => u.isValid).slice(0, MEMBERS_MAX);
    if (this.freeSlot() === undefined || alive.length === 0 || steps.length < 2) return false;
    for (const unit of alive) {
      const old = this.slotOf.get(unit.id);
      const trail = old === undefined ? undefined : this.trails.get(old);
      if (trail) this.leave(trail, unit.id, unit);
    }
    const trail = this.openTrail(steps, prey.id, prey.location, alive[0]);
    if (!trail) return false;
    for (const unit of alive.slice(1)) this.join(trail, unit);
    return true;
  }

  /**
   * Lleva a un soldado por una ruta ya calculada sin presa al final: la bajada de quien quedó en otro piso
   * (`unreachable.ts`). Espera ante cada escalera como los demás rastros. `false` si no queda rastro libre.
   */
  lead(unit: Entity, steps: readonly RouteStep[]): boolean {
    if (!unit.isValid || this.freeSlot() === undefined || steps.length < 2) return false;
    const old = this.slotOf.get(unit.id);
    const trail = old === undefined ? undefined : this.trails.get(old);
    if (trail) this.leave(trail, unit.id, unit);
    return this.openTrail(steps, "", steps[steps.length - 1], unit) !== undefined;
  }

  /** ¿Va por un rastro? */
  isLed(unitId: string): boolean {
    return this.slotOf.has(unitId);
  }

  /** Paso por el que va el rastro hacia esa presa; `undefined` si no hay ninguno. */
  progressToward(preyId: string): number | undefined {
    for (const trail of this.trails.values()) if (trail.preyId === preyId) return trail.progress;
    return undefined;
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

  private startSearch(unit: Entity, now: number): void {
    const prey = nearest(unit.location, this.preys());
    if (!prey) {
      this.retryAt.set(unit.id, now + RETRY_TICKS);
      return;
    }
    const generation = this.generation;
    const goal = prey.location;
    const preyId = prey.id;
    const accepted = this.jobs.request({
      start: unit.location,
      goal,
      dig: true,
      label: "Caza",
      done: (route) => {
        if (generation !== this.generation) return;
        this.searching = false;
        if (!route || route.steps.length < 2) {
          this.retryAt.set(unit.id, system.currentTick + RETRY_TICKS);
          return;
        }
        this.openTrail(route.steps, preyId, goal, unit);
      },
    });
    if (accepted) this.searching = true;
  }

  private openTrail(steps: readonly RouteStep[], preyId: string, goal: Vec3, unit: Entity): Trail | undefined {
    const slot = this.freeSlot();
    if (slot === undefined || !unit.isValid) return undefined;
    const marker = this.dimension.spawnEntity(ENTITY_IDS.waypoint, center(steps[0]));
    marker.addTag(huntTrailTag(slot));
    const trail: Trail = { slot, marker, steps, preyId, goal, members: new Set(), progress: 0, seconds: 0, idle: 0 };
    this.trails.set(slot, trail);
    this.join(trail, unit);
    return trail;
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
    const prey = trail.preyId === "" ? undefined : world.getEntity(trail.preyId);
    const preyGone = trail.preyId !== "" && (!prey || Math.hypot(prey.location.x - trail.goal.x, prey.location.y - trail.goal.y, prey.location.z - trail.goal.z) > PREY_MOVED);
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
    trail.progress = advanceWithLadders(trail.steps, trail.progress, firstPending(trail.steps, trail.progress, isSolid), positions);
    const toBreak = firstPending(trail.steps, trail.progress, isSolid);
    const ladder = firstLadder(trail.steps, trail.progress);
    const pending = firstOf(toBreak, ladder);
    const digging = toBreak !== undefined && toBreak === pending && this.bite(trail.steps[toBreak], positions, isSolid);
    // Quien está junto a una escalera o va por ella (`ladders.ts`) no cuenta como parado.
    const climbing = ladder !== undefined && ladder === pending && this.nearLadder(trail.steps[ladder], positions);
    trail.idle = digging || climbing || trail.progress !== before ? 0 : trail.idle + 1;

    const lastIndex = trail.steps.length - 1;
    if (trail.progress >= lastIndex) {
      this.endTrail(trail);
      return;
    }
    if (trail.idle >= IDLE_SECONDS) {
      for (const s of trail.steps.slice(trail.progress + 1, trail.progress + 3)) {
        if (s.breaks.length === 0) this.jobs.avoidCell(s);
      }
      this.endTrail(trail);
      return;
    }
    const target = center(trail.steps[markerStep(trail.progress, pending, lastIndex)]);
    if (Math.hypot(marker.x - target.x, marker.y - target.y, marker.z - target.z) > 0.1) trail.marker.teleport(target);
  }

  /** Alguno está a pocos bloques de la columna de la escalera de ese paso, a cualquier altura. */
  private nearLadder(step: RouteStep, positions: readonly Vec3[]): boolean {
    const col = step.ladder?.cells[0];
    return !!col && positions.some((p) => Math.hypot(p.x - (col.x + 0.5), p.z - (col.z + 0.5)) <= LADDER_NEAR);
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
