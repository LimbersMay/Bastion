import type { Vec3 } from "../maps/types";

/**
 * Lógica PURA de los muros: qué bloques se llevan los proyectiles y cuándo hay un hueco por el que
 * pasar. No importa `@minecraft/server`, así que se prueba con `npm test`.
 */

/** Caja de bloques con esquinas inclusivas (en cualquier orden). */
export interface Box {
  readonly from: Vec3;
  readonly to: Vec3;
}

export interface NormalizedBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

export function normalizeBox(box: Box): NormalizedBox {
  return {
    min: { x: Math.min(box.from.x, box.to.x), y: Math.min(box.from.y, box.to.y), z: Math.min(box.from.z, box.to.z) },
    max: { x: Math.max(box.from.x, box.to.x), y: Math.max(box.from.y, box.to.y), z: Math.max(box.from.z, box.to.z) },
  };
}

export function boxVolume(box: Box): number {
  const { min, max } = normalizeBox(box);
  return (max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1);
}

export function inBox(p: Vec3, box: Box): boolean {
  const { min, max } = normalizeBox(box);
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}

/** Cada posición de bloque de la caja. */
export function* boxPositions(box: Box): Generator<Vec3> {
  const { min, max } = normalizeBox(box);
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      for (let z = min.z; z <= max.z; z++) yield { x, y, z };
    }
  }
}

/** Eje del grosor del muro: el horizontal con menos extensión (por donde se atraviesa). */
export function thicknessAxis(box: Box): "x" | "z" {
  const { min, max } = normalizeBox(box);
  return max.x - min.x < max.z - min.z ? "x" : "z";
}

const NEIGHBOURS: readonly Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/**
 * Bloques que se lleva un impacto: el bloque tocado y sus 6 vecinos (forma de cruz), pero solo los
 * que están dentro de alguna de las cajas del muro. Un impacto en el suelo junto al muro también
 * muerde el muro si un vecino cae dentro.
 */
export function bitePositions(hit: Vec3, boxes: readonly Box[]): Vec3[] {
  const out: Vec3[] = [];
  for (const d of NEIGHBOURS) {
    const p = { x: hit.x + d.x, y: hit.y + d.y, z: hit.z + d.z };
    if (boxes.some((b) => inBox(p, b))) out.push(p);
  }
  return out;
}

/** Qué hay en una casilla, visto desde el muro: nada, un bloque del muro o terreno del mapa. */
export type WallCell = "free" | "wall" | "terrain";

/**
 * Sitios a los que apuntar para seguir rompiendo el muro: en cada columna vista desde `outside`, la casilla
 * libre justo delante del primer bloque de muro. Las columnas tapadas por terreno no cuentan, porque desde
 * fuera no se ven. Devuelve el centro de cada casilla, con `y` en su base.
 */
export function aimSpots(box: Box, outside: Vec3, cellAt: (x: number, y: number, z: number) => WallCell): Vec3[] {
  const { min, max } = normalizeBox(box);
  const axis = thicknessAxis(box);
  const [lo, hi] = axis === "z" ? [min.z, max.z] : [min.x, max.x];
  const [acrossLo, acrossHi] = axis === "z" ? [min.x, max.x] : [min.z, max.z];
  const fromLow = (axis === "z" ? outside.z : outside.x) < lo;
  const step = fromLow ? 1 : -1;
  const first = fromLow ? lo : hi;
  const cell = (a: number, y: number, t: number): WallCell => (axis === "z" ? cellAt(a, y, t) : cellAt(t, y, a));
  const out: Vec3[] = [];

  for (let a = acrossLo; a <= acrossHi; a++) {
    for (let y = min.y; y <= max.y; y++) {
      if (cell(a, y, first - step) !== "free") continue;
      for (let i = 0; i <= hi - lo; i++) {
        const t = first + step * i;
        const here = cell(a, y, t);
        if (here === "terrain") break;
        if (here === "wall") {
          const before = t - step;
          out.push(axis === "z" ? { x: a + 0.5, y, z: before + 0.5 } : { x: before + 0.5, y, z: a + 0.5 });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Busca un hueco por el que pueda pasar un soldado: una columna (x o z según el grosor) de al menos
 * 2 bloques de alto que esté libre a lo largo de TODO el grosor del muro. El borde inferior del hueco
 * puede estar a lo sumo un bloque sobre la base del muro (un escalón se sube; una ventana alta no).
 * Devuelve el centro del hueco (el más cercano al centro del muro) o `undefined` si el muro sigue cerrado.
 */
export function findOpening(box: Box, isSolid: (x: number, y: number, z: number) => boolean): Vec3 | undefined {
  const { min, max } = normalizeBox(box);
  const axis = thicknessAxis(box);
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  let best: Vec3 | undefined;
  let bestDist = Infinity;

  const across = axis === "z" ? [min.x, max.x] : [min.z, max.z];
  const through = axis === "z" ? [min.z, max.z] : [min.x, max.x];

  for (let a = across[0]; a <= across[1]; a++) {
    for (let y = min.y; y <= Math.min(min.y + 1, max.y - 1); y++) {
      let free = true;
      for (let t = through[0]; t <= through[1] && free; t++) {
        const x = axis === "z" ? a : t;
        const z = axis === "z" ? t : a;
        if (isSolid(x, y, z) || isSolid(x, y + 1, z)) free = false;
      }
      if (!free) continue;
      const centre: Vec3 =
        axis === "z"
          ? { x: a + 0.5, y: y + 1, z: cz + 0.5 }
          : { x: cx + 0.5, y: y + 1, z: a + 0.5 };
      const dist = axis === "z" ? Math.abs(a - cx) : Math.abs(a - cz);
      if (dist < bestDist) {
        best = centre;
        bestDist = dist;
      }
    }
  }
  return best;
}

/** Porcentaje (0-100, redondeado) de muro que queda. Sin muro de partida cuenta como 0. */
export function integrityPercent(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
}
