import { describe, expect, it } from "vitest";
import { bodySamples, isBusy, isThin, STILL_DISTANCE, stillFor, trackStill, type BusyContext } from "../scripts/systems/stuckLogic";
import { PASSABLE_DECORATION } from "../scripts/systems/gate";

describe("isThin", () => {
  it("no cuenta lo que no llena su casilla: se puede estar dentro sin estar bugeado", () => {
    for (const id of ["minecraft:oak_fence", "minecraft:cobblestone_wall", "minecraft:spruce_door", "minecraft:stone_brick_slab", "minecraft:oak_stairs", "minecraft:ladder", "minecraft:glass_pane", "minecraft:iron_bars", "minecraft:spruce_trapdoor"]) {
      expect(isThin(id), id).toBe(true);
    }
  });

  it("cuenta los cubos enteros: quien está dentro está empotrado", () => {
    for (const id of ["minecraft:stone_bricks", "minecraft:dark_oak_planks", "minecraft:dirt", "minecraft:oak_leaves", "minecraft:cobblestone", "minecraft:spruce_log", "minecraft:glass"]) {
      expect(isThin(id), id).toBe(false);
    }
  });
});

describe("bodySamples", () => {
  it("mira el centro y cuatro esquinas dentro del cuerpo, a la altura de los pies y de la cabeza", () => {
    const points = bodySamples({ x: 10.5, y: 64, z: 10.5 });
    expect(points).toHaveLength(10);
    for (const p of points) {
      expect(Math.abs(p.x - 10.5)).toBeLessThan(0.3);
      expect(Math.abs(p.z - 10.5)).toBeLessThan(0.3);
      expect(p.y).toBeGreaterThan(64);
      expect(p.y).toBeLessThan(65.8);
    }
  });

  it("tocar una pared por fuera no cuenta: ninguna muestra entra en la casilla de al lado", () => {
    // Pegado a una pared en x = 11: el centro queda a 0.3 de ella.
    const points = bodySamples({ x: 10.7, y: 64, z: 10.5 });
    expect(points.every((p) => Math.floor(p.x) === 10)).toBe(true);
  });
});

describe("trackStill", () => {
  const at = { x: 0, y: 100, z: 0 };

  it("sigue contando mientras no se aleja", () => {
    const first = trackStill(undefined, at, 100);
    const later = trackStill(first, { x: 1, y: 100, z: 0.5 }, 400);
    expect(later).toBe(first);
    expect(stillFor(later, 400)).toBe(300);
  });

  it("empieza de nuevo cuando avanza", () => {
    const first = trackStill(undefined, at, 100);
    const moved = trackStill(first, { x: STILL_DISTANCE + 0.5, y: 100, z: 0 }, 400);
    expect(stillFor(moved, 400)).toBe(0);
  });
});

describe("isBusy", () => {
  const base: BusyContext = {
    caster: false,
    breached: false,
    enemies: [],
    gates: [{ x: 100, y: 100, z: 0 }],
    objectives: [{ x: 110, y: 100, z: 0 }],
  };
  const lost = { x: 0, y: 100, z: 0 };

  it("el soldado solo, lejos del muro, no tiene motivo para estar quieto", () => {
    expect(isBusy(lost, base)).toBe(false);
  });

  it("el soldado junto a un enemigo está peleando, pero no si el enemigo está en otro piso", () => {
    expect(isBusy(lost, { ...base, enemies: [{ x: 3, y: 100, z: 0 }] })).toBe(true);
    expect(isBusy(lost, { ...base, enemies: [{ x: 1, y: 108, z: 0 }] })).toBe(false);
  });

  it("antes de la brecha, el soldado apiñado ante el muro está esperando; después, no", () => {
    const crowd = { x: 92, y: 100, z: 0 };
    expect(isBusy(crowd, base)).toBe(true);
    expect(isBusy(crowd, { ...base, breached: true })).toBe(false);
  });

  it("el mago dispara de lejos: quieto con un enemigo a tiro o, antes de la brecha, con el muro a tiro", () => {
    const caster = { ...base, caster: true };
    expect(isBusy(lost, { ...caster, enemies: [{ x: 25, y: 110, z: 0 }] })).toBe(true);
    expect(isBusy({ x: 85, y: 100, z: 0 }, caster)).toBe(true);
    expect(isBusy({ x: 85, y: 100, z: 0 }, { ...caster, breached: true })).toBe(false);
    expect(isBusy(lost, caster)).toBe(false);
  });
});

describe("PASSABLE_DECORATION", () => {
  it("deja pasar la decoración fina", () => {
    for (const id of ["minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:poppy", "minecraft:torch", "minecraft:white_carpet", "minecraft:red_mushroom", "minecraft:snow_layer", "minecraft:vine", "minecraft:lilac", "minecraft:peony", "minecraft:rose_bush", "minecraft:sunflower", "minecraft:wheat", "minecraft:rail", "minecraft:stone_button", "minecraft:web"]) {
      expect(PASSABLE_DECORATION.test(id), id).toBe(true);
    }
  });

  it("no confunde con decoración los bloques macizos que comparten palabra (el césped, sobre todo)", () => {
    for (const id of ["minecraft:grass_block", "minecraft:grass", "minecraft:brown_mushroom_block", "minecraft:mushroom_stem", "minecraft:flowering_azalea", "minecraft:mangrove_roots", "minecraft:muddy_mangrove_roots"]) {
      expect(PASSABLE_DECORATION.test(id), id).toBe(false);
    }
  });
});
