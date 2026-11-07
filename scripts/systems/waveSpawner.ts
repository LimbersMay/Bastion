import { GameMode, system, type Dimension, type Entity } from "@minecraft/server";
import { FAMILY, TICKS_PER_SECOND, WIZARD_ASSAULT_EVENT } from "../constants";
import type { GateDef, MapDef, Vec3 } from "../maps/types";
import { isShooter, unitOf, UNITS, type UnitId } from "../units/catalog";
import { isApproaching, isReturning, startApproach } from "./returnPath";
import { findSafeSpawn, isEmbedded } from "./spawnPoint";
import { isBusy, STILL_SECONDS, stillFor, trackStill, type StillTrack } from "./stuckLogic";
import { planWave } from "./wavePlan";

/** Solo los magos invasores tienen modo de asalto (los refuerzos aliados también salen de aquí). */
function isInvaderCaster(typeId: string): boolean {
  const unit = unitOf(typeId);
  return unit?.side === "invader" && unit.role === "caster";
}

/** Uno de cada tantos soldados sale por un flanco. Los magos no: su trabajo es el muro de la puerta. */
const FLANK_EVERY = 3;

/** Aplica al juego los planes de `wavePlan`: programa las apariciones y lleva la cuenta. */
export class WaveSpawner {
  private readonly timeouts = new Set<number>();
  private pendingSpawns = 0;
  /** Invasores vistos dentro de un bloque en la última revisión (se rescatan si siguen ahí). */
  private suspectIds = new Set<string>();
  /** Desde cuándo está quieto cada invasor, y dónde. */
  private still = new Map<string, StillTrack>();
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
        this.spawnUnit(order.unit, point, 2, true);
      }, Math.max(1, order.delayTicks));
      this.timeouts.add(id);
    }
  }

  /**
   * Crea una unidad en un sitio libre cerca de `position` (nunca dentro de un bloque). `approach`: es un invasor
   * de oleada y, si el mapa tiene rutas de subida, empieza por la suya.
   */
  spawnUnit(unit: UnitId, position: Vec3, jitter = 2, approach = false): Entity | undefined {
    const at = findSafeSpawn(this.dimension, position, jitter);
    if (!at) {
      console.warn(`[bastion] Sin sitio libre para ${unit} cerca de ${position.x},${position.y},${position.z}; se omite.`);
      return undefined;
    }
    try {
      const entity = this.dimension.spawnEntity(UNITS[unit].entityId, at);
      if (approach && this.map.approachRoutes?.length) {
        // Un par de ticks después: al aparecer, el juego le pone su modo de marcha y pisaría la ruta.
        system.runTimeout(() => {
          if (!entity.isValid) return;
          if (!startApproach(entity, this.map) && this.assault) this.sendToAssault(entity);
        }, 2);
      } else if (this.assault) this.sendToAssault(entity);
      return entity;
    } catch (e) {
      console.warn(`[bastion] No se pudo crear ${unit} en ${at.x.toFixed(1)},${at.y},${at.z.toFixed(1)}: ${e}`);
      return undefined;
    }
  }

  /**
   * Red de seguridad para los invasores atascados, en cada revisión (una por segundo):
   * - Empotrado (parte del cuerpo dentro de un bloque macizo) en dos revisiones seguidas: a un sitio libre cerca.
   * - Encajado (quieto `STILL_SECONDS` sin pelear ni esperar ante el muro): a un sitio libre cerca. Nunca lejos:
   *   la subida no se salta. Si el mapa no encuentra el camino, la solución son sus `approachRoutes`.
   * En los mapas con asedio, los soldados quietos se abren paso cavando (`Sappers`): solo se rescata al empotrado.
   * Quien regresa del agua tampoco cuenta como encajado: de eso se ocupan las balsas y los empujones.
   */
  rescueStuck(breached: boolean): void {
    const now = system.currentTick;
    const suspects = new Set<string>();
    const tracks = new Map<string, StillTrack>();
    const enemies = [
      ...this.dimension.getEntities({ families: [FAMILY.ally] }),
      ...this.dimension.getPlayers({ excludeGameModes: [GameMode.Creative, GameMode.Spectator] }),
    ]
      .filter((e) => e.isValid)
      .map((e) => e.location);
    const gates = this.map.gates.map((g) => g.position);
    const objectives = this.map.gates.map((g) => g.objective);

    for (const entity of this.dimension.getEntities({ families: [FAMILY.invader] })) {
      if (!entity.isValid || entity.isInWater) continue;
      const at = entity.location;
      if (isEmbedded(this.dimension, at)) {
        if (!this.suspectIds.has(entity.id)) {
          suspects.add(entity.id);
          continue;
        }
        this.rescue(entity, at, 3, "empotrado");
        continue;
      }

      // Magos y arqueros: quietos disparando de lejos no están atascados.
      const caster = isShooter(unitOf(entity.typeId));
      if ((this.map.siege && !caster) || (isReturning(entity) && !isApproaching(entity, this.map))) continue;
      const track = trackStill(this.still.get(entity.id), at, now);
      tracks.set(entity.id, track);
      if (stillFor(track, now) < STILL_SECONDS * TICKS_PER_SECOND) continue;
      if (isBusy(at, { caster, breached, enemies, gates, objectives })) continue;

      if (this.rescue(entity, at, 4, "encajado")) tracks.delete(entity.id);
    }
    this.suspectIds = suspects;
    this.still = tracks;
  }

  /** Lleva a la unidad a un sitio libre cerca de `near` (o la elimina si no lo hay y está empotrada). */
  private rescue(entity: Entity, near: Vec3, radius: number, why: string): boolean {
    const from = entity.location;
    const spot = findSafeSpawn(this.dimension, near, radius);
    const where = `${from.x.toFixed(1)},${from.y.toFixed(1)},${from.z.toFixed(1)}`;
    try {
      if (spot) {
        entity.teleport(spot);
        console.log(`[bastion] ${entity.typeId} ${why} en ${where}: rescatado en ${spot.x.toFixed(1)},${spot.y},${spot.z.toFixed(1)}.`);
        return true;
      }
      if (why === "empotrado") {
        entity.remove();
        console.warn(`[bastion] Invasor empotrado en ${where} sin sitio libre cerca: eliminado.`);
        return true;
      }
    } catch (e) {
      console.warn(`[bastion] No se pudo rescatar a un invasor en ${where}: ${e}`);
    }
    return false;
  }

  /** La brecha ya ocurrió: los magos dejan de apuntar a la meta y atacan a aliados y jugadores. */
  startAssault(): void {
    this.assault = true;
    for (const entity of this.dimension.getEntities({ families: [FAMILY.invader] })) this.sendToAssault(entity);
  }

  private sendToAssault(entity: Entity): void {
    if (!entity.isValid || !isInvaderCaster(entity.typeId) || isReturning(entity)) return;
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
    this.still.clear();
    this.assault = false;
    for (const family of [FAMILY.invader, FAMILY.ally, FAMILY.objective, FAMILY.aim, FAMILY.waypoint, FAMILY.bolt]) {
      for (const entity of this.dimension.getEntities({ families: [family] })) {
        if (entity.isValid) entity.remove();
      }
    }
  }
}
