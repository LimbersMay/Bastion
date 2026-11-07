import type { Vec3 } from "../maps/types";

/**
 * Lógica PURA de la moral (Fase 3). Un grupo de aliados que ha perdido buena parte de su fuerza y tiene delante
 * bastante más enemigo del que puede aguantar se repliega a la capa siguiente del castillo: de donde esté (la
 * muralla, la puerta, el campo) al patio y, de ahí, a la torre. No hay vuelta atrás sin una orden del jugador.
 */

/** Dónde aguanta un aliado: `field` es cualquier sitio por delante del patio. */
export type Layer = "field" | "courtyard" | "keep";

export interface MoraleOptions {
  /** Enemigos a esta distancia de algún miembro cuentan como amenaza. */
  readonly radius: number;
  /** Se rompe si su vida es menor que esta parte de la vida de la amenaza... */
  readonly breakRatio: number;
  /** ...y además le queda menos de esta parte de la fuerza que llegó a tener. */
  readonly woundedBelow: number;
}

export const MORALE_DEFAULTS: MoraleOptions = { radius: 12, breakRatio: 0.5, woundedBelow: 0.6 };

export interface Fighter {
  readonly at: Vec3;
  readonly health: number;
}

export interface Strength {
  /** Vida que le queda al grupo. */
  readonly own: number;
  /** La mayor vida (sumando la máxima de cada miembro) que tuvo el grupo: así cuentan también los caídos. */
  readonly peak: number;
  /** Vida de los enemigos cercanos. */
  readonly threat: number;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

/** Vida de los enemigos que están a `radius` o menos de algún miembro. */
export function threatAround(members: readonly Fighter[], enemies: readonly Fighter[], radius: number): number {
  let threat = 0;
  for (const e of enemies) if (members.some((m) => flat(m.at, e.at) <= radius)) threat += e.health;
  return threat;
}

/** ¿Se rompe el grupo? Superado (poca vida frente a la amenaza) y castigado (lejos de su mejor momento). */
export function isBroken(s: Strength, o: MoraleOptions = MORALE_DEFAULTS): boolean {
  if (s.peak <= 0 || s.threat <= 0) return false;
  return s.own < o.breakRatio * s.threat && s.own / s.peak < o.woundedBelow;
}

/** La capa a la que se repliega quien está en `layer`; `undefined` = no hay a dónde: resiste ahí. */
export function nextLayer(layer: Layer, map: { readonly hasCourtyard: boolean; readonly hasKeep: boolean }): Exclude<Layer, "field"> | undefined {
  if (layer === "field") return map.hasCourtyard ? "courtyard" : map.hasKeep ? "keep" : undefined;
  if (layer === "courtyard") return map.hasKeep ? "keep" : undefined;
  return undefined;
}
