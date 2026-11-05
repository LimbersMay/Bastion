import { describe, expect, it } from "vitest";
import { classifyBlock, FREE, HAZARD, planRoute, SOLID, type RouteCell } from "../scripts/systems/routeLogic";

const STONE: RouteCell = { cost: 6, ground: true };

/** Un mundo de prueba: suelo irrompible en y = 0, aire encima, y los bloques que se indiquen. */
function world(blocks: Record<string, RouteCell> = {}) {
  return (x: number, y: number, z: number): RouteCell => blocks[`${x},${y},${z}`] ?? (y <= 0 ? SOLID : FREE);
}

/** Un muro de piedra a lo largo de todo el eje z en esa x, de `height` bloques de alto. */
function wallAt(x: number, height: number, zFrom = -30, zTo = 30): Record<string, RouteCell> {
  const blocks: Record<string, RouteCell> = {};
  for (let z = zFrom; z <= zTo; z++) for (let y = 1; y <= height; y++) blocks[`${x},${y},${z}`] = STONE;
  return blocks;
}

const breaksOf = (route: ReturnType<typeof planRoute>) => route?.steps.flatMap((s) => s.breaks) ?? [];

describe("planRoute", () => {
  it("en terreno libre camina sin romper nada", () => {
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world());
    expect(route?.complete).toBe(true);
    expect(breaksOf(route)).toEqual([]);
  });

  it("atraviesa un muro largo abriendo un hueco de dos bloques", () => {
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world(wallAt(4, 4)));
    expect(route?.complete).toBe(true);
    expect(breaksOf(route)).toEqual([
      { x: 4, y: 2, z: 0 },
      { x: 4, y: 1, z: 0 },
    ]);
  });

  it("rodea el muro si el rodeo es corto", () => {
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world(wallAt(4, 4, -2, 2)));
    expect(route?.complete).toBe(true);
    expect(breaksOf(route)).toEqual([]);
  });

  it("abre el suelo para bajar hasta quien está debajo", () => {
    const blocks: Record<string, RouteCell> = {};
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) blocks[`${x},5,${z}`] = STONE;
    const route = planRoute({ x: 0.5, y: 6, z: 0.5 }, { x: 0.5, y: 1, z: 0.5 }, world(blocks), { maxFall: 4 });
    expect(route?.complete).toBe(true);
    expect(breaksOf(route)).toContainEqual({ x: 0, y: 5, z: 0 });
  });

  it("no cae más de lo permitido", () => {
    const pit = (x: number, y: number, z: number): RouteCell => (x === 1 ? (y <= -20 ? SOLID : FREE) : y <= 0 ? SOLID : FREE);
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 1.5, y: -19, z: 0.5 }, pit, { maxNodes: 50 });
    expect(route?.complete ?? false).toBe(false);
  });

  it("no pisa agua ni la cruza", () => {
    const blocks: Record<string, RouteCell> = {};
    for (let z = -30; z <= 30; z++) {
      for (const y of [0, 1, 2]) blocks[`4,${y},${z}`] = HAZARD;
    }
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world(blocks), { maxNodes: 300 });
    expect(route?.complete ?? false).toBe(false);
  });

  it("no rompe lo que no se puede romper", () => {
    const blocks: Record<string, RouteCell> = {};
    for (let z = -30; z <= 30; z++) for (let y = 1; y <= 8; y++) blocks[`4,${y},${z}`] = SOLID;
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world(blocks), { maxNodes: 300 });
    expect(route?.complete ?? false).toBe(false);
    expect(breaksOf(route)).toEqual([]);
  });

  it("si se agota el presupuesto devuelve lo más cerca que pudo", () => {
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 500.5, y: 1, z: 0.5 }, world(), { maxNodes: 40 });
    expect(route?.complete).toBe(false);
    expect(route?.steps.length).toBeGreaterThan(5);
  });

  it("sube un peldaño natural sin romperlo", () => {
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 4.5, y: 2, z: 0.5 }, world({ ...wallAt(3, 1) }));
    expect(route?.complete).toBe(true);
    expect(breaksOf(route)).toEqual([]);
  });
});

describe("classifyBlock", () => {
  it("el aire y la decoración se atraviesan", () => {
    for (const id of ["minecraft:air", "minecraft:short_grass", "minecraft:torch", "minecraft:wooden_door", "minecraft:fire"]) {
      expect(classifyBlock(id).cost).toBe(0);
    }
  });

  it("el bloque de hierba es sólido, aunque se llame grass", () => {
    expect(classifyBlock("minecraft:grass_block").ground).toBe(true);
    expect(classifyBlock("minecraft:grass_block").cost).toBeGreaterThan(0);
  });

  it("el agua ni se cruza ni se pisa", () => {
    expect(classifyBlock("minecraft:water")).toEqual(HAZARD);
  });

  it("los cofres y el lecho de roca no se rompen", () => {
    for (const id of ["minecraft:chest", "minecraft:bedrock"]) expect(classifyBlock(id).cost).toBe(Infinity);
  });

  it("la madera cuesta menos que la piedra, y una valla no se sube de un salto", () => {
    expect(classifyBlock("minecraft:spruce_planks").cost).toBeLessThan(classifyBlock("minecraft:stone").cost);
    expect(classifyBlock("minecraft:oak_fence").noStep).toBe(true);
    expect(classifyBlock("minecraft:trapdoor").noStep).toBe(true);
  });
});
