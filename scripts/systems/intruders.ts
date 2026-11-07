import { system, world, type Dimension, type Entity } from "@minecraft/server";
import { INTRUDER_TAG, TICKS_PER_SECOND } from "../constants";
import type { MapDef } from "../maps/types";
import { baseZone, inBase, THREAT_SECONDS, type BaseZone } from "./intruderLogic";

/** Familia de todos los monstruos del juego (zombis, creepers, endermen, brujas...). */
const MONSTER = "monster";

/**
 * Marca a los monstruos del juego a los que los aliados deben ir a buscar (`INTRUDER_TAG`): los que están dentro
 * del castillo y los que han atacado a un jugador hace menos de `THREAT_SECONDS`. Al resto solo los atacan si
 * los tienen encima (lo decide su comportamiento, en `tools/units/behavior.ts`). Y siempre después de los
 * invasores.
 */
export class Intruders {
  private readonly zone: BaseZone;
  /** Monstruos que han atacado a un jugador y hasta qué tick siguen marcados. */
  private readonly threats = new Map<string, number>();

  constructor(
    private readonly dimension: Dimension,
    map: MapDef
  ) {
    this.zone = baseZone(map);
  }

  /** Lo llama main.ts cuando algo hiere a un jugador. */
  onPlayerHurt(attacker: Entity | undefined): void {
    if (!attacker?.isValid || !attacker.matches({ families: [MONSTER] })) return;
    this.threats.set(attacker.id, system.currentTick + THREAT_SECONDS * TICKS_PER_SECOND);
    this.mark(attacker, true);
  }

  /** Una vez por segundo: pone la marca a quien entra o ataca y se la quita a quien ya no. */
  tick(): void {
    const now = system.currentTick;
    const wanted = new Set<string>();
    const { center, radius, minY, maxY } = this.zone;
    const reach = Math.hypot(radius, Math.max(maxY - center.y, center.y - minY));
    for (const mob of this.dimension.getEntities({ families: [MONSTER], location: center, maxDistance: reach })) {
      if (!mob.isValid || !inBase(this.zone, mob.location)) continue;
      wanted.add(mob.id);
      this.mark(mob, true);
    }
    for (const [id, until] of this.threats) {
      const mob = world.getEntity(id);
      if (!mob?.isValid || now > until) {
        this.threats.delete(id);
        continue;
      }
      wanted.add(id);
      this.mark(mob, true);
    }
    for (const mob of this.dimension.getEntities({ tags: [INTRUDER_TAG] })) {
      if (!wanted.has(mob.id)) this.mark(mob, false);
    }
  }

  /** Quita todas las marcas (al reiniciar). */
  clear(): void {
    this.threats.clear();
    for (const mob of this.dimension.getEntities({ tags: [INTRUDER_TAG] })) this.mark(mob, false);
  }

  private mark(mob: Entity, on: boolean): void {
    try {
      if (on && !mob.hasTag(INTRUDER_TAG)) mob.addTag(INTRUDER_TAG);
      else if (!on && mob.hasTag(INTRUDER_TAG)) mob.removeTag(INTRUDER_TAG);
    } catch {
      // Murió o se descargó entre la búsqueda y la marca.
    }
  }
}
