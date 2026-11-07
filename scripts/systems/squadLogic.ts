import type { Vec3 } from "../maps/types";
import type { Side } from "../units/catalog";

/**
 * Lógica PURA del director de grupos (Fase 3, contra la «bolita»). Las unidades cuerpo a cuerpo de cada bando
 * se juntan en grupos pequeños por cercanía, y a cada grupo le toca un enemigo distinto, separado de los que
 * persiguen los demás grupos de su bando: el frente se reparte en vez de que todos vayan a por el más cercano.
 * Si un bando tiene más grupos de los que el frente admite, los que sobran esperan (reserva) hasta que haya hueco.
 * `squads.ts` aplica el resultado al mundo: etiquetas en las unidades y un marcador por grupo.
 */

export interface SquadUnit {
  readonly id: string;
  readonly side: Side;
  readonly at: Vec3;
  /** Si entra en grupos. Los jugadores y los que disparan cuentan como objetivo, pero no se agrupan. */
  readonly groupable: boolean;
}

export type SquadState = "advance" | "wait";

export interface Squad {
  readonly slot: number;
  readonly side: Side;
  members: string[];
  /** Enemigo que persigue el grupo; sin él, cada unidad hace lo de siempre. */
  target?: string;
  state: SquadState;
  /** Revisiones (segundos) que lleva esperando en la reserva. */
  waited?: number;
  /** Ya esperó bastante: avanza aunque el frente esté lleno. */
  committed?: boolean;
  /** La menor distancia a la que ha llegado de su objetivo actual. */
  best?: number;
  /** Revisiones (segundos) seguidas sin acercarse a su objetivo ni pelear. */
  stalled?: number;
  /** Enemigos a los que no supo llegar: no los vuelve a elegir. */
  ignored?: string[];
  /**
   * Va por una ruta del director de inalcanzables (`unreachable.ts`) hasta su objetivo: lo conserva aunque esté a
   * otra altura, no espera en la reserva y no lo deja por no acercarse (la ruta puede dar un rodeo). El director
   * decide si la guía falla.
   */
  guided?: boolean;
}

/** Un grupo que dejó su objetivo porque no se le acercaba. */
export interface GaveUp {
  readonly slot: number;
  readonly side: Side;
  readonly target: string;
  readonly members: readonly string[];
}

export interface SquadOptions {
  /** Unidades por grupo, como mucho. */
  readonly size: number;
  /** A esta distancia del centro de un grupo, una unidad suelta se suma a él. */
  readonly join: number;
  /** Quien se aleja más que esto del centro de su grupo lo deja. */
  readonly leave: number;
  /** Separación mínima entre los objetivos de dos grupos del mismo bando. */
  readonly spread: number;
  /**
   * Solo se reparten objetivos a esta altura (±) del enemigo más cercano: en un castillo, un enemigo separado de
   * los demás suele estar en lo alto de una torre, donde no se llega a pie.
   */
  readonly floor: number;
  /** Grupos a la vez, entre los dos bandos (las entidades tienen una entrada por cada uno). */
  readonly slots: number;
  /**
   * Grupos que pueden avanzar a la vez por cada grupo enemigo (el resto espera). `Infinity` = sin reserva.
   * Con 1, un bando con el doble de grupos que el otro deja la mitad atrás. Si el enemigo no tiene grupos
   * (solo jugadores, tiradores o aliados en su último reducto), no hay reserva.
   */
  readonly activePerEnemySquad: number;
  /**
   * Revisiones (segundos) que un grupo espera como mucho; después avanza aunque el frente esté lleno. Así la
   * reserva entra escalonada y nunca se queda quieta para siempre (la oleada no terminaría).
   */
  readonly maxWait: number;
  /**
   * Revisiones (segundos) sin acercarse `progress` bloques a su objetivo, ni tener un enemigo a `reach`, tras las
   * que el grupo lo deja: no hay camino hasta él (en lo alto de una muralla, al otro lado de un barranco...).
   */
  readonly giveUp: number;
  readonly progress: number;
  readonly reach: number;
}

/**
 * Medido en campo abierto (`tools/lab/field.ts`, 2026-11-06): con 1 grupo activo por grupo enemigo, el bando más
 * numeroso entraba por partes y perdía; con 1,5 conserva su ventaja y aun así baja la densidad y alarga la pelea.
 */
