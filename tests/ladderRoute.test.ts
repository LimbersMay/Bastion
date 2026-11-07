import { describe, expect, it } from "vitest";
import { classifyBlock, FREE, HAZARD, planRoute, SOLID, type Route, type RouteCell } from "../scripts/systems/routeLogic";

/**
 * Escaleras de mano en el planificador (opción `ladders`), sobre terreno liso e irregular: salientes, cornisas,
 * almenas, agua abajo. Suelo irrompible en y = 0 y aire encima, salvo lo que se indique.
 */

const FENCE: RouteCell = { cost: 4, ground: true, noStep: true };
type Blocks = Map<string, RouteCell>;

function world(blocks: Blocks, floor: RouteCell = SOLID) {
  return (x: number, y: number, z: number): RouteCell => blocks.get(`${x},${y},${z}`) ?? (y <= 0 ? floor : FREE);
}

/** Rellena una caja (ambos extremos incluidos). */
function fill(blocks: Blocks, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cell: RouteCell = SOLID): Blocks {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) blocks.set(`${x},${y},${z}`, cell);
  return blocks;
}

const ladders = (route: Route | undefined) => route?.steps.flatMap((s) => (s.ladder ? [s.ladder] : [])) ?? [];

/** Cada casilla de escalera está libre y apoyada en un bloque macizo, detrás de hacia donde mira. */
function expectHeld(route: Route | undefined, cellAt: ReturnType<typeof world>) {
  for (const l of ladders(route)) {
    for (const c of l.cells) {
      expect(cellAt(c.x, c.y, c.z)).toEqual(FREE);
      expect(cellAt(c.x - c.dx, c.y, c.z - c.dz).ground).toBe(true);
    }
  }
}

const OPTS = { ladders: 24, maxNodes: 20000 };

