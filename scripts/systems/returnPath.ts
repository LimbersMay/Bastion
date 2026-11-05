import type { Dimension, Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY, RETURN_EVENT, SOLDIER_MARCH_EVENT, WIZARD_ASSAULT_EVENT, WIZARD_SIEGE_EVENT } from "../constants";
import type { MapDef, Vec3 } from "../maps/types";

/**
 * Regreso a pie: quien cae al agua no vuelve solo, porque su objetivo queda justo encima y se queda
 * mirando hacia arriba. Mientras regresa apunta a los hitos de `map.returnPath`, uno detrás de otro, y por el
 * camino pelea con los enemigos que tenga cerca (`bastion:returning` en los JSON). Nunca se teletransporta.
 */

const RETURNING_TAG = "bastion_returning";
const stageTag = (stage: number) => `bastion_stage_${stage}`;
const waypointTag = (stage: number) => `bastion_wp_${stage}`;

/** A esta distancia de un hito se pasa al siguiente (en la orilla el agua no deja acercarse más). */
const WAYPOINT_REACHED = 8;

export function isReturning(entity: Entity): boolean {
  return entity.hasTag(RETURNING_TAG);
}

const distanceSq = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** Coloca los hitos de la ruta que falten. */
export function ensureWaypoints(dimension: Dimension, map: MapDef): void {
  map.returnPath?.forEach((point, stage) => {
    if (dimension.getEntities({ families: [FAMILY.waypoint], tags: [waypointTag(stage)] }).length > 0) return;
    try {
      dimension.spawnEntity(ENTITY_IDS.waypoint, point).addTag(waypointTag(stage));
    } catch (e) {
      console.warn(`[bastion] No se pudo colocar el hito ${stage}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

function startReturn(entity: Entity): void {
  entity.addTag(RETURNING_TAG);
  entity.addTag(stageTag(0));
  entity.triggerEvent(RETURN_EVENT);
  console.log(`[bastion] ${entity.typeId} cayó al agua en ${entity.location.x.toFixed(0)},${entity.location.y.toFixed(0)},${entity.location.z.toFixed(0)}: regresa a pie.`);
}

/** El evento que devuelve a un invasor a lo que estaba haciendo, según haya habido brecha o no. */
function resumeEvent(entity: Entity, breached: boolean): string {
  if (entity.typeId === ENTITY_IDS.invaderWizard) return breached ? WIZARD_ASSAULT_EVENT : WIZARD_SIEGE_EVENT;
  return SOLDIER_MARCH_EVENT;
}

function advance(entity: Entity, path: readonly Vec3[], breached: boolean, resumeAlly: (ally: Entity) => void): void {
  const stage = path.findIndex((_, i) => entity.hasTag(stageTag(i)));
  if (stage < 0 || distanceSq(entity.location, path[stage]) > WAYPOINT_REACHED ** 2) return;
  entity.removeTag(stageTag(stage));
  if (stage + 1 < path.length) {
    entity.addTag(stageTag(stage + 1));
    return;
  }
  entity.removeTag(RETURNING_TAG);
  if (entity.matches({ families: [FAMILY.ally] })) resumeAlly(entity);
  else entity.triggerEvent(resumeEvent(entity, breached));
  console.log(`[bastion] ${entity.typeId} volvió a pie a ${entity.location.x.toFixed(0)},${entity.location.y.toFixed(0)},${entity.location.z.toFixed(0)}.`);
}

/** Revisión periódica: detecta a los que han caído y los guía de hito en hito. */
export function guideReturns(dimension: Dimension, map: MapDef, breached: boolean, resumeAlly: (ally: Entity) => void): void {
  const path = map.returnPath;
  if (!path || path.length === 0) return;

  for (const family of [FAMILY.invader, FAMILY.ally]) {
    for (const entity of dimension.getEntities({ families: [family] })) {
      if (!entity.isValid) continue;
      try {
        if (isReturning(entity)) advance(entity, path, breached, resumeAlly);
        else if (entity.isInWater) startReturn(entity);
      } catch (e) {
        console.warn(`[bastion] Error guiando el regreso de ${entity.typeId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
