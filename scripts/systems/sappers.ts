import type { BlockPermutation, Dimension, Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY } from "../constants";
import type { GateDef, MapDef, Vec3 } from "../maps/types";
import { Hunts } from "./hunt";
import { digPlan, FIGHT_DISTANCE, GATE_WALL_HITS, hitsToBreak, inFightRange, isUnbreakable, nearBox } from "./digLogic";
import { isReturning } from "./returnPath";
import { isFreeSpace } from "./spawnPoint";
import { inBox } from "./wallLogic";

/** Segundos sin avanzar para que un soldado decida que la pared le estorba. */
const STALL_SECONDS = 3;
/** Avanzar menos que esto cuenta como seguir en el mismo sitio (los empujones de la multitud no son avanzar). */
const STALL_DISTANCE = 1.2;
/** Golpes a paredes por segundo en todo el mapa, para acotar el coste en una batalla grande. */
const MAX_BITES_PER_TICK = 20;
/** Altura de la cabeza sobre los pies, para mirar si hay una pared entre dos unidades. */
const HEAD_HEIGHT = 1.5;
/** A esta distancia de un muro de puerta, un soldado detenido se pone a golpearlo. */
const GATE_WALL_REACH = 2.5;

const keyOf = (p: Vec3) => `${p.x},${p.y},${p.z}`;

/**
 * Soldados que derriban lo que les corta el paso cuando llevan un rato sin avanzar.
 * Las paredes y la roca solo dentro de `map.siege.zone`, siguiendo la ruta de `Hunts`, y lo que derriban vuelve
 * a su sitio al reiniciar.
 * El muro de la puerta, en cualquier mapa y muy despacio: lo rompen los magos, pero sin esto una oleada
 * sin magos vivos se quedaría empujándolo para siempre. Ese muro lo repone `raiseWalls`.
 */
export class Sappers {
  private watched = new Map<string, { at: Vec3; still: number }>();
  private readonly hits = new Map<string, number>();
  private readonly broken = new Map<string, { at: Vec3; permutation: BlockPermutation }>();
  /** `true` la primera vez que se derriba algo en la partida, para avisar una sola vez. */
  breachedSomewhere = false;
  private brokenNow = 0;
  private readonly hunts: Hunts | undefined;

  constructor(
    private readonly dimension: Dimension,
    private readonly map: MapDef
  ) {
    this.hunts = map.siege && new Hunts(dimension, map.siege, (at) => this.isProtected(at), (at) => this.strike(at));
  }

  /** Revisión periódica. Devuelve los bloques derribados en este pulso. */
  tick(): number {
    const seen = new Map<string, { at: Vec3; still: number }>();
    let budget = MAX_BITES_PER_TICK;
    this.brokenNow = 0;
    const soldiers = this.dimension.getEntities({ type: ENTITY_IDS.invaderSoldier });
    const stalled: Entity[] = [];

    for (const unit of soldiers) {
      if (!unit.isValid || isReturning(unit) || unit.isInWater) continue;
      const entry = this.track(unit);
      seen.set(unit.id, entry);
      if (entry.still < STALL_SECONDS || budget <= 0 || this.isFighting(unit)) continue;
      const gate = this.map.gates.find((g) => g.walls.some((w) => nearBox(unit.location, w, GATE_WALL_REACH)));
      if (!gate) {
        stalled.push(unit);
        continue;
      }
      const result = this.biteGateWall(unit.location, gate);
      if (result === "none") continue;
      budget--;
      if (result === "broken") this.brokenNow++;
    }
    this.watched = seen;
    this.hunts?.tick(stalled, soldiers);
    return this.brokenNow;
  }

  private track(unit: Entity): { at: Vec3; still: number } {
    const previous = this.watched.get(unit.id);
    const at = unit.location;
    if (previous && Math.hypot(at.x - previous.at.x, at.y - previous.at.y, at.z - previous.at.z) < STALL_DISTANCE) {
      return { at: previous.at, still: previous.still + 1 };
    }
    return { at, still: 0 };
  }

