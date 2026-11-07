import type { Dimension, Entity } from "@minecraft/server";
import {
  ENTITY_IDS,
  FAMILY,
  RETURN_EVENT,
  returnRouteTag,
  returnStageTag,
  returnWaypointTag,
  SOLDIER_MARCH_EVENT,
  WIZARD_ASSAULT_EVENT,
  WIZARD_SIEGE_EVENT,
} from "../constants";
import type { MapDef, Vec3 } from "../maps/types";
import { unitOf } from "../units/catalog";
import { isRafting, launchRaft, sweepRafts } from "./rafts";
import { nearestRoute, nudgeToward, Stillness, STRANDED_SECONDS, WaterProgress } from "./returnLogic";

/**
 * Regreso a pie: quien cae al agua no vuelve solo, porque su enemigo queda justo encima y se queda mirando
 * hacia arriba. Elige la ruta de `map.returnRoutes` cuya orilla tiene más cerca y apunta a sus hitos, uno
 * detrás de otro; por el camino pelea con los enemigos que tenga cerca (`bastion:returning` en los JSON).
 * En el agua sube a una balsa que le lleva a esa orilla (`rafts.ts`); si no hay balsa para él, nada, y si
 * nadando no se acerca a la orilla, recibe un empujón hacia ella. Nunca se teletransporta.
 *
 * Varados: quien se queda quieto en una repisa junto al agua, sin enemigos cerca, no tiene salida a pie
 * (en tierra evita el agua). Pasa también a regresar, que le deja nadar, y si sigue sin moverse recibe un
 * empujón hacia el agua; allí le recoge una balsa.
 *
 * Subida: las rutas de `map.approachRoutes` usan los mismos hitos y etiquetas, detrás de las de regreso (la
 * ruta de subida 0 es la `returnRoutes.length`). Cada invasor de las oleadas empieza en la más cercana.
 */

const RETURNING_TAG = "bastion_returning";

/** A esta distancia de un hito, y fuera del agua, se pasa al siguiente. */
const WAYPOINT_REACHED = 8;

export function isReturning(entity: Entity): boolean {
  return entity.hasTag(RETURNING_TAG);
}

const distanceSq = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** Las rutas de regreso y, detrás, las de subida: el índice de cada una es el de sus etiquetas. */
function allRoutes(map: MapDef): readonly (readonly Vec3[])[] {
  return [...(map.returnRoutes ?? []), ...(map.approachRoutes ?? [])];
}

