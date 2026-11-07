import { system, world, type Dimension, type Entity } from "@minecraft/server";
import {
  ALLY_FIGHT_EVENT,
  ALLY_HOLD_EVENT,
  ALLY_PATROL_EVENT,
  ALLY_RETREAT_EVENT,
  ALLY_SORTIE_EVENT,
  ENTITY_IDS,
  FAMILY,
  MAX_POSTS,
  postMarkerTag,
  postTag,
  RALLY_TAG,
  SORTIE_TAG,
} from "../constants";
import type { MapDef, Vec3 } from "../maps/types";
import { unitOf } from "../units/catalog";
import { assignPosts, choosePost } from "./postLogic";
import { isReturning } from "./returnPath";

/**
 * Órdenes del jugador a todos los aliados:
 * - `defend`: lo normal, cada uno en su puesto hasta la brecha.
 * - `retreat`: cada uno corre a un puesto de defensa del castillo (`map.defensePosts`) sin pararse a pelear y,
 *   al llegar, lo defiende; si se aleja persiguiendo a alguien, vuelve. Sin puesto libre, espera en el patio.
 * - `sortie`: salen a por el invasor vivo más cercano, esté donde esté; si no queda ninguno, esperan junto a la puerta.
 */
export type AllyOrder = "defend" | "retreat" | "sortie";

/** A esta distancia de un punto de reunión ya se ha llegado (no caben todos en el mismo bloque). */
const RALLY_REACHED = 10;
/** A esta distancia de su puesto ya ha llegado. */
const POST_REACHED = 3;
/** Quien defiende su puesto y se aleja más que esto persiguiendo a alguien, vuelve a él. */
const POST_LEASH = 16;
/** Quien no ha llegado a este tiempo se queda donde esté y pelea: nadie corre para siempre sin defenderse. */
const RETREAT_MAX_TICKS = 45 * 20;

const rallyTag = (index: number) => `${RALLY_TAG}_${index}`;
const distanceSq = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

function ensureMarker(dimension: Dimension, at: Vec3, tags: readonly string[]): void {
  if (dimension.getEntities({ families: [FAMILY.waypoint], tags: [tags[tags.length - 1]] }).length > 0) return;
  try {
    const marker = dimension.spawnEntity(ENTITY_IDS.waypoint, at);
    for (const tag of tags) marker.addTag(tag);
  } catch {
    // Zona aún sin cargar: se reintenta en el siguiente pulso.
  }
}

/**
 * Cambia un marcador por otro igual. Quien llega a su puesto pasa a defenderlo, pero el juego no le quita el
 * objetivo que tenía, el marcador, y se quedaba dándole golpes (o disparándole) en vez de vigilar. Al quitar el
 * marcador, quien lo tenía de objetivo lo pierde; quien aún va de camino toma el nuevo en su siguiente búsqueda.
 */
function renewMarker(dimension: Dimension, at: Vec3, tags: readonly string[]): void {
  try {
    for (const marker of dimension.getEntities({ families: [FAMILY.waypoint], tags: [tags[tags.length - 1]] })) marker.remove();
  } catch {
    // Ya no estaba: el pulso de los marcadores lo repone.
  }
  ensureMarker(dimension, at, tags);
}

/** Coloca los marcadores invisibles que falten: los puntos de reunión, los puestos y el punto de salida. */
export function ensureRallyPoints(dimension: Dimension, map: MapDef): void {
  if (map.sortiePoint) ensureMarker(dimension, map.sortiePoint, [SORTIE_TAG]);
  map.rallyPoints?.forEach((point, index) => ensureMarker(dimension, point, [RALLY_TAG, rallyTag(index)]));
  map.defensePosts?.slice(0, MAX_POSTS).forEach((post, index) => ensureMarker(dimension, post.at, [postMarkerTag(index)]));
}

export class AllyOrders {
  private order: AllyOrder = "defend";
  /** Quién va camino de su puesto (o del patio) y desde cuándo. */
  private readonly retreating = new Map<string, number>();
  /** Puesto de cada aliado con la orden de retirada; sin entrada, va al patio. */
  private readonly postOf = new Map<string, number>();

  constructor(
    private readonly dimension: Dimension,
    private readonly map: MapDef
  ) {}

  get current(): AllyOrder {
    return this.order;
  }

  get canRetreat(): boolean {
    return (this.map.rallyPoints?.length ?? 0) > 0 || this.posts.length > 0;
  }

  private get posts() {
    return (this.map.defensePosts ?? []).slice(0, MAX_POSTS);
  }

