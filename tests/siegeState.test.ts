import { describe, expect, it } from "vitest";
import { initialState, isActive, step, type SiegeConfig, type SiegeEvent, type SiegeState } from "../scripts/game/siegeState";

const cfg: SiegeConfig = { totalWaves: 2, countdownTicks: 100, intermissionTicks: 60, lives: 2 };

function run(events: SiegeEvent[], from: SiegeState = initialState(cfg)) {
  let state = from;
  const effects: string[] = [];
  for (const ev of events) {
    const r = step(state, ev, cfg);
    state = r.state;
    effects.push(...r.effects.map((e) => e.type));
  }
  return { state, effects };
}

describe("siegeState", () => {
  it("empieza en idle y start lleva a countdown", () => {
    expect(initialState(cfg).phase).toBe("idle");
    const { state } = run([{ type: "start" }]);
    expect(state.phase).toBe("countdown");
    expect(state.ticksLeft).toBe(100);
  });

  it("start se ignora si la partida ya está en curso", () => {
    const { state } = run([{ type: "start" }, { type: "tick", ticks: 20 }, { type: "start" }]);
    expect(state.ticksLeft).toBe(80);
  });

  it("al agotar la cuenta atrás lanza la oleada 0", () => {
    const { state, effects } = run([{ type: "start" }, { type: "tick", ticks: 100 }]);
    expect(state.phase).toBe("wave");
    expect(state.wave).toBe(0);
    expect(effects).toEqual(["spawnWave"]);
  });

  it("limpiar una oleada intermedia pasa al descanso y luego a la siguiente", () => {
    const { state, effects } = run([
      { type: "start" },
      { type: "tick", ticks: 100 },
      { type: "waveCleared" },
      { type: "tick", ticks: 60 },
    ]);
    expect(state.phase).toBe("wave");
    expect(state.wave).toBe(1);
    expect(effects).toEqual(["spawnWave", "spawnWave"]);
  });

  it("limpiar la última oleada da la victoria", () => {
    const { state, effects } = run([
      { type: "start" },
      { type: "tick", ticks: 100 },
      { type: "waveCleared" },
      { type: "tick", ticks: 60 },
      { type: "waveCleared" },
    ]);
    expect(state.phase).toBe("victory");
    expect(effects[effects.length - 1]).toBe("victory");
  });

  it("waveCleared fuera de la fase wave no hace nada", () => {
    const { state, effects } = run([{ type: "start" }, { type: "waveCleared" }]);
    expect(state.phase).toBe("countdown");
    expect(effects).toEqual([]);
  });

  it("la puerta destruida provoca la brecha una sola vez y no cambia de fase", () => {
    const { state, effects } = run([
      { type: "start" },
      { type: "tick", ticks: 100 },
      { type: "gateDestroyed" },
      { type: "gateDestroyed" },
    ]);
    expect(state.breached).toBe(true);
    expect(state.phase).toBe("wave");
    expect(effects.filter((e) => e === "breach")).toHaveLength(1);
  });

  it("gateDestroyed con la partida parada se ignora", () => {
    const { state, effects } = run([{ type: "gateDestroyed" }]);
    expect(state.breached).toBe(false);
    expect(effects).toEqual([]);
  });

  it("las muertes de jugadores gastan vidas y al llegar a 0 hay derrota", () => {
    const first = run([{ type: "start" }, { type: "playerDied" }]);
    expect(first.state.lives).toBe(1);
    expect(first.state.phase).toBe("countdown");

    const second = run([{ type: "playerDied" }], first.state);
    expect(second.state.lives).toBe(0);
    expect(second.state.phase).toBe("defeat");
    expect(second.effects).toEqual(["defeat"]);
    expect(isActive(second.state.phase)).toBe(false);
  });

  it("tras la derrota, los ticks y las muertes ya no hacen nada", () => {
    const { state } = run([
      { type: "start" },
      { type: "playerDied" },
      { type: "playerDied" },
      { type: "tick", ticks: 1000 },
      { type: "playerDied" },
    ]);
    expect(state.phase).toBe("defeat");
    expect(state.lives).toBe(0);
  });

  it("reset devuelve al estado inicial", () => {
    const { state } = run([{ type: "start" }, { type: "tick", ticks: 100 }, { type: "gateDestroyed" }, { type: "reset" }]);
    expect(state).toEqual(initialState(cfg));
  });
});
