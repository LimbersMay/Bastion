import type { Side } from "../units/catalog";
import { CLIMB_PER_TICK, DESCEND_PER_TICK } from "./ladderLogic";
import type { RouteStep } from "./routeLogic";

/**
 * Lógica PURA del director de inalcanzables (elegido por Limbers, 2026-11-07; ver docs/IA.md). Cuando un grupo
 * deja a su objetivo porque no se le acerca (`GaveUp` de `squadLogic.ts`), se abre un caso para ese objetivo, de
 * cualquier bando, que sube por una escalera de pasos:
 *
 * 1. **Ruta a pie:** se busca camino desde el grupo hasta el objetivo y, si llega, se guía al grupo por ella. Si
 *    no llega, o el grupo guiado no avanza, cuenta como un fallo; otro grupo que lo deje lo vuelve a intentar,
 *    hasta `attempts` fallos.
 * 2. **Tropas adecuadas:** sin hacer. Aquí iría llevar tiradores a un sitio con vista o, cuando las haya, mandar
 *    unidades aéreas; el caso pasaría por este paso antes de bajar.
 * 3. **Baja a pelear:** con algún fallo y la pelea `quiet` segundos sin bajas, el inalcanzable baja por su cuenta
 *    (como el último reducto). Se espera a que no haya bajas para no mover al arquero de la muralla que sigue
 *    disparando. Un jugador nunca baja: su caso solo busca rutas.
 *
 * `quiet` es menor que la red de seguridad (`STALL_SECONDS` en `stallLogic.ts`), que cuenta además los bloques
 * rotos: el director actúa antes de que los invasores atascados abandonen el asedio. El tiempo va en segundos.
 */

export interface UnreachableOptions {
  /** Fallos tras los que ya no se buscan más rutas hasta ese objetivo. */
  readonly attempts: number;
  /** Segundos sin avanzar por la ruta tras los que el grupo guiado falla. */
  readonly guideIdle: number;
  /** Segundos como mucho que un grupo va guiado sin llegar, en una ruta corta (ver `guideBudget`). */
  readonly guideMax: number;
  /** Segundos sin bajas en ningún bando para que el inalcanzable baje. */
  readonly quiet: number;
  /** Casos abiertos a la vez, como mucho: acota el coste. */
  readonly maxCases: number;
  /** Segundos que el que baja tiene para acercarse a su destino antes de llevarlo con humo. */
  readonly lift: number;
  /** Acercarse esto cuenta como avanzar en la bajada. */
  readonly liftProgress: number;
  /** A esta distancia de su destino ya ha bajado. */
  readonly arrived: number;
}

export const UNREACHABLE_DEFAULTS: UnreachableOptions = { attempts: 2, guideIdle: 12, guideMax: 30, quiet: 20, maxCases: 16, lift: 10, liftProgress: 2, arrived: 6 };

/** `search`: esperando la ruta. `guide`: un grupo va por ella. `open`: sin nadie intentándolo. */
export type CaseStage = "search" | "guide" | "open";

export interface UnreachableCase {
  readonly target: string;
  readonly targetSide: Side;
  readonly player: boolean;
  stage: CaseStage;
  /** Grupo que lo intenta ahora. */
  slot?: number;
  failures: number;
  /** Cuándo empezó la etapa. */
  since: number;
  /** Segundos que tiene el grupo guiado para llegar por esta ruta. */
  limit?: number;
  /** Último paso de la ruta al que llegó el grupo guiado, y cuándo. */
  progress?: number;
  movedAt?: number;
}

export type CaseAction =
  | { readonly type: "failed"; readonly target: string; readonly slot: number; readonly why: "noRoute" | "idle" | "timeout" | "lost" }
  | { readonly type: "descend"; readonly target: string }
  | { readonly type: "close"; readonly target: string; readonly why: "gone" | "reached"; readonly slot?: number };

/** Lo que el que llama sabe de cada caso en cada revisión. */
export interface CaseStatus {
  readonly alive: boolean;
  /** Un enemigo ya pelea con él. */
  readonly reached: boolean;
  /** Paso de la ruta del grupo guiado; `undefined` si la guía terminó o se perdió. */
  readonly progress?: number;
  /** Alguien del grupo va por una escalera de mano (`ladders.ts`): cuenta como avanzar. */
  readonly busy?: boolean;
}

export interface GaveUpTarget {
  readonly slot: number;
  /** Bando del grupo que lo deja; el objetivo es del otro. */
  readonly side: Side;
  readonly target: string;
}

export class UnreachableCases {
  private readonly cases = new Map<string, UnreachableCase>();

  constructor(private readonly o: UnreachableOptions = UNREACHABLE_DEFAULTS) {}

  get all(): readonly UnreachableCase[] {
    return [...this.cases.values()];
  }

  get(target: string): UnreachableCase | undefined {
    return this.cases.get(target);
  }

  /**
   * Un grupo deja a su objetivo. `true` si hay que buscarle ruta; `false` si ya se intenta, ya se agotaron los
   * intentos o hay demasiados casos: entonces el grupo hace lo de antes del director.
   */
  gaveUp(g: GaveUpTarget, player: boolean, now: number): boolean {
    let c = this.cases.get(g.target);
    if (!c) {
      if (this.cases.size >= this.o.maxCases) return false;
      c = { target: g.target, targetSide: g.side === "ally" ? "invader" : "ally", player, stage: "open", failures: 0, since: now };
      this.cases.set(g.target, c);
    }
    if (c.stage !== "open" || c.failures >= this.o.attempts) return false;
    c.stage = "search";
    c.slot = g.slot;
    c.since = now;
    return true;
  }

