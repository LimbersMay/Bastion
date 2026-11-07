import type { Vec3 } from "../maps/types";
import type { LadderMove, RouteStep } from "./routeLogic";

/**
 * Lógica pura de las escaleras de mano del director (`ladders.ts`). Lo medido en el laboratorio
 * (`tools/lab/ladder.ts`, 2026-11-07): las criaturas no entran solas en una escalera; metidas en ella, bajan solas
 * (5 de 5, 3 s para 10 bloques); subir no suben, así que el director las sube a la velocidad de trepar (5 de 5).
 * Al bajar también las baja él, a la velocidad medida: si no, la que sigue un marcador que aún espera arriba
 * podría volver a trepar hacia él.
 */

/** Velocidad de trepar por una escalera de mano en el juego: unos 2,4 bloques por segundo. */
export const CLIMB_PER_TICK = 0.12;
/** Velocidad de bajar: unos 4 bloques por segundo, lo que tardaron en el laboratorio. */
export const DESCEND_PER_TICK = 0.2;
/** A esta altura del pie o del borde de la escalera, se la mete en ella. */
export const ENTRY_V = 1.5;

/** `facing_direction` del bloque de escalera que mira hacia (dx, dz), de la pared hacia fuera. */
export function facingDirection(dx: number, dz: number): number {
  if (dx > 0) return 5;
  if (dx < 0) return 4;
  return dz > 0 ? 3 : 2;
}

/** Pasos de la ruta que se dan por una escalera, con el paso desde el que se entra en ella. */
export function ladderSteps(steps: readonly RouteStep[]): { readonly index: number; readonly entry: Vec3; readonly ladder: LadderMove }[] {
  const out: { index: number; entry: Vec3; ladder: LadderMove }[] = [];
  for (let i = 1; i < steps.length; i++) {
    const ladder = steps[i].ladder;
    if (ladder) out.push({ index: i, entry: steps[i - 1], ladder });
  }
  return out;
}

/** Está junto a la entrada de la escalera: a `reach` bloques en horizontal y a su altura. */
export function atEntry(at: Vec3, entry: Vec3, reach: number): boolean {
  return Math.hypot(at.x - (entry.x + 0.5), at.z - (entry.z + 0.5)) <= reach && Math.abs(at.y - entry.y) <= ENTRY_V;
}

/** Dónde se mete a la unidad: al bajar, en lo alto de la escalera; al subir, al pie. */
export function rideStart(ladder: LadderMove, at: Vec3): Vec3 {
  const { x, z } = ladder.cells[0];
  const top = ladder.cells[ladder.cells.length - 1];
  return { x: x + 0.5, y: ladder.up ? Math.max(at.y, ladder.cells[0].y) : top.y, z: z + 0.5 };
}

/**
 * La altura del siguiente tick en la escalera, o `done` si ya ha llegado: al subir, cuando asoma por encima (hay que
 * pasarla al borde); al bajar, cuando pisa el suelo.
 */
export function rideNext(y: number, ladder: LadderMove): { readonly y: number; readonly done: boolean } {
  if (ladder.up) {
    const top = ladder.cells[ladder.cells.length - 1].y + 1;
    if (y >= top - 0.2) return { y: top, done: true };
    return { y: Math.min(y + CLIMB_PER_TICK, top), done: false };
  }
  const bottom = ladder.cells[0].y;
  if (y <= bottom + 0.05) return { y: bottom, done: true };
  return { y: Math.max(y - DESCEND_PER_TICK, bottom), done: false };
}

/** Ticks como mucho para recorrerla; pasado esto, algo falla y el director la deja al otro extremo con humo. */
export function rideTimeout(ladder: LadderMove): number {
  return Math.ceil(ladder.cells.length / (ladder.up ? CLIMB_PER_TICK : DESCEND_PER_TICK)) + 40;
}
