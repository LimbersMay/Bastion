import { type Dimension, type Entity } from "@minecraft/server";
import { ENTITY_IDS, FAMILY, MAX_SQUADS, SQUAD_TAG, SQUAD_WAIT_TAG, squadMarkerTag, squadTag } from "../constants";
import type { Vec3 } from "../maps/types";
import { advanceWithLadders, firstLadder, markerStep } from "./huntLogic";
import type { RouteStep } from "./routeLogic";
import { assignTargets, regroup, SQUAD_DEFAULTS, unignore, type GaveUp, type Squad, type SquadOptions, type SquadUnit } from "./squadLogic";

/** El marcador se mueve cuando su enemigo se ha alejado esto de él. */
const MARKER_MOVE = 1;

const center = (s: Vec3): Vec3 => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });

/** Ruta del director de inalcanzables por la que va un grupo, y hasta qué paso ha llegado. */
interface Guide {
  readonly target: string;
  readonly steps: readonly RouteStep[];
  progress: number;
}

const ALL_SQUAD_TAGS = Array.from({ length: MAX_SQUADS }, (_, slot) => squadTag(slot));
const ALL_MARKER_TAGS = new Set(Array.from({ length: MAX_SQUADS }, (_, slot) => squadMarkerTag(slot)));

/**
 * El director de grupos (Fase 3): aplica al mundo lo que decide `squadLogic.ts`. A cada unidad le pone la etiqueta
 * de su grupo (y la de reserva si su grupo espera) y a cada grupo que avanza, un marcador invisible sobre el enemigo
 * que le toca. Las unidades siguen ese marcador (`squadChoices` en `tools/units/behavior.ts`) y solo se lanzan
 * contra enemigos a `SQUAD_ENGAGE` bloques.
 *
 * El director de inalcanzables (`unreachable.ts`) puede guiar a un grupo por una ruta a pie (`guide`): su marcador
 * va entonces unos pasos por delante en la ruta, no sobre el enemigo, y se usa con quien solo camina.
 */
export class Squads {
  private squads: Squad[] = [];
  private readonly markers = new Map<number, Entity>();
  /** Grupo y reserva con que quedó etiquetada cada unidad, para tocar solo lo que cambia. */
  private readonly tagged = new Map<string, { slot: number; waiting: boolean }>();
  private readonly guides = new Map<number, Guide>();

  constructor(
    private readonly dimension: Dimension,
    public options: SquadOptions = SQUAD_DEFAULTS
  ) {}

  get current(): readonly Squad[] {
    return this.squads;
  }

  /**
   * Revisión de cada segundo. `units` son las que cuentan (agrupables y objetivos), con su entidad en `entities`.
   * Quien deja de estar en `units` (muere, cae al agua, cambia de orden) pierde su grupo. Devuelve los grupos que
   * dejaron su objetivo porque no sabían llegar hasta él.
   */
  tick(units: readonly SquadUnit[], entities: ReadonlyMap<string, Entity>): GaveUp[] {
    this.squads = regroup(this.squads, units, this.options);
    const gaveUp = assignTargets(this.squads, units, this.options);
    this.followGuides(entities);

    const wanted = new Map<string, { slot: number; waiting: boolean }>();
    for (const s of this.squads) for (const id of s.members) wanted.set(id, { slot: s.slot, waiting: s.state === "wait" });
    for (const [id, was] of this.tagged) {
      if (wanted.has(id)) continue;
      const unit = entities.get(id);
      if (unit?.isValid) untag(unit, was.slot);
      this.tagged.delete(id);
    }
    for (const [id, want] of wanted) {
      const was = this.tagged.get(id);
      if (was && was.slot === want.slot && was.waiting === want.waiting) continue;
      const unit = entities.get(id);
      if (!unit?.isValid) continue;
      try {
        if (was && was.slot !== want.slot) unit.removeTag(squadTag(was.slot));
        unit.addTag(SQUAD_TAG);
        unit.addTag(squadTag(want.slot));
        if (want.waiting) unit.addTag(SQUAD_WAIT_TAG);
        else unit.removeTag(SQUAD_WAIT_TAG);
        this.tagged.set(id, want);
      } catch {
        // Se fue entre la lectura y la etiqueta: el siguiente pulso lo arregla.
      }
    }

    const live = new Set<number>();
    for (const s of this.squads) {
      const target = s.target === undefined ? undefined : entities.get(s.target);
      if (s.state !== "advance" || !target?.isValid) continue;
      live.add(s.slot);
      const guide = this.guides.get(s.slot);
      this.placeMarker(s.slot, guide ? center(guide.steps[markerStep(guide.progress, firstLadder(guide.steps, guide.progress), guide.steps.length - 1)]) : target.location);
    }
    for (const [slot, marker] of this.markers) {
      if (live.has(slot)) continue;
      if (marker.isValid) marker.remove();
      this.markers.delete(slot);
    }
    return gaveUp;
  }

