/**
 * Generador de unidades: de cada ficha de `scripts/units/catalog.ts` salen su entidad (behavior pack), su
 * entidad de cliente (resource pack) y su nombre en cada idioma. No toques esos archivos a mano:
 * cambia la ficha o los roles y ejecuta `npm run units`. `tests/units.test.ts` avisa si quedaron viejos.
 *
 * Puro: no escribe nada. `just.config.ts` (tarea `units`) escribe lo que devuelve `unitFiles`.
 */
import { FAMILY } from "../../scripts/constants";
import { UNIT_LIST, type UnitDef } from "../../scripts/units/catalog";
import { damageSensor, type Json, MONSTER_PREY_FAMILY, UNIT_FAMILY } from "./behavior";
import { RETURNING, ROLES } from "./roles";

export const BP_ENTITIES = "behavior_packs/bastion/entities";
export const RP_ENTITIES = "resource_packs/bastion/entity";
export const LANG_FILES = { es: "resource_packs/bastion/texts/es_MX.lang", en: "resource_packs/bastion/texts/en_US.lang" } as const;

const ENTITY_FORMAT = "1.21.90";
const CLIENT_FORMAT = "1.10.0";

/**
 * Daño que suma cada arma al golpe de una criatura (medido en el servidor: el daño del arma menos 1).
 * Las varas y el palo no suman nada. Un arma que no esté aquí no se puede usar: sin su cifra el golpe
 * cambiaría sin que nadie lo note.
 */
export const WEAPON_BONUS: Readonly<Record<string, number>> = {
  "minecraft:wooden_sword": 4,
  "minecraft:golden_sword": 4,
  "minecraft:stone_sword": 5,
  "minecraft:iron_sword": 6,
  "minecraft:wooden_axe": 3,
  "minecraft:golden_axe": 3,
  "minecraft:stone_axe": 4,
  "minecraft:iron_axe": 5,
  "minecraft:stick": 0,
  "minecraft:blaze_rod": 0,
  "minecraft:breeze_rod": 0,
  // Como cualquier objeto que no es arma (golpe 1): no suma.
  "minecraft:bow": 0,
};

/** El daño base de la entidad: el de la ficha menos lo que suma su arma, para que el golpe sea el de la ficha. */
export function baseDamage(unit: UnitDef): number {
  if (!unit.weapon) return unit.damage;
  const bonus = WEAPON_BONUS[unit.weapon];
  if (bonus === undefined) throw new Error(`${unit.id}: no se sabe cuánto daño suma ${unit.weapon}; mídelo y añádelo a WEAPON_BONUS.`);
  return unit.damage - bonus;
}

/** Grupo que fija la skin `index` de la unidad (`minecraft:variant`, que lee su render controller). */
export const skinGroup = (index: number) => `bastion:skin_${index}`;

/** Render controller de la unidad: elige entre sus skins según su variante. */
export const renderControllerId = (unit: UnitDef) => `controller.render.bastion.${unit.id}`;

/** Evento que activa un modo: el del grupo, salvo el regreso a pie. */
export const modeEvent = (mode: string) => (mode === RETURNING ? "bastion:return" : mode);

