import { system, world, type Dimension, type Entity } from "@minecraft/server";
import {
  ALLY_FIGHT_EVENT,
  ALLY_HOLD_EVENT,
  ALLY_PATROL_EVENT,
  ALLY_RETREAT_EVENT,
  ALLY_SORTIE_EVENT,
  ENTITY_IDS,
  FAMILY,
  KEEP_TAG,
  MAX_POSTS,
  postMarkerTag,
  postTag,
  RALLY_TAG,
  SORTIE_TAG,
  TO_KEEP_TAG,
} from "../constants";
import type { MapDef, Vec3 } from "../maps/types";
import { unitOf } from "../units/catalog";
import type { Layer } from "./moraleLogic";
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
/** A esta distancia de la torre ya ha llegado. */
const KEEP_REACHED = 5;
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
  if (map.keep) ensureMarker(dimension, map.keep, [KEEP_TAG]);
}

export class AllyOrders {
  private order: AllyOrder = "defend";
  /** Quién va camino de su puesto (o del patio) y desde cuándo. */
  private readonly retreating = new Map<string, number>();
  /** Puesto de cada aliado con la orden de retirada; sin entrada, va al patio. */
  private readonly postOf = new Map<string, number>();
  /** Quien se ha replegado por la moral y hasta dónde (patio o torre). La orden siguiente lo deshace. */
  private readonly fallback = new Map<string, Layer>();

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

  /**
   * Da la orden a todos menos a quien dice `exempt` (la escolta del cuerno, que va con su jugador y la retoma al
   * terminar). Quien regresa del agua la recibe al terminar el regreso. Devuelve a cuántos llegó.
   */
  give(order: AllyOrder, breached: boolean, exempt: (id: string) => boolean = () => false): number {
    this.order = order;
    this.retreating.clear();
    this.postOf.clear();
    this.fallback.clear();
    const everyone = this.dimension.getEntities({ families: [FAMILY.ally] }).filter((a) => a.isValid);
    for (const ally of everyone) this.leavePost(ally);
    const allies = everyone.filter((a) => !isReturning(a) && !exempt(a.id));
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
    if (ally.hasTag(TO_KEEP_TAG)) ally.removeTag(TO_KEEP_TAG);
  }

  /**
   * Deja de ocuparse de un aliado que pasa a la escolta del cuerno: sin puesto, ni carrera hacia él, ni repliegue.
   * Al terminar la escolta, `applyTo` le devuelve a la orden vigente.
   */
  forget(ally: Entity): void {
    this.retreating.delete(ally.id);
    this.fallback.delete(ally.id);
    this.leavePost(ally);
  }

  /** Hasta dónde se ha replegado un aliado por la moral; `field` si no se ha replegado. */
  layerOf(id: string): Layer {
    return this.fallback.get(id) ?? "field";
  }

  get hasCourtyard(): boolean {
    return (this.map.rallyPoints?.length ?? 0) > 0;
  }

  get hasKeep(): boolean {
    return this.map.keep !== undefined;
  }

  /**
   * Repliegue por la moral: el aliado corre al patio o a la torre sin pararse a pelear (como la retirada) y, al
   * llegar, lo defiende. No cambia la orden de los demás.
   */
  fallBack(ally: Entity, layer: Exclude<Layer, "field">): void {
    try {
      this.leavePost(ally);
      if (layer === "keep") ally.addTag(TO_KEEP_TAG);
      ally.triggerEvent(ALLY_RETREAT_EVENT);
      this.retreating.set(ally.id, system.currentTick);
      this.fallback.set(ally.id, layer);
    } catch (e) {
      console.warn(`[bastion] No se pudo replegar a un aliado: ${e}`);
    }
  }

  /** Quienes se replegaron por la moral vuelven a cumplir la orden vigente (en el descanso). Devuelve cuántos. */
  recall(breached: boolean): number {
    let count = 0;
    const total = this.fallback.size;
    for (const id of [...this.fallback.keys()]) {
      this.fallback.delete(id);
      this.retreating.delete(id);
      const ally = world.getEntity(id);
      if (!ally?.isValid || isReturning(ally)) continue;
      this.applyTo(ally, breached);
      count++;
    }
    if (total > 0) console.log(`[bastion] Descanso: ${count} de ${total} aliados replegados siguen vivos y vuelven a su sitio.`);
    return count;
  }

  /** Pone a una unidad a cumplir la orden vigente. */
  applyTo(ally: Entity, breached: boolean): void {
    try {
      // Quien vuelve del agua (o cumple de nuevo la orden) ya no está replegado.
      this.fallback.delete(ally.id);
      if (this.order !== "retreat") this.leavePost(ally);
      switch (this.order) {
        case "retreat":
          this.sendToPost(ally);
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

  /**
   * Corre a un puesto libre (o, sin puesto, al patio) sin pararse a pelear y, al llegar, lo defiende (`tick`).
   * Es lo que hace la retirada, y también los refuerzos y quien sale del castillo con la orden de defender.
   */
  private sendToPost(ally: Entity): void {
    this.takePost(ally);
    const post = this.postOf.get(ally.id);
    if (post !== undefined && !ally.hasTag(postTag(post))) ally.addTag(postTag(post));
    ally.triggerEvent(ALLY_RETREAT_EVENT);
    this.retreating.set(ally.id, system.currentTick);
  }

  /**
   * Los refuerzos aparecen en el patio. Con la orden de ataque van a buscar la pelea; si no, refuerzan un puesto de
   * defensa (elegido por Limbers, 2026-11-07: antes salían de uno en uno a por el invasor más cercano, aunque
   * fueran 40). Sin puestos ni patio, defienden donde aparecen.
   */
  deploy(ally: Entity): void {
    try {
      if (this.order === "sortie") ally.triggerEvent(ALLY_SORTIE_EVENT);
      else if (this.canRetreat) this.sendToPost(ally);
      else this.applyTo(ally, false);
    } catch (e) {
      console.warn(`[bastion] No se pudo desplegar un refuerzo: ${e}`);
    }
  }

  /**
   * Quien ha salido del castillo con la orden de defender o la de retirada vuelve a un puesto. Devuelve `false` si
   * ya iba de camino o no hay a dónde volver.
   */
  bringBack(ally: Entity): boolean {
    if (this.order === "sortie" || !this.canRetreat || this.retreating.has(ally.id)) return false;
    try {
      this.sendToPost(ally);
      return true;
    } catch (e) {
      console.warn(`[bastion] No se pudo hacer volver a un aliado: ${e}`);
      return false;
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
      const toKeep = this.fallback.get(id) === "keep" && this.map.keep !== undefined;
      const arrived = toKeep
        ? distanceSq(ally.location, this.map.keep!) <= KEEP_REACHED ** 2
        : post !== undefined
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
      // El marcador hacia el que iba (su puesto, la torre o el punto de reunión más cercano) se cambia por otro.
      if (toKeep) {
        const at = this.map.keep!;
        toRenew.set(KEEP_TAG, () => renewMarker(this.dimension, at, [KEEP_TAG]));
      } else if (post !== undefined) {
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
    this.fallback.clear();
  }
}