export const SQUAD_DEFAULTS: SquadOptions = { size: 8, join: 12, leave: 28, spread: 8, floor: 4, slots: 16, activePerEnemySquad: 1.5, maxWait: 30, giveUp: 15, progress: 2, reach: 6 };

const flat = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function centroid(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = Math.max(points.length, 1);
  return { x: x / n, y: y / n, z: z / n };
}

/** Centro de un grupo según dónde están ahora sus miembros. */
export function squadCenter(squad: Squad, byId: ReadonlyMap<string, SquadUnit>): Vec3 {
  return centroid(squad.members.flatMap((id) => (byId.has(id) ? [byId.get(id)!.at] : [])));
}

/**
 * Pone al día los grupos: quita a los muertos y a los que se alejaron, junta grupos pequeños cercanos, suma a
 * las unidades sueltas al grupo cercano con sitio y forma grupos nuevos con las que quedan, si hay hueco.
 * Devuelve la lista nueva; los grupos que siguen conservan su número (`slot`) y su objetivo.
 */
export function regroup(previous: readonly Squad[], units: readonly SquadUnit[], o: SquadOptions = SQUAD_DEFAULTS): Squad[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const squads: Squad[] = [];
  for (const old of previous) {
    const present = old.members.filter((id) => byId.get(id)?.groupable && byId.get(id)?.side === old.side);
    const center = centroid(present.map((id) => byId.get(id)!.at));
    const members = present.filter((id) => flat(byId.get(id)!.at, center) <= o.leave);
    if (members.length > 0) squads.push({ ...old, members });
  }

  // Dos grupos cercanos que caben en uno se juntan en el mayor: si no, quedan restos de 1 o 2 por todas partes.
  squads.sort((a, b) => b.members.length - a.members.length);
  for (let i = squads.length - 1; i >= 0; i--) {
    const small = squads[i];
    const center = squadCenter(small, byId);
    const host = squads.find(
      (s, j) => j < i && s.side === small.side && s.members.length + small.members.length <= o.size && flat(squadCenter(s, byId), center) <= o.join
    );
    if (!host) continue;
    host.members.push(...small.members);
    squads.splice(i, 1);
  }

  const grouped = new Set(squads.flatMap((s) => s.members));
  const loose = units.filter((u) => u.groupable && !grouped.has(u.id));
  const stillLoose: SquadUnit[] = [];
  // Centros de antes de sumar a nadie: basta para decidir a qué grupo se acerca cada una.
  const centers = new Map(squads.map((s) => [s, squadCenter(s, byId)]));
  for (const unit of loose) {
    let best: Squad | undefined;
    let bestD = o.join;
    for (const s of squads) {
      if (s.side !== unit.side || s.members.length >= o.size) continue;
      const d = flat(centers.get(s)!, unit.at);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) best.members.push(unit.id);
    else stillLoose.push(unit);
  }

  // Grupos nuevos: cada suelta reúne a las sueltas de su bando más cercanas, hasta llenar el grupo.
  const used = new Set(squads.map((s) => s.slot));
  const pending = new Set(stillLoose.map((u) => u.id));
  for (const seed of stillLoose) {
    if (!pending.has(seed.id)) continue;
    let slot = 0;
    while (used.has(slot)) slot++;
    if (slot >= o.slots) break;
    const mates = stillLoose
      .filter((u) => u.id !== seed.id && pending.has(u.id) && u.side === seed.side && flat(u.at, seed.at) <= o.join)
      .sort((a, b) => flat(a.at, seed.at) - flat(b.at, seed.at))
      .slice(0, o.size - 1);
    const members = [seed, ...mates].map((u) => u.id);
    members.forEach((id) => pending.delete(id));
    used.add(slot);
    squads.push({ slot, side: seed.side, members, state: "advance" });
  }
  return squads.sort((a, b) => a.slot - b.slot);
}

