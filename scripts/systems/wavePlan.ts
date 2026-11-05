import type { UnitId } from "../units/catalog";

/** Lógica pura de oleadas: decide QUÉ sale, POR DÓNDE y CUÁNDO. No toca el juego. */

export interface WaveGroup {
  readonly unit: UnitId;
  readonly count: number;
}

export interface WaveDef {
  readonly name?: string;
  readonly groups: readonly WaveGroup[];
  /** Unidades que salen a la vez en cada tanda. */
  readonly batchSize: number;
  /** Ticks entre una tanda y la siguiente (20 ticks = 1 s). */
  readonly batchIntervalTicks: number;
}

export interface SpawnOrder {
  readonly unit: UnitId;
  readonly pointIndex: number;
  readonly delayTicks: number;
}

export function totalUnits(def: WaveDef): number {
  return def.groups.reduce((sum, g) => sum + g.count, 0);
}

/**
 * Reparte las unidades de la oleada entre los puntos de aparición (en rotación)
 * y las agrupa en tandas separadas en el tiempo.
 */
export function planWave(def: WaveDef, pointCount: number): SpawnOrder[] {
  if (!Number.isInteger(pointCount) || pointCount <= 0) {
    throw new Error("planWave: se necesita al menos un punto de aparición.");
  }
  if (!Number.isInteger(def.batchSize) || def.batchSize <= 0) {
    throw new Error("planWave: batchSize debe ser un entero mayor que 0.");
  }
  if (def.batchIntervalTicks < 0) {
    throw new Error("planWave: batchIntervalTicks no puede ser negativo.");
  }

  const flat: UnitId[] = [];
  for (const group of def.groups) {
    if (!Number.isInteger(group.count) || group.count < 0) {
      throw new Error(`planWave: cantidad inválida para ${group.unit}.`);
    }
    for (let i = 0; i < group.count; i++) flat.push(group.unit);
  }

  return flat.map((unit, i) => ({
    unit,
    pointIndex: i % pointCount,
    delayTicks: Math.floor(i / def.batchSize) * def.batchIntervalTicks,
  }));
}

/** Cuántos refuerzos salen ahora: los que faltan para el mínimo, sin pasar de la tanda ni de la reserva. */
export function reinforcementsDue(alive: number, minField: number, reserve: number, batch: number): number {
  return Math.max(0, Math.min(minField - alive, reserve, batch));
}
