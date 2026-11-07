import { describe, expect, it } from "vitest";
import { assignTargets, regroup, SQUAD_DEFAULTS, unignore, type GaveUp, type Squad, type SquadUnit } from "../scripts/systems/squadLogic";

const unit = (id: string, side: "ally" | "invader", x: number, z = 0, groupable = true): SquadUnit => ({ id, side, at: { x, y: 0, z }, groupable });
/** `n` unidades en fila, a 1 bloque, desde `x`. */
const line = (prefix: string, side: "ally" | "invader", n: number, x: number, z = 0) => Array.from({ length: n }, (_, i) => unit(`${prefix}${i}`, side, x, z + i));

describe("grupos", () => {
  it("las unidades cercanas forman grupos de 8 como mucho, cada bando por su lado", () => {
    const squads = regroup([], [...line("a", "ally", 10, 0), ...line("i", "invader", 5, 3)]);
    expect(squads.map((s) => [s.side, s.members.length])).toEqual([
      ["ally", 8],
      ["ally", 2],
      ["invader", 5],
    ]);
  });

  it("los jugadores y los que disparan no entran en grupos", () => {
    const squads = regroup([], [unit("jugador", "ally", 0, 0, false), unit("a", "ally", 1)]);
    expect(squads.flatMap((s) => s.members)).toEqual(["a"]);
  });

  it("un grupo conserva su número y su objetivo; pierde a los muertos y a quien se aleja", () => {
    const before: Squad[] = [{ slot: 3, side: "ally", members: ["a", "b", "c", "muerto"], target: "x", state: "advance" }];
    const squads = regroup(before, [unit("a", "ally", 0), unit("b", "ally", 1), unit("c", "ally", 80)]);
    const kept = squads.find((s) => s.slot === 3);
    expect(kept?.members).toEqual(["a", "b"]);
    expect(kept?.target).toBe("x");
    // Quien se alejó forma su propio grupo, con otro número.
    expect(squads.find((s) => s.members.includes("c"))?.slot).not.toBe(3);
  });

  it("dos grupos pequeños cercanos se juntan; dos lejanos no", () => {
    const before: Squad[] = [
      { slot: 0, side: "ally", members: ["a", "b"], state: "advance" },
      { slot: 1, side: "ally", members: ["c"], state: "advance" },
      { slot: 2, side: "ally", members: ["lejos"], state: "advance" },
    ];
    const squads = regroup(before, [unit("a", "ally", 0), unit("b", "ally", 1), unit("c", "ally", 4), unit("lejos", "ally", 60)]);
    expect(squads.map((s) => s.members.length).sort()).toEqual([1, 3]);
  });

  it("sin números libres, las sueltas siguen sueltas", () => {
    const squads = regroup([], line("a", "ally", 30, 0), { ...SQUAD_DEFAULTS, slots: 2 });
    expect(squads.length).toBe(2);
    expect(squads.flatMap((s) => s.members).length).toBe(16);
  });
});

