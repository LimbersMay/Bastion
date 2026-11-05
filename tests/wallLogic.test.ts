import { describe, expect, it } from "vitest";
import { aimSpots, bitePositions, boxVolume, findOpening, inBox, integrityPercent, thicknessAxis, type Box, type WallCell } from "../scripts/systems/wallLogic";

// Muro de 9 de ancho (x 0..8), 4 de alto (y 10..13) y 3 de grosor (z 0..2): se atraviesa por z.
const wall: Box = { from: { x: 0, y: 10, z: 0 }, to: { x: 8, y: 13, z: 2 } };

/** Un mundo de juguete: el conjunto de bloques sólidos. */
function world(solid: Set<string>) {
  return (x: number, y: number, z: number) => solid.has(`${x},${y},${z}`);
}

function fullWall(): Set<string> {
  const s = new Set<string>();
  for (let x = 0; x <= 8; x++) for (let y = 10; y <= 13; y++) for (let z = 0; z <= 2; z++) s.add(`${x},${y},${z}`);
  return s;
}

describe("cajas", () => {
  it("calcula volumen y pertenencia sin importar el orden de las esquinas", () => {
    const flipped: Box = { from: wall.to, to: wall.from };
    expect(boxVolume(wall)).toBe(9 * 4 * 3);
    expect(boxVolume(flipped)).toBe(9 * 4 * 3);
    expect(inBox({ x: 4, y: 11, z: 1 }, flipped)).toBe(true);
    expect(inBox({ x: 9, y: 11, z: 1 }, flipped)).toBe(false);
  });

  it("el grosor es el eje horizontal más corto", () => {
    expect(thicknessAxis(wall)).toBe("z");
    expect(thicknessAxis({ from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 3, z: 8 } })).toBe("x");
  });
});

describe("bitePositions", () => {
  it("devuelve el bloque y sus 6 vecinos cuando están dentro del muro", () => {
    const bite = bitePositions({ x: 4, y: 11, z: 1 }, [wall]);
    expect(bite).toHaveLength(7);
  });

  it("descarta lo que cae fuera del muro", () => {
    const bite = bitePositions({ x: 0, y: 10, z: 0 }, [wall]);
    expect(bite).toHaveLength(4); // centro, +x, +y, +z
    expect(bite.every((p) => inBox(p, wall))).toBe(true);
  });

  it("un impacto en el suelo junto al muro muerde el muro", () => {
    const bite = bitePositions({ x: 4, y: 10, z: -1 }, [wall]);
    expect(bite).toEqual([{ x: 4, y: 10, z: 0 }]);
  });

  it("un impacto lejos no se lleva nada", () => {
    expect(bitePositions({ x: 50, y: 10, z: 50 }, [wall])).toEqual([]);
  });
});

