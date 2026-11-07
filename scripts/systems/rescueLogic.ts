import type { Vec3 } from "../maps/types";

/**
 * Lógica PURA del cuerno (Fase 3). `rescue.ts` lo aplica al mundo. Dos formas de pedir ayuda:
 * - Automática: si rodean a un jugador, suena un cuerno y acuden unos aliados; cuando ya no tiene invasores encima
 *   (o pasado un tiempo), vuelven a su orden.
 * - En la mano (elegido por Limbers, 2026-11-07): acude una escolta de 4 que se queda con el jugador hasta el fin de
 *   la oleada. Tocarlo otra vez la completa si ha perdido a alguien.
 * Quien acude va hacia el jugador (un marcador le sigue); ya a su lado, le guarda las espaldas.
 */

export interface RescueOptions {
  /** Invasores a esta distancia del jugador cuentan como encima. */
  readonly radius: number;
  /** Con tantos encima, está rodeado. */
  readonly surrounded: number;
  /** Solo acuden los aliados a esta distancia. */
  readonly reach: number;
  /** Aliados que acuden, como mucho. */
  readonly count: number;
  /** Revisiones (segundos) que dura un rescate como mucho. */
  readonly duration: number;
  /** Revisiones (segundos) entre dos cuernos del mismo jugador. */
  readonly cooldown: number;
  /** Sin invasores a esta distancia del jugador, el rescate termina. */
  readonly clear: number;
}

export const RESCUE_DEFAULTS: RescueOptions = { radius: 5, surrounded: 3, reach: 40, count: 6, duration: 30, cooldown: 30, clear: 8 };

/**
 * El cuerno en la mano: una escolta de 4 (elegido por Limbers, 2026-11-07), de donde estén, para no vaciar la
 * defensa. No caduca: se queda hasta el fin de la oleada. Se puede tocar una vez por minuto.
 */
export const HORN_ESCORT: RescueOptions = { ...RESCUE_DEFAULTS, reach: Infinity, count: 4, duration: Infinity, cooldown: 60 };

/** Quien tiene un invasor a esta distancia está peleando: no se le saca de su pelea. */
export const ENGAGED = 6;

/** Más lejos que esto del jugador, el escolta deja de vigilar y va hacia él. */
export const ESCORT_LEASH = 10;
/** A esta distancia del jugador, el escolta ya ha llegado y pasa a vigilar. */
export const ESCORT_ARRIVED = 4;

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Cuántos invasores tiene a `radius`. */
export function foesAround(player: Vec3, invaders: readonly Vec3[], radius: number): number {
  return invaders.filter((i) => distance(i, player) <= radius).length;
}

export function isSurrounded(player: Vec3, invaders: readonly Vec3[], o: RescueOptions = RESCUE_DEFAULTS): boolean {
  return foesAround(player, invaders, o.radius) >= o.surrounded;
}

/** De dónde sale quien acude, en orden: 0 = antes. */
export type RescueTier = 0 | 1 | 2;

/**
 * Qué aliado puede acudir y con qué preferencia, según el director de grupos (`squadLogic.ts`):
 * primero la reserva, que espera sin hacer nada; luego quien va suelto; luego los grupos que avanzan pero aún no
 * han llegado al enemigo. Quien está peleando (`engaged`) no se mueve: `undefined`.
 */
export function rescueTier(squad: "advance" | "wait" | undefined, engaged: boolean): RescueTier | undefined {
  if (engaged) return undefined;
  if (squad === "wait") return 0;
  if (squad === undefined) return 1;
  return 2;
}

export interface RescueCandidate {
  readonly id: string;
  readonly at: Vec3;
  readonly tier: RescueTier;
}

/** Los que acuden: los `count` de mejor preferencia y, a igual preferencia, los más cercanos, a `reach` como mucho. */
export function pickRescuers(player: Vec3, allies: readonly RescueCandidate[], o: RescueOptions = RESCUE_DEFAULTS): string[] {
  return allies
    .map((a) => ({ id: a.id, tier: a.tier, d: distance(a.at, player) }))
    .filter((a) => a.d <= o.reach)
    .sort((a, b) => a.tier - b.tier || a.d - b.d)
    .slice(0, Math.max(0, o.count))
    .map((a) => a.id);
}

/** ¿Termina el rescate? Pasado `duration`, o cuando el jugador ya no tiene invasores a `clear`. */
export function rescueOver(player: Vec3, invaders: readonly Vec3[], elapsed: number, o: RescueOptions = RESCUE_DEFAULTS): boolean {
  return elapsed >= o.duration || foesAround(player, invaders, o.clear) === 0;
}

/** Cómo está un escolta: yendo hacia el jugador, vigilando a su lado o regresando del agua (va a lo suyo). */
export type EscortMode = "escort" | "guard" | "returning";

/**
 * El modo que le toca a un escolta a `d` bloques del jugador. Con margen entre llegar y alejarse, para que no
 * cambie de modo a cada paso. Quien vuelve del agua retoma el camino hacia el jugador.
 */
export function escortStep(d: number, mode: EscortMode): "escort" | "guard" {
  if (mode === "guard") return d > ESCORT_LEASH ? "escort" : "guard";
  return d <= ESCORT_ARRIVED ? "guard" : "escort";
}
