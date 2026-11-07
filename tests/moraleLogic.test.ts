import { describe, expect, it } from "vitest";
import { isBroken, nextLayer, threatAround } from "../scripts/systems/moraleLogic";

const at = (x: number) => ({ x, y: 0, z: 0 });

describe("moral", () => {
  it("se rompe quien está superado y además ha perdido buena parte de su fuerza", () => {
    // 2 soldados heridos (50 de vida en total) de un grupo que llegó a 480, frente a 5 invasores enteros (200).
    expect(isBroken({ own: 50, peak: 480, threat: 200 })).toBe(true);
  });

  it("no se rompe un grupo entero aunque tenga mucho enemigo delante: primero tiene que sufrir", () => {
    expect(isBroken({ own: 480, peak: 480, threat: 2000 })).toBe(false);
  });

  it("no se rompe un grupo castigado que aún puede con lo que tiene delante", () => {
    expect(isBroken({ own: 100, peak: 480, threat: 120 })).toBe(false);
  });

  it("sin enemigos cerca no hay de qué huir", () => {
    expect(isBroken({ own: 10, peak: 480, threat: 0 })).toBe(false);
  });

  it("la amenaza son los enemigos cerca de algún miembro, no los lejanos", () => {
    const members = [{ at: at(0), health: 60 }, { at: at(20), health: 60 }];
    const enemies = [{ at: at(5), health: 40 }, { at: at(30), health: 40 }, { at: at(100), health: 40 }];
    expect(threatAround(members, enemies, 12)).toBe(80);
  });

  it("de la muralla al patio y del patio a la torre; sin torre, el patio es el final", () => {
    const full = { hasCourtyard: true, hasKeep: true };
    expect(nextLayer("field", full)).toBe("courtyard");
    expect(nextLayer("courtyard", full)).toBe("keep");
    expect(nextLayer("keep", full)).toBeUndefined();
    expect(nextLayer("courtyard", { hasCourtyard: true, hasKeep: false })).toBeUndefined();
    expect(nextLayer("field", { hasCourtyard: false, hasKeep: true })).toBe("keep");
    expect(nextLayer("field", { hasCourtyard: false, hasKeep: false })).toBeUndefined();
  });
});
