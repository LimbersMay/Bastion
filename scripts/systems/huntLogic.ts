import type { Vec3 } from "../maps/types";
import type { RouteStep } from "./routeLogic";

/** Lógica pura de la caza: a quién perseguir y por dónde va un rastro. No toca el juego. */

/** Cuántos pasos por delante del grupo va el marcador que siguen. */
const HOP = 8;
/** A esta distancia de un paso, una unidad ya está en él. */
const STEP_REACHED_H = 2;
const STEP_REACHED_V = 1.2;

/** El más cercano de la lista, o `undefined` si está vacía. */
export function nearest<T extends { readonly location: Vec3 }>(from: Vec3, candidates: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const candidate of candidates) {
    const { x, y, z } = candidate.location;
    const d = (x - from.x) ** 2 + (y - from.y) ** 2 + (z - from.z) ** 2;
    if (d < bestD) {
      best = candidate;
      bestD = d;
    }
  }
  return best;
}

/** Primer paso desde `progress`, hasta donde alcanza el marcador, que aún tiene bloques por quitar. */
export function firstPending(steps: readonly RouteStep[], progress: number, isSolid: (at: Vec3) => boolean): number | undefined {
  const last = Math.min(steps.length - 1, progress + HOP + 1);
  for (let i = progress; i <= last; i++) {
    if (steps[i].breaks.some(isSolid)) return i;
  }
  return undefined;
}

/** Hasta dónde ha llegado el grupo. Nadie cuenta como avance más allá de un paso con bloques sin quitar. */
export function advanceProgress(steps: readonly RouteStep[], progress: number, pending: number | undefined, positions: readonly Vec3[]): number {
  const top = Math.min(steps.length - 1, pending === undefined ? progress + HOP + 4 : pending - 1);
  for (let i = top; i > progress; i--) {
    const s = steps[i];
    const reached = positions.some((p) => Math.hypot(p.x - (s.x + 0.5), p.z - (s.z + 0.5)) <= STEP_REACHED_H && Math.abs(p.y - s.y) <= STEP_REACHED_V);
    if (reached) return i;
  }
  return progress;
}

/** En qué paso poner el marcador: unos pasos por delante, o justo antes de lo que hay que romper. */
export function markerStep(progress: number, pending: number | undefined, lastIndex: number): number {
  return pending === undefined ? Math.min(lastIndex, progress + HOP) : Math.max(progress, pending - 1);
}
