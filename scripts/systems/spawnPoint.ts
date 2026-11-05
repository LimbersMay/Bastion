import type { Block, Dimension } from "@minecraft/server";
import type { Vec3 } from "../maps/types";
import { PASSABLE_DECORATION } from "./gate";

/** Un bloque por el que una unidad puede estar de pie dentro: aire, agua o decoración fina. */
export function isFreeSpace(block: Block | undefined): boolean {
  if (!block) return false;
  return block.isAir || block.isLiquid || PASSABLE_DECORATION.test(block.typeId);
}

/** Sólido para apoyarse: ni aire, ni agua, ni decoración. */
function isGround(block: Block | undefined): boolean {
  return !!block && !isFreeSpace(block);
}

/**
 * Busca en la columna (x, z) un sitio donde cabe una unidad de 2 bloques de alto: dos bloques libres
 * sobre uno sólido. Mira desde `up` bloques por encima de `y` hasta `down` por debajo y devuelve la
 * altura de los pies más cercana a `y`, o `undefined` si no hay (o la zona no está cargada).
 */
export function findStandingY(dimension: Dimension, x: number, y: number, z: number, up = 3, down = 4): number | undefined {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const base = Math.floor(y);
  const offsets: number[] = [0];
  for (let d = 1; d <= Math.max(up, down); d++) {
    if (d <= up) offsets.push(d);
    if (d <= down) offsets.push(-d);
  }
  for (const off of offsets) {
    const feet = base + off;
    try {
      if (
        isFreeSpace(dimension.getBlock({ x: bx, y: feet, z: bz })) &&
        isFreeSpace(dimension.getBlock({ x: bx, y: feet + 1, z: bz })) &&
        isGround(dimension.getBlock({ x: bx, y: feet - 1, z: bz }))
      ) {
        return feet;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Posición libre cerca de `position`: prueba varios desplazamientos aleatorios de hasta `jitter` bloques
 * y, si todos caen en roca o en el vacío, el centro exacto. Evita que las unidades aparezcan dentro de bloques.
 */
export function findSafeSpawn(dimension: Dimension, position: Vec3, jitter: number, tries = 10): Vec3 | undefined {
  for (let i = 0; i < tries; i++) {
    const radius = i === tries - 1 ? 0 : jitter;
    const x = position.x + (Math.random() * 2 - 1) * radius;
    const z = position.z + (Math.random() * 2 - 1) * radius;
    const y = findStandingY(dimension, x, position.y, z);
    if (y !== undefined) return { x, y, z };
  }
  return undefined;
}

/** ¿Está la entidad con los pies o la cabeza dentro de un bloque sólido? */
export function isEmbedded(dimension: Dimension, at: Vec3): boolean {
  try {
    const feet = dimension.getBlock({ x: at.x, y: at.y + 0.6, z: at.z });
    const head = dimension.getBlock({ x: at.x, y: at.y + 1.5, z: at.z });
    if (!feet || !head) return false; // sin cargar: no se puede saber
    return !isFreeSpace(feet) || !isFreeSpace(head);
  } catch {
    return false;
  }
}
