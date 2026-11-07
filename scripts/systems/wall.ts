import type { Dimension, Vector3 } from "@minecraft/server";
import type { GateDef, WallDef } from "../maps/types";
import { PASSABLE_DECORATION } from "./gate";
import { aimSpots, bitePositions, boxPositions, findOpening, normalizeBox, type WallCell } from "./wallLogic";

/**
 * Muros del mundo: se colocan al empezar (solo sobre aire, el terreno se respeta), los proyectiles
 * de los magos se llevan bloques y, cuando queda un hueco por el que cabe un soldado, la puerta se abre.
 * La parte que no depende de Minecraft vive en `wallLogic.ts`.
 */

function typeIdOf(wall: WallDef): string {
  return wall.block.includes(":") ? wall.block : `minecraft:${wall.block}`;
}

function fill(dimension: Dimension, wall: WallDef): void {
  const { min, max } = normalizeBox(wall);
  try {
    // También sobre el fuego que dejan las explosiones: si no, quedarían huecos al reponer el muro.
    for (const old of ["air", "fire"]) {
      dimension.runCommand(`fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} ${wall.block} replace ${old}`);
    }
  } catch (e) {
    console.warn(`[bastion] No se pudo levantar el muro de ${wall.block}: ${e}`);
  }
}

/** Quita un muro de una versión anterior del mapa: sus bloques (solo los de su material) pasan a aire. */
export function removeRetiredWall(dimension: Dimension, wall: WallDef): void {
  const { min, max } = normalizeBox(wall);
  try {
    dimension.runCommand(`fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} air replace ${wall.block}`);
  } catch {
    // Zona sin cargar o sin bloques de ese material: nada que quitar.
  }
}

/** `true` si el bloque de esa posición cuenta como sólido (lo no cargado cuenta como sólido). */
function isSolidAt(dimension: Dimension, x: number, y: number, z: number): boolean {
  try {
    const block = dimension.getBlock({ x, y, z });
    if (!block) return true;
    return !(block.isAir || block.isLiquid || PASSABLE_DECORATION.test(block.typeId));
  } catch {
    return true;
  }
}

/** Levanta (o repone) los muros de una puerta y devuelve cuántos bloques del muro hay. */
export function placeWalls(dimension: Dimension, gate: GateDef): number {
  for (const wall of gate.walls) fill(dimension, wall);
  for (const blocker of gate.blockers ?? []) fill(dimension, { ...blocker, block: "barrier" });
  return countWall(dimension, gate);
}

/** Bloques de muro que quedan en pie (solo los del material del muro, no el terreno). */
export function countWall(dimension: Dimension, gate: GateDef): number {
  let n = 0;
  for (const wall of gate.walls) {
    const id = typeIdOf(wall);
    for (const p of boxPositions(wall)) {
      try {
        if (dimension.getBlock(p)?.typeId === id) n++;
      } catch {
        // chunk sin cargar: no cuenta
      }
    }
  }
  return n;
}

/** Un sitio al azar delante de lo que queda del muro, o `undefined` si desde fuera ya no se ve ningún bloque. */
export function pickAimSpot(dimension: Dimension, gate: GateDef): Vector3 | undefined {
  const spots = gate.walls.flatMap((wall) => {
    const id = typeIdOf(wall);
    const cellAt = (x: number, y: number, z: number): WallCell => {
      if (!isSolidAt(dimension, x, y, z)) return "free";
      try {
        return dimension.getBlock({ x, y, z })?.typeId === id ? "wall" : "terrain";
      } catch {
        return "terrain";
      }
    };
    return aimSpots(wall, gate.position, cellAt);
  });
  return spots[Math.floor(Math.random() * spots.length)];
}

/** El hueco por el que se puede pasar (centro), si alguno de los tramos del muro ya lo tiene. */
export function findGateOpening(dimension: Dimension, gate: GateDef): Vector3 | undefined {
  for (const wall of gate.walls) {
    const opening = findOpening(wall, (x, y, z) => isSolidAt(dimension, x, y, z));
    if (opening) return opening;
  }
  return undefined;
}

/**
 * Un proyectil ha chocado en `hit`: quita los bloques de muro de su alrededor (cruz de 7).
 * Devuelve cuántos ha roto y de qué puerta (0 si no tocó ningún muro).
 */
export function biteWalls(dimension: Dimension, gates: readonly GateDef[], hit: Vector3): { gate?: GateDef; broken: number } {
  let broken = 0;
  let gateHit: GateDef | undefined;
  for (const gate of gates) {
    for (const wall of gate.walls) {
      const id = typeIdOf(wall);
      for (const p of bitePositions(hit, [wall])) {
        try {
          const block = dimension.getBlock(p);
          if (block?.typeId !== id) continue;
          block.setType("minecraft:air");
          broken++;
          gateHit = gate;
        } catch (e) {
          console.warn(`[bastion] No se pudo romper el bloque en ${p.x},${p.y},${p.z}: ${e}`);
        }
      }
    }
  }
  if (broken > 0) {
    const at = { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 };
    try {
      dimension.spawnParticle("minecraft:large_explosion", at);
    } catch {
      // las partículas son un adorno
    }
    try {
      dimension.playSound("dig.wood", at, { volume: 2, pitch: 0.8 });
    } catch {
      // el sonido es un adorno
    }
  }
  return { gate: gateHit, broken };
}