  /** Da la orden a todos. Quien regresa del agua la recibe al terminar el regreso. Devuelve a cuántos llegó. */
  give(order: AllyOrder, breached: boolean): number {
    this.order = order;
    this.retreating.clear();
    this.postOf.clear();
    const everyone = this.dimension.getEntities({ families: [FAMILY.ally] }).filter((a) => a.isValid);
    for (const ally of everyone) this.leavePost(ally);
    const allies = everyone.filter((a) => !isReturning(a));
    if (order === "retreat") {
      const units = allies.map((a) => ({ id: a.id, role: unitOf(a.typeId)?.role ?? "melee", at: a.location }));
      for (const [id, post] of assignPosts(units, this.posts)) if (post !== undefined) this.postOf.set(id, post);
    }
    for (const ally of allies) this.applyTo(ally, breached);
    return allies.length;
  }

  /** Busca puesto a quien llega tarde a la retirada (un refuerzo, o quien vuelve del agua). */
  private takePost(ally: Entity): void {
    if (this.postOf.has(ally.id) || this.posts.length === 0) return;
    const occupied = this.posts.map(() => 0);
    for (const [id, post] of this.postOf) {
      if (world.getEntity(id)?.isValid) occupied[post]++;
      else this.postOf.delete(id);
    }
    const post = choosePost(unitOf(ally.typeId)?.role ?? "melee", ally.location, this.posts, occupied);
    if (post !== undefined) this.postOf.set(ally.id, post);
  }

  private leavePost(ally: Entity): void {
    this.postOf.delete(ally.id);
    for (let i = 0; i < MAX_POSTS; i++) if (ally.hasTag(postTag(i))) ally.removeTag(postTag(i));
  }

  /** Pone a una unidad a cumplir la orden vigente. */
  applyTo(ally: Entity, breached: boolean): void {
    try {
      if (this.order !== "retreat") this.leavePost(ally);
      switch (this.order) {
        case "retreat": {
          this.takePost(ally);
          const post = this.postOf.get(ally.id);
          if (post !== undefined && !ally.hasTag(postTag(post))) ally.addTag(postTag(post));
          ally.triggerEvent(ALLY_RETREAT_EVENT);
          this.retreating.set(ally.id, system.currentTick);
          break;
        }
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

  /**
   * Revisión periódica: quien ya llegó a su puesto o al patio (o agotó su tiempo) pasa a defenderlo, y quien
   * defiende un puesto y se ha alejado persiguiendo a alguien vuelve a él.
   */
  tick(): void {
    if (this.order === "retreat") this.keepPosts();
    const points = this.map.rallyPoints ?? [];
    const toRenew = new Map<string, () => void>();
    for (const [id, since] of this.retreating) {
      const ally = world.getEntity(id);
      if (!ally?.isValid) {
        this.retreating.delete(id);
        continue;
      }
      if (isReturning(ally)) continue;
      const post = this.postOf.get(id);
      const arrived =
        post !== undefined
          ? distanceSq(ally.location, this.posts[post].at) <= POST_REACHED ** 2
          : points.some((p) => distanceSq(ally.location, p) <= RALLY_REACHED ** 2);
      if (!arrived && system.currentTick - since < RETREAT_MAX_TICKS) continue;
      this.retreating.delete(id);
      try {
        ally.triggerEvent(ALLY_HOLD_EVENT);
      } catch (e) {
        console.warn(`[bastion] No se pudo pasar a defensa a un aliado: ${e}`);
        continue;
      }
      // El marcador hacia el que iba (su puesto o el punto de reunión más cercano) se cambia por otro.
      if (post !== undefined) {
        const at = this.posts[post].at;
        toRenew.set(postMarkerTag(post), () => renewMarker(this.dimension, at, [postMarkerTag(post)]));
      } else if (points.length > 0) {
        let index = 0;
        points.forEach((p, i) => {
          if (distanceSq(ally.location, p) < distanceSq(ally.location, points[index])) index = i;
        });
        toRenew.set(rallyTag(index), () => renewMarker(this.dimension, points[index], [RALLY_TAG, rallyTag(index)]));
      }
    }
    // Un par de ticks después, cuando ya ha cambiado de modo: si no, volvería a fijarse en el marcador nuevo.
    if (toRenew.size > 0) system.runTimeout(() => toRenew.forEach((renew) => renew()), 2);
  }

  /** Quien defiende su puesto y se ha ido lejos tras un enemigo vuelve corriendo a él. */
  private keepPosts(): void {
    for (const [id, post] of this.postOf) {
      if (this.retreating.has(id)) continue;
      const ally = world.getEntity(id);
      if (!ally?.isValid) {
        this.postOf.delete(id);
        continue;
      }
      if (isReturning(ally) || distanceSq(ally.location, this.posts[post].at) <= POST_LEASH ** 2) continue;
      this.applyTo(ally, false);
    }
  }

  reset(): void {
    this.order = "defend";
    this.retreating.clear();
    this.postOf.clear();
  }
}
