import type { Vec3 } from "../maps/types";

/**
 * Lógica PURA de la red de seguridad contra las oleadas colgadas (elegida por Limbers, 2026-11-06). Si la pelea
 * lleva `STALL_SECONDS` sin avances (ni bajas, ni bloques de muro rotos, ni brechas), los invasores que en todo
 * ese tiempo no se han alejado `STALL_MOVE` bloques de donde estaban no tienen salida y abandonan el asedio: si
 * no, la oleada no terminaría nunca. Cubre los atascos que el resto de sistemas no prevé en un mapa nuevo.
 */

export const STALL_SECONDS = 45;
export const STALL_MOVE = 8;

export interface Anchor {
  /** Dónde estaba cuando empezó a contar. */
  readonly at: Vec3;
  readonly since: number;
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Pone al día dónde empezó a contar cada invasor: quien se aleja más de `move` empieza de nuevo desde allí, y
 * quien ya no está en la lista (muerto, en reserva, regresando) se olvida.
 */
export function trackAnchors(
  prev: ReadonlyMap<string, Anchor>,
  units: readonly { readonly id: string; readonly at: Vec3 }[],
  now: number,
  move = STALL_MOVE
): Map<string, Anchor> {
  const next = new Map<string, Anchor>();
  for (const u of units) {
    const old = prev.get(u.id);
    next.set(u.id, old && distance(old.at, u.at) <= move ? old : { at: u.at, since: now });
  }
  return next;
}

/** Quienes llevan `ticks` sin moverse de su sitio, contados desde el último avance de la pelea. */
export function stalledUnits(anchors: ReadonlyMap<string, Anchor>, now: number, lastProgress: number, ticks: number): string[] {
  const out: string[] = [];
  for (const [id, a] of anchors) if (now - Math.max(a.since, lastProgress) >= ticks) out.push(id);
  return out;
}
