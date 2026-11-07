/**
 * Piezas de comportamiento de las unidades, en un solo sitio. Cada función devuelve un trozo de JSON de
 * entidad de Bedrock. Lo que es común (regreso a pie, peleas en el agua, a quién se ataca) se define aquí una
 * vez; los roles (`roles.ts`) lo combinan.
 */
import {
  FAMILY,
  HUNT_TRAILS,
  KEEP_TAG,
  TO_KEEP_TAG,
  huntTrailTag,
  INTRUDER_TAG,
  MAX_POSTS,
  postMarkerTag,
  postTag,
  MAX_RETURN_ROUTES,
  MAX_RETURN_STAGES,
  RALLY_TAG,
  returnRouteTag,
  returnStageTag,
  returnWaypointTag,
  SORTIE_TAG,
  HOLD_LINE_TAG,
  MAX_ESCORTS,
  escortMarkerTag,
  escortTag,
  MAX_SQUADS,
  SQUAD_ENGAGE,
  SQUAD_TAG,
  SQUAD_WAIT_TAG,
  squadMarkerTag,
  squadTag,
} from "../../scripts/constants";
import { HOLD_ENGAGE } from "../../scripts/systems/stanceLogic";
import type { Side } from "../../scripts/units/catalog";

export type Json = Record<string, unknown>;

/** Familia de los proyectiles del pirómano aliado (`ally_bolt.json`). */
export const ALLY_BOLT_FAMILY = "bastion_ally_bolt";
/**
 * Familia que los monstruos del juego (zombis, esqueletos, arañas...) atacan además del jugador: la del gólem
 * de hierro. Los aliados la llevan para que los monstruos los vean como enemigos, igual que ellos a los monstruos.
 */
export const MONSTER_PREY_FAMILY = "irongolem";
/** Todas las unidades la llevan; las herramientas de medida cuentan con ella. */
export const UNIT_FAMILY = "bastion_unit";

/** Cada cuánto se busca enemigo: cada 2 s. Más a menudo pesa demasiado en batallas grandes. */
export const SCAN_INTERVAL = 40;

/**
 * `reselect_targets` en todos los buscadores de objetivo. Con él, quien ya tiene objetivo revisa en cada tick todas
 * las entradas del buscador, y el coste crece con unidades × entradas × entidades al alcance: es lo que hunde la
 * batalla de 400 unidades a 2-4 ticks/s (sin él, 19-20; `tools/lab/cost.mjs` y `tools/lab/entries.mjs`, 2026-11-07).
 *
 * Pero sin él, quien tiene objetivo lo conserva aunque sus filtros ya no se cumplan, y el script cambia a quién
 * persigue cada unidad cambiándole etiquetas (etapa de la ruta, grupo, rastro, postura): en Stonehill los invasores
 * se quedaban en el primer hito de la subida. Volver a añadir el grupo del modo los despierta; añadir un grupo vacío,
 * no. Se queda en `true` mientras se decide la migración a Java (docs/IA.md, «Coste en batallas grandes, otra vez»).
 */
export const RESELECT_TARGETS = true;
/** Hasta dónde se comprueba si se puede llegar a pie a un enemigo (`must_reach`): es lo más caro. */
export const MAX_REACH_CHECK = 24;
/** Golpe cuerpo a cuerpo cada 1,5 s. */
export const MELEE_COOLDOWN = 1.5;

// ------------------------------------------------------------------ filtros

export const isFamily = (value: string, subject = "other") => ({ test: "is_family", subject, value });
export const hasTag = (subject: "self" | "other", value: string) => ({ test: "has_tag", subject, value });
export const lacksTag = (subject: "self" | "other", value: string) => ({ test: "has_tag", subject, operator: "!=", value });

/** Quien está en un grupo del director (`scripts/systems/squads.ts`). */
export const inSquad = hasTag("self", SQUAD_TAG);
export const notInSquad = lacksTag("self", SQUAD_TAG);
/** Quien no está en un grupo de reserva: la reserva no va a buscar a nadie. */
export const notWaiting = lacksTag("self", SQUAD_WAIT_TAG);

