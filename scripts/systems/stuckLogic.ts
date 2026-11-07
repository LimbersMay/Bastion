import type { Vec3 } from "../maps/types";

/**
 * Lógica pura del rescate de invasores atascados. No toca el juego.
 *
 * Dos casos:
 * - Empotrado: parte del cuerpo dentro de un bloque macizo. El juego no deja entrar en un cubo entero, así que
 *   quien lo pisa por dentro está bugeado (lo empujó la multitud, apareció ahí...).
 * - Encajado: entre bloques, sin estar dentro de ninguno, y sin poder seguir. Lleva un rato quieto sin pelear.
 */

/**
 * Bloques que no ocupan la casilla entera: una unidad puede estar dentro de su casilla sin estar bugeada
 * (una valla, una losa, una escalera, una puerta abierta...). Para saber si está empotrada no cuentan.
 */
const THIN = /fence|wall|pane|bars|door|slab|stair|ladder|sign|button|lever|rail|pressure_plate|chain|lantern|candle|banner|scaffolding|web|bed$|chest|cake|lectern|enchanting|anvil|cauldron|hopper|campfire|skull|head|flower_pot|decorated_pot|bell|grindstone|stonecutter|bamboo|reeds|sugar_cane|kelp|seagrass|crop|wheat|carrots|potatoes|beetroot|sweet_berry|tall|double_plant|deadbush|sprouts|roots|dripleaf|azalea|cactus|end_rod|lightning_rod|frame|pointed_dripstone|amethyst_bud|cluster|vine|snow_layer|carpet|torch|daylight|sensor|brewing|conduit|repeater|comparator|redstone_wire|tripwire|shrieker|water|lava|air/;

export function isThin(typeId: string): boolean {
  return THIN.test(typeId);
}

/** Medio ancho del cuerpo menos un margen: tocar una pared por fuera no cuenta como estar dentro. */
const INSET = 0.2;
const FEET_HEIGHT = 0.3;
const HEAD_HEIGHT = 1.5;

/** Puntos del cuerpo que se miran: el centro y cuatro esquinas, a la altura de los pies y de la cabeza. */
export function bodySamples(at: Vec3): Vec3[] {
  const columns = [
    [0, 0],
    [INSET, INSET],
    [INSET, -INSET],
    [-INSET, INSET],
    [-INSET, -INSET],
  ];
  const points: Vec3[] = [];
  for (const [dx, dz] of columns) {
    for (const h of [FEET_HEIGHT, HEAD_HEIGHT]) points.push({ x: at.x + dx, y: at.y + h, z: at.z + dz });
  }
  return points;
}

/** Quien no se aleja más que esto de donde estaba no ha avanzado. */
export const STILL_DISTANCE = 1.5;
/** Tantos segundos sin avanzar, y sin pelear, es estar encajado. */
export const STILL_SECONDS = 15;

export interface StillTrack {
  /** Dónde estaba cuando empezó a contar. */
  readonly anchor: Vec3;
  readonly since: number;
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Actualiza la cuenta de quietud: si se ha movido lo bastante, empieza de nuevo desde aquí. */
export function trackStill(prev: StillTrack | undefined, at: Vec3, now: number): StillTrack {
  if (!prev || distance(prev.anchor, at) > STILL_DISTANCE) return { anchor: at, since: now };
  return prev;
}

export function stillFor(track: StillTrack, now: number): number {
  return now - track.since;
}

/** Cerca de un enemigo, cuerpo a cuerpo: está peleando. */
const MELEE_BUSY_H = 5;
const MELEE_BUSY_V = 3;
/** Los magos se quedan quietos disparando a esta distancia de su blanco. */
const CASTER_BUSY = 32;
/** Antes de la brecha, los soldados se apiñan contra el muro: quietos, pero no atascados. */
const GATE_CROWD = 14;

export interface BusyContext {
  readonly caster: boolean;
  readonly breached: boolean;
  /** Aliados y jugadores vivos. */
  readonly enemies: readonly Vec3[];
  /** Delante de cada muro, donde se apiñan. */
  readonly gates: readonly Vec3[];
  /** Detrás de cada muro: a lo que disparan los magos antes de la brecha. */
  readonly objectives: readonly Vec3[];
}

/** ¿Tiene motivo para estar quieto? Peleando, disparando o esperando ante el muro. */
export function isBusy(at: Vec3, ctx: BusyContext): boolean {
  if (ctx.caster) {
    if (ctx.enemies.some((e) => distance(at, e) <= CASTER_BUSY)) return true;
    return !ctx.breached && ctx.objectives.some((o) => distance(at, o) <= CASTER_BUSY);
  }
  if (ctx.enemies.some((e) => Math.hypot(at.x - e.x, at.z - e.z) <= MELEE_BUSY_H && Math.abs(at.y - e.y) <= MELEE_BUSY_V)) return true;
  return !ctx.breached && ctx.gates.some((g) => distance(at, g) <= GATE_CROWD);
}
