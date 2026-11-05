/**
 * Máquina de estados del asedio. Es una función pura: (estado, evento) -> (estado nuevo, efectos).
 * No importa `@minecraft/server`; quien la usa (siegeManager) aplica los efectos al juego.
 *
 * Fases:
 *   idle -> countdown -> wave -> intermission -> wave -> ... -> victory
 *   defeat se alcanza si se agotan las vidas del equipo.
 *   La brecha (puerta destruida) no cambia de fase: marca `breached` y lanza el efecto "breach".
 */

export type Phase = "idle" | "countdown" | "wave" | "intermission" | "victory" | "defeat";

export interface SiegeConfig {
  readonly totalWaves: number;
  readonly countdownTicks: number;
  readonly intermissionTicks: number;
  readonly lives: number;
}

export interface SiegeState {
  readonly phase: Phase;
  /** Índice de la oleada actual (0..totalWaves-1). -1 si aún no empezó. */
  readonly wave: number;
  readonly ticksLeft: number;
  readonly breached: boolean;
  readonly lives: number;
}

export type SiegeEvent =
  | { readonly type: "start" }
  | { readonly type: "tick"; readonly ticks: number }
  | { readonly type: "gateDestroyed" }
  | { readonly type: "waveCleared" }
  | { readonly type: "playerDied" }
  | { readonly type: "reset" };

export type SiegeEffect =
  | { readonly type: "spawnWave"; readonly wave: number }
  | { readonly type: "breach" }
  | { readonly type: "victory" }
  | { readonly type: "defeat" };

export interface StepResult {
  readonly state: SiegeState;
  readonly effects: readonly SiegeEffect[];
}

export function initialState(cfg: SiegeConfig): SiegeState {
  return { phase: "idle", wave: -1, ticksLeft: 0, breached: false, lives: cfg.lives };
}

/** Fases en las que la partida está en curso. */
export function isActive(phase: Phase): boolean {
  return phase === "countdown" || phase === "wave" || phase === "intermission";
}

export function step(state: SiegeState, event: SiegeEvent, cfg: SiegeConfig): StepResult {
  switch (event.type) {
    case "reset":
      return { state: initialState(cfg), effects: [] };

    case "start":
      if (state.phase !== "idle") return { state, effects: [] };
      return {
        state: { ...initialState(cfg), phase: "countdown", ticksLeft: cfg.countdownTicks },
        effects: [],
      };

    case "tick": {
      if (state.phase !== "countdown" && state.phase !== "intermission") {
        return { state, effects: [] };
      }
      const ticksLeft = state.ticksLeft - event.ticks;
      if (ticksLeft > 0) return { state: { ...state, ticksLeft }, effects: [] };
      const wave = state.wave + 1;
      return {
        state: { ...state, phase: "wave", wave, ticksLeft: 0 },
        effects: [{ type: "spawnWave", wave }],
      };
    }

    case "waveCleared": {
      if (state.phase !== "wave") return { state, effects: [] };
      if (state.wave + 1 >= cfg.totalWaves) {
        return { state: { ...state, phase: "victory", ticksLeft: 0 }, effects: [{ type: "victory" }] };
      }
      return {
        state: { ...state, phase: "intermission", ticksLeft: cfg.intermissionTicks },
        effects: [],
      };
    }

    case "gateDestroyed":
      if (!isActive(state.phase) || state.breached) return { state, effects: [] };
      return { state: { ...state, breached: true }, effects: [{ type: "breach" }] };

    case "playerDied": {
      if (!isActive(state.phase)) return { state, effects: [] };
      const lives = Math.max(0, state.lives - 1);
      if (lives === 0) {
        return { state: { ...state, lives, phase: "defeat", ticksLeft: 0 }, effects: [{ type: "defeat" }] };
      }
      return { state: { ...state, lives }, effects: [] };
    }
  }
}
