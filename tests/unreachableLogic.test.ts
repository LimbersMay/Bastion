import { describe, expect, it } from "vitest";
import { STALL_SECONDS } from "../scripts/systems/stallLogic";
import type { LadderMove, RouteStep } from "../scripts/systems/routeLogic";
import { descentStep, GUIDE_BUDGET_MAX, guideBudget, UNREACHABLE_DEFAULTS, UnreachableCases, type CaseStatus } from "../scripts/systems/unreachableLogic";

const invaderGaveUp = (slot = 1, target = "arquero") => ({ slot, side: "invader" as const, target });
const alive: CaseStatus = { alive: true, reached: false };

describe("casos de inalcanzables", () => {
  it("un grupo que deja a su objetivo abre un caso y pide ruta; el objetivo es del otro bando", () => {
    const cases = new UnreachableCases();
    expect(cases.gaveUp(invaderGaveUp(), false, 0)).toBe(true);
    expect(cases.get("arquero")).toMatchObject({ stage: "search", slot: 1, targetSide: "ally", failures: 0 });
  });

  it("mientras se busca o se guía, otro grupo que lo deja no pide otra ruta", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(1), false, 0);
    expect(cases.gaveUp(invaderGaveUp(2), false, 1)).toBe(false);
    cases.routeFound("arquero", true, 2);
    expect(cases.gaveUp(invaderGaveUp(2), false, 3)).toBe(false);
  });

  it("con ruta completa se guía; sin ella cuenta como fallo", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 0);
    expect(cases.routeFound("arquero", true, 1)).toBe(true);
    expect(cases.get("arquero")?.stage).toBe("guide");

    const other = new UnreachableCases();
    other.gaveUp(invaderGaveUp(), false, 0);
    expect(other.routeFound("arquero", false, 1)).toEqual({ type: "failed", target: "arquero", slot: 1, why: "noRoute" });
    expect(other.get("arquero")).toMatchObject({ stage: "open", failures: 1 });
  });

  it("otro grupo lo vuelve a intentar, hasta 2 fallos; después ya no se buscan rutas", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(1), false, 0);
    cases.routeFound("arquero", false, 1);
    expect(cases.gaveUp(invaderGaveUp(2), false, 2)).toBe(true);
    cases.routeFound("arquero", false, 3);
    expect(cases.gaveUp(invaderGaveUp(3), false, 4)).toBe(false);
  });

  it("con la cola llena se deshace el intento sin contarlo como fallo", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 0);
    cases.cancel("arquero");
    expect(cases.get("arquero")).toBeUndefined();
    expect(cases.gaveUp(invaderGaveUp(), false, 1)).toBe(true);
  });

  it("el grupo guiado que no avanza por la ruta falla; el que avanza, no", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 0);
    cases.routeFound("arquero", true, 0);
    for (let t = 1; t <= 10; t++) expect(cases.tick(t, 0, () => ({ ...alive, progress: t }))).toEqual([]);
    const actions = [];
    for (let t = 11; t <= 11 + UNREACHABLE_DEFAULTS.guideIdle; t++) actions.push(...cases.tick(t, 0, () => ({ ...alive, progress: 10 })));
    expect(actions).toEqual([{ type: "failed", target: "arquero", slot: 1, why: "idle" }]);
  });

  it("si la guía se pierde, falla; si el grupo llega, el caso se cierra", () => {
    const lost = new UnreachableCases();
    lost.gaveUp(invaderGaveUp(), false, 0);
    lost.routeFound("arquero", true, 0);
    expect(lost.tick(1, 0, () => alive)).toEqual([{ type: "failed", target: "arquero", slot: 1, why: "lost" }]);

    const reached = new UnreachableCases();
    reached.gaveUp(invaderGaveUp(), false, 0);
    reached.routeFound("arquero", true, 0);
    expect(reached.tick(1, 0, () => ({ alive: true, reached: true, progress: 3 }))).toEqual([{ type: "close", target: "arquero", why: "reached", slot: 1 }]);
    expect(reached.get("arquero")).toBeUndefined();
  });

  it("si el objetivo muere, el caso se cierra", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 0);
    cases.routeFound("arquero", false, 1);
    expect(cases.tick(2, 60, () => ({ alive: false, reached: false }))).toEqual([{ type: "close", target: "arquero", why: "gone" }]);
  });

  it("tras un fallo baja a pelear, pero solo cuando la pelea lleva 20 s sin bajas", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 0);
    cases.routeFound("arquero", false, 1);
    expect(cases.tick(2, UNREACHABLE_DEFAULTS.quiet - 1, () => alive)).toEqual([]);
    expect(cases.tick(3, UNREACHABLE_DEFAULTS.quiet, () => alive)).toEqual([{ type: "descend", target: "arquero" }]);
    expect(cases.get("arquero")).toBeUndefined();
  });

  it("sin ningún fallo todavía no baja, aunque no haya bajas", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 0);
    expect(cases.tick(1, 100, () => alive)).toEqual([]);
  });

  it("un jugador nunca baja: su caso solo busca rutas", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(1, "jugador"), true, 0);
    cases.routeFound("jugador", false, 1);
    expect(cases.tick(2, 100, () => alive)).toEqual([]);
  });

  it("los aliados que dejan a un invasor también abren caso", () => {
    const cases = new UnreachableCases();
    expect(cases.gaveUp({ slot: 4, side: "ally", target: "invasor" }, false, 0)).toBe(true);
    expect(cases.get("invasor")?.targetSide).toBe("invader");
  });

  it("no abre más casos de la cuenta", () => {
    const cases = new UnreachableCases({ ...UNREACHABLE_DEFAULTS, maxCases: 1 });
    expect(cases.gaveUp(invaderGaveUp(1, "a"), false, 0)).toBe(true);
    expect(cases.gaveUp(invaderGaveUp(2, "b"), false, 0)).toBe(false);
  });

  it("baja antes de que actúe la red de seguridad de los 45 s", () => {
    // La pelea se para en el segundo 0; el grupo se rinde a los 15 s y la ruta falla al momento.
    expect(UNREACHABLE_DEFAULTS.quiet).toBeLessThan(STALL_SECONDS);
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 15);
    cases.routeFound("arquero", false, 17);
    let descendAt: number | undefined;
    for (let t = 18; t < STALL_SECONDS && descendAt === undefined; t++) {
      if (cases.tick(t, t, () => alive).some((a) => a.type === "descend")) descendAt = t;
    }
    expect(descendAt).toBeDefined();
    expect(descendAt!).toBeLessThan(STALL_SECONDS);
  });
});

