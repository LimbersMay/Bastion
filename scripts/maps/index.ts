import type { MapDef } from "./types";
import { castleDemo } from "./castle-demo";
import { combatCastle } from "./combat-castle";
import { oldFallenCastle } from "./old-fallen-castle";
import { stonehillCastle } from "./stonehill-castle";

/**
 * Registro de mapas. Para añadir uno: crea su archivo en esta carpeta e inclúyelo aquí.
 * Con un mundo por mapa, normalmente basta con dejar UN mapa registrado por build,
 * o elegir el activo con `/scriptevent bastion:map <id>`.
 */
export const MAPS: readonly MapDef[] = [combatCastle, oldFallenCastle, stonehillCastle, castleDemo];

export function findMap(id: string | undefined): MapDef | undefined {
  return MAPS.find((m) => m.id === id);
}

export function defaultMap(): MapDef {
  return MAPS[0];
}