describe("reparto del frente", () => {
  it("cada grupo persigue a un enemigo distinto, separados entre sí", () => {
    // Cuatro grupos aliados en fila frente a una línea de 32 invasores a lo largo de z.
    const allies = [...line("a", "ally", 8, 0, 0), ...line("b", "ally", 8, 0, 20), ...line("c", "ally", 8, 0, 40), ...line("d", "ally", 8, 0, 60)];
    const invaders = line("i", "invader", 64, 20, 0);
    const units = [...allies, ...invaders];
    const squads = regroup([], units);
    assignTargets(squads, units);
    const targets = squads.filter((s) => s.side === "ally").map((s) => units.find((u) => u.id === s.target)!.at.z);
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) expect(Math.abs(targets[i] - targets[j])).toBeGreaterThanOrEqual(8);
  });

  it("avanzan 1,5 grupos por cada grupo enemigo: con 3 contra 1 espera uno, el más lejano", () => {
    const units = [...line("i", "invader", 8, 0), ...line("a", "ally", 8, 10), ...line("b", "ally", 8, 25), ...line("c", "ally", 8, 40)];
    const squads = regroup([], units);
    assignTargets(squads, units);
    const of = (id: string) => squads.find((s) => s.members.includes(id))!;
    expect(of("a0").state).toBe("advance");
    expect(of("b0").state).toBe("advance");
    expect(of("c0").state).toBe("wait");
    expect(of("c0").target).toBeUndefined();
  });

  it("con 1 grupo activo por grupo enemigo, quien tiene el doble deja la mitad esperando", () => {
    const options = { ...SQUAD_DEFAULTS, activePerEnemySquad: 1 };
    const units = [...line("i", "invader", 8, 0), ...line("a", "ally", 8, 10), ...line("b", "ally", 8, 40)];
    const squads = regroup([], units, options);
    assignTargets(squads, units, options);
    expect(squads.find((s) => s.members.includes("a0"))!.state).toBe("advance");
    expect(squads.find((s) => s.members.includes("b0"))!.state).toBe("wait");
  });

  it("sin reserva, todos avanzan", () => {
    const units = [...line("i", "invader", 8, 0), ...line("a", "ally", 8, 10), ...line("b", "ally", 8, 40)];
    const options = { ...SQUAD_DEFAULTS, activePerEnemySquad: Infinity };
    const squads = regroup([], units, options);
    assignTargets(squads, units, options);
    expect(squads.every((s) => s.state === "advance")).toBe(true);
  });

  it("si el enemigo no tiene grupos (jugadores, tiradores, el último reducto), nadie espera", () => {
    const shooters = Array.from({ length: 8 }, (_, i) => unit(`t${i}`, "ally", 0, i, false));
    const units = [...shooters, ...line("i", "invader", 32, 20)];
    const squads = regroup([], units);
    assignTargets(squads, units);
    expect(squads.every((s) => s.state === "advance")).toBe(true);
  });

  it("nadie espera para siempre: pasado `maxWait`, el grupo de reserva avanza aunque el frente esté lleno", () => {
    const options = { ...SQUAD_DEFAULTS, activePerEnemySquad: 1, maxWait: 3 };
    const units = [...line("i", "invader", 8, 0), ...line("a", "ally", 8, 10), ...line("b", "ally", 8, 40)];
    const squads = regroup([], units, options);
    const far = squads.find((s) => s.members.includes("b0"))!;
    const states: string[] = [];
    for (let second = 0; second < 5; second++) {
      assignTargets(squads, units, options);
      states.push(far.state);
    }
    expect(states).toEqual(["wait", "wait", "wait", "advance", "advance"]);
    expect(squads.every((s) => s.state === "advance")).toBe(true);
  });

  it("no reparte objetivos en otro piso: antes que a un arquero en lo alto de una torre, al mismo enemigo que otro grupo", () => {
    // La torre está a 8 bloques del soldado aliado, pero 25 más arriba; para los dos grupos, el soldado está más cerca.
    const tower = { ...unit("torre", "ally", 28, 10, false), at: { x: 28, y: 25, z: 10 } };
    const units = [...line("i", "invader", 8, 0), ...line("j", "invader", 8, 0, 12), unit("a", "ally", 20, 10, false), tower];
    const options = { ...SQUAD_DEFAULTS, activePerEnemySquad: Infinity };
    const squads = regroup([], units, options);
    assignTargets(squads, units, options);
    expect(squads.map((s) => s.target)).toEqual(["a", "a"]);
  });

  it("conserva su objetivo mientras siga vivo; si muere, toma otro", () => {
    const units = [...line("a", "ally", 4, 0), unit("x", "invader", 10), unit("y", "invader", 12)];
    const squads = regroup([], units);
    squads[0].target = "y";
    assignTargets(squads, units);
    expect(squads[0].target).toBe("y");
    const without = units.filter((u) => u.id !== "y");
    assignTargets(squads, without);
    expect(squads[0].target).toBe("x");
  });

  it("sin enemigos, ningún objetivo y nadie espera", () => {
    const units = line("a", "ally", 4, 0);
    const squads = regroup([], units);
    squads[0].state = "wait";
    assignTargets(squads, units);
    expect(squads[0]).toMatchObject({ target: undefined, state: "advance" });
  });

  it("deja al objetivo al que no se acerca (en lo alto de una muralla) y no lo vuelve a elegir", () => {
    const options = { ...SQUAD_DEFAULTS, giveUp: 3 };
    const wall = { ...unit("muralla", "ally", 10, 0, false), at: { x: 10, y: 14, z: 0 } };
    const units = [...line("i", "invader", 4, 0), wall];
    const squads = regroup([], units, options);
    const results: GaveUp[][] = [];
    for (let second = 0; second < 5; second++) results.push(assignTargets(squads, units, options));
    expect(results.map((r) => r.length)).toEqual([0, 0, 0, 1, 0]);
    expect(results[3][0]).toMatchObject({ side: "invader", target: "muralla", members: ["i0", "i1", "i2", "i3"] });
    // Sin otro enemigo, cada unidad hace lo de siempre.
    expect(squads[0]).toMatchObject({ target: undefined, state: "advance", ignored: ["muralla"] });
  });

  it("no deja al objetivo mientras se le acerca o mientras pelea", () => {
    const options = { ...SQUAD_DEFAULTS, giveUp: 3 };
    const far = unit("x", "ally", 40, 0, false);
    const approaching = [...line("i", "invader", 4, 0)];
    const squads = regroup([], [...approaching, far], options);
    for (let second = 0; second < 6; second++) {
      // Avanzan 3 bloques por segundo.
      const moved = approaching.map((u) => ({ ...u, at: { ...u.at, x: second * 3 } }));
      expect(assignTargets(squads, [...moved, far], options)).toEqual([]);
    }
    // Pegados a un enemigo (pelea), aunque no se acerquen al objetivo.
    const fight = [...line("j", "invader", 4, 0), unit("cerca", "ally", 3, 0, false), unit("y", "ally", 3, 12, false)];
    const fighters = regroup([], fight, options);
    for (let second = 0; second < 6; second++) expect(assignTargets(fighters, fight, options)).toEqual([]);
  });

  it("con ruta del director vuelve a contar con el objetivo que dejó, lo conserva en otro piso y no lo deja", () => {
    const options = { ...SQUAD_DEFAULTS, giveUp: 3 };
    const wall = { ...unit("muralla", "ally", 10, 0, false), at: { x: 10, y: 14, z: 0 } };
    const units = [...line("i", "invader", 4, 0), unit("abajo", "ally", 6, 0, false), wall];
    const squads = regroup([], units, options);
    const squad = squads[0];
    squad.ignored = ["muralla"];
    unignore(squad, "muralla");
    expect(squad.ignored).toEqual([]);
    Object.assign(squad, { target: "muralla", guided: true });
    for (let second = 0; second < 6; second++) expect(assignTargets(squads, units, options)).toEqual([]);
    expect(squad).toMatchObject({ target: "muralla", guided: true, state: "advance" });
  });

  it("el grupo guiado no espera en la reserva; si su objetivo muere, deja de ir guiado", () => {
    const units = [...line("i", "invader", 8, 0), ...line("j", "invader", 8, 0, 20), ...line("a", "ally", 8, 10)];
    const squads = regroup([], units, { ...SQUAD_DEFAULTS, activePerEnemySquad: 1 });
    const far = squads.find((s) => s.members.includes("j0"))!;
    Object.assign(far, { target: "a0", guided: true });
    assignTargets(squads, units, { ...SQUAD_DEFAULTS, activePerEnemySquad: 1 });
    expect(far).toMatchObject({ state: "advance", target: "a0", guided: true });
    const withoutA0 = units.filter((u) => u.id !== "a0");
    assignTargets(squads, withoutA0, { ...SQUAD_DEFAULTS, activePerEnemySquad: 1 });
    expect(far.guided).toBe(false);
  });
});