describe("bajada", () => {
  it("al llegar a su destino ha bajado", () => {
    expect(descentStep({ best: 30, since: 0 }, UNREACHABLE_DEFAULTS.arrived, 5).kind).toBe("arrived");
  });

  it("acercarse renueva el plazo", () => {
    expect(descentStep({ best: 30, since: 0 }, 25, 9)).toEqual({ kind: "wait", track: { best: 25, since: 9 } });
  });

  it("sin acercarse en 10 s, se le lleva con humo", () => {
    expect(descentStep({ best: 30, since: 0 }, 29, 9).kind).toBe("wait");
    expect(descentStep({ best: 30, since: 0 }, 29, 10).kind).toBe("lift");
  });
});

describe("plazo de una ruta guiada", () => {
  const walk = (n: number): RouteStep[] => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, z: 0, breaks: [] }));
  const ladder = (up: boolean, height: number): LadderMove => ({ up, cells: Array.from({ length: height }, (_, i) => ({ x: 0, y: i, z: 0, dx: 1, dz: 0 })) });

  it("una ruta corta tiene el plazo de siempre", () => {
    expect(guideBudget(walk(20))).toBe(UNREACHABLE_DEFAULTS.guideMax);
  });

  it("la ruta de Stonehill (101 pasos, 3 escaleras para subir y 1 para bajar) tiene más de 30 s", () => {
    const steps = walk(101);
    steps[20] = { ...steps[20], ladder: ladder(true, 6) };
    steps[40] = { ...steps[40], ladder: ladder(true, 5) };
    steps[60] = { ...steps[60], ladder: ladder(true, 5) };
    steps[80] = { ...steps[80], ladder: ladder(false, 5) };
    const budget = guideBudget(steps);
    expect(budget).toBeGreaterThan(55);
    expect(budget).toBeLessThanOrEqual(GUIDE_BUDGET_MAX);
  });

  it("tiene tope", () => {
    expect(guideBudget(walk(1000))).toBe(GUIDE_BUDGET_MAX);
  });

  it("el caso falla por tiempo con el plazo de su ruta, y por estar parado igual que antes", () => {
    const cases = new UnreachableCases();
    cases.gaveUp(invaderGaveUp(), false, 0);
    cases.routeFound("arquero", true, 0, 60);
    let p = 0;
    const moving = (): CaseStatus => ({ alive: true, reached: false, progress: p++ });
    for (let t = 1; t < 60; t++) expect(cases.tick(t, 0, moving)).toEqual([]);
    expect(cases.tick(60, 0, moving)).toEqual([{ type: "failed", target: "arquero", slot: 1, why: "timeout" }]);

    const idle = new UnreachableCases();
    idle.gaveUp(invaderGaveUp(), false, 0);
    idle.routeFound("arquero", true, 0, 60);
    const still: CaseStatus = { alive: true, reached: false, progress: 0 };
    idle.tick(1, 0, () => still);
    expect(idle.tick(1 + UNREACHABLE_DEFAULTS.guideIdle, 0, () => still)).toEqual([{ type: "failed", target: "arquero", slot: 1, why: "idle" }]);
  });
});