describe("escaleras de mano en el planificador", () => {
  // Torre maciza de 5x5 y 10 de alto, como la del laboratorio: se está de pie arriba en y = 11.
  const tower = () => fill(new Map(), -2, 1, -2, 2, 10, 2);

  it("sin la opción no pone escaleras: desde lo alto de la torre no hay ruta", () => {
    const route = planRoute({ x: 0.5, y: 11, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world(tower()), { maxNodes: 20000 });
    expect(route?.complete ?? false).toBe(false);
  });

  it("baja de la torre por una escalera de toda su altura, pegada a la pared", () => {
    const cellAt = world(tower());
    const route = planRoute({ x: 0.5, y: 11, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    const [l, ...rest] = ladders(route);
    expect(rest).toEqual([]);
    expect(l.up).toBe(false);
    expect(l.cells.map((c) => c.y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expectHeld(route, cellAt);
  });

  it("sube a la torre por una escalera y sale por encima", () => {
    const cellAt = world(tower());
    const route = planRoute({ x: 8.5, y: 1, z: 0.5 }, { x: 0.5, y: 11, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    const [l, ...rest] = ladders(route);
    expect(rest).toEqual([]);
    expect(l.up).toBe(true);
    expect(l.cells.map((c) => c.y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const exit = route!.steps.find((s) => s.ladder);
    expect(exit?.y).toBe(11);
    expectHeld(route, cellAt);
  });

  it("una caída corta se salta, sin escalera", () => {
    const route = planRoute({ x: 0.5, y: 4, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world(fill(new Map(), -2, 1, -2, 2, 3, 2)), OPTS);
    expect(route?.complete).toBe(true);
    expect(ladders(route)).toEqual([]);
  });

  it("acantilado con un saliente a media altura: dos escaleras, con un tramo a pie entre ellas", () => {
    // Meseta hasta x = 2 (de pie en y = 13) y un saliente de x = 3 a 5 (de pie en y = 7), a lo largo de todo z.
    const blocks = fill(fill(new Map(), -10, 1, -30, 2, 12, 30), 3, 1, -30, 5, 6, 30);
    const cellAt = world(blocks);
    const route = planRoute({ x: 0.5, y: 13, z: 0.5 }, { x: 12.5, y: 1, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    const all = ladders(route);
    expect(all.length).toBe(2);
    expect(all.every((l) => !l.up)).toBe(true);
    expectHeld(route, cellAt);
  });

  it("y lo mismo al revés: sube al saliente y después a la meseta", () => {
    const blocks = fill(fill(new Map(), -10, 1, -30, 2, 12, 30), 3, 1, -30, 5, 6, 30);
    const cellAt = world(blocks);
    const route = planRoute({ x: 12.5, y: 1, z: 0.5 }, { x: -2.5, y: 13, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    const all = ladders(route);
    expect(all.length).toBe(2);
    expect(all.every((l) => l.up)).toBe(true);
    expectHeld(route, cellAt);
  });

  it("bajo una cornisa que sobresale no hay pared: busca otra columna donde sí la haya", () => {
    // Acantilado hasta x = 2 y una cornisa en lo alto (y = 12) que sobresale hasta x = 3, salvo de z = 5 a 7.
    const blocks = fill(new Map(), -10, 1, -30, 2, 12, 30);
    fill(blocks, 3, 12, -30, 3, 12, 4);
    fill(blocks, 3, 12, 8, 3, 12, 30);
    const cellAt = world(blocks);
    const route = planRoute({ x: 0.5, y: 13, z: 0.5 }, { x: 10.5, y: 1, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    const [l] = ladders(route);
    expect(l.cells.every((c) => c.z >= 5 && c.z <= 7)).toBe(true);
    expectHeld(route, cellAt);
  });

  it("si la cornisa sobresale por todas partes, no hay escalera posible", () => {
    // La cornisa rodea toda la meseta: por ningún lado hay pared bajo el borde.
    const blocks = fill(new Map(), -10, 1, -30, 2, 12, 30);
    fill(blocks, -11, 12, -31, 3, 12, -31);
    fill(blocks, -11, 12, 31, 3, 12, 31);
    fill(blocks, -11, 12, -31, -11, 12, 31);
    fill(blocks, 3, 12, -31, 3, 12, 31);
    const route = planRoute({ x: 0.5, y: 13, z: 0.5 }, { x: 10.5, y: 1, z: 0.5 }, world(blocks), { ...OPTS, maxNodes: 6000 });
    expect(route?.complete ?? false).toBe(false);
  });

  it("no baja una escalera hasta el agua", () => {
    const blocks = fill(new Map(), -10, 1, -30, 2, 12, 30);
    fill(blocks, 3, 0, -30, 30, 0, 30, HAZARD);
    const route = planRoute({ x: 0.5, y: 13, z: 0.5 }, { x: 10.5, y: 1, z: 0.5 }, world(blocks), { ...OPTS, maxNodes: 6000 });
    expect(ladders(route).some((l) => !l.up)).toBe(false);
  });

  it("muralla con almenas: sube por un hueco entre almenas", () => {
    // Muralla en x = 4 de 6 de alto, con almenas (y = 7) en las z pares.
    const blocks = fill(new Map(), 4, 1, -30, 6, 6, 30);
    for (let z = -30; z <= 30; z += 2) blocks.set(`4,7,${z}`, SOLID);
    const cellAt = world(blocks);
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 5.5, y: 7, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    const [l] = ladders(route);
    expect(l.up).toBe(true);
    expect(Math.abs(l.cells[0].z) % 2).toBe(1);
    expectHeld(route, cellAt);
  });

  it("una valla en lo alto de la muralla impide salir por encima", () => {
    const blocks = fill(new Map(), 4, 1, -30, 6, 6, 30);
    // Valla por todo el borde, por los dos lados y por los extremos.
    fill(blocks, 4, 7, -30, 4, 7, 30, FENCE);
    fill(blocks, 6, 7, -30, 6, 7, 30, FENCE);
    fill(blocks, 4, 7, -30, 6, 7, -30, FENCE);
    fill(blocks, 4, 7, 30, 6, 7, 30, FENCE);
    const route = planRoute({ x: 0.5, y: 1, z: 0.5 }, { x: 5.5, y: 7, z: 0.5 }, world(blocks), { ...OPTS, maxNodes: 6000 });
    expect(ladders(route).some((l) => l.up)).toBe(false);
  });

  it("no pone una escalera más alta que el máximo", () => {
    const route = planRoute({ x: 0.5, y: 11, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, world(tower()), { ladders: 6, maxNodes: 6000 });
    expect(route?.complete ?? false).toBe(false);
  });
});

describe("escaleras de mano: dónde se sostienen", () => {
  it("las losas, escalones y vidrio fino no sostienen una escalera; la losa doble y la piedra sí", () => {
    for (const id of ["minecraft:stone_brick_slab", "minecraft:oak_stairs", "minecraft:glass_pane", "minecraft:cobblestone_wall", "minecraft:oak_trapdoor"]) {
      expect(classifyBlock(id).partial, id).toBe(true);
    }
    for (const id of ["minecraft:stone_bricks", "minecraft:stone_brick_double_slab", "minecraft:oak_planks", "minecraft:glass"]) {
      expect(classifyBlock(id).partial, id).toBeUndefined();
    }
  });

  it("no baja por una cara de losas: busca otra cara entera", () => {
    // Torre de 5x5 y 10 de alto con la cara este (x = 2) de losas: la escalera va por otra cara.
    const SLAB = classifyBlock("minecraft:stone_brick_slab");
    const blocks = fill(fill(new Map(), -2, 1, -2, 1, 10, 2), 2, 1, -2, 2, 10, 2, SLAB);
    const cellAt = world(blocks);
    const route = planRoute({ x: 0.5, y: 11, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    for (const l of ladders(route)) for (const c of l.cells) expect(cellAt(c.x - c.dx, c.y, c.z - c.dz).partial).toBeUndefined();
  });

  it("si toda la torre es de losas, no hay escalera posible", () => {
    const SLAB = classifyBlock("minecraft:stone_brick_slab");
    const cellAt = world(fill(new Map(), -2, 1, -2, 2, 10, 2, SLAB));
    const route = planRoute({ x: 0.5, y: 11, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, cellAt, OPTS);
    expect(ladders(route)).toEqual([]);
  });
});

describe("escaleras de mano: el fuego", () => {
  /** Tablones fuera de la zona de asedio: macizos (no se rompen) y arden, como los deja `routeJobs.ts`. */
  const PLANKS: RouteCell = { ...SOLID, flammable: true };

  it("la madera arde; la piedra no", () => {
    for (const id of ["minecraft:dark_oak_planks", "minecraft:oak_log", "minecraft:white_wool", "minecraft:bookshelf"]) {
      expect(classifyBlock(id).flammable, id).toBe(true);
    }
    for (const id of ["minecraft:stone_bricks", "minecraft:cobblestone", "minecraft:andesite"]) {
      expect(classifyBlock(id).flammable, id).toBeUndefined();
    }
  });

  it("baja por la cara de piedra aunque la de tablones quede más cerca", () => {
    // Torre de 5x5 y 10 de alto: cara este (x = 2) de tablones, el resto de piedra. La meta está al este.
    const cellAt = world(fill(fill(new Map(), -2, 1, -2, 1, 10, 2), 2, 1, -2, 2, 10, 2, PLANKS));
    const route = planRoute({ x: 0.5, y: 11, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    const [l] = ladders(route);
    expect(l).toBeDefined();
    for (const c of l.cells) expect(cellAt(c.x - c.dx, c.y, c.z - c.dz).flammable).toBeUndefined();
  });

  it("si toda la torre es de madera, la usa igual", () => {
    const cellAt = world(fill(new Map(), -2, 1, -2, 2, 10, 2, PLANKS));
    const route = planRoute({ x: 0.5, y: 11, z: 0.5 }, { x: 8.5, y: 1, z: 0.5 }, cellAt, OPTS);
    expect(route?.complete).toBe(true);
    expect(ladders(route).length).toBeGreaterThan(0);
  });
});
