import { describe, expect, it } from "vitest";
import {
  ESCORT_ARRIVED,
  ESCORT_LEASH,
  escortStep,
  HORN_ESCORT,
  isSurrounded,
  pickRescuers,
  RESCUE_DEFAULTS,
  rescueOver,
  rescueTier,
  type RescueTier,
} from "../scripts/systems/rescueLogic";

const at = (x: number, z = 0) => ({ x, y: 0, z });
const ally = (id: string, x: number, tier: RescueTier = 1) => ({ id, at: at(x), tier });

describe("cuerno de rescate", () => {
  it("con 3 invasores a 5 bloques o menos, el jugador está rodeado; con 2, o más lejos, no", () => {
    expect(isSurrounded(at(0), [at(1), at(-2), at(0, 4)])).toBe(true);
    expect(isSurrounded(at(0), [at(1), at(-2)])).toBe(false);
    expect(isSurrounded(at(0), [at(1), at(-2), at(9)])).toBe(false);
  });

  it("acuden los 6 aliados más cercanos a 40 bloques o menos", () => {
    const allies = Array.from({ length: 10 }, (_, i) => ally(`a${i}`, 5 * (i + 1)));
    expect(pickRescuers(at(0), allies)).toEqual(["a0", "a1", "a2", "a3", "a4", "a5"]);
    expect(pickRescuers(at(0), allies, { ...RESCUE_DEFAULTS, reach: 12 })).toEqual(["a0", "a1"]);
  });

  it("con el cuerno en la mano acude una escolta de 4, estén donde estén", () => {
    const allies = Array.from({ length: 10 }, (_, i) => ally(`a${i}`, 100 * (i + 1)));
    expect(pickRescuers(at(0), allies, HORN_ESCORT)).toHaveLength(4);
  });

  it("termina cuando el jugador queda libre o pasa el tiempo", () => {
    expect(rescueOver(at(0), [at(3)], 5)).toBe(false);
    expect(rescueOver(at(0), [at(20)], 5)).toBe(true);
    expect(rescueOver(at(0), [at(3)], 30)).toBe(true);
  });

  it("la escolta del cuerno en la mano no caduca mientras el jugador tenga invasores cerca", () => {
    expect(rescueOver(at(0), [at(3)], 10_000, HORN_ESCORT)).toBe(false);
  });
});

describe("de dónde sale quien acude", () => {
  it("nadie en plena pelea; primero la reserva, luego los sueltos, luego los grupos que avanzan", () => {
    expect(rescueTier("wait", true)).toBeUndefined();
    expect(rescueTier(undefined, true)).toBeUndefined();
    expect(rescueTier("advance", true)).toBeUndefined();
    expect(rescueTier("wait", false)).toBe(0);
    expect(rescueTier(undefined, false)).toBe(1);
    expect(rescueTier("advance", false)).toBe(2);
  });

  it("la reserva lejana va antes que un grupo que avanza cerca; a igual preferencia, el más cercano", () => {
    const allies = [ally("avanza", 5, 2), ally("reserva-lejos", 80, 0), ally("suelto-cerca", 10, 1), ally("reserva-cerca", 30, 0)];
    expect(pickRescuers(at(0), allies, { ...HORN_ESCORT, count: 3 })).toEqual(["reserva-cerca", "reserva-lejos", "suelto-cerca"]);
  });

  it("sin cupo no acude nadie", () => {
    expect(pickRescuers(at(0), [ally("a", 5)], { ...HORN_ESCORT, count: 0 })).toEqual([]);
  });
});

describe("la escolta sigue al jugador", () => {
  it("de camino pasa a vigilar al llegar a su lado", () => {
    expect(escortStep(ESCORT_ARRIVED + 1, "escort")).toBe("escort");
    expect(escortStep(ESCORT_ARRIVED, "escort")).toBe("guard");
  });

  it("vigilando no se mueve por poco; si el jugador se aleja, vuelve a seguirle", () => {
    expect(escortStep(ESCORT_LEASH, "guard")).toBe("guard");
    expect(escortStep(ESCORT_LEASH + 1, "guard")).toBe("escort");
  });

  it("al volver del agua retoma el camino o, si ya está al lado, vigila", () => {
    expect(escortStep(30, "returning")).toBe("escort");
    expect(escortStep(2, "returning")).toBe("guard");
  });
});