describe("findOpening", () => {
  it("un muro entero no tiene hueco", () => {
    expect(findOpening(wall, world(fullWall()))).toBeUndefined();
  });

  it("detecta un túnel de 2 de alto que atraviesa todo el grosor", () => {
    const s = fullWall();
    for (let z = 0; z <= 2; z++) for (const y of [10, 11]) s.delete(`3,${y},${z}`);
    const open = findOpening(wall, world(s));
    expect(open).toBeDefined();
    expect(open!.x).toBe(3.5);
  });

  it("un agujero que no atraviesa todo el grosor no cuenta", () => {
    const s = fullWall();
    for (const y of [10, 11]) {
      s.delete(`3,${y},0`);
      s.delete(`3,${y},1`);
    }
    expect(findOpening(wall, world(s))).toBeUndefined();
  });

  it("un hueco de 1 de alto no deja pasar", () => {
    const s = fullWall();
    for (let z = 0; z <= 2; z++) s.delete(`3,10,${z}`);
    expect(findOpening(wall, world(s))).toBeUndefined();
  });

  it("una ventana alta (a más de un bloque del suelo) no cuenta", () => {
    const s = fullWall();
    for (let z = 0; z <= 2; z++) for (const y of [12, 13]) s.delete(`3,${y},${z}`);
    expect(findOpening(wall, world(s))).toBeUndefined();
  });

  it("un hueco con un escalón de un bloque sí cuenta", () => {
    const s = fullWall();
    for (let z = 0; z <= 2; z++) for (const y of [11, 12]) s.delete(`3,${y},${z}`);
    expect(findOpening(wall, world(s))).toBeDefined();
  });

  it("elige el hueco más cercano al centro", () => {
    const s = fullWall();
    for (const x of [1, 4]) for (let z = 0; z <= 2; z++) for (const y of [10, 11]) s.delete(`${x},${y},${z}`);
    expect(findOpening(wall, world(s))!.x).toBe(4.5);
  });

  it("funciona con muros que se atraviesan por x", () => {
    const side: Box = { from: { x: 0, y: 10, z: 0 }, to: { x: 2, y: 13, z: 8 } };
    const s = new Set<string>();
    for (let x = 0; x <= 2; x++) for (let y = 10; y <= 13; y++) for (let z = 0; z <= 8; z++) s.add(`${x},${y},${z}`);
    for (let x = 0; x <= 2; x++) for (const y of [10, 11]) s.delete(`${x},${y},5`);
    const open = findOpening(side, world(s));
    expect(open?.z).toBe(5.5);
  });
});

describe("aimSpots", () => {
  // Muro de 3 de ancho (x 0..2), 2 de alto (y 10..11) y 2 de grosor (z 0..1); los invasores vienen desde z alto.
  const small: Box = { from: { x: 0, y: 10, z: 0 }, to: { x: 2, y: 11, z: 1 } };
  const outside = { x: 1, y: 10, z: 9 };
  const cells = (overrides: Record<string, WallCell> = {}) => (x: number, y: number, z: number): WallCell =>
    overrides[`${x},${y},${z}`] ?? (inBox({ x, y, z }, small) ? "wall" : "free");

  it("con el muro entero apunta delante de la cara exterior", () => {
    const spots = aimSpots(small, outside, cells());
    expect(spots).toHaveLength(6);
    expect(spots).toContainEqual({ x: 0.5, y: 10, z: 2.5 });
    expect(spots.every((s) => s.z === 2.5)).toBe(true);
  });

  it("si falta el bloque exterior, apunta al de detrás", () => {
    const spots = aimSpots(small, outside, cells({ "1,10,1": "free" }));
    expect(spots).toContainEqual({ x: 1.5, y: 10, z: 1.5 });
    expect(spots).not.toContainEqual({ x: 1.5, y: 10, z: 2.5 });
  });

  it("ignora las columnas tapadas por terreno y las ya abiertas", () => {
    const spots = aimSpots(small, outside, cells({ "0,10,2": "terrain", "1,10,1": "terrain", "2,10,1": "free", "2,10,0": "free" }));
    expect(spots).not.toContainEqual({ x: 0.5, y: 10, z: 2.5 });
    expect(spots.some((s) => s.x === 1.5 && s.y === 10)).toBe(false);
    expect(spots.some((s) => s.x === 2.5 && s.y === 10)).toBe(false);
  });

  it("funciona con un muro que se atraviesa por x, viniendo desde x bajo", () => {
    const side: Box = { from: { x: 0, y: 10, z: 0 }, to: { x: 1, y: 11, z: 2 } };
    const spots = aimSpots(side, { x: -9, y: 10, z: 1 }, (x, y, z) => (inBox({ x, y, z }, side) ? "wall" : "free"));
    expect(spots).toHaveLength(6);
    expect(spots.every((s) => s.x === -0.5)).toBe(true);
  });
});

describe("integrityPercent", () => {
  it("redondea y acota", () => {
    expect(integrityPercent(108, 108)).toBe(100);
    expect(integrityPercent(54, 108)).toBe(50);
    expect(integrityPercent(0, 108)).toBe(0);
    expect(integrityPercent(5, 0)).toBe(0);
    expect(integrityPercent(200, 100)).toBe(100);
  });
});
