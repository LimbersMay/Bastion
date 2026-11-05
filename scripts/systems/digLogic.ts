import type { Vec3 } from "../maps/types";

/** Lógica pura de los invasores que derriban paredes: qué bloque toca y cuánto aguanta. No toca el juego. */

/** Tan cerca del corazón del castillo ya no hay pared que abrir: quien está aquí ya ha entrado. */
const HEART_REACHED = 12;

/** Bloques que nadie rompe: los del propio juego, y los que guardan algo que se perdería al romperlos. */
const UNBREAKABLE = /bedrock|barrier|command_block|structure_|border_block|:allow|:deny|portal|light_block|reinforced_deepslate|chest|barrel|shulker|hopper|dispenser|dropper|furnace|smoker|sign|banner|lectern|jukebox|spawner|:bed$/;

/** Un bloque del muro de la puerta aguanta mucho más que una pared: los soldados lo abren despacio, los magos rápido. */
export const GATE_WALL_HITS = 15;

/** Lo blando cae de un golpe; lo demás, de dos. */
const SOFT = /planks|log|wood|fence|door|leaves|wool|glass|hay|bookshelf|ladder|dirt|grass_block|mud|sand|gravel/;

export function isUnbreakable(typeId: string): boolean {
  return UNBREAKABLE.test(typeId);
}

export function hitsToBreak(typeId: string): number {
  return SOFT.test(typeId) ? 1 : 2;
}

/**
 * Bloques que hay que quitar, en orden, para dar UN paso hacia `goal` desde `feet`.
 *
 * Si la meta queda más arriba, abre un escalón: libera el sitio de encima de la cabeza y la parte alta
 * de la casilla de delante, y deja su bloque inferior para pisarlo. Así excavan una rampa en la roca, porque
 * el castillo está sobre un risco. Quien ya está por encima de la meta no cava: nunca abre el suelo que pisa.
 * `reached` es la distancia a la meta a la que ya no hace falta cavar.
 */
export function digPlan(feet: Vec3, goal: Vec3, reached = HEART_REACHED): Vec3[] {
  const dx = goal.x - feet.x;
  const dz = goal.z - feet.z;
  if (dx * dx + dz * dz <= reached ** 2) return [];

  const x = Math.floor(feet.x);
  const y = Math.floor(feet.y);
  const z = Math.floor(feet.z);
  if (y > Math.floor(goal.y) + 1) return [];

  const horizontal = Math.abs(dx) >= Math.abs(dz);
  const ahead = {
    x: x + (horizontal ? Math.sign(dx) : 0),
    z: z + (horizontal ? 0 : Math.sign(dz)),
  };
  if (Math.floor(goal.y) - y >= 2) {
    return [
      { x, y: y + 2, z },
      { x: ahead.x, y: y + 2, z: ahead.z },
      { x: ahead.x, y: y + 1, z: ahead.z },
    ];
  }
  return [
    { x: ahead.x, y: y + 1, z: ahead.z },
    { x: ahead.x, y, z: ahead.z },
  ];
}

/** ¿Está `p` a `margin` bloques o menos de la caja, en cada eje? */
export function nearBox(p: Vec3, box: { readonly from: Vec3; readonly to: Vec3 }, margin: number): boolean {
  const near = (v: number, a: number, b: number) => v >= Math.min(a, b) - margin && v <= Math.max(a, b) + 1 + margin;
  return near(p.x, box.from.x, box.to.x) && near(p.y, box.from.y, box.to.y) && near(p.z, box.from.z, box.to.z);
}
