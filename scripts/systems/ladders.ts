import { BlockPermutation, system, world, type Dimension } from "@minecraft/server";
import type { Vec3 } from "../maps/types";
import { atEntry, facingDirection, ladderSteps, rideNext, rideStart, rideTimeout } from "./ladderLogic";
import { classifyBlock, holdsLadder, type LadderMove, type RouteStep } from "./routeLogic";

/** Cada cuántos ticks se mira quién está junto a una escalera para meterlo en ella. */
const BOARD_TICKS = 4;
const LADDER_ID = "minecraft:ladder";

const center = (s: Vec3): Vec3 => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });
const keyOf = (p: Vec3) => `${p.x},${p.y},${p.z}`;
const fmt = (p: Vec3) => `${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`;

/** Una ruta con escaleras y quiénes van por ella. */
interface Ride {
  readonly steps: readonly RouteStep[];
  readonly ladders: ReturnType<typeof ladderSteps>;
  readonly members: () => readonly string[];
  /** A esta distancia de la entrada se le mete en la escalera. */
  readonly reach: number;
}

/** Quien va ahora por una escalera. */
interface Rider {
  readonly ride: string;
  readonly ladder: LadderMove;
  readonly exit: Vec3;
  readonly started: number;
}

/**
 * Las escaleras de mano del director de inalcanzables (Limbers, 2026-11-07): pone las de una ruta
 * (`RouteStep.ladder`) y lleva por ellas a quien va por esa ruta. Las criaturas no entran solas en una escalera:
 * al llegar a su pie o a su borde, se las mete en ella y se las sube o se las baja a la velocidad medida en el
 * laboratorio (`ladderLogic.ts`). Las escaleras se quedan hasta reiniciar, como los muros rotos, y entonces se
 * repone lo que había.
 */
/** Cada cuánto se mira si alguna escalera puesta se cayó. */
const FALL_CHECK_TICKS = 20;

export class Ladders {
  /** `wall`: el bloque en que se apoya; `facing`, hacia dónde mira. `fell`: ya no está (se anotó en el registro). */
  private readonly placed = new Map<string, { at: Vec3; before: BlockPermutation; wall: Vec3; facing: number; fell?: boolean }>();
  private readonly rides = new Map<string, Ride>();
  private readonly riders = new Map<string, Rider>();

  constructor(private readonly dimension: Dimension) {}

  /** Pone las escaleras de la ruta. Solo en casillas que siguen libres; devuelve cuántas casillas puso. */
  place(steps: readonly RouteStep[]): number {
    let count = 0;
    for (const { ladder } of ladderSteps(steps)) {
      for (const c of ladder.cells) {
        const key = keyOf(c);
        if (this.placed.has(key)) continue;
        try {
          const block = this.dimension.getBlock(c);
          if (!block) continue;
          const cell = classifyBlock(block.typeId);
          if (cell.cost !== 0 || cell.ground) continue;
          const before = block.permutation;
          block.setPermutation(BlockPermutation.resolve(LADDER_ID, { facing_direction: facingDirection(c.dx, c.dz) }));
          this.placed.set(key, { at: { x: c.x, y: c.y, z: c.z }, before, wall: { x: c.x - c.dx, y: c.y, z: c.z - c.dz }, facing: facingDirection(c.dx, c.dz) });
          count++;
        } catch {
          // Zona sin cargar: esa casilla se queda sin escalera.
        }
      }
    }
    return count;
  }

  /** Lleva por las escaleras de la ruta a `members`, mientras dure (hasta `stop`). */
  ride(key: string, steps: readonly RouteStep[], members: () => readonly string[], reach: number): void {
    const ladders = ladderSteps(steps);
    if (ladders.length > 0) this.rides.set(key, { steps, ladders, members, reach });
  }

  /** Deja de meter a nadie en las escaleras de esa ruta; quien ya va por una termina de recorrerla. */
  stop(key: string): void {
    this.rides.delete(key);
  }

  /** Alguno de ellos va ahora por una escalera. */
  isRiding(ids: readonly string[]): boolean {
    return ids.some((id) => this.riders.has(id));
  }

  /** En el descanso: nadie más sube ni baja, pero las escaleras se quedan. */
  clearRides(): void {
    this.rides.clear();
    this.riders.clear();
  }

