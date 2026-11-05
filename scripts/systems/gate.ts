import type { Dimension, Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY } from "../constants";
import type { GateDef, MapDef, Vec3 } from "../maps/types";

/**
 * Puntos de entrada: la meta invisible de los invasores (`bastion:objective`) y las comprobaciones
 * del terreno antes de empezar. Los muros están en `wall.ts`.
 */

/** Cada meta lleva una etiqueta con el id de su puerta. */
function objectiveTag(id: string): string {
  return `bastion_objective_${id}`;
}

/** A esta distancia de la meta, un invasor ya ha pasado el muro (desde fuera o desde encima queda más lejos). */
const OBJECTIVE_REACHED_DISTANCE = 3;

/** ¿Hay algún invasor junto a la meta? Pasa si cruzan por encima de un muro escalonado, sin abrir un hueco. */
export function invaderAtObjective(dimension: Dimension, gate: GateDef): boolean {
  return dimension.getEntities({ families: [FAMILY.invader], location: gate.objective, maxDistance: OBJECTIVE_REACHED_DISTANCE }).length > 0;
}

export function findObjective(dimension: Dimension, id: string): Entity | undefined {
  return dimension.getEntities({ families: [FAMILY.objective], tags: [objectiveTag(id)] }).find((e) => e.isValid);
}

/** Coloca la meta de esa puerta (sustituye la que hubiera). */
export function spawnObjective(dimension: Dimension, gate: GateDef): Entity {
  findObjective(dimension, gate.id)?.remove();
  const entity = dimension.spawnEntity(ENTITY_IDS.objective, gate.objective);
  entity.addTag(objectiveTag(gate.id));
  return entity;
}

/** El punto de mira de esa puerta, si existe. */
export function findAimPoint(dimension: Dimension, id: string): Entity | undefined {
  return dimension.getEntities({ families: [FAMILY.aim], tags: [`bastion_aim_${id}`] }).find((e) => e.isValid);
}

/** Lleva el punto de mira de esa puerta a `at` (lo crea si no existe). */
export function moveAimPoint(dimension: Dimension, gate: GateDef, at: Vec3): void {
  const aim = findAimPoint(dimension, gate.id);
  if (aim) {
    aim.teleport(at);
    return;
  }
  dimension.spawnEntity(ENTITY_IDS.aimPoint, at).addTag(`bastion_aim_${gate.id}`);
}

/** Quita todas las metas y proyectiles (también los que sobraron de una partida o mapa anterior). */
export function removeObjectivesAndBolts(dimension: Dimension): void {
  for (const family of [FAMILY.objective, FAMILY.aim, FAMILY.waypoint, FAMILY.bolt]) {
    for (const entity of dimension.getEntities({ families: [family] })) {
      if (entity.isValid) entity.remove();
    }
  }
}

/** Bloques decorativos que no cuentan como «sólido» (hierba, flores, nieve fina...). */
export const PASSABLE_DECORATION = /grass|fern|flower|snow_layer|vine|bush|tulip|dandelion|poppy|orchid|allium|azure|cornflower|lily|carpet|torch|sapling|mushroom|leaf_litter|moss_carpet|:fire|soul_fire/;

/**
 * Comprueba que el terreno coincide con lo que espera el mapa: el punto de referencia no es sólido
 * (aire, agua, hierba...) y debajo hay algo sólido. Si el mapa no es el de este mundo, el punto caería al vacío
 * o quedaría dentro de la roca. Con la zona sin cargar devuelve `true` (no se puede saber).
 */
export function gateTerrainMatches(dimension: Dimension, position: Vec3): boolean {
  try {
    const at = dimension.getBlock(position);
    const below = dimension.getBlock({ x: position.x, y: position.y - 1, z: position.z });
    if (!at || !below) return true;
    return (at.isAir || at.isLiquid || PASSABLE_DECORATION.test(at.typeId)) && !below.isAir;
  } catch {
    return true;
  }
}

/** Texto de diagnóstico: qué bloques hay en el punto de referencia y debajo. */
export function describeGateTerrain(dimension: Dimension, position: Vec3): string {
  try {
    const at = dimension.getBlock(position)?.typeId ?? "sin cargar";
    const below = dimension.getBlock({ x: position.x, y: position.y - 1, z: position.z })?.typeId ?? "sin cargar";
    return `en el punto ${at}, debajo ${below}`;
  } catch {
    return "ilegible";
  }
}

/** `true` si el chunk de esa posición está cargado (así evitamos falsas lecturas de bloques). */
export function isAreaLoaded(dimension: Dimension, position: Vec3): boolean {
  try {
    return dimension.getBlock(position) !== undefined;
  } catch {
    return false;
  }
}
