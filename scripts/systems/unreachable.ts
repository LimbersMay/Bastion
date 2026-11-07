import { EntityDamageCause, system, world, type Dimension, type Entity } from "@minecraft/server";
import { ALLY_SORTIE_EVENT, TICKS_PER_SECOND } from "../constants";
import type { MapDef, Vec3 } from "../maps/types";
import { S } from "../strings";
import { unitOf, type Side } from "../units/catalog";
import type { Hunts } from "./hunt";
import type { Ladders } from "./ladders";
import type { AllyOrders } from "./orders";
import { isReturning, startApproach } from "./returnPath";
import type { RouteJobs } from "./routeJobs";
import type { Route, RouteStep } from "./routeLogic";
import { findSafeSpawn } from "./spawnPoint";
import { centroid, type GaveUp } from "./squadLogic";
import type { Squads } from "./squads";
import { descentStep, guideBudget, UnreachableCases, type CaseAction, type CaseStatus, type DescentTrack, type UnreachableCase } from "./unreachableLogic";

/** Ya pelea con él quien está a esta distancia en horizontal y a esta altura. */
const REACHED_H = 4;
const REACHED_V = 2;
/**
 * A esta distancia de la entrada de una escalera se mete en ella a quien va por la ruta: el grupo, que se para a
 * unos 2 bloques de su marcador; y quien baja solo, que no tiene marcador que seguir y suele estar a pocos pasos del
 * borde.
 */
const GROUP_REACH = 3;
const SOLO_REACH = 6;

const flat = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const fmt = (p: Vec3) => `${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`;
const seconds = () => system.currentTick / TICKS_PER_SECOND;
const nameOf = (e: Entity) => (e.typeId === "minecraft:player" ? "jugador" : (unitOf(e.typeId)?.name.es.toLowerCase() ?? e.typeId));
/** La ruta empieza por una escalera: se añade la casilla de salida como primer paso, que es su entrada. */
const withStart = (steps: readonly RouteStep[], start: Vec3): readonly RouteStep[] =>
  steps[0]?.ladder ? [{ x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z), breaks: [] }, ...steps] : steps;
const caseKey = (target: string) => `case:${target}`;
const descentKey = (id: string) => `descent:${id}`;

/** Cómo va guiado un grupo: por el marcador del grupo (solo camina) o por un rastro de la caza (rompe). */
interface Guided {
  readonly slot: number;
  readonly side: Side;
  readonly trail: boolean;
  /**
   * Altura donde empieza la ruta, si lleva escaleras. Si el intento falla, quien ya no está a esa altura subió o bajó
   * por una escalera y no sabe volver solo: baja con la ayuda de las bajadas.
   */
  readonly ladderFrom?: number;
  /** Por qué se perdió la guía, para el registro: el grupo ya no existe, o sigue pero cambió de objetivo. */
  lost?: string;
}

/** Más de esto por encima o por debajo del inicio de la ruta es estar en otro piso. */
const OTHER_FLOOR = 2;
/**
 * El toque: el objetivo da un golpe de 1 a cada uno del grupo que llega a esta distancia. Los soldados solo eligen
 * enemigos a los que su navegación sabe llegar (`must_reach`), y esa no usa escaleras de mano: el grupo que el
 * director sube a lo alto de una torre golpeaba al marcador, encima del arquero, sin hacerle nada (visto por
 * Limbers en Stonehill, v0.1.53). Herido, el soldado va a por quien le hirió (`hurt_by_target`) y pelea de verdad.
 */
const TOUCH_H = 3;
const TOUCH_V = 2;
const TOUCH_DAMAGE = 1;
/** Segundos que se vigila a los que llegan para darles el toque. */
const TOUCH_WINDOW = 20;

/** Segundos como mucho que se espera a que muera el objetivo alcanzado por escaleras antes de bajar a quien subió. */
const CLIMBED_MAX = 60;

/** Un grupo invasor que llegó a su objetivo por escaleras: cuando acabe con él, baja con ayuda quien quedó arriba. */
interface Climbed {
  readonly members: readonly string[];
  readonly from: number;
  readonly since: number;
}