  /** Solo cuenta quien se puede golpear: un enemigo tras una pared o en otro piso no impide cavar. */
  private isFighting(unit: Entity): boolean {
    const near = { location: unit.location, maxDistance: FIGHT_DISTANCE };
    const foes = [...this.dimension.getEntities({ ...near, families: [FAMILY.ally] }), ...this.dimension.getPlayers(near)];
    return foes.some((foe) => inFightRange(unit.location, foe.location) && !this.wallBetween(unit.location, foe.location));
  }

  private wallBetween(from: Vec3, to: Vec3): boolean {
    const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) return false;
    const hit = this.dimension.getBlockFromRay(
      { x: from.x, y: from.y + HEAD_HEIGHT, z: from.z },
      { x: direction.x / length, y: direction.y / length, z: direction.z / length },
      { maxDistance: length, includeLiquidBlocks: false, includePassableBlocks: false }
    );
    return hit !== undefined;
  }

  private isProtected(at: Vec3): boolean {
    return this.map.gates.some((g) => g.walls.some((w) => inBox(at, w)) || (g.blockers ?? []).some((b) => inBox(at, b)));
  }

  /** Un golpe a ese bloque del rastro de una caza. */
  private strike(at: Vec3): "none" | "hit" | "broken" {
    const block = this.dimension.getBlock(at);
    if (!block || isFreeSpace(block)) return "none";
    if (isUnbreakable(block.typeId) || this.isProtected(at)) return "none";

    const key = keyOf(at);
    const hits = (this.hits.get(key) ?? 0) + 1;
    if (hits < hitsToBreak(block.typeId)) {
      this.hits.set(key, hits);
      this.dimension.playSound("mob.zombie.wood", at, { volume: 0.6 });
      return "hit";
    }
    this.hits.delete(key);
    if (!this.broken.has(key)) this.broken.set(key, { at, permutation: block.permutation });
    block.setType("minecraft:air");
    this.dimension.playSound("mob.zombie.woodbreak", at, { volume: 0.8 });
    this.breachedSomewhere = true;
    this.brokenNow++;
    return "broken";
  }

  /** Un golpe al muro de la puerta que tiene delante, si lo tiene. */
  private biteGateWall(feet: Vec3, gate: GateDef): "none" | "hit" | "broken" {
    for (const at of digPlan(feet, gate.objective, 0.5)) {
      const block = this.dimension.getBlock(at);
      if (!block || isFreeSpace(block)) continue;
      if (!gate.walls.some((w) => inBox(at, w))) return "none";

      const key = keyOf(at);
      const hits = (this.hits.get(key) ?? 0) + 1;
      if (hits < GATE_WALL_HITS) {
        this.hits.set(key, hits);
        this.dimension.playSound("mob.zombie.wood", at, { volume: 0.5 });
        return "hit";
      }
      this.hits.delete(key);
      block.setType("minecraft:air");
      this.dimension.playSound("mob.zombie.woodbreak", at, { volume: 0.8 });
      return "broken";
    }
    return "none";
  }

  /** Devuelve al mapa lo derribado. Devuelve los bloques repuestos; los de zonas sin cargar se pierden. */
  restore(): number {
    let restored = 0;
    for (const { at, permutation } of this.broken.values()) {
      try {
        const block = this.dimension.getBlock(at);
        if (!block) continue;
        block.setPermutation(permutation);
        restored++;
      } catch (e) {
        console.warn(`[bastion] No se pudo reponer un bloque en ${keyOf(at)}: ${e}`);
      }
    }
    if (this.broken.size > 0) console.log(`[bastion] Paredes repuestas: ${restored} de ${this.broken.size} bloques.`);
    this.broken.clear();
    this.hits.clear();
    this.watched.clear();
    this.breachedSomewhere = false;
    this.hunts?.clear();
    return restored;
  }
}