/** Solo se apunta a quien nada si uno también está en el agua; así nadie se queda mirando el lago. */
export const notSwimmingUnlessISwim = {
  any_of: [
    { test: "in_water", subject: "other", operator: "!=", value: true },
    { test: "in_water", subject: "self", value: true },
  ],
};

/** Monstruos del juego, todos: zombis, esqueletos, arañas, creepers, endermen, brujas... */
export const hostileMob = isFamily("monster");

/** A esta distancia, un monstruo es una amenaza aunque esté fuera del castillo y no ataque a nadie. */
export const MONSTER_NEAR = 6;

/** Enemigos del bando: invasores y monstruos para los aliados; aliados y jugadores para los invasores. */
export function foe(side: Side): Json {
  return side === "ally" ? { any_of: [isFamily(FAMILY.invader), hostileMob] } : { any_of: [isFamily(FAMILY.ally), isFamily("player")] };
}

/** Enemigos a los que se puede ir: los de `foe` que no nadan, salvo que uno también nade. */
export function foeOnLand(side: Side): Json {
  return { all_of: [foe(side), notSwimmingUnlessISwim] };
}

// ------------------------------------------------------------------ objetivos

export interface TargetOptions {
  readonly priority: number;
  readonly filters: Json;
  readonly maxDist: number;
  /** Solo lo que se ve. */
  readonly mustSee?: boolean;
  /** Solo lo que se puede alcanzar a pie. Cuesta: hasta `MAX_REACH_CHECK` bloques. */
  readonly mustReach?: boolean;
  /** Quien está en un grupo solo se lanza contra lo que tiene a `SQUAD_ENGAGE`; más lejos, sigue a su grupo. */
  readonly squads?: boolean;
}

/** El enemigo más cercano que cumple el filtro. */
export function nearestTarget(o: TargetOptions): Json {
  if (o.mustReach && o.maxDist > MAX_REACH_CHECK) throw new Error(`must_reach hasta ${o.maxDist} bloques: el máximo es ${MAX_REACH_CHECK}.`);
  return {
    priority: o.priority,
    must_see: o.mustSee ?? false,
    reselect_targets: RESELECT_TARGETS,
    entity_types: o.squads
      ? [
          { filters: { all_of: [o.filters, notInSquad] }, max_dist: o.maxDist },
          { filters: { all_of: [o.filters, inSquad] }, max_dist: Math.min(o.maxDist, SQUAD_ENGAGE) },
        ]
      : [{ filters: o.filters, max_dist: o.maxDist }],
    ...(o.mustReach ? { must_reach: true } : {}),
    scan_interval: SCAN_INTERVAL,
  };
}

export interface Choice {
  readonly filters: Json;
  readonly maxDist: number;
  /** Menor = antes. */
  readonly rank: number;
}

/** Solo lo que no nada, salvo que uno también nade. */
const onLand = (filters: Json): Json => ({ all_of: [filters, notSwimmingUnlessISwim] });

/**
 * A quién apuntan los aliados, en orden: primero los invasores, siempre. Después los monstruos, pero solo los que
 * están dentro del castillo o acaban de atacar a un jugador (`INTRUDER_TAG`) y los que tiene encima
 * (`MONSTER_NEAR`): no se va al bosque a cazar zombis.
 */
export function allyChoices(maxDist: number, landOnly = false): Choice[] {
  const f = landOnly ? onLand : (x: Json) => x;
  return [
    { filters: f(isFamily(FAMILY.invader)), maxDist, rank: 0 },
    { filters: f({ all_of: [hostileMob, hasTag("other", INTRUDER_TAG)] }), maxDist, rank: 1 },
    { filters: f(hostileMob), maxDist: Math.min(maxDist, MONSTER_NEAR), rank: 1 },
  ];
}

