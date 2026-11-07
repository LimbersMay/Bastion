import { ENTITY_IDS } from "../constants";

/**
 * Fichas de las unidades. Cada ficha dice qué es la unidad; `tools/units/` genera con ella sus archivos del
 * juego (`npm run units`). Añadir una unidad = una ficha aquí + sus skins en `textures/entity/`.
 * No importa `@minecraft/server`, así que se puede usar en los tests y en el generador.
 */
export type UnitId = "ally_soldier" | "ally_warrior" | "ally_wizard" | "ally_archer" | "invader_soldier" | "invader_wizard" | "invader_archer";

/** El bando decide quiénes son sus enemigos, de qué daño se libra y qué órdenes obedece. */
export type Side = "ally" | "invader";

/**
 * Cómo pelea. `melee`: cuerpo a cuerpo; los invasores además cazan y derriban paredes.
 * `caster`: lanza proyectiles. El aliado dispara desde su puesto; el invasor ataca el muro hasta la brecha.
 * `archer`: dispara flechas a quien ve. El aliado, desde su puesto; el invasor sube con la oleada y dispara a
 * quien asome por la muralla. No toca el muro.
 */
export type Role = "melee" | "caster" | "archer";

export interface UnitDef {
  readonly id: UnitId;
  readonly entityId: string;
  readonly side: Side;
  readonly role: Role;
  /** Nombre en el juego, por idioma. */
  readonly name: { readonly es: string; readonly en: string };
  /** Nombre del huevo generador; sin él, el idioma no lo nombra. */
  readonly egg?: { readonly es?: string; readonly en?: string };
  readonly health: number;
  /** Golpe cuerpo a cuerpo, con el arma incluida; los que disparan también lo usan al regresar a pie. */
  readonly damage: number;
  /** Velocidad al andar (`minecraft:movement`). */
  readonly speed: number;
  /** Proyectil de quien dispara. */
  readonly projectile?: string;
  /** Lo que lleva en la mano derecha: un objeto normal del juego. Se ve, pero no se suelta al morir. */
  readonly weapon?: string;
  /**
   * Skins: `textures/entity/<skin>.png`. Cada unidad sale con una al azar, para que un ejército no sean
   * clones. De dónde sale cada una y su autor: `docs/SKINS.md`.
   */
  readonly skins: readonly string[];
  /** Colores del huevo generador: fondo y motas. */
  readonly eggColors: readonly [string, string];
  /** De 0 a 1: cuánto aguanta los empujones (`minecraft:knockback_resistance`). Sin valor, lo normal. */
  readonly knockbackResistance?: number;
  /** Ataque a distancia: segundos entre disparos y alcance en bloques. Solo para quien dispara. */
  readonly ranged?: { readonly interval: readonly [number, number]; readonly radius: number };
}

/** ¿Pelea a distancia (magos y arqueros)? */
export const isShooter = (unit: UnitDef | undefined) => unit !== undefined && unit.role !== "melee";

/** `<base>_0` … `<base>_<n-1>`. */
const skinSet = (base: string, count: number) => Array.from({ length: count }, (_, i) => `${base}_${i}`);