interface Descent {
  readonly side: Side;
  /** Adónde va: los puntos del patio (aliados) o los hitos de subida (invasores). La distancia es al más cercano. */
  readonly points: readonly Vec3[];
  track: DescentTrack;
  /** Invasor que va por la ruta calculada (rastro de la caza) en vez de derecho a la ruta de subida. */
  led?: boolean;
}

/**
 * El director de inalcanzables (elegido por Limbers, 2026-11-07): aplica al mundo lo que decide
 * `unreachableLogic.ts`. Cuando un grupo deja a su objetivo, busca una ruta a pie hasta él y guía al grupo; si nadie
 * llega y la pelea se para, el inalcanzable baja a pelear (al patio el aliado, a la ruta de subida el invasor). Las
 * dos rutas pueden llevar escaleras de mano que el director pone y por las que lleva a las unidades (`ladders.ts`);
 * si ni así hay camino para bajar, se le lleva con una nube de humo. Esas bajadas también las usa el último reducto.
 */
export class Unreachable {
  private readonly cases = new UnreachableCases();
  private readonly guided = new Map<string, Guided>();
  private readonly descents = new Map<string, Descent>();
  /** Por objetivo alcanzado. */
  private readonly climbed = new Map<string, Climbed>();
  /** Por objetivo alcanzado: quiénes del grupo esperan el toque, y hasta cuándo. */
  private readonly touches = new Map<string, { members: Set<string>; until: number }>();
  /** Sube al reiniciar, para descartar las rutas que lleguen tarde. */
  private generation = 0;

  constructor(
    private readonly dimension: Dimension,
    private readonly map: MapDef,
    private readonly jobs: RouteJobs,
    private readonly squads: Squads,
    private readonly hunts: Hunts | undefined,
    private readonly orders: AllyOrders,
    private readonly openedGates: () => ReadonlySet<string>,
    private readonly ladders: Ladders
  ) {}

  /**
   * Los grupos que dejaron a su objetivo en esta revisión. Devuelve los que el director no tomó (ya se intenta, ya
   * no quedan intentos, cola llena...): con ellos se hace lo de antes. Los aliados solo persiguen a su objetivo con
   * la orden de ataque, así que sin ella el director no los toma.
   */
  onGaveUp(gave: readonly GaveUp[], entities: ReadonlyMap<string, Entity>): GaveUp[] {
    const rest: GaveUp[] = [];
    const now = seconds();
    for (const g of gave) {
      const target = entities.get(g.target);
      const chasers = g.members.flatMap((id) => {
        const e = entities.get(id);
        return e?.isValid ? [e] : [];
      });
      const taken =
        (g.side === "invader" || this.orders.current === "sortie") &&
        target?.isValid === true &&
        chasers.length > 0 &&
        this.cases.gaveUp(g, target.typeId === "minecraft:player", now);
      if (!taken) {
        rest.push(g);
        continue;
      }
      // Desde el miembro más cercano al centro: el centro puede caer en el aire o dentro de un muro.
      const mid = centroid(chasers.map((c) => c.location));
      const start = chasers.reduce((a, b) => (dist(a.location, mid) <= dist(b.location, mid) ? a : b)).location;
      const generation = this.generation;
      const accepted = this.jobs.request({
        start,
        goal: target.location,
        // Los aliados solo caminan: no rompen su propio castillo (elegido por Limbers, 2026-11-07).
        dig: g.side === "invader",
        // Y los dos bandos ponen escaleras de mano para subir o bajar; los invasores, también por fuera de la muralla
        // (como asalto, elegido por Limbers, 2026-11-07).
        ladders: true,
        label: `Inalcanzable (${nameOf(target)})`,
        done: (route) => {
          if (generation === this.generation) this.onRoute(g, route, start);
        },
      });
      if (!accepted) {
        this.cases.cancel(g.target);
        rest.push(g);
        continue;
      }
      console.log(`[bastion] Inalcanzable: un grupo ${g.side === "ally" ? "aliado" : "invasor"} no llega a un ${nameOf(target)} en ${fmt(target.location)}; se busca ruta a pie.`);
    }
    return rest;
  }