/** El objetivo de un aliado según `allyChoices`. Va en `nearest_prioritized_attackable_target`. */
export function allyTarget(o: Omit<TargetOptions, "filters">): Json {
  if (o.mustReach && o.maxDist > MAX_REACH_CHECK) throw new Error(`must_reach hasta ${o.maxDist} bloques: el máximo es ${MAX_REACH_CHECK}.`);
  return { ...rankedTarget(o.priority, allyChoices(o.maxDist), o.mustSee), ...(o.mustReach ? { must_reach: true } : {}) };
}

/** Quien aguanta en su sitio porque tiene delante el doble de enemigos (`scripts/systems/stance.ts`). */
export const holding = hasTag("self", HOLD_LINE_TAG);
export const notHolding = lacksTag("self", HOLD_LINE_TAG);
/** Quien aguanta y recibe un golpe solo responde si el atacante está a esta distancia: no sale tras los tiradores. */
export const HOLD_HURT_RANGE = 8;

/**
 * Como `allyTarget`, pero quien aguanta en su sitio (`holding`) solo va a por quien tiene a `HOLD_ENGAGE`: el
 * defensor en desventaja deja que vengan a él (elegido por Limbers, 2026-11-07).
 */
export function holdingAllyTarget(o: Omit<TargetOptions, "filters">): Json {
  if (o.mustReach && o.maxDist > MAX_REACH_CHECK) throw new Error(`must_reach hasta ${o.maxDist} bloques: el máximo es ${MAX_REACH_CHECK}.`);
  const when = (cond: Json) => (c: Choice): Choice => ({ ...c, filters: { all_of: [c.filters, cond] } });
  const choices = [...allyChoices(o.maxDist).map(when(notHolding)), ...allyChoices(Math.min(o.maxDist, HOLD_ENGAGE)).map(when(holding))];
  return { ...rankedTarget(o.priority, choices, o.mustSee), ...(o.mustReach ? { must_reach: true } : {}) };
}

/** Como `hurtByTarget("ally")`, pero quien aguanta solo responde a quien le golpea de cerca. */
export function holdingHurtByTarget(): Json {
  return {
    priority: 1,
    entity_types: [
      { filters: { all_of: [foe("ally"), notHolding] }, max_dist: 48 },
      { filters: { all_of: [foe("ally"), holding] }, max_dist: HOLD_HURT_RANGE },
    ],
  };
}

/** Invasores a los que se puede ir: para la orden de ataque, que es solo contra ellos. */
export const invaderOnLand = onLand(isFamily(FAMILY.invader));

/** El objetivo de mejor rango que haya; se usa para seguir hitos, rastros y puntos de reunión. */
export function rankedTarget(priority: number, choices: readonly Choice[], mustSee = false): Json {
  return {
    priority,
    must_see: mustSee,
    reselect_targets: RESELECT_TARGETS,
    persist_time: 0,
    entity_types: choices.map((c) => ({ filters: c.filters, max_dist: c.maxDist, priority: c.rank })),
    scan_interval: SCAN_INTERVAL,
  };
}

// ------------------------------------------------------------------ ataques

export function melee(speed = 1.15): Json {
  return { priority: 2, speed_multiplier: speed, track_target: true, cooldown_time: MELEE_COOLDOWN };
}

export interface RangedOptions {
  /** Velocidad al acercarse; 0 = dispara desde su puesto. Sin valor, la del juego. */
  readonly speed?: number;
  readonly interval: readonly [number, number];
  readonly radius: number;
}

export function ranged(o: RangedOptions): Json {
  return {
    priority: 2,
    ...(o.speed === undefined ? {} : { speed_multiplier: o.speed }),
    attack_interval_min: o.interval[0],
    attack_interval_max: o.interval[1],
    attack_radius: o.radius,
  };
}

/** Responder a quien le golpea. Los aliados solo responden a invasores, para no volverse contra el jugador. */
export function hurtByTarget(side: Side): Json {
  if (side === "invader") return { priority: 1 };
  return { priority: 1, entity_types: { filters: foe("ally"), max_dist: 48 } };
}

// ------------------------------------------------------------------ movimiento

