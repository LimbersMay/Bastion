import type { Dimension } from "@minecraft/server";
import type { BarrierDef } from "../maps/types";

/**
 * Las barricadas son los bloques que cierran físicamente el paso del castillo (por ejemplo, las
 * compuertas de madera del mapa). Se cierran al empezar y se abren cuando cae la puerta.
 */

function fill(dimension: Dimension, b: BarrierDef, block: string): void {
  const [x0, x1] = [Math.min(b.from.x, b.to.x), Math.max(b.from.x, b.to.x)];
  const [y0, y1] = [Math.min(b.from.y, b.to.y), Math.max(b.from.y, b.to.y)];
  const [z0, z1] = [Math.min(b.from.z, b.to.z), Math.max(b.from.z, b.to.z)];
  try {
    dimension.runCommand(`fill ${x0} ${y0} ${z0} ${x1} ${y1} ${z1} ${block}`);
  } catch (e) {
    console.warn(`[bastion] No se pudo rellenar la barricada con ${block}: ${e}`);
  }
}

export function closeBarriers(dimension: Dimension, barriers: readonly BarrierDef[] | undefined): void {
  for (const b of barriers ?? []) fill(dimension, b, b.block);
}

export function openBarriers(dimension: Dimension, barriers: readonly BarrierDef[] | undefined): void {
  for (const b of barriers ?? []) fill(dimension, b, "air");
}

export function barrierCenter(b: BarrierDef): { x: number; y: number; z: number } {
  return {
    x: (b.from.x + b.to.x) / 2 + 0.5,
    y: (b.from.y + b.to.y) / 2 + 0.5,
    z: (b.from.z + b.to.z) / 2 + 0.5,
  };
}
