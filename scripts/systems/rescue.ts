import { system, world, type Dimension, type Entity, type Player } from "@minecraft/server";
import { ALLY_ESCORT_EVENT, ALLY_GUARD_EVENT, ENTITY_IDS, escortMarkerTag, escortTag, FAMILY, MAX_ESCORTS } from "../constants";
import type { Vec3 } from "../maps/types";
import { S } from "../strings";
import {
  escortStep,
  HORN_ESCORT,
  isSurrounded,
  pickRescuers,
  RESCUE_DEFAULTS,
  rescueOver,
  type EscortMode,
  type RescueOptions,
  type RescueTier,
} from "./rescueLogic";
import { isReturning } from "./returnPath";

/** Sonido del cuerno de cabra del juego (el cuerno en la mano ya suena solo al usarlo). */
const HORN_SOUND = "horn.call.0";
/** El marcador se mueve cuando el jugador se ha alejado esto de él. */
const MARKER_MOVE = 1;

const ALL_ESCORT_TAGS = Array.from({ length: MAX_ESCORTS }, (_, slot) => escortTag(slot));
const ALL_MARKER_TAGS = new Set(Array.from({ length: MAX_ESCORTS }, (_, slot) => escortMarkerTag(slot)));

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Un aliado que puede acudir y de dónde sale (`rescueTier`). */
export interface RescueCandidate {
  readonly entity: Entity;
  readonly tier: RescueTier;
}

/** Lo que la escolta necesita de las órdenes (`orders.ts`). */
export interface EscortHooks {
  /** Devuelve a un aliado a la orden vigente. */
  readonly restore: (ally: Entity) => void;
  /** Las órdenes dejan de ocuparse de un aliado que pasa a la escolta. */
  readonly claim: (ally: Entity) => void;
}

interface Member {
  mode: EscortMode;
  /** Vino por el cuerno automático: se va cuando el jugador queda libre. Si no, es de la escolta. */
  readonly temporary: boolean;
}

/** Quienes acompañan a un jugador, con el marcador que le sigue. */
interface Group {
  readonly slot: number;
  readonly members: Map<string, Member>;
  marker?: Entity;
  /** Dónde estaba el jugador en la última revisión. */
  at: Vec3;
  /** Segundos que lleva el rescate automático en curso; sin valor, no hay ninguno. */
  auto?: number;
}

/**
 * El cuerno (`rescueLogic.ts`). Dos formas de pedir ayuda:
 * - Automática: si rodean a un jugador en supervivencia, suena un cuerno y acuden unos aliados hasta que queda libre.
 * - En la mano (elegido por Limbers, 2026-11-07): el jugador toca el cuerno de cabra y acude una escolta de 4 que se
 *   queda con él hasta el fin de la oleada, sin obedecer las órdenes generales. Tocarlo otra vez la completa;
 *   agachado, la despide.
 * Quien acude sale de la reserva del director o de quien no esté peleando (`rescueTier`). Lleva la etiqueta de la
 * escolta del jugador y sigue un marcador que va con él (modo `escort`); a su lado, pasa a vigilar (modo `guard`):
 * pelea con quien se acerque y, si el jugador se aleja, vuelve a seguirle. El director no los agrupa.
 */
export class Rescue {
  /** Por jugador. */
  private readonly groups = new Map<string, Group>();
  /** Revisiones que le faltan a cada jugador para volver a pedir ayuda, por forma. */
  private readonly autoCooldown = new Map<string, number>();
  private readonly hornCooldown = new Map<string, number>();

  constructor(
    private readonly dimension: Dimension,
    private readonly hooks: EscortHooks,
    public auto: RescueOptions = RESCUE_DEFAULTS,
    public horn: RescueOptions = HORN_ESCORT
  ) {}

  /** ¿Acompaña a algún jugador? */
  isRescuer(id: string): boolean {
    for (const g of this.groups.values()) if (g.members.has(id)) return true;
    return false;
  }

