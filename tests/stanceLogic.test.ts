import { describe, expect, it } from "vitest";
import { MAPS } from "../scripts/maps";
import { GATE_HEIGHT, GATE_REACH, isOutside, outsideGate, shouldHold } from "../scripts/systems/stanceLogic";

describe("medir fuerzas", () => {
  it("con el doble de enemigos que aliados a su lado, aguanta; con menos, sale a buscarlos", () => {
    expect(shouldHold(5, 40, false)).toBe(true);
    expect(shouldHold(3, 6, false)).toBe(true);
    expect(shouldHold(3, 5, false)).toBe(false);
    expect(shouldHold(8, 8, false)).toBe(false);
  });

  it("solo, contra dos, aguanta", () => {
    expect(shouldHold(1, 2, false)).toBe(true);
    expect(shouldHold(0, 2, false)).toBe(true);
    expect(shouldHold(1, 1, false)).toBe(false);
  });

  it("aguantando, no vuelve a salir hasta que la pelea esté más pareja", () => {
    expect(shouldHold(4, 7, true)).toBe(true);
    expect(shouldHold(4, 6, true)).toBe(false);
    expect(shouldHold(4, 7, false)).toBe(false);
  });
});

describe("no salir del castillo", () => {
  // Una puerta en el eje x: fuera hacia +x, dentro hacia -x; el muro en x = 0.
  const gate = { position: { x: 5, y: 100, z: 0 }, objective: { x: -5, y: 100, z: 0 } };
  const at = (x: number, y = 100, z = 0) => ({ x, y, z });

  it("al otro lado del muro está fuera; de este lado, dentro", () => {
    expect(outsideGate(at(3), gate)).toBe(true);
    expect(outsideGate(at(20, 100, 15), gate)).toBe(true);
    expect(outsideGate(at(-1), gate)).toBe(false);
    expect(outsideGate(at(-30, 100, 10), gate)).toBe(false);
  });

  it("en lo alto de una torre o lejos de la puerta no cuenta", () => {
    expect(outsideGate(at(3, 100 + GATE_HEIGHT + 1), gate)).toBe(false);
    expect(outsideGate(at(5 + GATE_REACH + 1), gate)).toBe(false);
  });

  it("basta con estar fuera de una de las puertas", () => {
    const other = { position: { x: 0, y: 100, z: 50 }, objective: { x: 0, y: 100, z: 40 } };
    expect(isOutside(at(0, 100, 48), [gate, other])).toBe(true);
    expect(isOutside(at(-10, 100, 20), [gate, other])).toBe(false);
  });

  it("en todos los mapas, aliados, puestos, patio, torre y salida están dentro", () => {
    for (const map of Object.values(MAPS)) {
      const inside = [
        ...map.allies.map((a) => a.position),
        ...(map.defensePosts ?? []).map((p) => p.at),
        ...(map.rallyPoints ?? []),
        ...(map.keep ? [map.keep] : []),
        ...(map.sortiePoint ? [map.sortiePoint] : []),
        ...(map.reinforcements?.spawns ?? []),
        ...map.gates.map((g) => g.objective),
      ];
      for (const p of inside) expect(isOutside(p, map.gates), `${map.id}: ${JSON.stringify(p)}`).toBe(false);
      for (const g of map.gates) expect(isOutside(g.position, map.gates), `${map.id}: frente de ${g.id}`).toBe(true);
    }
  });
});