  /** Revisión de cada segundo, en plena oleada. `quiet`: segundos desde la última baja de cualquier bando. */
  tick(quiet: number): void {
    const now = seconds();
    for (const action of this.cases.tick(now, quiet, (c) => this.status(c))) this.apply(action);
    this.followTouches(now);
    this.followClimbed(now);
    this.followDescents(now);
  }

  /**
   * El aliado baja al patio a resistir y, si no tiene camino, se le lleva. Sin patio, sale a por los invasores.
   * Lo usan el último reducto y el paso 3.
   */
  descendAlly(ally: Entity): "courtyard" | "sortie" {
    if (this.orders.hasCourtyard) {
      this.orders.fallBack(ally, "courtyard");
      this.track(ally, "ally", this.map.rallyPoints ?? []);
      this.routeDown(ally, this.map.rallyPoints ?? []);
      return "courtyard";
    }
    try {
      ally.triggerEvent(ALLY_SORTIE_EVENT);
    } catch {
      // Ya no está.
    }
    return "sortie";
  }

  /** Deshace todo: al reiniciar y en el descanso. */
  clear(): void {
    this.generation++;
    for (const g of this.guided.values()) this.squads.unguide(g.slot);
    this.guided.clear();
    this.cases.clear();
    this.descents.clear();
    this.climbed.clear();
    this.touches.clear();
    this.ladders.clearRides();
  }

  /**
   * Pone las escaleras de una ruta y lleva por ellas a `members`. Devuelve el texto para el registro: vacío si la
   * ruta no tiene escaleras.
   */
  private useLadders(key: string, steps: readonly RouteStep[], members: () => readonly string[], reach: number): string {
    const ladders = steps.flatMap((s) => (s.ladder ? [s.ladder] : []));
    if (ladders.length === 0) return "";
    const placed = this.ladders.place(steps);
    this.ladders.ride(key, steps, members, reach);
    const up = ladders.filter((l) => l.up).length;
    const parts = [up > 0 ? `${up} para subir` : "", ladders.length - up > 0 ? `${ladders.length - up} para bajar` : ""].filter(Boolean);
    return `, con escaleras (${parts.join(" y ")}; ${placed} bloques puestos)`;
  }

  /**
   * Quien baja busca ruta hasta su destino, con escaleras. Si la ruta las tiene, se ponen y se le lleva por ellas;
   * si no hay ruta, sigue como antes: si en `lift` segundos no se acerca, humo.
   */
  private routeDown(e: Entity, points: readonly Vec3[]): void {
    if (points.length === 0) return;
    const id = e.id;
    const start = e.location;
    const goal = points.reduce((a, b) => (dist(a, start) <= dist(b, start) ? a : b));
    const generation = this.generation;
    const accepted = this.jobs.request({
      start,
      goal,
      dig: false,
      ladders: true,
      label: `Bajada (${nameOf(e)})`,
      done: (route) => {
        if (generation !== this.generation || !this.descents.has(id)) return;
        if (!route?.complete || route.steps.length < 2) {
          this.unlead(id);
          return;
        }
        const steps = withStart(route.steps, start);
        const d = this.descents.get(id);
        const unit = world.getEntity(id);
        const led = d?.led === true && unit?.isValid === true && this.hunts!.lead(unit, steps);
        if (!led) this.unlead(id);
        const ladders = this.useLadders(descentKey(id), steps, () => [id], SOLO_REACH);
        if (!ladders && !led) return;
        // Le da tiempo de llegar a la escalera antes del humo.
        if (d) d.track = { best: d.track.best, since: seconds() };
        console.log(`[bastion] Bajada: ${e.typeId} desde ${fmt(start)}${led ? ", por la ruta" : ""}${ladders}.`);
      },
    });
    if (!accepted) this.unlead(id);
  }

