import type { Vec3 } from "../maps/types";

/** Lógica PURA del regreso a pie: qué ruta tomar y cuándo empujar a quien no avanza nadando. */

/** Segundos nadando sin acercarse a la orilla antes del empujón. */
export const STALL_CHECKS = 3;
/** Acercarse menos que esto no cuenta como avanzar (el oleaje y los empujones de otros mueven un poco). */
export const PROGRESS = 1;
/** Fuerza del empujón: hacia la orilla y un poco hacia arriba, para subir el borde. */
export const NUDGE_HORIZONTAL = 0.6;
export const NUDGE_UP = 0.35;

const flatDistance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

/** La ruta cuya orilla (su primer hito) queda más cerca en horizontal. */
export function nearestRoute(from: Vec3, routes: readonly (readonly Vec3[])[]): number {
  let best = 0;
  routes.forEach((route, r) => {
    if (flatDistance(from, route[0]) < flatDistance(from, routes[best][0])) best = r;
  });
  return best;
}

/** El empujón hacia `target`: horizontal de fuerza fija y algo hacia arriba. */
export function nudgeToward(from: Vec3, target: Vec3): Vec3 {
  const d = flatDistance(from, target);
  if (d < 0.01) return { x: 0, y: NUDGE_UP, z: 0 };
  return { x: ((target.x - from.x) / d) * NUDGE_HORIZONTAL, y: NUDGE_UP, z: ((target.z - from.z) / d) * NUDGE_HORIZONTAL };
}

/** Recuerda lo más cerca que ha estado cada nadador de su orilla. */
export class WaterProgress {
  private readonly swimmers = new Map<string, { best: number; stalls: number }>();

  /** Una revisión (cada segundo). `true` si toca empujarle. */
  check(id: string, at: Vec3, target: Vec3): boolean {
    const d = flatDistance(at, target);
    const rec = this.swimmers.get(id);
    if (!rec || d < rec.best - PROGRESS) {
      this.swimmers.set(id, { best: Math.min(d, rec?.best ?? Infinity), stalls: 0 });
      return false;
    }
    rec.stalls++;
    if (rec.stalls < STALL_CHECKS) return false;
    rec.stalls = 0;
    rec.best = d;
    return true;
  }

  forget(id: string): void {
    this.swimmers.delete(id);
  }

  /** Olvida a quien ya no está regresando (salió, murió o desapareció). */
  keepOnly(ids: ReadonlySet<string>): void {
    for (const id of this.swimmers.keys()) if (!ids.has(id)) this.swimmers.delete(id);
  }
}

/** Segundos quieto, sin enemigos cerca y junto al agua, para dar a alguien por varado. */
export const STRANDED_SECONDS = 12;
/** Moverse menos que esto cuenta como seguir en el mismo sitio. */
export const STILL_DISTANCE = 1.5;

/** Cuántos segundos lleva cada unidad sin moverse del sitio. */
export class Stillness {
  private units = new Map<string, { at: Vec3; still: number }>();
  private seen = new Map<string, { at: Vec3; still: number }>();

  /** Una revisión (cada segundo). Devuelve los segundos que lleva quieto. */
  update(id: string, at: Vec3): number {
    const previous = this.units.get(id);
    const moved = !previous || Math.hypot(at.x - previous.at.x, at.y - previous.at.y, at.z - previous.at.z) >= STILL_DISTANCE;
    const entry = moved ? { at, still: 0 } : { at: previous.at, still: previous.still + 1 };
    this.seen.set(id, entry);
    return entry.still;
  }

  forget(id: string): void {
    this.seen.delete(id);
    this.units.delete(id);
  }

  /** Al final de cada revisión: olvida a quien no se vio en ella. */
  endRound(): void {
    this.units = this.seen;
    this.seen = new Map();
  }
}