  /** No se pudo pedir la búsqueda (cola llena): el caso vuelve a esperar, sin contarlo como fallo. */
  cancel(target: string): void {
    const c = this.cases.get(target);
    if (!c || c.stage !== "search") return;
    c.stage = "open";
    c.slot = undefined;
    if (c.failures === 0) this.cases.delete(target);
  }

  /**
   * Llegó la ruta pedida por `gaveUp`. `true` si hay que guiar al grupo por ella; si no, el fallo. `limit`: segundos
   * para llegar por ella (`guideBudget`); sin él, `guideMax`.
   */
  routeFound(target: string, complete: boolean, now: number, limit?: number): CaseAction | true | undefined {
    const c = this.cases.get(target);
    if (!c || c.stage !== "search") return undefined;
    if (!complete) return this.fail(c, now, "noRoute");
    c.stage = "guide";
    c.since = now;
    c.limit = Math.max(limit ?? 0, this.o.guideMax);
    c.progress = undefined;
    c.movedAt = now;
    return true;
  }

  /** La guía no se pudo poner (sin rastros libres, el grupo ya no existe...): cuenta como fallo. */
  guideFailed(target: string, now: number): CaseAction | undefined {
    const c = this.cases.get(target);
    return c && c.stage === "guide" ? this.fail(c, now, "lost") : undefined;
  }

  /** Revisión de cada segundo. `quiet`: segundos desde la última baja de cualquier bando. */
  tick(now: number, quiet: number, status: (c: UnreachableCase) => CaseStatus): CaseAction[] {
    const actions: CaseAction[] = [];
    for (const c of [...this.cases.values()]) {
      const s = status(c);
      if (!s.alive || s.reached) {
        this.cases.delete(c.target);
        actions.push({ type: "close", target: c.target, why: s.alive ? "reached" : "gone", ...(c.stage === "guide" && c.slot !== undefined ? { slot: c.slot } : {}) });
        continue;
      }
      if (c.stage === "guide") {
        if (s.progress === undefined) {
          actions.push(this.fail(c, now, "lost"));
        } else if (s.progress !== c.progress || s.busy) {
          c.progress = s.progress;
          c.movedAt = now;
        }
        if (c.stage === "guide" && now - (c.movedAt ?? c.since) >= this.o.guideIdle) actions.push(this.fail(c, now, "idle"));
        else if (c.stage === "guide" && now - c.since >= (c.limit ?? this.o.guideMax)) actions.push(this.fail(c, now, "timeout"));
      }
      if (c.stage === "open" && c.failures > 0 && !c.player && quiet >= this.o.quiet) {
        this.cases.delete(c.target);
        actions.push({ type: "descend", target: c.target });
      }
    }
    return actions;
  }

  clear(): void {
    this.cases.clear();
  }

  private fail(c: UnreachableCase, now: number, why: "noRoute" | "idle" | "timeout" | "lost"): CaseAction {
    const slot = c.slot ?? -1;
    c.failures++;
    c.stage = "open";
    c.slot = undefined;
    c.since = now;
    c.limit = undefined;
    c.progress = undefined;
    c.movedAt = undefined;
    return { type: "failed", target: c.target, slot, why };
  }
}

/** Segundos por paso de una ruta guiada: un grupo anda más despacio que una criatura sola y se espera en los giros. */
export const GUIDE_STEP_SECONDS = 0.4;
/** Segundos de más por escalera: el grupo se junta al pie o al borde y entra de uno en uno. */
export const GUIDE_LADDER_SECONDS = 4;
/** Tope del plazo de una ruta guiada, por larga que sea. */
export const GUIDE_BUDGET_MAX = 120;

/**
 * Plazo para llegar por una ruta: lo que se tarda en andarla más lo que se tarda en cada escalera, con un mínimo de
 * `guideMax`. En el asedio de Stonehill (v0.1.53) un grupo no llegó en 30 s por una ruta de 101 pasos con 4
 * escaleras aunque iba avanzando. Quedarse parado sigue fallando por `guideIdle`.
 */
export function guideBudget(steps: readonly RouteStep[], o: UnreachableOptions = UNREACHABLE_DEFAULTS): number {
  let seconds = steps.length * GUIDE_STEP_SECONDS;
  for (const s of steps) {
    if (!s.ladder) continue;
    const perTick = s.ladder.up ? CLIMB_PER_TICK : DESCEND_PER_TICK;
    seconds += GUIDE_LADDER_SECONDS + s.ladder.cells.length / (perTick * 20);
  }
  return Math.min(GUIDE_BUDGET_MAX, Math.max(o.guideMax, Math.ceil(seconds)));
}

/** Cómo va quien baja: lo más cerca que ha estado de su destino y desde cuándo. */
export interface DescentTrack {
  readonly best: number;
  readonly since: number;
}

/**
 * Un paso de la bajada. `arrived`: ya está abajo. `lift`: en `lift` segundos no se ha acercado `liftProgress`
 * bloques, así que no tiene camino y se le lleva con humo. Si no, sigue, con su marca al día.
 */
export function descentStep(
  track: DescentTrack,
  distance: number,
  now: number,
  o: UnreachableOptions = UNREACHABLE_DEFAULTS
): { readonly kind: "arrived" } | { readonly kind: "lift" } | { readonly kind: "wait"; readonly track: DescentTrack } {
  if (distance <= o.arrived) return { kind: "arrived" };
  if (distance < track.best - o.liftProgress) return { kind: "wait", track: { best: distance, since: now } };
  if (now - track.since >= o.lift) return { kind: "lift" };
  return { kind: "wait", track };
}