  /**
   * Guía a un grupo hasta `target` por una ruta a pie: vuelve a contar con ese objetivo y lo conserva mientras
   * dure la guía. `false` si el grupo ya no existe.
   */
  guide(slot: number, target: string, steps: readonly RouteStep[]): boolean {
    const squad = this.squads.find((s) => s.slot === slot);
    if (!squad || steps.length < 2) return false;
    unignore(squad, target);
    squad.target = target;
    squad.guided = true;
    squad.state = "advance";
    squad.stalled = 0;
    squad.best = undefined;
    this.guides.set(slot, { target, steps, progress: 0 });
    return true;
  }

  /** Deja de guiar a un grupo: vuelve a elegir objetivo como siempre. */
  unguide(slot: number): void {
    this.guides.delete(slot);
    const squad = this.squads.find((s) => s.slot === slot);
    if (squad) squad.guided = false;
  }

  /** Paso de la ruta por el que va un grupo guiado; `undefined` si ya no va guiado. */
  guideProgress(slot: number): number | undefined {
    return this.guides.get(slot)?.progress;
  }

  /** Miembros de un grupo, si existe. */
  membersOf(slot: number): readonly string[] | undefined {
    return this.squads.find((s) => s.slot === slot)?.members;
  }

  /** Pone al día cuánto ha avanzado cada grupo guiado; la guía termina si el grupo se deshizo o cambió de objetivo. */
  private followGuides(entities: ReadonlyMap<string, Entity>): void {
    for (const [slot, guide] of this.guides) {
      const squad = this.squads.find((s) => s.slot === slot);
      if (!squad?.guided || squad.target !== guide.target) {
        this.unguide(slot);
        continue;
      }
      const positions = squad.members.flatMap((id) => {
        const e = entities.get(id);
        return e?.isValid ? [e.location] : [];
      });
      // Al final de la ruta el marcador se queda en el último paso, junto al objetivo: el director decide si llegó.
      // Ante una escalera espera al pie o en el borde, hasta que alguien llega al otro extremo (`ladders.ts`).
      guide.progress = advanceWithLadders(guide.steps, guide.progress, undefined, positions);
    }
  }

  private placeMarker(slot: number, at: Vec3): void {
    const marker = this.markers.get(slot);
    try {
      if (marker?.isValid) {
        const m = marker.location;
        if (Math.hypot(m.x - at.x, m.y - at.y, m.z - at.z) > MARKER_MOVE) marker.teleport(at);
        return;
      }
      const created = this.dimension.spawnEntity(ENTITY_IDS.waypoint, at);
      created.addTag(squadMarkerTag(slot));
      this.markers.set(slot, created);
    } catch {
      // Zona sin cargar: se reintenta en el siguiente pulso.
    }
  }

  /** Deshace todos los grupos: etiquetas y marcadores, también los que quedaran de una partida anterior. */
  clear(): void {
    this.squads = [];
    this.guides.clear();
    this.tagged.clear();
    this.markers.clear();
    try {
      for (const unit of this.dimension.getEntities({ tags: [SQUAD_TAG] })) untag(unit);
      for (const marker of this.dimension.getEntities({ families: [FAMILY.waypoint] })) {
        if (marker.getTags().some((t) => ALL_MARKER_TAGS.has(t))) marker.remove();
      }
    } catch (e) {
      console.warn(`[bastion] No se pudieron deshacer los grupos: ${e}`);
    }
  }
}

function untag(unit: Entity, slot?: number): void {
  try {
    unit.removeTag(SQUAD_TAG);
    unit.removeTag(SQUAD_WAIT_TAG);
    if (slot !== undefined) unit.removeTag(squadTag(slot));
    else for (const tag of ALL_SQUAD_TAGS) if (unit.hasTag(tag)) unit.removeTag(tag);
  } catch {
    // Ya no está.
  }
}
