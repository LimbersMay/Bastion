import { world, type Dimension, type Entity } from "@minecraft/server";
import { HOLD_LINE_TAG } from "../constants";
import type { Vec3 } from "../maps/types";
import { shouldHold, STANCE_ALLY_RADIUS, STANCE_FOE_RADIUS } from "./stanceLogic";

const near = (a: Vec3, b: Vec3, r: number) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 <= r * r;

/**
 * Medir fuerzas (`stanceLogic.ts`): cada segundo, el aliado cuerpo a cuerpo que tiene delante el doble de enemigos
 * que aliados a su lado recibe `HOLD_LINE_TAG` y deja de salir a buscarlos; se le quita cuando la pelea se iguala.
 */
export class Stance {
  private readonly holding = new Set<string>();

  constructor(private readonly dimension: Dimension) {}

  get count(): number {
    return this.holding.size;
  }

  /**
   * `fighters`: cuerpo a cuerpo que defienden (sin la escolta del cuerno, ni quien regresa, ni la orden de ataque).
   * `friends`: todo lo que pelea de su lado (aliados de cualquier rol y jugadores). `foes`: invasores.
   */
  tick(fighters: readonly Entity[], friends: readonly Vec3[], foes: readonly Vec3[]): void {
    const seen = new Set<string>();
    for (const unit of fighters) {
      seen.add(unit.id);
      const at = unit.location;
      const allies = friends.filter((f) => near(f, at, STANCE_ALLY_RADIUS)).length;
      const enemies = foes.filter((f) => near(f, at, STANCE_FOE_RADIUS)).length;
      const was = this.holding.has(unit.id);
      const hold = shouldHold(allies, enemies, was);
      if (hold === was) continue;
      try {
        if (hold) unit.addTag(HOLD_LINE_TAG);
        else unit.removeTag(HOLD_LINE_TAG);
        if (hold) this.holding.add(unit.id);
        else this.holding.delete(unit.id);
      } catch {
        // Ya no está.
      }
    }
    // Quien deja de defender (muere, pasa a la escolta, sale con la orden de ataque) deja de aguantar.
    for (const id of [...this.holding]) {
      if (seen.has(id)) continue;
      this.holding.delete(id);
      try {
        const unit = world.getEntity(id);
        if (unit?.isValid) unit.removeTag(HOLD_LINE_TAG);
      } catch {
        // Ya no está.
      }
    }
  }

  /** Nadie aguanta: quita la etiqueta a todos, también a los de una partida anterior. */
  clear(): void {
    this.holding.clear();
    try {
      for (const unit of this.dimension.getEntities({ tags: [HOLD_LINE_TAG] })) unit.removeTag(HOLD_LINE_TAG);
    } catch (e) {
      console.warn(`[bastion] No se pudo quitar la postura de aguante: ${e}`);
    }
  }
}
