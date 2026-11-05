import { ENTITY_IDS } from "../constants";

/**
 * Catálogo de unidades. Añadir una unidad = una entrada aquí + su JSON de BP y RP.
 * No importa `@minecraft/server`, así que se puede usar en los tests.
 */
export type UnitId = "ally_soldier" | "ally_wizard" | "invader_soldier" | "invader_wizard";

export type Side = "ally" | "invader";

export interface UnitDef {
  readonly id: UnitId;
  readonly entityId: string;
  readonly side: Side;
  readonly label: string;
}

export const UNITS: Readonly<Record<UnitId, UnitDef>> = {
  ally_soldier: {
    id: "ally_soldier",
    entityId: ENTITY_IDS.allySoldier,
    side: "ally",
    label: "Soldado aliado",
  },
  ally_wizard: {
    id: "ally_wizard",
    entityId: ENTITY_IDS.allyWizard,
    side: "ally",
    label: "Pirómano aliado",
  },
  invader_soldier: {
    id: "invader_soldier",
    entityId: ENTITY_IDS.invaderSoldier,
    side: "invader",
    label: "Soldado invasor",
  },
  invader_wizard: {
    id: "invader_wizard",
    entityId: ENTITY_IDS.invaderWizard,
    side: "invader",
    label: "Mago invasor",
  },
};

export function isUnitId(value: string): value is UnitId {
  return Object.prototype.hasOwnProperty.call(UNITS, value);
}
