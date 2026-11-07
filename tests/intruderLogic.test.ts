import { describe, expect, it } from "vitest";
import { MAPS } from "../scripts/maps";
import { BASE_MARGIN, baseZone, inBase } from "../scripts/systems/intruderLogic";

describe("baseZone", () => {
  for (const map of MAPS) {
    const zone = baseZone(map);

    it(`${map.id}: el castillo entero (aliados, puestos, patio, metas) queda dentro`, () => {
      const inside = [...map.allies.map((a) => a.position), ...(map.defensePosts ?? []).map((p) => p.at), ...(map.rallyPoints ?? []), ...map.gates.map((g) => g.objective)];
      for (const p of inside) expect(inBase(zone, p), `${p.x},${p.y},${p.z}`).toBe(true);
    });

    it(`${map.id}: los puntos de aparición de los invasores quedan fuera`, () => {
      for (const p of [...map.invaderSpawns, ...(map.flankSpawns ?? [])]) expect(inBase(zone, p), `${p.x},${p.y},${p.z}`).toBe(false);
    });
  }

  it("deja holgura alrededor del castillo, pero no cuenta lo que está muy por debajo", () => {
    const map = MAPS[0];
    const zone = baseZone(map);
    const edge = { x: zone.center.x + zone.radius - BASE_MARGIN / 2, y: zone.center.y, z: zone.center.z };
    expect(inBase(zone, edge)).toBe(true);
    expect(inBase(zone, { ...zone.center, y: zone.minY - 1 })).toBe(false);
    expect(inBase(zone, { x: zone.center.x + zone.radius + 1, y: zone.center.y, z: zone.center.z })).toBe(false);
  });
});