  private onRoute(g: GaveUp, route: Route | undefined, start: Vec3): void {
    const now = seconds();
    const complete = route !== undefined && route.complete && route.steps.length >= 2;
    const result = this.cases.routeFound(g.target, complete, now, complete ? guideBudget(withStart(route!.steps, start)) : undefined);
    if (result === undefined) return;
    if (result !== true) {
      this.apply(result, g.members);
      return;
    }
    const steps = withStart(route!.steps, start);
    const target = world.getEntity(g.target);
    // Si hay que romper, el rastro de la caza (que rompe); si no, el marcador del grupo, que solo camina.
    const trail = g.side === "invader" && this.hunts !== undefined && steps.some((s) => s.breaks.length > 0);
    let ok = target?.isValid === true && this.squads.guide(g.slot, g.target, steps);
    if (ok && trail) {
      const members = (this.squads.membersOf(g.slot) ?? []).flatMap((id) => world.getEntity(id) ?? []);
      ok = this.hunts!.guide(members, target!, steps);
    }
    if (!ok) {
      this.squads.unguide(g.slot);
      const failed = this.cases.guideFailed(g.target, now);
      if (failed) this.apply(failed, g.members);
      return;
    }
    const ladders = this.useLadders(caseKey(g.target), steps, () => this.squads.membersOf(g.slot) ?? [], GROUP_REACH);
    this.guided.set(g.target, { slot: g.slot, side: g.side, trail, ...(ladders ? { ladderFrom: steps[0].y } : {}) });
    console.log(
      `[bastion] Inalcanzable: el grupo ${g.slot} va por una ruta de ${steps.length} pasos hasta un ${nameOf(target!)}${trail ? ", rompiendo" : ""}${ladders}.`
    );
  }

  private status(c: UnreachableCase): CaseStatus {
    const target = world.getEntity(c.target);
    if (!target?.isValid || target.isInWater) return { alive: false, reached: false };
    const g = this.guided.get(c.target);
    if (c.stage !== "guide" || !g) return { alive: true, reached: false };
    const members = this.squads.membersOf(g.slot) ?? [];
    const reached = members.some((id) => {
      const e = world.getEntity(id);
      return e?.isValid === true && flat(e.location, target.location) <= REACHED_H && Math.abs(e.location.y - target.location.y) <= REACHED_V;
    });
    const progress = g.trail ? this.hunts?.progressToward(c.target) : this.squads.guideProgress(g.slot);
    if (progress === undefined) g.lost = members.length === 0 ? "ya no existe" : `sigue con ${members.length} pero cambió de objetivo`;
    return { alive: true, reached, progress, busy: this.ladders.isRiding(members) };
  }

  private apply(action: CaseAction, members?: readonly string[]): void {
    const g = this.guided.get(action.target);
    if (action.type !== "descend") {
      this.guided.delete(action.target);
      if (g) this.squads.unguide(g.slot);
      this.ladders.stop(caseKey(action.target));
    }
    switch (action.type) {
      case "close": {
        if (action.why === "reached") console.log(`[bastion] Inalcanzable: un grupo llegó hasta su objetivo por la ruta a pie.`);
        // Subió o bajó por escaleras: arriba se quedaría (en Stonehill, en lo alto de la torre de la esquina, hasta
        // que la red de seguridad lo quitaba). Si el objetivo ya murió, baja ya; si no, cuando acabe con él.
        const ids = members ?? (action.slot !== undefined ? this.squads.membersOf(action.slot) : undefined) ?? [];
        if (action.why === "reached" && ids.length > 0) this.touches.set(action.target, { members: new Set(ids), until: seconds() + TOUCH_WINDOW });
        if (g?.side === "invader" && g.ladderFrom !== undefined && ids.length > 0) {
          if (action.why === "gone") this.bringDown(ids, g.ladderFrom, "su objetivo murió");
          else this.climbed.set(action.target, { members: [...ids], from: g.ladderFrom, since: seconds() });
        }
        break;
      }
      case "failed": {
        const why = { noRoute: "no hay ruta a pie", idle: "el grupo no avanza por la ruta", timeout: "el grupo no llegó a tiempo", lost: "el grupo se deshizo" }[action.why];
        const side = g?.side ?? this.sideOf(members);
        // Como antes del director: el grupo invasor que no sabe llegar vuelve a la ruta de subida. Quien quedó en otro
        // piso tras una escalera baja con ayuda: a pie se quedaría allí hasta que la red de seguridad lo quitara
        // (asedio de Stonehill, v0.1.53).
        let back = 0;
        let stranded = 0;
        if (side === "invader") {
          const ids = members ?? this.squads.membersOf(action.slot) ?? [];
          stranded = g?.ladderFrom !== undefined ? this.bringDown(ids, g.ladderFrom) : 0;
          for (const id of ids) {
            const e = world.getEntity(id);
            if (e?.isValid && !isReturning(e) && !this.descents.has(id) && startApproach(e, this.map, true)) back++;
          }
        }
        const left = [back > 0 ? `${back} invasores vuelven a la ruta de subida` : "", stranded > 0 ? `${stranded} bajan de otro piso` : ""].filter(Boolean);
        const detail = action.why === "lost" && g?.lost ? `: ${g.lost}` : "";
        console.log(`[bastion] Inalcanzable: falla un intento (${why}${detail})${left.length > 0 ? `; ${left.join(" y ")}` : ""}.`);
        break;
      }
      case "descend":
        this.descend(action.target);
        break;
    }
  }

