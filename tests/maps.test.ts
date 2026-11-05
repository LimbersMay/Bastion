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

describe("validateMap: muros y meta", () => {
  const base = MAPS[0];
  const gate = base.gates[0];
  const wall = gate.walls[0];

  it("exige al menos un tramo de muro", () => {
    expect(validateMap({ ...base, gates: [{ ...gate, walls: [] }] }).join()).toContain("walls necesita");
  });

  it("rechaza un bloque de muro con estados o mayúsculas", () => {
    expect(validateMap({ ...base, gates: [{ ...gate, walls: [{ ...wall, block: "Planks[wood_type=oak]" }] }] }).join()).toContain("bloque inválido");
  });

  it("rechaza un muro de un solo bloque de alto", () => {
    const flat = { ...wall, to: { ...wall.to, y: wall.from.y } };
    expect(validateMap({ ...base, gates: [{ ...gate, walls: [flat] }] }).join()).toContain("al menos 2 bloques de alto");
  });

  it("rechaza una meta dentro del muro", () => {
    const inside = { x: wall.from.x + 0.5, y: wall.from.y, z: wall.from.z + 0.5 };
    expect(validateMap({ ...base, gates: [{ ...gate, objective: inside }] }).join()).toContain("objective");
  });

  it("rechaza un muro enorme", () => {
    const huge = { ...wall, to: { x: wall.from.x + 100, y: wall.from.y + 100, z: wall.from.z + 100 } };
    expect(validateMap({ ...base, gates: [{ ...gate, walls: [huge] }] }).join()).toContain("demasiado grande");
  });
});
