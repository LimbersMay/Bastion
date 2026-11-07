import { describe, expect, it } from "vitest";
import { NUDGE_HORIZONTAL, NUDGE_UP, nearestRoute, nudgeToward, STALL_CHECKS, Stillness, STRANDED_SECONDS, WaterProgress } from "../scripts/systems/returnLogic";

describe("regreso a pie", () => {
  const routes = [
    [{ x: 60, y: 80, z: -380 }, { x: 50, y: 108, z: -363 }],
    [{ x: 86, y: 80, z: -419 }],
  ];

  it("elige la ruta cuya orilla tiene más cerca, sin contar la altura", () => {
    expect(nearestRoute({ x: 80, y: 79, z: -425 }, routes)).toBe(1);
    expect(nearestRoute({ x: 40, y: 79, z: -370 }, routes)).toBe(0);
    expect(nearestRoute({ x: 0, y: 0, z: 0 }, [routes[1]])).toBe(0);
  });

  it("el empujón va hacia la orilla, con fuerza fija y un poco hacia arriba", () => {
    const v = nudgeToward({ x: 0, y: 79, z: 0 }, { x: 30, y: 80, z: 40 });
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(NUDGE_HORIZONTAL);
    expect(v.x).toBeGreaterThan(0);
    expect(v.z).toBeGreaterThan(0);
    expect(v.y).toBe(NUDGE_UP);
  });

  it("solo empuja a quien lleva varios segundos sin acercarse, y vuelve a esperar tras el empujón", () => {
    const water = new WaterProgress();
    const shore = { x: 50, y: 80, z: 0 };
    const pushes = (positions: number[]) => positions.map((x) => water.check("a", { x, y: 79, z: 0 }, shore));

    expect(pushes([0, 5, 10, 15])).toEqual([false, false, false, false]);
    const stuck = pushes(Array(STALL_CHECKS * 2).fill(15));
    expect(stuck.filter(Boolean)).toHaveLength(2);
    expect(stuck[STALL_CHECKS - 1]).toBe(true);
  });

  it("olvida a quien ya no regresa", () => {
    const water = new WaterProgress();
    const shore = { x: 50, y: 80, z: 0 };
    for (let i = 0; i < STALL_CHECKS - 1; i++) water.check("a", { x: 0, y: 79, z: 0 }, shore);
    water.keepOnly(new Set());
    expect(water.check("a", { x: 0, y: 79, z: 0 }, shore)).toBe(false);
  });
});

describe("varados", () => {
  it("cuenta los segundos quieto y vuelve a cero al moverse o al olvidarlo", () => {
    const s = new Stillness();
    const at = (x: number) => ({ x, y: 90, z: 0 });
    expect(s.update("a", at(0))).toBe(0);
    s.endRound();
    expect(s.update("a", at(0.5))).toBe(1);
    s.endRound();
    expect(s.update("a", at(1))).toBe(2);
    s.endRound();
    expect(s.update("a", at(3))).toBe(0);
    s.endRound();
    expect(s.update("a", at(3))).toBe(1);
    s.forget("a");
    s.endRound();
    expect(s.update("a", at(3))).toBe(0);
  });

  it("olvida a quien no se vio en una revisión", () => {
    const s = new Stillness();
    s.update("a", { x: 0, y: 0, z: 0 });
    s.endRound();
    s.endRound();
    expect(s.update("a", { x: 0, y: 0, z: 0 })).toBe(0);
    expect(STRANDED_SECONDS).toBeGreaterThan(5);
  });
});
