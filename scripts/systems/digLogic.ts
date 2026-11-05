import type { Vec3 } from "../maps/types";

/** Lógica pura de los invasores que derriban paredes: qué bloque toca y cuánto aguanta. No toca el juego. */

/** Tan cerca del corazón del castillo ya no hay pared que abrir: quien está aquí ya ha entrado. */
const HEART_REACHED = 12;

/** Bloques que nadie rompe: los del propio juego, y los que guardan algo que se perdería al romperlos. */
const UNBREAKABLE = /bedrock|barrier|command_block|structure_|border_block|:allow|:deny|portal|light_block|reinforced_deepslate|chest|barrel|shulker|hopper|dispenser|dropper|furnace|smoker|sign|banner|lectern|jukebox|spawner|:bed$/;

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
 */
export function digPlan(feet: Vec3, goal: Vec3): Vec3[] {
  const dx = goal.x - feet.x;
  const dz = goal.z - feet.z;
  if (dx * dx + dz * dz <= HEART_REACHED ** 2) return [];

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