export const UNITS: Readonly<Record<UnitId, UnitDef>> = {
  ally_soldier: {
    id: "ally_soldier",
    entityId: ENTITY_IDS.allySoldier,
    side: "ally",
    role: "melee",
    name: { es: "Soldado aliado", en: "Allied Soldier" },
    egg: { es: "Huevo generador de soldado aliado", en: "Allied Soldier Spawn Egg" },
    health: 60,
    // 4 de base + 6 de la espada de hierro.
    damage: 10,
    speed: 0.29,
    weapon: "minecraft:iron_sword",
    skins: skinSet("ally_soldier", 4),
    eggColors: ["#2b4c9b", "#c9ced6"],
  },
  ally_warrior: {
    id: "ally_warrior",
    entityId: ENTITY_IDS.allyWarrior,
    side: "ally",
    role: "melee",
    name: { es: "Guerrero aliado", en: "Allied Warrior" },
    egg: { es: "Huevo generador de guerrero aliado", en: "Allied Warrior Spawn Egg" },
    // El tanque de la brecha (elegido por Limbers, 2026-11-06): más vida y golpe, más lento y no lo empujan.
    health: 80,
    // 8 de base + 5 del hacha de hierro.
    damage: 13,
    speed: 0.26,
    knockbackResistance: 1,
    weapon: "minecraft:iron_axe",
    skins: skinSet("ally_warrior", 4),
    eggColors: ["#e8e4d8", "#a8201a"],
  },
  ally_wizard: {
    id: "ally_wizard",
    entityId: ENTITY_IDS.allyWizard,
    side: "ally",
    role: "caster",
    name: { es: "Pirómano aliado", en: "Allied pyromancer" },
    health: 30,
    damage: 2,
    speed: 0.24,
    projectile: ENTITY_IDS.allyBolt,
    weapon: "minecraft:blaze_rod",
    skins: skinSet("ally_wizard", 4),
    eggColors: ["#1c3f8c", "#d9d9d9"],
  },
  ally_archer: {
    id: "ally_archer",
    entityId: ENTITY_IDS.allyArcher,
    side: "ally",
    role: "archer",
    name: { es: "Arquero aliado", en: "Allied Archer" },
    egg: { es: "Huevo generador de arquero aliado", en: "Allied Archer Spawn Egg" },
    // Cifras elegidas por Limbers (2026-11-06): 5 por flecha (en `ally_arrow.json`), una cada 1,5-2 s, a 24 bloques.
    health: 30,
    // El golpe con el arco en la mano, solo al regresar a pie.
    damage: 3,
    speed: 0.25,
    projectile: ENTITY_IDS.allyArrow,
    ranged: { interval: [1.5, 2], radius: 24 },
    weapon: "minecraft:bow",
    skins: skinSet("ally_archer", 4),
    eggColors: ["#2f5a2a", "#c9b27a"],
  },
  invader_soldier: {
    id: "invader_soldier",
    entityId: ENTITY_IDS.invaderSoldier,
    side: "invader",
    role: "melee",
    name: { es: "Soldado invasor", en: "Invader Soldier" },
    egg: { es: "Huevo generador de soldado invasor", en: "Invader Soldier Spawn Egg" },
    health: 40,
    // 4 de base + 5 del hacha de hierro.
    damage: 9,
    speed: 0.28,
    weapon: "minecraft:iron_axe",
    skins: skinSet("invader_soldier", 5),
    eggColors: ["#8c1c1c", "#1d1d1d"],
  },
  invader_wizard: {
    id: "invader_wizard",
    entityId: ENTITY_IDS.invaderWizard,
    side: "invader",
    role: "caster",
    name: { es: "Mago invasor", en: "Invader Wizard" },
    egg: { es: "Huevo generador de mago invasor", en: "Invader Wizard Spawn Egg" },
    health: 24,
    damage: 2,
    speed: 0.24,
    projectile: ENTITY_IDS.arcaneBolt,
    weapon: "minecraft:breeze_rod",
    skins: skinSet("invader_wizard", 4),
    eggColors: ["#3b2a6b", "#c9a227"],
  },
  invader_archer: {
    id: "invader_archer",
    entityId: ENTITY_IDS.invaderArcher,
    side: "invader",
    role: "archer",
    name: { es: "Arquero invasor", en: "Invader Archer" },
    egg: { es: "Huevo generador de arquero invasor", en: "Invader Archer Spawn Egg" },
    // Cifras elegidas por Limbers (2026-11-06): 4 por flecha (en `invader_arrow.json`), una cada 2-3 s, a 20 bloques.
    health: 24,
    damage: 3,
    speed: 0.26,
    projectile: ENTITY_IDS.invaderArrow,
    ranged: { interval: [2, 3], radius: 20 },
    weapon: "minecraft:bow",
    skins: skinSet("invader_archer", 1),
    eggColors: ["#5a3a1a", "#1d1d1d"],
  },
};

export const UNIT_LIST: readonly UnitDef[] = Object.values(UNITS);

export function isUnitId(value: string): value is UnitId {
  return Object.prototype.hasOwnProperty.call(UNITS, value);
}

/** La ficha de una entidad del juego, o `undefined` si no es una unidad. */
export function unitOf(entityId: string): UnitDef | undefined {
  return UNIT_LIST.find((u) => u.entityId === entityId);
}

/** Ids de entidad de las unidades que cumplen la condición. */
export function entityIdsWhere(test: (unit: UnitDef) => boolean): string[] {
  return UNIT_LIST.filter(test).map((u) => u.entityId);
}
