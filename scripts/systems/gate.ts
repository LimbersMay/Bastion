import type { Dimension, Entity } from "@minecraft/server";
import { DEFAULT_GATE_HEALTH, ENTITY_IDS, FAMILY } from "../constants";
import type { GateDef, Vec3 } from "../maps/types";

/** La puerta es una entidad (`bastion:gate_core`) con `minecraft:boss`, que da la barra de vida. */

/** Cada puerta lleva una etiqueta con su id para saber de cuál se trata. */
function gateTag(id: string): string {
  return `bastion_gate_${id}`;
}

/** La entidad de esa puerta, si existe. */
export function findGate(dimension: Dimension, id: string): Entity | undefined {
  return dimension.getEntities({ families: [FAMILY.gate], tags: [gateTag(id)] }).find((e) => e.isValid);
}

export function spawnGate(dimension: Dimension, gate: GateDef): Entity {
  const existing = findGate(dimension, gate.id);
  if (existing) existing.remove();
  const entity = dimension.spawnEntity(ENTITY_IDS.gate, gate.position);
  entity.addTag(gateTag(gate.id));
  applyHealth(entity, gate.health ?? DEFAULT_GATE_HEALTH);
  return entity;
}

/**
 * Fija la vida de la puerta. El máximo lo cambia el evento `bastion:hp_<n>` del JSON de la entidad
 * (el motor no lo permite desde script) y después se llena la vida actual.
 */
function applyHealth(entity: Entity, health: number): void {
  if (health !== DEFAULT_GATE_HEALTH) entity.triggerEvent(`bastion:hp_${health}`);
  const component = entity.getComponent("minecraft:health");
  if (component) component.setCurrentValue(component.effectiveMax);
}

/** Quita todas las puertas (también las que sobraron de una partida o mapa anterior). */
export function removeGates(dimension: Dimension): void {
  for (const gate of dimension.getEntities({ families: [FAMILY.gate] })) {
    if (gate.isValid) gate.remove();
  }
}

export interface GateHealth {
  readonly current: number;
  readonly max: number;
}

/** Suma la vida de varias puertas (para la barra de estado). */
export function sumGateHealth(parts: readonly (GateHealth | undefined)[]): GateHealth | undefined {
  const known = parts.filter((p): p is GateHealth => p !== undefined);
  if (known.length === 0) return undefined;
  return { current: known.reduce((a, p) => a + p.current, 0), max: known.reduce((a, p) => a + p.max, 0) };
}

export function readGateHealth(gate: Entity): GateHealth | undefined {
  const health = gate.getComponent("minecraft:health");
  if (!health) return undefined;
  return { current: Math.max(0, Math.ceil(health.currentValue)), max: Math.ceil(health.effectiveMax) };
}

/** Bloques decorativos que no cuentan como «sólido» (hierba, flores, nieve fina...). */
export const PASSABLE_DECORATION = /grass|fern|flower|snow_layer|vine|bush|tulip|dandelion|poppy|orchid|allium|azure|cornflower|lily|carpet|torch|sapling|mushroom|leaf_litter|moss_carpet/;

/**
 * Comprueba que el terreno coincide con lo que espera el mapa: el hueco de la puerta no es sólido
 * (aire, agua, hierba...) y debajo hay algo sólido. Si el mapa no es el de este mundo, la puerta caería al vacío
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

/** Texto de diagnóstico: qué bloques hay en la puerta y debajo. */
export function describeGateTerrain(dimension: Dimension, position: Vec3): string {
  try {
    const at = dimension.getBlock(position)?.typeId ?? "sin cargar";
    const below = dimension.getBlock({ x: position.x, y: position.y - 1, z: position.z })?.typeId ?? "sin cargar";
    return `en la puerta ${at}, debajo ${below}`;
  } catch {
    return "ilegible";
  }
}

/** `true` si el chunk de esa posición está cargado (así evitamos falsas "puerta destruida"). */
export function isAreaLoaded(dimension: Dimension, position: Vec3): boolean {
  try {
    return dimension.getBlock(position) !== undefined;
  } catch {
    return false;
  }
}
