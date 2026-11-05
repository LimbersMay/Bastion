import type { DimensionName } from "../constants";
import type { UnitId } from "../units/catalog";
import type { WaveDef } from "../systems/wavePlan";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface UnitSpawn {
  readonly unit: UnitId;
  readonly position: Vec3;
}

export interface BreachTroops {
  readonly unit: UnitId;
  readonly count: number;
}

/**
 * Región de bloques que cierra el paso (compuerta, barricada). Se rellena con `block` al empezar
 * y se vacía al caer la puerta. Esquinas inclusivas; `block` es lo que va tras `fill`
 * (ej. `spruce_planks` o `planks ["wood_type"="spruce"]`).
 */
export interface BarrierDef {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly block: string;
}

/** Una puerta atacable y lo que ocurre cuando cae. */
export interface GateDef {
  /** Identificador único dentro del mapa (minúsculas, números, _ y -). */
  readonly id: string;

  /**
   * Dónde aparece la entidad `bastion:gate_core`. Debe estar en un sitio ALCANZABLE por los
   * invasores desde fuera, no en un hueco cerrado: es lo que atacan.
   */
  readonly position: Vec3;

  /** Vida de la puerta. Debe ser uno de `GATE_HEALTH_TIERS` (150, 300, 600, 1200, 2400). Por defecto 300. */
  readonly health?: number;

  /** Bloques que cierran el paso y desaparecen cuando esta puerta cae. Opcional. */
  readonly barriers?: readonly BarrierDef[];

  /** Puntos INTERIORES donde aparecen las tropas cuando cae esta puerta. */
  readonly breachSpawns: readonly Vec3[];
  readonly breachTroops: readonly BreachTroops[];
}

/**
 * Definición completa de un mapa. Un mapa = un archivo en `scripts/maps/`.
 * Las coordenadas son absolutas del mundo donde está el castillo.
 * Truco para sacarlas: en el juego, `/scriptevent bastion:pos` te dice dónde estás.
 */
export interface MapDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly dimension: DimensionName;

  /**
   * Las puertas del mapa (una o varias). Cada una es una entidad atacable con su propia barra de
   * vida, sus barricadas y sus tropas de brecha. La brecha del asedio salta cuando cae la primera.
   */
  readonly gates: readonly GateDef[];

  /** Dónde aparecen los jugadores al empezar. Se reparten en rotación. */
  readonly playerSpawns: readonly Vec3[];

  /** Aliados que se colocan al empezar. */
  readonly allies: readonly UnitSpawn[];

  /** Puntos EXTERIORES por donde entran las oleadas. Mantenlos a menos de ~70 bloques de la puerta. */
  readonly invaderSpawns: readonly Vec3[];

  readonly waves: readonly WaveDef[];

  /** Vidas del equipo: cada muerte de un jugador gasta una. */
  readonly lives: number;
  readonly countdownSeconds: number;
  readonly intermissionSeconds: number;

  /** Área que se mantiene cargada aunque estés lejos (radio en chunks, 1 a 4). */
  readonly tickingArea?: { readonly center: Vec3; readonly radiusChunks: number };
}
