import { describe, expect, it } from "vitest";
import { digPlan, hitsToBreak, isUnbreakable } from "../scripts/systems/digLogic";
import { reinforcementsDue } from "../scripts/systems/wavePlan";

const heart = { x: -50, y: 124, z: -437 };

describe("digPlan", () => {
  it("en terreno llano abre un hueco de dos bloques hacia la meta", () => {
    const plan = digPlan({ x: -50.5, y: 124, z: -470.5 }, heart);
    expect(plan).toEqual([
      { x: -51, y: 125, z: -470 },
      { x: -51, y: 124, z: -470 },
    ]);
  });

  it("si la meta queda arriba abre un escalón y deja el bloque que va a pisar", () => {
    const plan = digPlan({ x: -50.5, y: 113, z: -470.5 }, heart);
    expect(plan).toContainEqual({ x: -51, y: 115, z: -471 });
    expect(plan).toContainEqual({ x: -51, y: 115, z: -470 });
    expect(plan).toContainEqual({ x: -51, y: 114, z: -470 });
    expect(plan).not.toContainEqual({ x: -51, y: 113, z: -470 });
  });

  it("avanza por el eje en el que queda más lejos", () => {
    const plan = digPlan({ x: -100.5, y: 124, z: -440.5 }, heart);
    expect(plan.every((b) => b.x === -100 && b.z === -441)).toBe(true);
  });

  it("no cava si ya está dentro, junto al corazón del castillo", () => {
    expect(digPlan({ x: -48, y: 124, z: -432 }, heart)).toEqual([]);
  });

  it("no abre el suelo: quien está por encima de la meta no cava", () => {
    expect(digPlan({ x: -50.5, y: 132, z: -470.5 }, heart)).toEqual([]);
  });
});

describe("dureza de los bloques", () => {
  it("la madera cae de un golpe y la piedra de dos", () => {
    expect(hitsToBreak("minecraft:spruce_planks")).toBe(1);
    expect(hitsToBreak("minecraft:stone")).toBe(2);
  });

  it("no se rompen los bloques del juego ni los que guardan cosas", () => {
    for (const id of ["minecraft:bedrock", "minecraft:barrier", "minecraft:chest", "minecraft:standing_sign", "minecraft:bed"]) {
      expect(isUnbreakable(id)).toBe(true);
    }
    expect(isUnbreakable("minecraft:cobblestone")).toBe(false);
  });
});

describe("reinforcementsDue", () => {
  it("repone hasta el mínimo, tanda a tanda", () => {
    expect(reinforcementsDue(2, 6, 20, 3)).toBe(3);
    expect(reinforcementsDue(5, 6, 20, 3)).toBe(1);
  });

  it("no pasa de lo que queda en la reserva", () => {
    expect(reinforcementsDue(0, 6, 2, 3)).toBe(2);
    expect(reinforcementsDue(0, 6, 0, 3)).toBe(0);
  });

  it("no hace nada con el campo cubierto", () => {
    expect(reinforcementsDue(6, 6, 20, 3)).toBe(0);
    expect(reinforcementsDue(9, 6, 20, 3)).toBe(0);
  });
});
