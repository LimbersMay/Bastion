import { describe, expect, it } from "vitest";
import { advanceProgress, firstPending, markerStep, nearest } from "../scripts/systems/huntLogic";
import type { RouteStep } from "../scripts/systems/routeLogic";

const line = (length: number, breaksAt: Record<number, boolean> = {}): RouteStep[] =>
  Array.from({ length }, (_, x) => ({ x, y: 100, z: 0, breaks: breaksAt[x] ? [{ x, y: 101, z: 0 }] : [] }));
const allSolid = () => true;

describe("nearest", () => {
  it("elige al más cercano, contando la altura", () => {
    const near = { location: { x: 3, y: 100, z: 0 } };
    const above = { location: { x: 0, y: 110, z: 0 } };
    expect(nearest({ x: 0, y: 100, z: 0 }, [above, near])).toBe(near);
  });

  it("sin candidatos no hay presa", () => {
    expect(nearest({ x: 0, y: 0, z: 0 }, [])).toBeUndefined();
  });
});

describe("firstPending", () => {
  it("encuentra el primer paso con un bloque por quitar", () => {
    expect(firstPending(line(20, { 4: true, 6: true }), 0, allSolid)).toBe(4);
  });

  it("ignora lo que ya se rompió", () => {
    expect(firstPending(line(20, { 4: true }), 0, () => false)).toBeUndefined();
  });

  it("no mira más allá de lo que alcanza el marcador", () => {
    expect(firstPending(line(40, { 30: true }), 0, allSolid)).toBeUndefined();
  });
});

describe("advanceProgress", () => {
  const steps = line(30, { 10: true });

  it("avanza hasta el paso más lejano que alguien tiene a 2 bloques o menos", () => {
    expect(advanceProgress(steps, 0, 10, [{ x: 5.5, y: 100, z: 0.5 }])).toBe(7);
  });

  it("no pasa de un bloque sin romper, aunque alguien esté al otro lado", () => {
    expect(advanceProgress(steps, 0, 10, [{ x: 12.5, y: 100, z: 0.5 }])).toBe(0);
  });

  it("no cuenta a quien está en otro piso", () => {
    expect(advanceProgress(steps, 0, 10, [{ x: 5.5, y: 105, z: 0.5 }])).toBe(0);
  });

  it("sin nadie cerca, se queda donde estaba", () => {
    expect(advanceProgress(steps, 3, 10, [{ x: 28, y: 100, z: 20 }])).toBe(3);
  });
});

describe("markerStep", () => {
  it("va unos pasos por delante", () => {
    expect(markerStep(2, undefined, 30)).toBe(10);
  });

  it("no se sale de la ruta", () => {
    expect(markerStep(28, undefined, 30)).toBe(30);
  });

  it("espera justo antes de lo que hay que romper", () => {
    expect(markerStep(2, 6, 30)).toBe(5);
    expect(markerStep(6, 6, 30)).toBe(6);
  });
});
