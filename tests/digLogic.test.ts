import { describe, expect, it } from "vitest";
import { CasualtyLog } from "../scripts/systems/casualties";
import { digPlan, GATE_WALL_HITS, hitsToBreak, inFightRange, isUnbreakable, nearBox } from "../scripts/systems/digLogic";
import { reinforcementsDue } from "../scripts/systems/wavePlan";

const heart = { x: -50, y: 124, z: -437 };

describe("inFightRange", () => {
  const unit = { x: 0, y: 100, z: 0 };

  it("cuenta al enemigo cercano en el mismo piso, aunque esté en un escalón", () => {
    expect(inFightRange(unit, { x: 2, y: 100, z: 2 })).toBe(true);
    expect(inFightRange(unit, { x: 2, y: 101, z: 0 })).toBe(true);
  });

  it("no cuenta al enemigo de otro piso aunque esté justo encima o debajo", () => {
    expect(inFightRange(unit, { x: 0, y: 104, z: 0 })).toBe(false);
    expect(inFightRange(unit, { x: 0, y: 96, z: 0 })).toBe(false);
  });

  it("no cuenta al enemigo lejano", () => {
    expect(inFightRange(unit, { x: 4, y: 100, z: 0 })).toBe(false);
  });
});

describe("digPlan", () => {
  it("en terreno llano abre un hueco de dos bloques hacia la meta", () => {
    const plan = digPlan({ x: -50.5, y: 124, z: -470.5 }, heart, 12);
    expect(plan).toEqual([
      { x: -51, y: 125, z: -470 },
      { x: -51, y: 124, z: -470 },
    ]);
  });

  it("si la meta queda arriba abre un escalón y deja el bloque que va a pisar", () => {
    const plan = digPlan({ x: -50.5, y: 113, z: -470.5 }, heart, 12);
    expect(plan).toContainEqual({ x: -51, y: 115, z: -471 });
    expect(plan).toContainEqual({ x: -51, y: 115, z: -470 });
    expect(plan).toContainEqual({ x: -51, y: 114, z: -470 });
    expect(plan).not.toContainEqual({ x: -51, y: 113, z: -470 });
  });

  it("avanza por el eje en el que queda más lejos", () => {
    const plan = digPlan({ x: -100.5, y: 124, z: -440.5 }, heart, 12);
    expect(plan.every((b) => b.x === -100 && b.z === -441)).toBe(true);
  });

  it("no cava si ya está dentro, junto al corazón del castillo", () => {
    expect(digPlan({ x: -48, y: 124, z: -432 }, heart, 12)).toEqual([]);
  });

  it("no abre el suelo: quien está por encima de la meta no cava", () => {
    expect(digPlan({ x: -50.5, y: 132, z: -470.5 }, heart, 12)).toEqual([]);
  });
});

describe("muro de la puerta", () => {
  const wall = { from: { x: 32, y: 113, z: -417 }, to: { x: 44, y: 116, z: -415 } };
  const objective = { x: 37.5, y: 114, z: -419.5 };

  it("un soldado pegado al muro por fuera lo tiene delante", () => {
    expect(digPlan({ x: 37.5, y: 113, z: -413.5 }, objective, 0.5)).toEqual([
      { x: 37, y: 114, z: -415 },
      { x: 37, y: 113, z: -415 },
    ]);
  });

  it("solo cuenta como cerca quien está junto al muro", () => {
    expect(nearBox({ x: 37.5, y: 113, z: -413.5 }, wall, 2.5)).toBe(true);
    expect(nearBox({ x: 37.5, y: 113, z: -405 }, wall, 2.5)).toBe(false);
  });

  it("aguanta mucho más que una pared normal", () => {
    expect(GATE_WALL_HITS).toBeGreaterThan(hitsToBreak("minecraft:stone") * 5);
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

describe("CasualtyLog", () => {
  it("resume las bajas por bando y causa, de más a menos, y vacía la cuenta", () => {
    const log = new CasualtyLog();
    log.record("ally", "entityExplosion", "bastion:arcane_bolt");
    log.record("ally", "entityAttack", "bastion:invader_soldier");
    log.record("ally", "entityAttack", "bastion:invader_soldier");
    log.record("invader", "fall");
    expect(log.flush()).toBe("Bajas: aliados 3 (entityAttack/invader_soldier 2, entityExplosion/arcane_bolt 1); invasores 1 (fall 1)");
    expect(log.flush()).toBeUndefined();
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
