/**
 * Roles: cómo pelea cada unidad según su bando. Cada uno da sus componentes propios y sus modos (grupos de
 * componentes entre los que la unidad cambia con eventos). El primer modo es el de aparición.
 */
import { ALLY_ESCORT_EVENT, ALLY_GUARD_EVENT, FAMILY } from "../../scripts/constants";
import type { Role, Side, UnitDef } from "../../scripts/units/catalog";
import {
  allyTarget,
  escortTargeting,
  foe,
  GUARD_RANGE,
  holdingAllyTarget,
  holdingHurtByTarget,
  foeOnLand,
  invaderOnLand,
  home,
  huntTargeting,
  hurtByTarget,
  isFamily,
  type Json,
  keepAway,
  melee,
  nearestTarget,
  ranged,
  rankedTarget,
  retreatTargeting,
  returnTargeting,
  sortieHunt,
  stroll,
} from "./behavior";

/** Nombre del grupo de regreso a pie; su evento es `bastion:return`. */
export const RETURNING = "bastion:returning";

export interface Behavior {
  /** Componentes que el rol añade a los de todas las unidades. */
  readonly components: Json;
  /** Modos, en orden; el primero es con el que aparece. */
  readonly modes: Readonly<Record<string, Json>>;
}

type RoleBuilder = (unit: UnitDef) => Behavior;

// ------------------------------------------------------------------ aliados

/**
 * Modos de los aliados. Patrulla al aparecer, combate tras la brecha y obedece las órdenes del jugador
 * (`retreat`, `hold`, `sortie`). Retirada y regreso son iguales para todos los roles.
 */
function allyModes(own: { patrol: Json; fight: Json; hold: Json; sortie: Json }): Record<string, Json> {
  return {
    "bastion:patrol": own.patrol,
    "bastion:fight": own.fight,
    [RETURNING]: {
      "minecraft:behavior.nearest_prioritized_attackable_target": returnTargeting("ally"),
      "minecraft:behavior.melee_attack": melee(),
      "minecraft:behavior.hurt_by_target": hurtByTarget("ally"),
    },
    "bastion:hold": own.hold,
    "bastion:retreat": {
      "minecraft:behavior.nearest_prioritized_attackable_target": retreatTargeting(),
      "minecraft:behavior.melee_attack": melee(1.3),
    },
    "bastion:sortie": own.sortie,
  };
}

/**
 * Soldado aliado: se defiende de lo que tiene cerca y puede alcanzar, sin alejarse de su puesto; antes los
 * invasores que los monstruos (`allyTarget`). Solo él puede ser escolta del cuerno.
 */
const allyMelee: RoleBuilder = () => {
  const core = {
    "minecraft:behavior.melee_attack": melee(),
    "minecraft:behavior.hurt_by_target": holdingHurtByTarget(),
  };
  // Si tiene delante el doble de enemigos, aguanta: solo va a por quien se le acerca (`scripts/systems/stance.ts`).
  const fightCore = (maxDist: number) => ({
    ...core,
    "minecraft:behavior.nearest_prioritized_attackable_target": holdingAllyTarget({ priority: 3, maxDist, mustReach: true }),
  });
  const base: Behavior = {
    components: {},
    modes: allyModes({
      patrol: {
        ...home(10, 5, 0.7),
        "minecraft:behavior.random_stroll": stroll({ speed: 0.6, xz: 10, y: 3, interval: 60 }),
        ...fightCore(16),
      },
      fight: { ...fightCore(24), ...home(24, 4, 1.0) },
      hold: { "minecraft:behavior.random_stroll": stroll({ speed: 0.6, xz: 4, y: 3, interval: 120 }), ...fightCore(16) },
      sortie: {
        ...core,
        "minecraft:behavior.nearest_attackable_target": nearestTarget({ priority: 3, filters: invaderOnLand, maxDist: 24, mustReach: true, squads: true }),
        "minecraft:behavior.nearest_prioritized_attackable_target": sortieHunt(true, true),
      },
    }),
  };
  return {
    components: base.components,
    modes: {
      ...base.modes,
      // Escolta del cuerno (`scripts/systems/rescue.ts`): de camino hacia su jugador y, a su lado, vigilando.
      [ALLY_ESCORT_EVENT]: { ...core, "minecraft:behavior.nearest_prioritized_attackable_target": escortTargeting() },
      [ALLY_GUARD_EVENT]: { ...fightCore(GUARD_RANGE), "minecraft:behavior.random_stroll": stroll({ speed: 0.6, xz: 3, y: 2, interval: 80 }) },
    },
  };
};

/** Pirómano aliado: guardia fija que dispara a lo que ve desde su puesto; solo camina con la orden de ataque. */
const allyCaster: RoleBuilder = () => {
  const guard = (radius: number) => ({
    "minecraft:behavior.ranged_attack": ranged({ speed: 0, interval: [3, 4], radius }),
    "minecraft:behavior.nearest_prioritized_attackable_target": allyTarget({ priority: 3, maxDist: radius, mustSee: true }),
  });
  return {
    components: {
      "minecraft:behavior.hurt_by_target": hurtByTarget("ally"),
      // Disparan desde lo alto: que los golpes y las explosiones no los tiren abajo.
      "minecraft:knockback_resistance": { value: 1 },
    },
    modes: allyModes({
      patrol: guard(32),
      fight: guard(40),
      hold: guard(32),
      sortie: {
        "minecraft:behavior.ranged_attack": ranged({ speed: 1.0, interval: [3, 4], radius: 20 }),
        "minecraft:behavior.nearest_attackable_target": nearestTarget({ priority: 3, filters: invaderOnLand, maxDist: 24, mustReach: true }),
        "minecraft:behavior.nearest_prioritized_attackable_target": sortieHunt(false),
      },
    }),
  };
};