export function stroll(o: { speed: number; xz?: number; y?: number; interval?: number }): Json {
  return {
    priority: 6,
    speed_multiplier: o.speed,
    ...(o.xz === undefined ? {} : { xz_dist: o.xz }),
    ...(o.y === undefined ? {} : { y_dist: o.y }),
    ...(o.interval === undefined ? {} : { interval: o.interval }),
  };
}

/** Atado a un radio alrededor de donde apareció. */
export function home(radius: number, priority: number, speed: number): Json {
  return {
    "minecraft:home": { restriction_type: "random_movement", restriction_radius: radius },
    "minecraft:behavior.move_towards_home_restriction": { priority, speed_multiplier: speed },
  };
}

/** A esta distancia de un enemigo, el arquero retrocede: dispara de lejos, no cuerpo a cuerpo. */
export const KEEP_AWAY = 5;

/**
 * Mantener la distancia (arqueros): si un enemigo se le acerca a menos de `KEEP_AWAY`, se aparta unos bloques
 * y vuelve a disparar en cuanto puede. Acorralado, sin sitio adonde ir, sigue disparando a quemarropa: el
 * apartarse solo gana mientras encuentra camino. Va por delante del disparo (prioridad 1 frente a 2).
 */
export function keepAway(side: Side): Json {
  return {
    priority: 1,
    entity_types: [{ filters: foe(side), max_dist: KEEP_AWAY, walk_speed_multiplier: 1.0, sprint_speed_multiplier: 1.2 }],
    avoid_target_xz: 8,
    avoid_target_y: 4,
    remove_target: false,
  };
}

// ------------------------------------------------------------------ comportamientos comunes

/**
 * Regreso a pie tras caer al agua: pelea con quien tenga cerca y si no va al hito de su ruta y tramo
 * (`scripts/systems/returnPath.ts` le pone las etiquetas). Nunca se teletransporta.
 */
export function returnTargeting(side: Side): Json {
  const stages: Choice[] = [];
  for (let route = 0; route < MAX_RETURN_ROUTES; route++) {
    for (let stage = 0; stage < MAX_RETURN_STAGES; stage++) {
      const filters = { all_of: [hasTag("self", returnRouteTag(route)), hasTag("self", returnStageTag(stage)), hasTag("other", returnWaypointTag(route, stage))] };
      stages.push({ filters, maxDist: 200, rank: 1 });
    }
  }
  return rankedTarget(2, [{ filters: foe(side), maxDist: 12, rank: 0 }, ...stages]);
}

/**
 * Orden de retirada: corre a su puesto de defensa (`scripts/systems/orders.ts` le pone la etiqueta) o, sin
 * puesto, al patio. Solo se defiende de quien tiene encima. El repliegue por la moral usa el mismo modo: al patio
 * o, quien lleva `TO_KEEP_TAG`, a la torre.
 */
export function retreatTargeting(): Json {
  const posts: Choice[] = [];
  for (let i = 0; i < MAX_POSTS; i++) {
    posts.push({ filters: { all_of: [hasTag("self", postTag(i)), hasTag("other", postMarkerTag(i))] }, maxDist: 200, rank: 1 });
  }
  const keep: Choice = { filters: { all_of: [hasTag("self", TO_KEEP_TAG), hasTag("other", KEEP_TAG)] }, maxDist: 200, rank: 1 };
  return rankedTarget(2, [{ filters: foe("ally"), maxDist: 5, rank: 0 }, ...posts, keep, { filters: hasTag("other", RALLY_TAG), maxDist: 200, rank: 2 }]);
}

/**
 * Orden de ataque: va a por el invasor vivo más cercano, esté donde esté, como hacen los invasores con
 * los aliados. A los monstruos, solo si no queda ningún invasor (y solo a los de `allyChoices`); en cuanto
 * muere el último invasor, `siegeManager` les manda volver al castillo. Mientras tanto, quien pelea cuerpo a
 * cuerpo espera en el punto de salida; quien dispara no, porque dispararía al marcador.
 */
