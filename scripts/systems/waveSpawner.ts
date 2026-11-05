import { system, type Dimension, type Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY, WIZARD_ASSAULT_EVENT } from "../constants";
import type { GateDef, MapDef, Vec3 } from "../maps/types";
import { UNITS, type UnitId } from "../units/catalog";
import { isReturning } from "./returnPath";
import { findSafeSpawn, isEmbedded } from "./spawnPoint";
import { planWave } from "./wavePlan";

/** Uno de cada tantos soldados sale por un flanco. Los magos no: su trabajo es el muro de la puerta. */
const FLANK_EVERY = 3;

/** Aplica al juego los planes de `wavePlan`: programa las apariciones y lleva la cuenta. */
export class WaveSpawner {
  private readonly timeouts = new Set<number>();
  private pendingSpawns = 0;
  /** Invasores vistos dentro de un bloque en la última revisión (se rescatan si siguen ahí). */
  private suspectIds = new Set<string>();
  /** Tras la brecha, los magos que aparezcan ya no apuntan a la meta. */
  private assault = false;

  constructor(
    private readonly dimension: Dimension,
    private readonly map: MapDef
  ) {}

  /** Unidades de la oleada que todavía no han aparecido. */
  get pending(): number {
    return this.pendingSpawns;
  }

  aliveInvaders(): number {
    return this.dimension.getEntities({ families: [FAMILY.invader] }).length;
  }

  startWave(index: number): void {
    const def = this.map.waves[index];
    if (!def) return;
    const orders = planWave(def, this.map.invaderSpawns.length);
    this.pendingSpawns += orders.length;
    const flanks = this.map.flankSpawns ?? [];
    let soldiers = 0;

    for (const order of orders) {
      const toFlank = flanks.length > 0 && order.unit === "invader_soldier" && ++soldiers % FLANK_EVERY === 0;
      const point = toFlank ? flanks[(soldiers / FLANK_EVERY) % flanks.length] : this.map.invaderSpawns[order.pointIndex];
      const id = system.runTimeout(() => {
        this.timeouts.delete(id);
        this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
        this.spawnUnit(order.unit, point);
      }, Math.max(1, order.delayTicks));
      this.timeouts.add(id);
    }
  }

  /** Crea una unidad en un sitio libre cerca de `position` (nunca dentro de un bloque). */
  spawnUnit(unit: UnitId, position: Vec3, jitter = 2): Entity | undefined {
    const at = findSafeSpawn(this.dimension, position, jitter);
    if (!at) {
      console.warn(`[bastion] Sin sitio libre para ${unit} cerca de ${position.x},${position.y},${position.z}; se omite.`);
      return undefined;
    }
    try {
      const entity = this.dimension.spawnEntity(UNITS[unit].entityId, at);
      if (this.assault) this.sendToAssault(entity);
      return entity;
    } catch (e) {
      console.warn(`[bastion] No se pudo crear ${unit} en ${at.x.toFixed(1)},${at.y},${at.z.toFixed(1)}: ${e}`);
      return undefined;
    }
  }

  /**
   * Red de seguridad: un invasor atrapado dentro de un bloque impediría terminar la oleada.
   * Si en dos revisiones seguidas sigue empotrado, se le saca a un sitio libre cercano (o se elimina).
   */
  rescueStuck(): void {
    const now = new Set<string>();
    for (const entity of this.dimension.getEntities({ families: [FAMILY.invader] })) {
      if (!entity.isValid || !isEmbedded(this.dimension, entity.location)) continue;
      if (!this.suspectIds.has(entity.id)) {
        now.add(entity.id);
        continue;
      }
      const spot = findSafeSpawn(this.dimension, entity.location, 3);
      if (spot) {
        entity.teleport(spot);
        console.log(`[bastion] Invasor atrapado rescatado en ${spot.x.toFixed(1)},${spot.y},${spot.z.toFixed(1)}.`);
      } else {
        entity.remove();
        console.warn("[bastion] Invasor atrapado sin sitio libre cerca: eliminado.");
      }
    }
    this.suspectIds = now;
  }

  /** La brecha ya ocurrió: los magos dejan de apuntar a la meta y atacan a aliados y jugadores. */
  startAssault(): void {
    this.assault = true;
    for (const entity of this.dimension.getEntities({ families: [FAMILY.invader] })) this.sendToAssault(entity);
  }

  private sendToAssault(entity: Entity): void {
    if (!entity.isValid || entity.typeId !== ENTITY_IDS.invaderWizard || isReturning(entity)) return;
    try {
      entity.triggerEvent(WIZARD_ASSAULT_EVENT);
    } catch (e) {
      console.warn(`[bastion] No se pudo pasar un mago al asalto: ${e}`);
    }
  }

  /** Tropas que aparecen dentro cuando cae esa puerta. */
  spawnBreachTroops(gate: GateDef): void {
    let i = 0;
    for (const group of gate.breachTroops) {
      for (let n = 0; n < group.count; n++) {
        const point = gate.breachSpawns[i % gate.breachSpawns.length];
        this.spawnUnit(group.unit, point);
        i++;
      }
    }
  }

  /** Cancela apariciones programadas y elimina todas las unidades de ambos bandos. */
  clear(): void {
    for (const id of this.timeouts) system.clearRun(id);
    this.timeouts.clear();
    this.pendingSpawns = 0;
    this.suspectIds.clear();
    this.assault = false;
    for (const family of [FAMILY.invader, FAMILY.ally, FAMILY.objective, FAMILY.aim, FAMILY.waypoint, FAMILY.bolt]) {
      for (const entity of this.dimension.getEntities({ families: [family] })) {
        if (entity.isValid) entity.remove();
      }
    }
  }
}