/**
 * Arquero aliado: como el pirómano, guardia fija que dispara a lo que ve desde su puesto, pero más rápido y
 * más cerca (sus cifras, en la ficha). Si un enemigo se le echa encima, se aparta y sigue disparando; pasado
 * el peligro vuelve a su sitio (salvo en la retirada, donde su sitio es el puesto y lo vigila `orders.ts`).
 * Con la orden de ataque camina y dispara a quien vea.
 */
const allyArcher: RoleBuilder = (unit) => {
  const { interval, radius } = rangedOf(unit);
  const guard = {
    "minecraft:behavior.ranged_attack": ranged({ speed: 0, interval, radius }),
    "minecraft:behavior.nearest_prioritized_attackable_target": allyTarget({ priority: 3, maxDist: radius, mustSee: true }),
    "minecraft:behavior.avoid_mob_type": keepAway("ally"),
  };
  const atPost = { ...guard, ...home(3, 4, 1.0) };
  return {
    components: {
      "minecraft:behavior.hurt_by_target": hurtByTarget("ally"),
      // Disparan desde lo alto: que los golpes y las explosiones no los tiren abajo.
      "minecraft:knockback_resistance": { value: 1 },
    },
    modes: allyModes({
      patrol: atPost,
      fight: atPost,
      hold: guard,
      sortie: {
        "minecraft:behavior.avoid_mob_type": keepAway("ally"),
        "minecraft:behavior.ranged_attack": ranged({ speed: 1.0, interval, radius: Math.min(radius, 20) }),
        "minecraft:behavior.nearest_attackable_target": nearestTarget({ priority: 3, filters: invaderOnLand, maxDist: 24, mustReach: true }),
        "minecraft:behavior.nearest_prioritized_attackable_target": sortieHunt(false),
      },
    }),
  };
};

/** Alcance y ritmo de quien dispara flechas, de su ficha. */
function rangedOf(unit: UnitDef): { interval: readonly [number, number]; radius: number } {
  if (!unit.ranged) throw new Error(`${unit.id}: un arquero necesita \`ranged\` en su ficha.`);
  return unit.ranged;
}

// ------------------------------------------------------------------ invasores

const invaderBase = {
  "minecraft:behavior.hurt_by_target": hurtByTarget("invader"),
  "minecraft:behavior.random_stroll": stroll({ speed: 0.8 }),
};

/** Soldado invasor: va a por quien pueda alcanzar y, si no, caza al enemigo vivo más cercano. */
const invaderMelee: RoleBuilder = () => ({
  components: { "minecraft:behavior.melee_attack": melee(), ...invaderBase },
  modes: {
    "bastion:march": {
      "minecraft:behavior.nearest_attackable_target": nearestTarget({ priority: 2, filters: foeOnLand("invader"), maxDist: 24, mustReach: true, squads: true }),
      "minecraft:behavior.nearest_prioritized_attackable_target": huntTargeting(),
    },
    [RETURNING]: { "minecraft:behavior.nearest_prioritized_attackable_target": returnTargeting("invader") },
  },
});

/** Mago invasor: ataca el muro (el punto de mira) hasta la brecha; después, a aliados y jugadores. */
const invaderCaster: RoleBuilder = () => ({
  components: { ...invaderBase },
  modes: {
    "bastion:siege": {
      "minecraft:behavior.nearest_attackable_target": nearestTarget({ priority: 2, filters: isFamily(FAMILY.aim), maxDist: 80 }),
      "minecraft:behavior.ranged_attack": ranged({ interval: [2, 3], radius: 16 }),
    },
    "bastion:assault": {
      "minecraft:behavior.nearest_attackable_target": nearestTarget({ priority: 2, filters: foeOnLand("invader"), maxDist: 256 }),
      "minecraft:behavior.ranged_attack": ranged({ interval: [3, 5], radius: 16 }),
    },
    [RETURNING]: {
      "minecraft:behavior.nearest_prioritized_attackable_target": returnTargeting("invader"),
      "minecraft:behavior.melee_attack": melee(),
    },
  },
});

/**
 * Arquero invasor: dispara a quien ve a su alcance y, si no ve a nadie, se acerca al enemigo vivo más cercano.
 * Si alguien se le echa encima, se aparta y sigue disparando.
 * Antes de la brecha eso le deja ante el muro, disparando a quien asome por la muralla. No apunta a la meta
 * ni al muro: sus flechas no lo rompen. Su modo se llama como el del soldado, para reanudarlo igual al
 * terminar un regreso o la ruta de subida.
 */
const invaderArcher: RoleBuilder = (unit) => {
  const { interval, radius } = rangedOf(unit);
  return {
    components: { ...invaderBase },
    modes: {
      "bastion:march": {
        "minecraft:behavior.avoid_mob_type": keepAway("invader"),
        "minecraft:behavior.ranged_attack": ranged({ speed: 1.0, interval, radius }),
        "minecraft:behavior.nearest_attackable_target": nearestTarget({ priority: 2, filters: foeOnLand("invader"), maxDist: radius, mustSee: true }),
        "minecraft:behavior.nearest_prioritized_attackable_target": rankedTarget(3, [{ filters: foeOnLand("invader"), maxDist: 256, rank: 0 }]),
      },
      [RETURNING]: {
        "minecraft:behavior.nearest_prioritized_attackable_target": returnTargeting("invader"),
        "minecraft:behavior.melee_attack": melee(),
      },
    },
  };
};

export const ROLES: Readonly<Record<Side, Readonly<Record<Role, RoleBuilder>>>> = {
  ally: { melee: allyMelee, caster: allyCaster, archer: allyArcher },
  invader: { melee: invaderMelee, caster: invaderCaster, archer: invaderArcher },
};
