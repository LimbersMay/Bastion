/** Identificadores compartidos entre scripts y packs. Si cambias uno, cambia también los JSON. */

export const NAMESPACE = "bastion";

export const ENTITY_IDS = {
  gate: "bastion:gate_core",
  allySoldier: "bastion:ally_soldier",
  invaderSoldier: "bastion:invader_soldier",
} as const;

/** Familias definidas en `minecraft:type_family` de cada entidad. */
export const FAMILY = {
  ally: "bastion_ally",
  invader: "bastion_invader",
  gate: "bastion_gate",
} as const;

/**
 * Vidas máximas que puede tener una puerta. El motor no deja cambiar la vida máxima de una entidad
 * desde script, así que `gate_core.json` trae un evento `bastion:hp_<n>` por cada tramo (ver `gate.ts`).
 * Si añades uno aquí, añádelo también en ese JSON (hay una prueba que lo comprueba).
 */
export const GATE_HEALTH_TIERS = [150, 300, 600, 1200, 2400] as const;
export const DEFAULT_GATE_HEALTH = 300;

/** Evento de `ally_soldier.json` que pasa a los aliados de patrullar a combatir. */
export const ALLY_FIGHT_EVENT = "bastion:fight";

export const TICKS_PER_SECOND = 20;

/** Cada cuántos ticks se evalúa el estado de la partida (1 segundo). */
export const LOGIC_INTERVAL_TICKS = TICKS_PER_SECOND;

/** Nombre del área de carga permanente de la arena. */
export const TICKING_AREA_NAME = "bastion_arena";

/** Propiedad dinámica del mundo donde se guarda el mapa elegido. */
export const PROP_ACTIVE_MAP = "bastion:map";

/** Objeto que abre el menú al usarlo (se entrega en el equipo inicial). */
export const MENU_ITEM_ID = "minecraft:clock";

/** Dimensiones de las que se puede leer un mapa. */
export type DimensionName = "overworld" | "nether" | "the_end";