/** Coloca los hitos de las rutas que falten. */
export function ensureWaypoints(dimension: Dimension, map: MapDef): void {
  allRoutes(map).forEach((route, r) =>
    route.forEach((point, stage) => {
      const tag = returnWaypointTag(r, stage);
      if (dimension.getEntities({ families: [FAMILY.waypoint], tags: [tag] }).length > 0) return;
      try {
        dimension.spawnEntity(ENTITY_IDS.waypoint, point).addTag(tag);
      } catch (e) {
        console.warn(`[bastion] No se pudo colocar el hito ${r}.${stage}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );
}

const water = new WaterProgress();
let nudges = 0;
let launched = 0;
let stranded = 0;
const stillness = new Stillness();
const landProgress = new WaterProgress();
/** Varados camino del agua: hacia qué bloque de agua se les empuja. */
const toWater = new Map<string, Vec3>();

/** Sin enemigos a esta distancia: quien está quieto con un enemigo cerca está peleando, no varado. */
const STRANDED_FOE_DISTANCE = 10;
/** Hasta cuántos bloques por debajo de los pies se busca agua. */
const WATER_DEPTH = 16;
/** Columnas que se miran alrededor: el centro y ocho direcciones a 2 y a 4 bloques. */
const AROUND: readonly (readonly [number, number])[] = [
  [0, 0],
  ...[2, 4].flatMap((d) => [
    [d, 0],
    [-d, 0],
    [0, d],
    [0, -d],
    [d, d],
    [d, -d],
    [-d, d],
    [-d, -d],
  ] as [number, number][]),
];

const isWater = (typeId: string) => typeId === "minecraft:water" || typeId === "minecraft:flowing_water";

/** El agua más cercana junto a `at` o debajo de una caída (solo aire entre medias), si la hay. */
function waterBeside(dimension: Dimension, at: Vec3): Vec3 | undefined {
  const x0 = Math.floor(at.x);
  const y0 = Math.floor(at.y);
  const z0 = Math.floor(at.z);
  for (const [dx, dz] of AROUND) {
    for (let dy = 0; dy >= -WATER_DEPTH; dy--) {
      const block = dimension.getBlock({ x: x0 + dx, y: y0 + dy, z: z0 + dz });
      if (!block) break;
      if (isWater(block.typeId)) return { x: x0 + dx + 0.5, y: y0 + dy, z: z0 + dz + 0.5 };
      if (!block.isAir) break;
    }
  }
  return undefined;
}

function hasFoeNear(dimension: Dimension, entity: Entity): boolean {
  const near = { location: entity.location, maxDistance: STRANDED_FOE_DISTANCE };
  if (entity.matches({ families: [FAMILY.ally] })) return dimension.getEntities({ ...near, families: [FAMILY.invader] }).length > 0;
  return dimension.getEntities({ ...near, families: [FAMILY.ally] }).length > 0 || dimension.getPlayers(near).length > 0;
}

/** `true` si la unidad lleva rato quieta junto al agua sin nadie con quien pelear; si es así, le pone en marcha. */
function rescueStranded(dimension: Dimension, entity: Entity, routes: readonly (readonly Vec3[])[]): boolean {
  if (stillness.update(entity.id, entity.location) < STRANDED_SECONDS || isRafting(entity)) return false;
  // Se mira una vez cada STRANDED_SECONDS por unidad quieta: los que esperan en su puesto no cuestan cada segundo.
  stillness.forget(entity.id);
  const water = waterBeside(dimension, entity.location);
  if (!water || hasFoeNear(dimension, entity)) return false;
  startReturn(entity, routes);
  toWater.set(entity.id, water);
  stranded++;
  return true;
}

function followRoute(entity: Entity, route: number): void {
  entity.addTag(RETURNING_TAG);
  entity.addTag(returnRouteTag(route));
  entity.addTag(returnStageTag(0));
  entity.triggerEvent(RETURN_EVENT);
}

function startReturn(entity: Entity, routes: readonly (readonly Vec3[])[]): void {
  const route = nearestRoute(entity.location, routes);
  followRoute(entity, route);
  const at = entity.location;
  console.log(`[bastion] ${entity.typeId} cayó al agua en ${at.x.toFixed(0)},${at.y.toFixed(0)},${at.z.toFixed(0)}: regresa por la ruta ${route}.`);
}

/** Un invasor recién llegado empieza la subida por la ruta más cercana. `false` si el mapa no tiene rutas de subida. */
export function startApproach(entity: Entity, map: MapDef): boolean {
  const approach = map.approachRoutes ?? [];
  if (approach.length === 0) return false;
  try {
    followRoute(entity, (map.returnRoutes?.length ?? 0) + nearestRoute(entity.location, approach));
    return true;
  } catch (e) {
    console.warn(`[bastion] No se pudo poner en la ruta de subida a ${entity.typeId}: ${e}`);
    return false;
  }
}

/** ¿Va por una ruta de subida (no regresando del agua)? */
export function isApproaching(entity: Entity, map: MapDef): boolean {
  const first = map.returnRoutes?.length ?? 0;
  return isReturning(entity) && (map.approachRoutes ?? []).some((_, r) => entity.hasTag(returnRouteTag(first + r)));
}

/** El evento que devuelve a un invasor a lo que estaba haciendo, según haya habido brecha o no. Los arqueros, como los soldados. */
function resumeEvent(entity: Entity, breached: boolean): string {
  if (unitOf(entity.typeId)?.role === "caster") return breached ? WIZARD_ASSAULT_EVENT : WIZARD_SIEGE_EVENT;
  return SOLDIER_MARCH_EVENT;
}

/** Ruta y tramo de quien regresa, por sus etiquetas; `undefined` si le faltan. */
function position(entity: Entity, routes: readonly (readonly Vec3[])[]): { route: number; stage: number } | undefined {
  const route = routes.findIndex((_, r) => entity.hasTag(returnRouteTag(r)));
  if (route < 0) return undefined;
  const stage = routes[route].findIndex((_, i) => entity.hasTag(returnStageTag(i)));
  return stage < 0 ? undefined : { route, stage };
}

function finish(entity: Entity, routes: readonly (readonly Vec3[])[]): void {
  entity.removeTag(RETURNING_TAG);
  routes.forEach((route, r) => {
    entity.removeTag(returnRouteTag(r));
    route.forEach((_, i) => entity.removeTag(returnStageTag(i)));
  });
  water.forget(entity.id);
  landProgress.forget(entity.id);
  toWater.delete(entity.id);
}

function advance(
  dimension: Dimension,
  entity: Entity,
  routes: readonly (readonly Vec3[])[],
  breached: boolean,
  resumeAlly: (ally: Entity) => void
): void {
  const at = position(entity, routes);
  if (!at) {
    // Etiquetas incompletas (por ejemplo, de una versión anterior): deja la ruta y sigue como siempre.
    finish(entity, routes);
    if (entity.matches({ families: [FAMILY.ally] })) resumeAlly(entity);
    else entity.triggerEvent(resumeEvent(entity, breached));
    return;
  }
  const target = routes[at.route][at.stage];

  if (isRafting(entity)) return;
  const spot = toWater.get(entity.id);
  if (spot && !entity.isInWater) {
    // Varado: si en 3 s no se acerca al agua por su pie, un empujón hacia ella.
    if (landProgress.check(entity.id, entity.location, spot)) {
      entity.applyImpulse(nudgeToward(entity.location, spot));
      nudges++;
    }
    return;
  }
  toWater.delete(entity.id);
  if (entity.isInWater) {
    if (launchRaft(dimension, entity, target)) {
      water.forget(entity.id);
      launched++;
      return;
    }
    const push = water.check(entity.id, entity.location, target);
    if (push) {
      entity.applyImpulse(nudgeToward(entity.location, target));
      nudges++;
    }
    return;
  }
  if (distanceSq(entity.location, target) > WAYPOINT_REACHED ** 2) return;

  water.forget(entity.id);
  entity.removeTag(returnStageTag(at.stage));
  if (at.stage + 1 < routes[at.route].length) {
    entity.addTag(returnStageTag(at.stage + 1));
    return;
  }
  finish(entity, routes);
  if (entity.matches({ families: [FAMILY.ally] })) resumeAlly(entity);
  else entity.triggerEvent(resumeEvent(entity, breached));
  const p = entity.location;
  console.log(`[bastion] ${entity.typeId} volvió a pie a ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}.`);
}

/** Revisión de cada segundo: detecta a los que han caído y los guía de hito en hito. */
export function guideReturns(dimension: Dimension, map: MapDef, breached: boolean, resumeAlly: (ally: Entity) => void): void {
  const routes = allRoutes(map);
  if (routes.length === 0) return;
  // Solo las de regreso sirven a quien cae al agua; sin ellas, se queda donde cae.
  const waterRoutes = map.returnRoutes ?? [];

  const seen = new Set<string>();
  for (const family of [FAMILY.invader, FAMILY.ally]) {
    for (const entity of dimension.getEntities({ families: [family] })) {
      if (!entity.isValid) continue;
      try {
        if (isReturning(entity)) {
          seen.add(entity.id);
          advance(dimension, entity, routes, breached, resumeAlly);
        } else if (waterRoutes.length === 0) continue;
        else if (entity.isInWater) startReturn(entity, waterRoutes);
        else if (rescueStranded(dimension, entity, waterRoutes)) seen.add(entity.id);
      } catch (e) {
        console.warn(`[bastion] Error guiando el regreso de ${entity.typeId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  water.keepOnly(seen);
  landProgress.keepOnly(seen);
  for (const id of toWater.keys()) if (!seen.has(id)) toWater.delete(id);
  stillness.endRound();
  if (stranded > 0) {
    console.log(`[bastion] Regreso: ${stranded} varado(s) junto al agua, de camino a ella.`);
    stranded = 0;
  }
  sweepRafts(dimension);
  if (launched > 0) {
    console.log(`[bastion] Regreso: ${launched} balsa(s) a la orilla.`);
    launched = 0;
  }
  if (nudges > 0) {
    console.log(`[bastion] Regreso: ${nudges} empujón(es) hacia la orilla.`);
    nudges = 0;
  }
}
