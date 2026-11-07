import { system, world, type Dimension, type Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY } from "../constants";
import type { Vec3 } from "../maps/types";
import { MAX_RAFTS, RAFT_COOLDOWN_TICKS, RaftCourse, raftImpulse, yawToward } from "./raftLogic";
import { nudgeToward } from "./returnLogic";

/**
 * Balsas: aparecen bajo quien cae al agua y le llevan a la orilla de salida de su ruta (`returnPath.ts`
 * decide cuándo). Allí le bajan, le dan un empujón hacia tierra y desaparecen. Si no cabe otra balsa, o
 * la unidad acaba de bajar de una, nada como siempre.
 */

/** Cada cuánto se corrige el rumbo: cada 2 ticks, para que avance suave. */
const STEER_TICKS = 2;

interface Voyage {
  readonly riderId: string;
  readonly course: RaftCourse;
}

const voyages = new Map<string, Voyage>();
const landedAt = new Map<string, number>();
let steering: number | undefined;

/** `true` si va subido en una balsa. */
export function isRafting(entity: Entity): boolean {
  return entity.getComponent("riding")?.entityRidingOn?.typeId === ENTITY_IDS.raft;
}

/** Sube a `rider` a una balsa nueva rumbo a `shore`. `false` si no puede (hay demasiadas o acaba de bajar). */
export function launchRaft(dimension: Dimension, rider: Entity, shore: Vec3): boolean {
  if (voyages.size >= MAX_RAFTS || rider.getComponent("riding")) return false;
  const last = landedAt.get(rider.id);
  if (last !== undefined && system.currentTick - last < RAFT_COOLDOWN_TICKS) return false;
  const raft = dimension.spawnEntity(ENTITY_IDS.raft, rider.location);
  if (!raft.getComponent("rideable")?.addRider(rider)) {
    raft.remove();
    return false;
  }
  voyages.set(raft.id, { riderId: rider.id, course: new RaftCourse(shore, system.currentTick) });
  steering ??= system.runInterval(steer, STEER_TICKS);
  return true;
}

function steer(): void {
  const now = system.currentTick;
  for (const [raftId, voyage] of voyages) {
    const raft = world.getEntity(raftId);
    const rider = world.getEntity(voyage.riderId);
    try {
      if (!raft?.isValid || !rider?.isValid || !isRafting(rider) || voyage.course.step(raft.location, now) === "land") {
        land(raftId, raft, rider, voyage.course.target);
        continue;
      }
      raft.applyImpulse(raftImpulse(raft.location, voyage.course.target, raft.getVelocity()));
      raft.setRotation({ x: 0, y: yawToward(raft.location, voyage.course.target) });
    } catch (e) {
      console.warn(`[bastion] Error llevando una balsa: ${e instanceof Error ? e.message : String(e)}`);
      voyages.delete(raftId);
    }
  }
  if (voyages.size === 0 && steering !== undefined) {
    system.clearRun(steering);
    steering = undefined;
  }
}

/** Baja al pasajero, le empuja hacia tierra y quita la balsa. */
function land(raftId: string, raft: Entity | undefined, rider: Entity | undefined, shore: Vec3): void {
  voyages.delete(raftId);
  if (raft?.isValid) {
    raft.getComponent("rideable")?.ejectRiders();
    raft.remove();
  }
  if (!rider?.isValid) return;
  landedAt.set(rider.id, system.currentTick);
  system.run(() => {
    if (rider.isValid) rider.applyImpulse(nudgeToward(rider.location, shore));
  });
}

/**
 * Limpieza de cada segundo: quita las balsas que nadie lleva (por ejemplo, tras recargar el mundo) y olvida
 * a quien bajó hace tiempo.
 */
export function sweepRafts(dimension: Dimension): void {
  for (const raft of dimension.getEntities({ families: [FAMILY.raft] })) {
    if (voyages.has(raft.id)) continue;
    try {
      raft.getComponent("rideable")?.ejectRiders();
      raft.remove();
    } catch {
      // Ya no existe.
    }
  }
  const now = system.currentTick;
  for (const [id, tick] of landedAt) if (now - tick >= RAFT_COOLDOWN_TICKS) landedAt.delete(id);
}

/** Al reiniciar la partida: fuera todas. */
export function clearRafts(dimension: Dimension): void {
  voyages.clear();
  landedAt.clear();
  sweepRafts(dimension);
}
