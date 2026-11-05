import { describe, expect, it } from "vitest";
import { MAPS } from "../scripts/maps";
import { validateMap } from "../scripts/maps/validate";

describe("mapas registrados", () => {
  it("hay al menos un mapa y los ids no se repiten", () => {
    expect(MAPS.length).toBeGreaterThan(0);
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(MAPS.length);
  });

  for (const map of MAPS) {
    it(`${map.id} es válido`, () => {
      expect(validateMap(map)).toEqual([]);
    });

    it(`${map.id}: los puntos de invasión están a menos de 70 bloques de alguna puerta`, () => {
      for (const p of map.invaderSpawns) {
        const nearest = Math.min(...map.gates.map((g) => Math.hypot(p.x - g.position.x, p.z - g.position.z)));
        expect(nearest).toBeLessThan(70);
      }
    });
  }
});

describe("validateMap: puertas", () => {
  const base = MAPS[0];
  const gate = base.gates[0];

  it("rechaza un mapa sin puertas", () => {
    expect(validateMap({ ...base, gates: [] }).join()).toContain("gates necesita");
  });

  it("rechaza ids de puerta repetidos", () => {
    expect(validateMap({ ...base, gates: [gate, gate] }).join()).toContain("id repetido");
  });

  it("acepta varias puertas con ids distintos", () => {
    expect(validateMap({ ...base, gates: [gate, { ...gate, id: "south" }] })).toEqual([]);
  });

  it("exige puntos de brecha en cada puerta", () => {
    expect(validateMap({ ...base, gates: [{ ...gate, breachSpawns: [] }] }).join()).toContain("breachSpawns");
  });
});

describe("validateMap: vida de la puerta", () => {
  const base = MAPS[0];
  const gate = base.gates[0];

  it("acepta los tramos de vida conocidos", () => {
    expect(validateMap({ ...base, gates: [{ ...gate, health: 600 }] })).toEqual([]);
  });

  it("rechaza una vida que no es un tramo", () => {
    expect(validateMap({ ...base, gates: [{ ...gate, health: 500 }] }).join()).toContain("health debe ser");
  });
});
