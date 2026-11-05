import { system, world, type Dimension, type Entity } from "@minecraft/server";
import { ALLY_FIGHT_EVENT, ALLY_HOLD_EVENT, ALLY_PATROL_EVENT, ALLY_RETREAT_EVENT, ALLY_SORTIE_EVENT, ENTITY_IDS, FAMILY, RALLY_TAG, SORTIE_TAG } from "../constants";
import type { MapDef, Vec3 } from "../maps/types";
import { isReturning } from "./returnPath";

/**
 * Órdenes del jugador a todos los aliados:
 * - `defend`: lo normal, cada uno en su puesto hasta la brecha.
 * - `retreat`: corren al punto de reunión del castillo sin pararse a pelear; al llegar, lo defienden.
 * - `sortie`: salen a buscar a los invasores que puedan alcanzar; si no hay ninguno, esperan junto a la puerta.
 */
export type AllyOrder = "defend" | "retreat" | "sortie";

/** A esta distancia de un punto de reunión ya se ha llegado (no caben todos en el mismo bloque). */
const RALLY_REACHED = 10;
/** Quien no ha llegado a este tiempo se queda donde esté y pelea: nadie corre para siempre sin defenderse. */
const RETREAT_MAX_TICKS = 45 * 20;

const rallyTag = (index: number) => `${RALLY_TAG}_${index}`;
const distanceSq = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** Coloca los marcadores invisibles que falten: los puntos de reunión y el punto de salida. */
export function ensureRallyPoints(dimension: Dimension, map: MapDef): void {
  if (map.sortiePoint && dimension.getEntities({ families: [FAMILY.waypoint], tags: [SORTIE_TAG] }).length === 0) {
    try {
      dimension.spawnEntity(ENTITY_IDS.waypoint, map.sortiePoint).addTag(SORTIE_TAG);
    } catch {
      // Zona aún sin cargar: se reintenta en el siguiente pulso.
    }
  }
  map.rallyPoints?.forEach((point, index) => {
    if (dimension.getEntities({ families: [FAMILY.waypoint], tags: [rallyTag(index)] }).length > 0) return;
    try {
      const marker = dimension.spawnEntity(ENTITY_IDS.waypoint, point);
      marker.addTag(RALLY_TAG);
      marker.addTag(rallyTag(index));
    } catch {
      // Zona aún sin cargar: se reintenta en el siguiente pulso.
    }
  });
}

export class AllyOrders {
  private order: AllyOrder = "defend";
  /** Quién va camino del punto de reunión y desde cuándo. */
  private readonly retreating = new Map<string, number>();

  constructor(
    private readonly dimension: Dimension,
    private readonly map: MapDef
  ) {}

  get current(): AllyOrder {
    return this.order;
  }

  get canRetreat(): boolean {
    return (this.map.rallyPoints?.length ?? 0) > 0;
  }

  /** Da la orden a todos. Quien regresa del agua la recibe al terminar el regreso. Devuelve a cuántos llegó. */
  give(order: AllyOrder, breached: boolean): number {
    this.order = order;
    this.retreating.clear();
    let reached = 0;
    for (const ally of this.dimension.getEntities({ families: [FAMILY.ally] })) {
      if (!ally.isValid || isReturning(ally)) continue;
      this.applyTo(ally, breached);
      reached++;
    }
    return reached;
  }

  /** Pone a una unidad a cumplir la orden vigente. */
  applyTo(ally: Entity, breached: boolean): void {
    try {
      switch (this.order) {
        case "retreat":
          ally.triggerEvent(ALLY_RETREAT_EVENT);
          this.retreating.set(ally.id, system.currentTick);
          break;
        case "sortie":
          ally.triggerEvent(ALLY_SORTIE_EVENT);
          break;
        case "defend":
          ally.triggerEvent(breached ? ALLY_FIGHT_EVENT : ALLY_PATROL_EVENT);
          break;
      }
    } catch (e) {
      console.warn(`[bastion] No se pudo dar la orden a un aliado: ${e}`);
    }
  }

  /** Los refuerzos aparecen lejos de la pelea: salvo orden de retirada, van a buscarla. */
  deploy(ally: Entity): void {
    if (this.order === "retreat") {
      this.applyTo(ally, false);
      return;
    }
    try {
      ally.triggerEvent(ALLY_SORTIE_EVENT);
    } catch (e) {
      console.warn(`[bastion] No se pudo desplegar un refuerzo: ${e}`);
    }
  }

  /** Revisión periódica: quien ya llegó al punto de reunión (o agotó su tiempo) pasa a defenderlo. */
  tick(): void {
    const points = this.map.rallyPoints ?? [];
    for (const [id, since] of this.retreating) {
      const ally = world.getEntity(id);
      if (!ally?.isValid) {
        this.retreating.delete(id);
        continue;
      }
      if (isReturning(ally)) continue;
      const arrived = points.some((p) => distanceSq(ally.location, p) <= RALLY_REACHED ** 2);
      if (!arrived && system.currentTick - since < RETREAT_MAX_TICKS) continue;
      this.retreating.delete(id);
      try {
        ally.triggerEvent(ALLY_HOLD_EVENT);
      } catch (e) {
        console.warn(`[bastion] No se pudo pasar a defensa a un aliado: ${e}`);
      }
    }
  }

  reset(): void {
    this.order = "defend";
    this.retreating.clear();
  }
}
