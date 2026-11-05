import { describe, expect, it } from "vitest";
import { castleDemo } from "../scripts/maps/castle-demo";
import { MAPS } from "../scripts/maps";
import type { MapDef } from "../scripts/maps/types";
import { validateMap } from "../scripts/maps/validate";
import { planWave, totalUnits, type WaveDef } from "../scripts/systems/wavePlan";

const wave: WaveDef = {
  groups: [{ unit: "invader_soldier", count: 7 }],
  batchSize: 3,
  batchIntervalTicks: 40,
};

describe("planWave", () => {
  it("genera una orden por unidad", () => {
    expect(planWave(wave, 2)).toHaveLength(7);
    expect(totalUnits(wave)).toBe(7);
  });

  it("reparte los puntos de aparición en rotación", () => {
    const points = planWave(wave, 3).map((o) => o.pointIndex);
    expect(points).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it("agrupa en tandas separadas por el intervalo", () => {
    const delays = planWave(wave, 1).map((o) => o.delayTicks);
    expect(delays).toEqual([0, 0, 0, 40, 40, 40, 80]);
  });

  it("respeta el orden de los grupos", () => {
    const mixed: WaveDef = {
      groups: [
        { unit: "ally_soldier", count: 1 },
        { unit: "invader_soldier", count: 2 },
      ],
      batchSize: 5,
      batchIntervalTicks: 0,
    };
    expect(planWave(mixed, 1).map((o) => o.unit)).toEqual(["ally_soldier", "invader_soldier", "invader_soldier"]);
  });

  it("rechaza parámetros inválidos", () => {
    expect(() => planWave(wave, 0)).toThrow();
    expect(() => planWave({ ...wave, batchSize: 0 }, 1)).toThrow();
    expect(() => planWave({ ...wave, batchIntervalTicks: -1 }, 1)).toThrow();
    expect(() => planWave({ groups: [{ unit: "invader_soldier", count: -2 }], batchSize: 1, batchIntervalTicks: 0 }, 1)).toThrow();
  });
});

describe("validateMap", () => {
  it("todos los mapas registrados son válidos", () => {
    for (const map of MAPS) expect(validateMap(map)).toEqual([]);
  });

  it("detecta los errores más comunes", () => {
    const broken: MapDef = {
      ...castleDemo,
      id: "Mal Id",
      invaderSpawns: [],
      waves: [],
      lives: 0,
      tickingArea: { center: { x: 0, y: 0, z: 0 }, radiusChunks: 9 },
    };
    const errors = validateMap(broken).join("\n");
    expect(errors).toContain("id");
    expect(errors).toContain("invaderSpawns");
    expect(errors).toContain("waves");
    expect(errors).toContain("lives");
    expect(errors).toContain("radiusChunks");
  });
});
