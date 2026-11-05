import type { BlockPermutation, Dimension, Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY } from "../constants";
import type { GateDef, MapDef, Vec3 } from "../maps/types";
import { digPlan, GATE_WALL_HITS, hitsToBreak, isUnbreakable, nearBox } from "./digLogic";
import { isReturning } from "./returnPath";
import { isFreeSpace } from "./spawnPoint";
import { inBox } from "./wallLogic";

/** Segundos sin avanzar para que un soldado decida que la pared le estorba. */
const STALL_SECONDS = 3;
/** Avanzar menos que esto cuenta como seguir en el mismo sitio (los empujones de la multitud no son avanzar). */
const STALL_DISTANCE = 1.2;
/** Golpes a paredes por segundo en todo el mapa, para acotar el coste en una batalla grande. */
const MAX_BITES_PER_TICK = 20;
/** Quien tiene un enemigo a esta distancia está peleando, no atascado. */
const FIGHT_DISTANCE = 3.5;
/** A esta distancia de un muro de puerta, un soldado detenido se pone a golpearlo. */
const GATE_WALL_REACH = 2.5;

const keyOf = (p: Vec3) => `${p.x},${p.y},${p.z}`;

/**
 * Soldados que derriban lo que les corta el paso cuando llevan un rato sin avanzar hacia el castillo.
 * Las paredes y la roca solo dentro de `map.siege.zone`, y lo que derriban vuelve a su sitio al reiniciar.
 * El muro de la puerta, en cualquier mapa y muy despacio: lo rompen los magos, pero sin esto una oleada
 * sin magos vivos se quedaría empujándolo para siempre. Ese muro lo repone `raiseWalls`.
 */
export class Sappers {
  private watched = new Map<string, { at: Vec3; still: number }>();
  private readonly hits = new Map<string, number>();
  private readonly broken = new Map<string, { at: Vec3; permutation: BlockPermutation }>();
  /** `true` la primera vez que se derriba algo en la partida, para avisar una sola vez. */
  breachedSomewhere = false;

  constructor(
    private readonly dimension: Dimension,
    private readonly map: MapDef
  ) {}

  /** Revisión periódica. Devuelve los bloques derribados en este pulso. */
  tick(): number {
    const siege = this.map.siege;
    const seen = new Map<string, { at: Vec3; still: number }>();
    let budget = MAX_BITES_PER_TICK;
    let brokenNow = 0;

    for (const unit of this.dimension.getEntities({ type: ENTITY_IDS.invaderSoldier })) {
      if (!unit.isValid || isReturning(unit) || unit.isInWater) continue;
      const entry = this.track(unit);
      seen.set(unit.id, entry);
      if (entry.still < STALL_SECONDS || budget <= 0 || this.isFighting(unit)) continue;
      const gate = this.map.gates.find((g) => g.walls.some((w) => nearBox(unit.location, w, GATE_WALL_REACH)));
      const result = gate ? this.biteGateWall(unit.location, gate) : siege ? this.bite(unit.location, siege.heart, siege.zone) : "none";
      if (result === "none") continue;
      budget--;
      if (result === "broken") brokenNow++;
    }
    this.watched = seen;
    return brokenNow;
  }

  private track(unit: Entity): { at: Vec3; still: number } {
    const previous = this.watched.get(unit.id);
    const at = unit.location;
    if (previous && Math.hypot(at.x - previous.at.x, at.y - previous.at.y, at.z - previous.at.z) < STALL_DISTANCE) {
      return { at: previous.at, still: previous.still + 1 };
    }
    return { at, still: 0 };
  }

  private isFighting(unit: Entity): boolean {
    const near = { location: unit.location, maxDistance: FIGHT_DISTANCE };
    return this.dimension.getEntities({ ...near, families: [FAMILY.ally] }).length > 0 || this.dimension.getPlayers(near).length > 0;
  }

  private isProtected(at: Vec3): boolean {
    return this.map.gates.some((g) => g.walls.some((w) => inBox(at, w)) || (g.blockers ?? []).some((b) => inBox(at, b)));
  }

  /** Da un golpe al primer bloque que estorba en el siguiente paso de esa unidad. */
  private bite(feet: Vec3, heart: Vec3, zone: { from: Vec3; to: Vec3 }): "none" | "hit" | "broken" {
    for (const at of digPlan(feet, heart)) {
      if (!inBox(at, zone)) return "none";
      const block = this.dimension.getBlock(at);
      if (!block || isFreeSpace(block)) continue;
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
      return "broken";
    }
    return "none";
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
    return restored;
  }
}