/** La entidad de comportamiento (`behavior_packs/.../<id>.json`). */
export function behaviorEntity(unit: UnitDef): Json {
  const { components: roleComponents, modes } = ROLES[unit.side][unit.role](unit);
  const names = Object.keys(modes);

  // Al aparecer: primer modo y una skin al azar. La skin queda puesta; los modos no la quitan.
  const skinGroups: Record<string, Json> = {};
  unit.skins.forEach((_, i) => (skinGroups[skinGroup(i)] = { "minecraft:variant": { value: i } }));
  const events: Json = {
    "minecraft:entity_spawned": {
      sequence: [
        { add: { component_groups: [names[0]] } },
        { randomize: unit.skins.map((_, i) => ({ weight: 1, add: { component_groups: [skinGroup(i)] } })) },
      ],
    },
  };
  for (const mode of names) {
    events[modeEvent(mode)] = { remove: { component_groups: names.filter((m) => m !== mode) }, add: { component_groups: [mode] } };
  }

  return {
    format_version: ENTITY_FORMAT,
    "minecraft:entity": {
      description: { identifier: unit.entityId, is_spawnable: true, is_summonable: true, is_experimental: false },
      component_groups: { ...withMovement(modes), ...skinGroups },
      components: {
        "minecraft:type_family": { family: unit.side === "ally" ? [FAMILY.ally, UNIT_FAMILY, MONSTER_PREY_FAMILY] : [FAMILY.invader, UNIT_FAMILY] },
        "minecraft:collision_box": { width: 0.6, height: 1.9 },
        "minecraft:health": { value: unit.health, max: unit.health },
        "minecraft:movement": { value: unit.speed },
        "minecraft:annotation.open_door": {},
        "minecraft:jump.static": {},
        "minecraft:can_climb": {},
        "minecraft:follow_range": { value: 100, max: 100 },
        "minecraft:attack": { damage: baseDamage(unit) },
        ...(unit.knockbackResistance === undefined ? {} : { "minecraft:knockback_resistance": { value: unit.knockbackResistance } }),
        ...(unit.projectile ? { "minecraft:shooter": { def: unit.projectile } } : {}),
        ...(unit.weapon ? { "minecraft:equipment": equipment(unit) } : {}),
        "minecraft:persistent": {},
        "minecraft:physics": {},
        "minecraft:pushable": { is_pushable: true, is_pushable_by_piston: true },
        "minecraft:damage_sensor": damageSensor(unit.side),
        "minecraft:behavior.float": { priority: 0 },
        ...roleComponents,
        "minecraft:behavior.look_at_player": { priority: 7, look_distance: 8 },
        "minecraft:behavior.random_look_around": { priority: 8 },
      },
      events,
    },
  };
}

/**
 * Cómo se mueve en cada modo. En tierra anda y evita el agua, para cruzar por el puente y no por el lago.
 * Al regresar del agua nada como un ahogado y busca ruta por el agua hasta la orilla.
 * Va en cada modo y no en los componentes comunes: si un modo sustituye un componente común, al quitar el
 * modo el juego quita el componente entero y la unidad se quedaría sin moverse.
 */
export const WALKING: Json = {
  "minecraft:navigation.walk": { can_path_over_water: true, can_pass_doors: true, can_open_doors: true, avoid_water: true },
  "minecraft:movement.basic": {},
};
export const SWIMMING: Json = {
  "minecraft:navigation.generic": { can_swim: true, can_walk: true, can_breach: true, can_pass_doors: true, can_open_doors: true, avoid_water: false },
  "minecraft:movement.amphibious": {},
  "minecraft:underwater_movement": { value: 0.1 },
};

function withMovement(modes: Readonly<Record<string, Json>>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [mode, group] of Object.entries(modes)) out[mode] = { ...(mode === RETURNING ? SWIMMING : WALKING), ...group };
  return out;
}

/** Ruta, dentro del behavior pack, de la tabla que le da su arma al aparecer. */
const gearTable = (unit: UnitDef) => `loot_tables/entities/${unit.id}_gear.json`;

/** El arma en la mano, que no se suelta al morir: cientos de espadas por el suelo pesarían y serían botín. */
function equipment(unit: UnitDef): Json {
  return { table: gearTable(unit), slot_drop_chance: [{ slot: "slot.weapon.mainhand", drop_chance: 0 }] };
}

/** La tabla de botín que equipa el arma. */
export function gearLootTable(unit: UnitDef): Json {
  return { pools: [{ rolls: 1, entries: [{ type: "item", name: unit.weapon, weight: 1 }] }] };
}

/**
 * La entidad de cliente (`resource_packs/.../<id>.entity.json`): modelo, skin y animaciones.
 * Los arqueros, con un objetivo, levantan el arco y tensan la cuerda.
 */