  /** Al reiniciar: quita las escaleras y repone lo que había. */
  removeAll(): void {
    this.clearRides();
    let removed = 0;
    for (const { at, before } of this.placed.values()) {
      try {
        const block = this.dimension.getBlock(at);
        if (block?.typeId !== LADDER_ID) continue;
        block.setPermutation(before);
        removed++;
      } catch {
        // Zona sin cargar.
      }
    }
    if (this.placed.size > 0) console.log(`[bastion] Escaleras quitadas: ${removed} de ${this.placed.size} bloques.`);
    this.placed.clear();
  }

  /** Cada tick: mete en la escalera a quien llega a ella y lleva a quien ya va por una. */
  tick(): void {
    const now = system.currentTick;
    if (now % FALL_CHECK_TICKS === 0) this.checkFallen();
    if (this.rides.size === 0 && this.riders.size === 0) return;
    if (now % BOARD_TICKS === 0) this.board(now);
    for (const [id, rider] of this.riders) this.move(id, rider, now);
  }

  /**
   * Las escaleras que desaparecen: en el asedio de Stonehill (v0.1.53) las explosiones de los proyectiles arcanos y
   * los invasores que rompen el muro las tiraban al suelo como objetos. Si alguna ruta en marcha la usa, su sitio
   * está libre y el apoyo sigue en pie, se repone (elegido por Limbers, 2026-11-07); si no, se anota una vez.
   */
  private checkFallen(): void {
    const inUse = new Set<string>();
    for (const ride of this.rides.values()) for (const { ladder } of ride.ladders) for (const c of ladder.cells) inUse.add(keyOf(c));
    for (const [key, p] of this.placed) {
      try {
        const block = this.dimension.getBlock(p.at);
        if (!block || block.typeId === LADDER_ID) {
          p.fell = false;
          continue;
        }
        const wall = this.dimension.getBlock(p.wall)?.typeId;
        const cell = classifyBlock(block.typeId);
        const holds = wall !== undefined && holdsLadder(classifyBlock(wall));
        if (inUse.has(key) && holds && cell.cost === 0 && !cell.ground) {
          block.setPermutation(BlockPermutation.resolve(LADDER_ID, { facing_direction: p.facing }));
          console.log(`[bastion] Escalera repuesta en ${p.at.x},${p.at.y},${p.at.z}.`);
          continue;
        }
        if (p.fell) continue;
        p.fell = true;
        console.log(`[bastion] Escalera caída en ${p.at.x},${p.at.y},${p.at.z}: ahora ${block.typeId}; apoyo ${wall ?? "?"}.`);
      } catch {
        // Zona sin cargar.
      }
    }
  }

  private board(now: number): void {
    for (const [key, ride] of this.rides) {
      for (const id of ride.members()) {
        if (this.riders.has(id)) continue;
        const e = world.getEntity(id);
        if (!e?.isValid) continue;
        const at = e.location;
        const hit = ride.ladders.find((l) => atEntry(at, l.entry, ride.reach));
        if (!hit) continue;
        try {
          e.teleport(rideStart(hit.ladder, at));
        } catch {
          continue;
        }
        this.riders.set(id, { ride: key, ladder: hit.ladder, exit: ride.steps[hit.index], started: now });
      }
    }
  }

  private move(id: string, r: Rider, now: number): void {
    const e = world.getEntity(id);
    if (!e?.isValid) {
      this.riders.delete(id);
      return;
    }
    const at = e.location;
    try {
      if (now - r.started > rideTimeout(r.ladder)) {
        // Atascado en la escalera: se le deja al otro extremo con humo.
        this.riders.delete(id);
        this.dimension.spawnParticle("minecraft:basic_smoke_particle", at);
        e.teleport(center(r.exit));
        console.log(`[bastion] Escalera: ${e.typeId} atascado en ${fmt(at)}, llevado a ${fmt(r.exit)}.`);
        return;
      }
      const next = rideNext(at.y, r.ladder);
      if (next.done) {
        // Arriba hay que pasarla al borde; abajo ya está de pie, en la casilla de salida.
        this.riders.delete(id);
        if (r.ladder.up) e.teleport(center(r.exit));
        return;
      }
      // Por la columna de la escalera, de cara a la pared.
      const col = r.ladder.cells[0];
      const wall = { x: col.x - col.dx + 0.5, y: next.y + 1, z: col.z - col.dz + 0.5 };
      e.teleport({ x: col.x + 0.5, y: next.y, z: col.z + 0.5 }, { facingLocation: wall });
    } catch {
      this.riders.delete(id);
    }
  }
}
