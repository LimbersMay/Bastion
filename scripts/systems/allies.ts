import type { Dimension } from "@minecraft/server";
import { ALLY_FIGHT_EVENT, FAMILY } from "../constants";

/**
 * Hasta la brecha los aliados patrullan cerca de donde aparecieron (no se amontonan en la puerta).
 * Al caer la puerta se les lanza el evento `bastion:fight` y pasan a atacar a los invasores.
 */
export function unleashAllies(dimension: Dimension): void {
  for (const ally of dimension.getEntities({ families: [FAMILY.ally] })) {
    if (!ally.isValid) continue;
    try {
      ally.triggerEvent(ALLY_FIGHT_EVENT);
    } catch (e) {
      console.warn(`[bastion] No se pudo activar el combate de un aliado: ${e}`);
    }
  }
}