  /** Revisión de cada segundo. `candidates`: aliados cuerpo a cuerpo que pueden acudir. */
  tick(players: readonly Player[], invaders: readonly Entity[], candidates: readonly RescueCandidate[]): void {
    const foes = invaders.map((i) => i.location);
    for (const cooldown of [this.autoCooldown, this.hornCooldown]) {
      for (const [id, left] of cooldown) {
        if (left <= 1) cooldown.delete(id);
        else cooldown.set(id, left - 1);
      }
    }

    const toRenew: Group[] = [];
    for (const [playerId, group] of [...this.groups]) {
      const player = players.find((p) => p.id === playerId);
      if (!player) {
        // Se fue, o pasó a mirar en creativo.
        this.release(playerId, [...group.members.keys()]);
        continue;
      }
      if (group.auto !== undefined && rescueOver(player.location, foes, ++group.auto, this.auto)) {
        const temporary = [...group.members].filter(([, m]) => m.temporary).map(([id]) => id);
        console.log(`[bastion] Cuerno automático de ${player.name}: fin del rescate tras ${group.auto} s.`);
        group.auto = undefined;
        this.release(playerId, temporary);
      }
      this.prune(group);
      if (group.members.size === 0) {
        this.drop(playerId);
        continue;
      }
      this.placeMarker(group, player.location);
      let arrived = false;
      for (const [id, member] of group.members) {
        const ally = world.getEntity(id)!;
        if (isReturning(ally)) {
          member.mode = "returning";
          continue;
        }
        const next = escortStep(distance(ally.location, player.location), member.mode);
        if (next === member.mode) continue;
        try {
          ally.triggerEvent(next === "guard" ? ALLY_GUARD_EVENT : ALLY_ESCORT_EVENT);
          member.mode = next;
          if (next === "guard") arrived = true;
        } catch {
          // Ya no está: la siguiente revisión lo quita.
        }
      }
      if (arrived) toRenew.push(group);
    }
    // Quien llega pasa a vigilar, pero el juego no le quita el objetivo que tenía, el marcador, y se quedaría dándole
    // golpes. Un par de ticks después, ya en su modo nuevo, se cambia el marcador por otro y lo pierde (como en
    // `orders.ts`). Quien aún va de camino toma el nuevo en su siguiente búsqueda.
    if (toRenew.length > 0) system.runTimeout(() => toRenew.forEach((g) => this.renewMarker(g)), 2);

    for (const player of players) {
      if (this.groups.get(player.id)?.auto !== undefined || this.autoCooldown.has(player.id)) continue;
      if (!isSurrounded(player.location, foes, this.auto)) continue;
      this.autoCooldown.set(player.id, this.auto.cooldown);
      try {
        player.dimension.playSound(HORN_SOUND, player.location, { volume: 4 });
      } catch {
        // Sin sonido no pasa nada.
      }
      const n = this.enlist(player, candidates, this.auto, this.auto.count, true);
      if (!n) {
        player.sendMessage(S.hornNobody);
        console.log(`[bastion] Cuerno automático de ${player.name}: ningún aliado puede acudir.`);
        continue;
      }
      this.groups.get(player.id)!.auto = 0;
      player.sendMessage(S.rescueCall(n));
      console.log(`[bastion] Cuerno automático de ${player.name}: acuden ${n} aliados.`);
    }
  }

  /** El jugador toca el cuerno de la mano: llama a su escolta, la completa o, agachado, la despide. */
  call(player: Player, candidates: readonly RescueCandidate[]): void {
    const group = this.groups.get(player.id);
    if (group) this.prune(group);
    const escort = group ? [...group.members].filter(([, m]) => !m.temporary).map(([id]) => id) : [];

    if (player.isSneaking) {
      if (escort.length === 0) {
        player.sendMessage(S.escortNone);
        return;
      }
      this.release(player.id, escort);
      player.sendMessage(S.escortDismissed);
      console.log(`[bastion] Cuerno de ${player.name}: despide a su escolta (${escort.length}).`);
      return;
    }

    const missing = this.horn.count - escort.length;
    if (missing <= 0) {
      player.sendMessage(S.escortFull);
      return;
    }
    const left = this.hornCooldown.get(player.id);
    if (left !== undefined) {
      player.sendMessage(S.hornCooldown(left));
      return;
    }
    const n = this.enlist(player, candidates, this.horn, missing, false);
    if (n === undefined) {
      player.sendMessage(S.escortNoSlot);
      return;
    }
    if (n === 0) {
      // Sin nadie libre no se gasta el cuerno: se puede volver a probar enseguida.
      player.sendMessage(S.hornNobody);
      console.log(`[bastion] Cuerno de ${player.name}: ningún aliado libre puede acudir.`);
      return;
    }
    this.hornCooldown.set(player.id, this.horn.cooldown);
    player.sendMessage(escort.length > 0 ? S.escortRefill(n) : S.escortCall(n));
    console.log(`[bastion] Cuerno de ${player.name}: ${n} aliados ${escort.length > 0 ? "completan" : "forman"} su escolta.`);
  }

