/** Identificadores compartidos entre scripts y packs. Si cambias uno, cambia también los JSON. */

export const NAMESPACE = "bastion";

export const ENTITY_IDS = {
  allySoldier: "bastion:ally_soldier",
  allyWizard: "bastion:ally_wizard",
  invaderSoldier: "bastion:invader_soldier",
  invaderWizard: "bastion:invader_wizard",
  /** Proyectil del mago: copia de la bola de fuego del Ghast; además, al chocar con un muro se lleva bloques. */
  arcaneBolt: "bastion:arcane_bolt",
  /** Proyectil del pirómano aliado: daño directo, sin explosión ni fuego, para no quemar el propio castillo. */
  allyBolt: "bastion:ally_bolt",
  /** Marcador invisible detrás del muro: es lo que los invasores quieren alcanzar. */
  objective: "bastion:objective",
  /** Marcador invisible delante del muro: los magos solo disparan a lo que ven, y aquí apuntan. */
  aimPoint: "bastion:aim_point",
  /** Hito invisible de la ruta a pie de quien cae al agua. */
  waypoint: "bastion:waypoint",
} as const;

/** Familias definidas en `minecraft:type_family` de cada entidad. */
export const FAMILY = {
  ally: "bastion_ally",
  invader: "bastion_invader",
  objective: "bastion_objective",
  bolt: "bastion_bolt",
  aim: "bastion_aim",
  waypoint: "bastion_waypoint",
} as const;

/** Evento de `ally_soldier.json` que pasa a los aliados de patrullar a combatir. */
export const ALLY_FIGHT_EVENT = "bastion:fight";

/** Evento de `invader_wizard.json`: tras la brecha deja de apuntar a la meta y ataca a aliados y jugadores. */
export const WIZARD_ASSAULT_EVENT = "bastion:assault";

/** Eventos de las unidades que regresan a pie (`bastion:returning` en sus JSON). */
export const RETURN_EVENT = "bastion:return";
export const ALLY_PATROL_EVENT = "bastion:patrol";
export const SOLDIER_MARCH_EVENT = "bastion:march";
export const WIZARD_SIEGE_EVENT = "bastion:siege";

/** Órdenes a los aliados: correr al punto de reunión, defenderlo al llegar y salir a buscar al enemigo. */
export const ALLY_RETREAT_EVENT = "bastion:retreat";
export const ALLY_HOLD_EVENT = "bastion:hold";
export const ALLY_SORTIE_EVENT = "bastion:sortie";

/** Etiqueta de los marcadores de los puntos de reunión; los JSON de los aliados la buscan. */
export const RALLY_TAG = "bastion_rally";
/** Etiqueta del marcador del punto de salida: a donde marchan los soldados si no pueden alcanzar a ningún enemigo. */
export const SORTIE_TAG = "bastion_sortie";

/** Tramos de la ruta de regreso; los JSON de las unidades tienen una entrada por tramo. */
export const MAX_RETURN_STAGES = 4;

export const TICKS_PER_SECOND = 20;

/** Cada cuántos ticks se evalúa el estado de la partida (1 segundo). */
export const LOGIC_INTERVAL_TICKS = TICKS_PER_SECOND;

/** Nombre del área de carga permanente de la arena. */
export const TICKING_AREA_NAME = "bastion_arena";

/** Propiedad dinámica del mundo donde se guarda el mapa elegido. */
export const PROP_ACTIVE_MAP = "bastion:map";

/** Objeto que abre el menú al usarlo (se entrega en el equipo inicial). */
export const MENU_ITEM_ID = "minecraft:clock";

/** Objetos del equipo inicial que dan órdenes a los aliados. */
export const RETREAT_ITEM_ID = "minecraft:feather";
export const SORTIE_ITEM_ID = "minecraft:blaze_rod";

/** Dimensiones de las que se puede leer un mapa. */
export type DimensionName = "overworld" | "nether" | "the_end";
