import type { Vec3 } from "../maps/types";

/**
 * Lógica PURA de las balsas: quien cae al agua sube a una balsa que le lleva en línea recta a la orilla de
 * salida de su ruta. Atraca al llegar, si choca con algo y deja de avanzar, o si tarda demasiado.
 */

/** Velocidad de la balsa, en bloques por tick (4 bloques por segundo, algo más que nadando). */
export const RAFT_SPEED = 0.2;
/** A esta distancia en horizontal de la orilla, atraca. */
export const RAFT_REACHED = 3;
/** Si en este tiempo no se acerca medio bloque, ha chocado con la orilla (u otra cosa) y atraca ahí. */
export const RAFT_STALL_TICKS = 30;
export const RAFT_PROGRESS = 0.5;
/** Nadie navega más de un minuto. */
export const RAFT_MAX_TICKS = 60 * 20;
/** Tras atracar, la misma unidad no recibe otra balsa en este tiempo: nada o la empujan. */
export const RAFT_COOLDOWN_TICKS = 10 * 20;
/** Balsas a la vez como mucho; las demás unidades nadan. */
export const MAX_RAFTS = 16;

const flatDistance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

/** El impulso que deja la velocidad horizontal en `RAFT_SPEED` hacia `target`, sin tocar la vertical. */
export function raftImpulse(at: Vec3, target: Vec3, velocity: Vec3): Vec3 {
  const d = flatDistance(at, target);
  const want = d < 0.01 ? { x: 0, z: 0 } : { x: ((target.x - at.x) / d) * RAFT_SPEED, z: ((target.z - at.z) / d) * RAFT_SPEED };
  return { x: want.x - velocity.x, y: 0, z: want.z - velocity.z };
}

/** Rumbo (giro sobre el eje vertical, en grados de Minecraft: 0 = sur, 90 = oeste) hacia `target`. */
export function yawToward(from: Vec3, target: Vec3): number {
  return (Math.atan2(-(target.x - from.x), target.z - from.z) * 180) / Math.PI;
}

/** La travesía de una balsa: decide en cada paso si sigue o atraca. */
export class RaftCourse {
  private best = Infinity;
  private bestAt: number;

  constructor(
    readonly target: Vec3,
    private readonly born: number
  ) {
    this.bestAt = born;
  }

  step(at: Vec3, tick: number): "sail" | "land" {
    const d = flatDistance(at, this.target);
    if (d <= RAFT_REACHED || tick - this.born >= RAFT_MAX_TICKS) return "land";
    if (d < this.best - RAFT_PROGRESS) {
      this.best = d;
      this.bestAt = tick;
      return "sail";
    }
    return tick - this.bestAt >= RAFT_STALL_TICKS ? "land" : "sail";
  }
}
