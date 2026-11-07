import type { GateDef, Vec3 } from "../maps/types";

/**
 * Lógica PURA de la postura de los aliados que defienden (Fase 3, elegida por Limbers, 2026-11-07): el defensor
 * aguanta la posición y deja que el atacante venga a él. `stance.ts` y `siegeManager.ts` la aplican al mundo.
 * - Medir fuerzas: quien tiene delante el doble de enemigos que aliados a su lado no sale a buscarlos; solo pelea
 *   con quien se le acerca (`HOLD_ENGAGE`), en su sitio, hasta que la pelea esté más pareja.
 * - No salir del castillo: con la orden de defender, quien pasa al otro lado de una puerta vuelve a su puesto.
 * La orden de ataque (la vara) no mira nada de esto: ahí decide el jugador.
 */

/** Aliados que cuentan como «a su lado». */
export const STANCE_ALLY_RADIUS = 12;
/** Enemigos que cuentan como «delante». */
export const STANCE_FOE_RADIUS = 16;
/** Con tantos enemigos por cada aliado, aguanta. */
export const HOLD_RATIO = 2;
/** Aguantando, sigue así mientras haya más de tantos enemigos por aliado (margen para no cambiar a cada paso). */
export const RELEASE_RATIO = 1.5;
/** Quien aguanta solo pelea con quien tiene a esta distancia. */
export const HOLD_ENGAGE = 5;

/**
 * ¿Aguanta en su sitio? `allies` cuenta también a la propia unidad. Los que disparan desde lo alto y el jugador
 * cuentan como aliados: también pelean.
 */
export function shouldHold(allies: number, foes: number, holding: boolean): boolean {
  const own = Math.max(allies, 1);
  if (foes >= HOLD_RATIO * own) return true;
  return holding && foes > RELEASE_RATIO * own;
}

/** A esta altura (±) de una puerta se mira si alguien está fuera. Más arriba o más abajo, son torres o barrancos. */
export const GATE_HEIGHT = 6;
/** Hasta esta distancia horizontal de una puerta se mira si alguien está fuera. */
export const GATE_REACH = 48;

const flat = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * ¿Está al otro lado de la puerta? Más cerca del frente de la puerta (`position`, por fuera) que de la meta
 * (`objective`, por dentro): el plano que los separa pasa por el muro. Solo cerca de la puerta y a su altura.
 */
export function outsideGate(at: Vec3, gate: Pick<GateDef, "position" | "objective">): boolean {
  if (Math.abs(at.y - gate.position.y) > GATE_HEIGHT) return false;
  if (flat(at, gate.position) > GATE_REACH) return false;
  return flat(at, gate.position) < flat(at, gate.objective);
}

export function isOutside(at: Vec3, gates: readonly Pick<GateDef, "position" | "objective">[]): boolean {
  return gates.some((g) => outsideGate(at, g));
}