export function sortieHunt(waitAtSortiePoint: boolean, squads = false): Json {
  const [invaders, ...monsters] = allyChoices(32, true);
  const free = (c: Choice, rank: number): Choice => ({ ...c, rank, filters: squads ? { all_of: [c.filters, notWaiting] } : c.filters });
  const choices: Choice[] = [...(squads ? squadChoices(0) : []), free({ ...invaders, maxDist: 256 }, 1), ...monsters.map((m) => free(m, 2))];
  if (waitAtSortiePoint) choices.push(free({ filters: hasTag("other", SORTIE_TAG), maxDist: 200, rank: 3 }, 3));
  return rankedTarget(4, choices);
}

/** El escolta que va hacia su jugador se para a pelear con quien tenga a esta distancia. */
export const ESCORT_ENGAGE = 6;
/** El escolta que vigila junto a su jugador va a por quien se acerque a esta distancia. */
export const GUARD_RANGE = 10;

/**
 * Escolta del cuerno, de camino (`scripts/systems/rescue.ts`): pelea con quien tenga encima y, si no, va al marcador
 * que sigue a su jugador (una entrada por escolta). Al llegar, el script le pasa a vigilar (`guard`).
 */
export function escortTargeting(): Json {
  const markers: Choice[] = [];
  for (let slot = 0; slot < MAX_ESCORTS; slot++) {
    markers.push({ filters: { all_of: [hasTag("self", escortTag(slot)), hasTag("other", escortMarkerTag(slot))] }, maxDist: 256, rank: 2 });
  }
  return rankedTarget(3, [...allyChoices(ESCORT_ENGAGE, true), ...markers]);
}

/**
 * El marcador de su grupo (`scripts/systems/squads.ts`): el director lo pone sobre el enemigo que le toca al
 * grupo, distinto del de los demás grupos de su bando. Una entrada por grupo.
 */
export function squadChoices(rank: number): Choice[] {
  const choices: Choice[] = [];
  for (let slot = 0; slot < MAX_SQUADS; slot++) {
    choices.push({ filters: { all_of: [hasTag("self", squadTag(slot)), hasTag("other", squadMarkerTag(slot))] }, maxDist: 256, rank });
  }
  return choices;
}

/**
 * La caza de los invasores (`scripts/systems/hunt.ts`): su rastro si tiene uno; si no, el marcador de su grupo
 * (`squads.ts`); si no, el enemigo vivo más cercano y, solo si no queda nadie, la meta de la puerta. La reserva
 * de un grupo no va a por nadie: espera donde está.
 */
export function huntTargeting(): Json {
  const trails: Choice[] = [];
  for (let slot = 0; slot < HUNT_TRAILS; slot++) {
    const tag = huntTrailTag(slot);
    trails.push({ filters: { all_of: [hasTag("self", tag), hasTag("other", tag)] }, maxDist: 256, rank: 0 });
  }
  return rankedTarget(3, [
    ...trails,
    ...squadChoices(1),
    { filters: { all_of: [foeOnLand("invader"), notWaiting] }, maxDist: 256, rank: 2 },
    { filters: { all_of: [isFamily(FAMILY.objective), notWaiting] }, maxDist: 256, rank: 3 },
  ]);
}

/** De qué daño se libra cada bando: el de los suyos y el fuego. Los invasores, también las explosiones. */
export function damageSensor(side: Side): Json {
  const friendly =
    side === "ally"
      ? [isFamily("player"), isFamily(FAMILY.ally), isFamily(ALLY_BOLT_FAMILY)]
      : [isFamily(FAMILY.bolt), isFamily(FAMILY.invader)];
  const causes = side === "ally" ? ["fire", "fire_tick"] : ["entity_explosion", "fire", "fire_tick"];
  return {
    triggers: [
      { on_damage: { filters: { any_of: friendly } }, deals_damage: "no" },
      ...causes.map((cause) => ({ cause, deals_damage: "no" })),
    ],
  };
}