  private sideOf(members: readonly string[] | undefined): Side | undefined {
    const first = members?.map((id) => world.getEntity(id)).find((e) => e?.isValid);
    return first ? unitOf(first.typeId)?.side : undefined;
  }

  /** Paso 3: nadie llega hasta él y la pelea se ha parado. */
  private descend(id: string): void {
    const e = world.getEntity(id);
    if (!e?.isValid || isReturning(e) || this.descents.has(id)) return;
    const side = unitOf(e.typeId)?.side;
    if (side === "ally") {
      // Quien ya se replegó al patio o a la torre está donde debe.
      if (this.orders.layerOf(id) !== "field") return;
      this.descendAlly(e);
    } else if (side === "invader") {
      this.sendInvaderDown(e);
    } else {
      return;
    }
    console.log(`[bastion] Inalcanzable: nadie llega hasta un ${nameOf(e)} en ${fmt(e.location)}; baja a pelear.`);
    world.sendMessage(S.unreachableDescends(nameOf(e)));
  }

  /**
   * Baja con ayuda a los invasores de `ids` que están en otro piso que `from` (el inicio de una ruta con escaleras).
   * Con `why`, lo anota en el registro. Devuelve cuántos.
   */
  private bringDown(ids: readonly string[], from: number, why?: string): number {
    let n = 0;
    for (const id of ids) {
      const e = world.getEntity(id);
      if (!e?.isValid || isReturning(e) || this.descents.has(id) || Math.abs(e.location.y - from) <= OTHER_FLOOR) continue;
      this.sendInvaderDown(e);
      n++;
    }
    if (why && n > 0) console.log(`[bastion] Inalcanzable: ${n} invasores bajan de otro piso (${why}).`);
    return n;
  }

