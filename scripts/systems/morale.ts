import { EntityComponentTypes, system, type Entity } from "@minecraft/server";
import { TICKS_PER_SECOND } from "../constants";
import { isBroken, MORALE_DEFAULTS, nextLayer, threatAround, type Fighter, type Layer, type MoraleOptions } from "./moraleLogic";
import type { Squad } from "./squadLogic";

/** Tras replegarse, un aliado no vuelve a romperse en este tiempo: primero tiene que llegar. */
const COOLDOWN_TICKS = 30 * TICKS_PER_SECOND;

export interface Rout {
  readonly members: readonly Entity[];
  readonly to: Exclude<Layer, "field">;
}

interface Health {
  readonly current: number;
  readonly max: number;
}

function healthOf(entity: Entity): Health | undefined {
  try {
    const h = entity.getComponent(EntityComponentTypes.Health);
    return h ? { current: h.currentValue, max: h.effectiveMax } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * La moral de los grupos aliados (Fase 3): cada segundo mira si algún grupo está superado y castigado
 * (`moraleLogic.ts`) y dice a qué capa del castillo se repliega cada miembro. Lo aplica `siegeManager` con las
 * órdenes (`AllyOrders.fallBack`).
 */
export class Morale {
  /** Mayor vida que llegó a tener cada grupo, por su número. */
  private readonly peaks = new Map<number, number>();
  /** Cuándo se replegó por última vez cada aliado. */
  private readonly brokeAt = new Map<string, number>();

  constructor(private readonly options: MoraleOptions = MORALE_DEFAULTS) {}

  check(
    squads: readonly Squad[],
    entities: ReadonlyMap<string, Entity>,
    enemies: readonly Entity[],
    layerOf: (id: string) => Layer,
    map: { readonly hasCourtyard: boolean; readonly hasKeep: boolean }
  ): Rout[] {
    const now = system.currentTick;
    const live = new Set<number>();
    const foes: Fighter[] = enemies.flatMap((e) => {
      const h = e.isValid ? healthOf(e) : undefined;
      return h ? [{ at: e.location, health: h.current }] : [];
    });
    const routs: Rout[] = [];
    for (const squad of squads) {
      if (squad.side !== "ally") continue;
      live.add(squad.slot);
      const members = squad.members.flatMap((id) => {
        const e = entities.get(id);
        const h = e?.isValid ? healthOf(e) : undefined;
        return e && h ? [{ entity: e, health: h }] : [];
      });
      if (members.length === 0) continue;
      const own = members.reduce((n, m) => n + m.health.current, 0);
      const full = members.reduce((n, m) => n + m.health.max, 0);
      const peak = Math.max(this.peaks.get(squad.slot) ?? 0, full);
      this.peaks.set(squad.slot, peak);
      if (members.some((m) => now - (this.brokeAt.get(m.entity.id) ?? -Infinity) < COOLDOWN_TICKS)) continue;
      const threat = threatAround(
        members.map((m) => ({ at: m.entity.location, health: m.health.current })),
        foes,
        this.options.radius
      );
      if (!isBroken({ own, peak, threat }, this.options)) continue;

      // Cada miembro, a la capa siguiente a la suya. El grupo empieza de cero: tiene que volver a sufrir.
      this.peaks.set(squad.slot, own);
      const byLayer = new Map<Exclude<Layer, "field">, Entity[]>();
      for (const m of members) {
        const to = nextLayer(layerOf(m.entity.id), map);
        if (!to) continue;
        this.brokeAt.set(m.entity.id, now);
        byLayer.set(to, [...(byLayer.get(to) ?? []), m.entity]);
      }
      for (const [to, list] of byLayer) routs.push({ members: list, to });
    }
    for (const slot of [...this.peaks.keys()]) if (!live.has(slot)) this.peaks.delete(slot);
    for (const [id, at] of [...this.brokeAt]) if (now - at >= COOLDOWN_TICKS) this.brokeAt.delete(id);
    return routs;
  }

  clear(): void {
    this.peaks.clear();
    this.brokeAt.clear();
  }
}