  /** Fin de la oleada (o director apagado): todos vuelven a la orden vigente y se avisa a cada jugador. */
  dismissAll(): void {
    for (const [playerId, group] of [...this.groups]) {
      const hadEscort = [...group.members.values()].some((m) => !m.temporary);
      this.release(playerId, [...group.members.keys()]);
      if (hadEscort) world.getAllPlayers().find((p) => p.id === playerId)?.sendMessage(S.escortEnds);
    }
    this.autoCooldown.clear();
    this.hornCooldown.clear();
  }

  /** Olvida todo sin dar órdenes (reinicio): quita las etiquetas y los marcadores, también los de otra partida. */
  clear(): void {
    this.groups.clear();
    this.autoCooldown.clear();
    this.hornCooldown.clear();
    try {
      for (const tag of ALL_ESCORT_TAGS) for (const unit of this.dimension.getEntities({ tags: [tag] })) unit.removeTag(tag);
      for (const marker of this.dimension.getEntities({ families: [FAMILY.waypoint] })) {
        if (marker.getTags().some((t) => ALL_MARKER_TAGS.has(t))) marker.remove();
      }
    } catch (e) {
      console.warn(`[bastion] No se pudieron deshacer las escoltas: ${e}`);
    }
  }

  /**
   * Suma a la compañía del jugador hasta `count` aliados libres. Devuelve cuántos, o `undefined` si ya hay
   * `MAX_ESCORTS` jugadores acompañados.
   */
  private enlist(player: Player, candidates: readonly RescueCandidate[], options: RescueOptions, count: number, temporary: boolean): number | undefined {
    let group = this.groups.get(player.id);
    if (!group) {
      const used = new Set([...this.groups.values()].map((g) => g.slot));
      const slot = Array.from({ length: MAX_ESCORTS }, (_, i) => i).find((i) => !used.has(i));
      if (slot === undefined) return undefined;
      group = { slot, members: new Map(), at: player.location };
    }
    const free = candidates.filter((c) => c.entity.isValid && !this.isRescuer(c.entity.id));
    const ids = pickRescuers(
      player.location,
      free.map((c) => ({ id: c.entity.id, at: c.entity.location, tier: c.tier })),
      { ...options, count }
    );
    let added = 0;
    for (const id of ids) {
      try {
        const ally = free.find((c) => c.entity.id === id)!.entity;
        this.hooks.claim(ally);
        ally.addTag(escortTag(group.slot));
        ally.triggerEvent(ALLY_ESCORT_EVENT);
        group.members.set(id, { mode: "escort", temporary });
        added++;
      } catch {
        // Ya no está.
      }
    }
    if (added > 0 && !this.groups.has(player.id)) this.groups.set(player.id, group);
    if (added > 0) this.placeMarker(group, player.location);
    return added;
  }

  /** Devuelve a su orden a los `ids` de la compañía del jugador. Sin nadie más, la compañía se deshace. */
  private release(playerId: string, ids: readonly string[]): void {
    const group = this.groups.get(playerId);
    if (!group) return;
    for (const id of ids) {
      group.members.delete(id);
      const ally = world.getEntity(id);
      if (!ally?.isValid) continue;
      try {
        ally.removeTag(escortTag(group.slot));
        // Quien vuelve del agua retoma la orden vigente al terminar el regreso (`returnPath.ts`).
        if (!isReturning(ally)) this.hooks.restore(ally);
      } catch {
        // Ya no está.
      }
    }
    if (group.members.size === 0) this.drop(playerId);
  }

  /** Quita a los caídos. */
  private prune(group: Group): void {
    for (const id of [...group.members.keys()]) if (!world.getEntity(id)?.isValid) group.members.delete(id);
  }

  private drop(playerId: string): void {
    const group = this.groups.get(playerId);
    this.groups.delete(playerId);
    try {
      if (group?.marker?.isValid) group.marker.remove();
    } catch {
      // Ya no estaba.
    }
  }

  private placeMarker(group: Group, at: Vec3): void {
    group.at = at;
    try {
      if (group.marker?.isValid) {
        if (distance(group.marker.location, at) > MARKER_MOVE) group.marker.teleport(at);
        return;
      }
      const marker = this.dimension.spawnEntity(ENTITY_IDS.waypoint, at);
      marker.addTag(escortMarkerTag(group.slot));
      group.marker = marker;
    } catch {
      // Zona sin cargar: se reintenta en la siguiente revisión.
    }
  }

  private renewMarker(group: Group): void {
    if (![...this.groups.values()].includes(group)) return;
    try {
      if (group.marker?.isValid) group.marker.remove();
    } catch {
      // Ya no estaba.
    }
    group.marker = undefined;
    this.placeMarker(group, group.at);
  }
}