  /** El toque a cada uno del grupo que llega junto a su objetivo (ver `TOUCH_H`). */
  private followTouches(now: number): void {
    for (const [targetId, t] of this.touches) {
      const target = world.getEntity(targetId);
      if (!target?.isValid || now > t.until || t.members.size === 0) {
        this.touches.delete(targetId);
        continue;
      }
      let touched = 0;
      for (const id of [...t.members]) {
        const e = world.getEntity(id);
        if (!e?.isValid) {
          t.members.delete(id);
          continue;
        }
        if (flat(e.location, target.location) > TOUCH_H || Math.abs(e.location.y - target.location.y) > TOUCH_V) continue;
        t.members.delete(id);
        try {
          e.applyDamage(TOUCH_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: target });
          touched++;
        } catch {
          // Ya no está.
        }
      }
      if (touched > 0) console.log(`[bastion] Inalcanzable: ${touched} del grupo se enfrentan a un ${nameOf(target)} (toque).`);
    }
  }

  /** Quien llegó por escaleras baja cuando muere su objetivo, o a los `CLIMBED_MAX` segundos. */
  private followClimbed(now: number): void {
    for (const [target, c] of this.climbed) {
      const alive = world.getEntity(target)?.isValid === true;
      if (alive && now - c.since < CLIMBED_MAX) continue;
      this.climbed.delete(target);
      this.bringDown(c.members, c.from, alive ? "tras un rato arriba" : "su objetivo murió");
    }
  }

  /**
   * El invasor vuelve a la ruta de subida. El soldado va primero por la ruta calculada hasta ella, con un rastro de
   * la caza que espera ante cada escalera: yendo en línea recta hacia el hito más cercano, en Stonehill se quedaba
   * empujando contra el borde de lo alto de la torre de la esquina, con el hito 14 bloques más abajo. Sin ruta, o
   * si no es soldado, va derecho como antes; si no se acerca, humo.
   */
  private sendInvaderDown(e: Entity): void {
    const approach = (this.map.approachRoutes ?? []).flat();
    const led = this.canLead(e);
    if (!led) startApproach(e, this.map, true);
    const opened = this.openedGates();
    const breach = this.map.gates.filter((gate) => opened.has(gate.id)).flatMap((gate) => gate.breachSpawns);
    const points = approach.length > 0 ? approach : breach.length > 0 ? breach : this.map.invaderSpawns;
    this.track(e, "invader", points, led);
    this.routeDown(e, points);
  }

  /** Solo los soldados siguen los rastros de la caza (`huntTargeting` en `tools/units/behavior.ts`). */
  private canLead(e: Entity): boolean {
    return this.hunts !== undefined && unitOf(e.typeId)?.role === "melee" && unitOf(e.typeId)?.side === "invader" && !isReturning(e);
  }

  private track(e: Entity, side: Side, points: readonly Vec3[], led = false): void {
    if (points.length === 0) return;
    this.descents.set(e.id, { side, points, track: { best: this.distanceTo(e.location, points), since: seconds() }, ...(led ? { led } : {}) });
  }

  /** Quien iba a ir por la ruta calculada y no puede (sin ruta, sin rastro libre) va derecho a la ruta de subida. */
  private unlead(id: string): void {
    const d = this.descents.get(id);
    if (!d?.led) return;
    d.led = false;
    const e = world.getEntity(id);
    if (e?.isValid) startApproach(e, this.map, true);
  }

  private distanceTo(at: Vec3, points: readonly Vec3[]): number {
    return Math.min(Infinity, ...points.map((p) => dist(p, at)));
  }

  /**
   * Quien baja y en `lift` segundos no se acerca a su destino no tiene camino (en Stonehill, el pirómano de lo alto
   * de la torre de la esquina): se le lleva con una nube de humo. El aliado, a un punto del patio al azar; el
   * invasor, al hito de subida más cercano (o a la brecha, o a donde aparecen los invasores).
   */
  private followDescents(now: number): void {
    for (const [id, d] of this.descents) {
      const e = world.getEntity(id);
      if (!e?.isValid) {
        this.descents.delete(id);
        this.ladders.stop(descentKey(id));
        continue;
      }
      // Va por una escalera o por la ruta calculada: avanza, aunque se aleje un momento de su destino. El rastro
      // termina solo si se queda parado; entonces vuelve a contar el tiempo para el humo.
      if (this.ladders.isRiding([id]) || (d.led && this.hunts?.isLed(id))) {
        d.track = { best: d.track.best, since: now };
        continue;
      }
      const step = descentStep(d.track, this.distanceTo(e.location, d.points), now);
      if (step.kind === "wait") {
        d.track = step.track;
        continue;
      }
      this.descents.delete(id);
      this.ladders.stop(descentKey(id));
      if (step.kind === "arrived") {
        // Llegó por la ruta calculada: sigue por la de subida.
        if (d.led && !isReturning(e)) startApproach(e, this.map, true);
        continue;
      }
      const anchor =
        d.side === "ally"
          ? d.points[Math.floor(Math.random() * d.points.length)]
          : d.points.reduce((a, b) => (dist(a, e.location) <= dist(b, e.location) ? a : b));
      const spot = findSafeSpawn(this.dimension, anchor, 2);
      if (!spot) continue;
      const from = e.location;
      try {
        this.dimension.spawnParticle("minecraft:basic_smoke_particle", from);
        e.teleport(spot);
        this.dimension.spawnParticle("minecraft:basic_smoke_particle", spot);
        if (d.side === "invader") startApproach(e, this.map, true);
        console.log(`[bastion] Bajada: ${e.typeId} sin camino en ${fmt(from)}, llevado a ${fmt(spot)}.`);
      } catch {
        // Ya no está.
      }
    }
  }
}