export function clientEntity(unit: UnitDef): Json {
  const archer = unit.role === "archer";
  return {
    format_version: CLIENT_FORMAT,
    "minecraft:client_entity": {
      description: {
        identifier: unit.entityId,
        // El arco del juego se dibuja con su propio modelo (un «attachable», por la cuerda que se tensa): sin
        // esto la unidad lo lleva pero no se ve. Las espadas y hachas no lo necesitan.
        ...(archer ? { enable_attachables: true } : {}),
        materials: { default: "entity_alphatest" },
        textures: Object.fromEntries(unit.skins.map((skin, i) => [`skin_${i}`, `textures/entity/${skin}`])),
        geometry: { default: "geometry.bastion.humanoid" },
        animations: {
          look_at_target: "controller.animation.humanoid.look_at_target",
          look_at_target_default: "animation.humanoid.look_at_target.default",
          look_at_target_gliding: "animation.humanoid.look_at_target.gliding",
          look_at_target_swimming: "animation.humanoid.look_at_target.swimming",
          walk: "animation.bastion.humanoid.walk",
          attack: "animation.bastion.humanoid.attack",
          ...(archer ? { aim: "animation.bastion.humanoid.aim" } : {}),
        },
        scripts: {
          animate: archer
            ? ["look_at_target", "walk", { aim: "query.has_target" }]
            : ["look_at_target", "walk", { attack: "variable.attack_time > 0.0" }],
        },
        render_controllers: [renderControllerId(unit)],
        spawn_egg: { base_color: unit.eggColors[0], overlay_color: unit.eggColors[1] },
      },
    },
  };
}

export const RENDER_CONTROLLERS = "resource_packs/bastion/render_controllers/units.render_controllers.json";

/** Los render controllers de las unidades: cada uno pinta la skin que marca la variante de la entidad. */
export function unitRenderControllers(): Json {
  const controllers: Json = {};
  for (const unit of UNIT_LIST) {
    controllers[renderControllerId(unit)] = {
      arrays: { textures: { "Array.skins": unit.skins.map((_, i) => `Texture.skin_${i}`) } },
      geometry: "Geometry.default",
      materials: [{ "*": "Material.default" }],
      textures: ["Array.skins[query.variant]"],
    };
  }
  return { format_version: "1.10.0", render_controllers: controllers };
}

/** Las líneas de idioma de las unidades: nombre y, si lo tiene, huevo generador. */
export function langEntries(lang: keyof typeof LANG_FILES): [string, string][] {
  const entries: [string, string][] = [];
  for (const unit of UNIT_LIST) {
    entries.push([`entity.${unit.entityId}.name`, unit.name[lang]]);
    const egg = unit.egg?.[lang];
    if (egg) entries.push([`item.spawn_egg.entity.${unit.entityId}.name`, egg]);
  }
  return entries;
}

/** Pone las líneas de las unidades en un `.lang`: cambia las que existen y añade al final las nuevas. */
export function mergeLang(current: string, entries: readonly [string, string][]): string {
  const pending = new Map(entries);
  const lines = current.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const out = lines.map((line) => {
    const key = line.slice(0, line.indexOf("="));
    if (!pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  return out.join("\n") + "\n";
}

export const toJsonText = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

/**
 * Todos los archivos que salen de las fichas, con su contenido. `readText` lee un archivo existente
 * (para los `.lang`, que también tienen textos que no son de unidades).
 */
export function unitFiles(readText: (path: string) => string): Map<string, string> {
  const files = new Map<string, string>();
  for (const unit of UNIT_LIST) {
    files.set(`${BP_ENTITIES}/${unit.id}.json`, toJsonText(behaviorEntity(unit)));
    files.set(`${RP_ENTITIES}/${unit.id}.entity.json`, toJsonText(clientEntity(unit)));
    if (unit.weapon) files.set(`behavior_packs/bastion/${gearTable(unit)}`, toJsonText(gearLootTable(unit)));
  }
  files.set(RENDER_CONTROLLERS, toJsonText(unitRenderControllers()));
  for (const lang of Object.keys(LANG_FILES) as (keyof typeof LANG_FILES)[]) {
    files.set(LANG_FILES[lang], mergeLang(readText(LANG_FILES[lang]), langEntries(lang)));
  }
  return files;
}