/**
 * Reparte el frente: a cada grupo, un enemigo vivo. Eligen primero los grupos más cercanos al enemigo. Cada uno
 * se queda con su objetivo si sigue vivo y no está encima del de otro grupo; si no, toma el enemigo más cercano
 * que esté a `spread` o más de los ya elegidos, a la altura del más cercano (`floor`), y si no queda ninguno así,
 * el más cercano. Cuando ya avanzan tantos grupos como admite el frente (`activePerEnemySquad`), el resto espera,
 * como mucho `maxWait` revisiones.
 *
 * Un grupo que pasa `giveUp` revisiones sin acercarse a su objetivo ni pelear lo deja y no lo vuelve a elegir
 * (elegido por Limbers, 2026-11-06): en Stonehill, un grupo invasor perseguía a un arquero de la muralla trepando
 * el acantilado y la oleada se estancó. Devuelve esos grupos, para que quien llama los encamine.
 */
/** Vuelve a contar con un enemigo que había dejado: el director encontró camino hasta él. */
export function unignore(squad: Squad, target: string): void {
  if (squad.ignored) squad.ignored = squad.ignored.filter((id) => id !== target);
}

export function assignTargets(squads: readonly Squad[], units: readonly SquadUnit[], o: SquadOptions = SQUAD_DEFAULTS): GaveUp[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const gaveUp: GaveUp[] = [];
  for (const side of ["ally", "invader"] as const) {
    const mine = squads.filter((s) => s.side === side);
    const enemies = units.filter((u) => u.side !== side);
    if (enemies.length === 0) {
      for (const s of mine) {
        s.target = undefined;
        s.state = "advance";
      }
      continue;
    }
    const enemySquads = squads.filter((s) => s.side !== side).length;
    const maxActive = enemySquads === 0 ? Infinity : Math.max(1, Math.ceil(enemySquads * o.activePerEnemySquad));

    const centers = new Map(mine.map((s) => [s.slot, squadCenter(s, byId)]));
    const gaps = new Map(mine.map((s) => [s.slot, Math.min(...enemies.map((e) => flat(e.at, centers.get(s.slot)!)))]));
    const order = [...mine].sort((a, b) => gaps.get(a.slot)! - gaps.get(b.slot)!);
    const chosen: Vec3[] = [];
    let active = 0;
    for (const squad of order) {
      // Quien ya esperó bastante avanza sin ocupar plaza: no manda a la reserva a otro.
      if (!squad.committed && !squad.guided) {
        if (active >= maxActive) {
          squad.state = "wait";
          squad.target = undefined;
          squad.waited = (squad.waited ?? 0) + 1;
          if (squad.waited >= o.maxWait) squad.committed = true;
          continue;
        }
        active++;
      }
      const center = centers.get(squad.slot)!;
      squad.state = "advance";
      const kept = squad.target === undefined ? undefined : byId.get(squad.target);
      if (squad.guided) {
        // Guiado por el director: conserva su objetivo mientras viva, y la guía es quien decide si falla.
        if (kept && kept.side !== side) {
          squad.stalled = 0;
          squad.best = undefined;
          chosen.push(kept.at);
          continue;
        }
        squad.guided = false;
      }
      const ignored = new Set(squad.ignored ?? []);
      const byDistance = enemies.filter((e) => !ignored.has(e.id)).sort((a, b) => flat(a.at, center) - flat(b.at, center));
      if (byDistance.length === 0) {
        // Ninguno al que sepa llegar: cada unidad hace lo de siempre.
        squad.target = undefined;
        continue;
      }
      const floorY = byDistance[0].at.y;
      const candidate = (e: SquadUnit) => Math.abs(e.at.y - floorY) <= o.floor && chosen.every((c) => flat(c, e.at) >= o.spread);
      const target = (kept && kept.side !== side && !ignored.has(kept.id) && candidate(kept) ? kept : undefined) ?? byDistance.find(candidate) ?? byDistance[0];

      const gap = dist(center, target.at);
      const fighting = enemies.some((e) => dist(e.at, center) <= o.reach);
      if (target.id !== squad.target || fighting || gap < (squad.best ?? Infinity) - o.progress) {
        squad.best = gap;
        squad.stalled = 0;
      } else if ((squad.stalled = (squad.stalled ?? 0) + 1) >= o.giveUp) {
        gaveUp.push({ slot: squad.slot, side, target: target.id, members: [...squad.members] });
        squad.ignored = [...ignored, target.id];
        squad.target = undefined;
        squad.best = undefined;
        squad.stalled = 0;
        continue;
      }
      squad.target = target.id;
      chosen.push(target.at);
    }
  }
  return gaveUp;
}
