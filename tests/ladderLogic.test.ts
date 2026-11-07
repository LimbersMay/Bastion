import { describe, expect, it } from "vitest";
import { advanceWithLadders, firstLadder, markerStep } from "../scripts/systems/huntLogic";
import { atEntry, CLIMB_PER_TICK, DESCEND_PER_TICK, facingDirection, ladderSteps, rideNext, rideStart, rideTimeout } from "../scripts/systems/ladderLogic";
import type { LadderMove, RouteStep } from "../scripts/systems/routeLogic";

/** Escalera de 10 en la columna x = 3, z = 0, apoyada en la pared de x = 2 (mira al este), de y = 1 a 10. */
const column = (up: boolean): LadderMove => ({ up, cells: Array.from({ length: 10 }, (_, i) => ({ x: 3, y: 1 + i, z: 0, dx: 1, dz: 0 })) });

const step = (x: number, y: number, z: number, ladder?: LadderMove): RouteStep => ({ x, y, z, breaks: [], ...(ladder ? { ladder } : {}) });

/** Bajar de la torre: por arriba hasta el borde, la escalera hasta el suelo y unos pasos más. */
const down: RouteStep[] = [step(0, 11, 0), step(1, 11, 0), step(2, 11, 0), step(3, 1, 0, column(false)), step(4, 1, 0), step(5, 1, 0), step(6, 1, 0)];

describe("escaleras: lógica", () => {
  it("la escalera mira de la pared hacia fuera", () => {
    expect(facingDirection(1, 0)).toBe(5);
    expect(facingDirection(-1, 0)).toBe(4);
    expect(facingDirection(0, 1)).toBe(3);
    expect(facingDirection(0, -1)).toBe(2);
  });

  it("la entrada de cada escalera es el paso anterior", () => {
    const [l, ...rest] = ladderSteps(down);
    expect(rest).toEqual([]);
    expect(l.index).toBe(3);
    expect(l.entry).toEqual(down[2]);
  });

  it("solo se entra junto a la entrada y a su altura", () => {
    const entry = down[2];
    expect(atEntry({ x: 1.5, y: 11, z: 0.5 }, entry, 3)).toBe(true);
    expect(atEntry({ x: 6.5, y: 11, z: 0.5 }, entry, 3)).toBe(false);
    expect(atEntry({ x: 2.5, y: 1, z: 0.5 }, entry, 3)).toBe(false);
  });

  it("al bajar se empieza arriba y se llega abajo a la velocidad medida en el laboratorio", () => {
    const l = column(false);
    let at = rideStart(l, { x: 2.5, y: 11, z: 0.5 });
    expect(at).toEqual({ x: 3.5, y: 10, z: 0.5 });
    let ticks = 0;
    for (let r = rideNext(at.y, l); !r.done; r = rideNext(at.y, l)) {
      at = { ...at, y: r.y };
      ticks++;
    }
    expect(at.y).toBeCloseTo(1, 1);
    expect(Math.abs(ticks - 9 / DESCEND_PER_TICK)).toBeLessThanOrEqual(1);
    expect(ticks).toBeLessThan(rideTimeout(l));
  });

  it("al subir se empieza al pie y termina al asomar por encima", () => {
    const l = column(true);
    let y = rideStart(l, { x: 3.5, y: 1, z: 0.5 }).y;
    let ticks = 0;
    for (let r = rideNext(y, l); !r.done; r = rideNext(y, l)) {
      y = r.y;
      ticks++;
    }
    expect(y).toBeGreaterThanOrEqual(10.8);
    expect(ticks / 20).toBeCloseTo(10 / (CLIMB_PER_TICK * 20), 0);
    expect(ticks).toBeLessThan(rideTimeout(l));
  });
});

describe("escaleras: el marcador del grupo", () => {
  it("espera en la entrada de la escalera", () => {
    const ladder = firstLadder(down, 0);
    expect(ladder).toBe(3);
    expect(markerStep(0, ladder, down.length - 1)).toBe(2);
  });

  it("nadie pasa de la escalera por estar cerca de lo que hay detrás", () => {
    // Arriba junto al borde: llega hasta el paso 2, no más.
    expect(advanceWithLadders(down, 0, undefined, [{ x: 2.5, y: 11, z: 0.5 }])).toBe(2);
  });

  it("en cuanto alguien llega abajo, el grupo cuenta como pasado y el marcador sigue", () => {
    const progress = advanceWithLadders(down, 2, undefined, [{ x: 3.5, y: 1, z: 0.5 }]);
    expect(progress).toBe(3);
    expect(firstLadder(down, progress)).toBeUndefined();
    expect(markerStep(progress, undefined, down.length - 1)).toBe(down.length - 1);
  });

  it("si hay bloques por quitar antes de la escalera, manda lo primero", () => {
    expect(advanceWithLadders(down, 0, 1, [{ x: 2.5, y: 11, z: 0.5 }])).toBe(0);
  });
});
