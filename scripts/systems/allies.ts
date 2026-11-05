import { EntityComponentTypes, type Dimension, type Entity } from "@minecraft/server";
import { ALLY_FIGHT_EVENT, FAMILY } from "../constants";
import { isReturning } from "./returnPath";

/**
 * Hasta la brecha los aliados patrullan cerca de donde aparecieron (no se amontonan en la puerta) y solo
 * atacan a los invasores que tengan cerca y puedan alcanzar. Al caer la puerta se les lanza el evento
 * `bastion:fight` y pasan a buscarlos desde más lejos.
 */
export function unleashAllies(dimension: Dimension): void {
  for (const ally of dimension.getEntities({ families: [FAMILY.ally] })) {
    if (!ally.isValid || isReturning(ally)) continue;
    try {
      ally.triggerEvent(ALLY_FIGHT_EVENT);
    } catch (e) {
      console.warn(`[bastion] No se pudo activar el combate de un aliado: ${e}`);
    }
  }
}

/** Aliados vivos del mapa. */
export function aliveAllies(dimension: Dimension): Entity[] {
  return dimension.getEntities({ families: [FAMILY.ally] }).filter((e) => e.isValid);
}

/** Deja a un aliado con la vida al máximo (entre oleadas). */
export function healAlly(ally: Entity): void {
  try {
    ally.getComponent(EntityComponentTypes.Health)?.resetToMaxValue();
  } catch {
    // Sin componente de vida no hay nada que curar.
  }
}
