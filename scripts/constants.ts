/** Identificadores compartidos entre scripts y packs. Si cambias uno, cambia también los JSON. */

export const NAMESPACE = "bastion";

export const ENTITY_IDS = {
  allySoldier: "bastion:ally_soldier",
  allyWarrior: "bastion:ally_warrior",
  allyWizard: "bastion:ally_wizard",
  allyArcher: "bastion:ally_archer",
  invaderSoldier: "bastion:invader_soldier",
  invaderWizard: "bastion:invader_wizard",
  invaderArcher: "bastion:invader_archer",
  /** Flecha del arquero aliado: daño directo; los aliados no la notan. */
  allyArrow: "bastion:ally_arrow",
  /** Flecha del arquero invasor: daño directo; los invasores no la notan y no muerde el muro. */
  invaderArrow: "bastion:invader_arrow",
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
  /** Balsa que aparece bajo quien cae al agua y le lleva a la orilla de salida. */
  raft: "bastion:raft",
} as const;

/** Familias definidas en `minecraft:type_family` de cada entidad. */
export const FAMILY = {
  ally: "bastion_ally",
  invader: "bastion_invader",
  objective: "bastion_objective",
  bolt: "bastion_bolt",
  aim: "bastion_aim",
  waypoint: "bastion_waypoint",
  raft: "bastion_raft",
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
/**
 * Monstruo del juego (zombi, creeper, bruja...) dentro del castillo o que ha atacado hace poco a un jugador: los
 * aliados van a por él aunque no lo tengan encima. La pone y la quita `scripts/systems/intruders.ts`.
 */
export const INTRUDER_TAG = "bastion_intruder";

/** Puestos de defensa por mapa; los JSON de los aliados tienen una entrada por cada uno. */
export const MAX_POSTS = 12;
/** Etiqueta del aliado destinado al puesto `index`. */
export const postTag = (index: number) => `bastion_post_${index}`;
/** Etiqueta del marcador del puesto `index`. */
export const postMarkerTag = (index: number) => `bastion_postmark_${index}`;

/** Rastros de caza a la vez; `invader_soldier.json` tiene una entrada por cada uno. */
export const HUNT_TRAILS = 8;
export const huntTrailTag = (slot: number) => `bastion_trail_${slot}`;

/**
 * Regreso a pie tras caer al agua: cada mapa tiene hasta `MAX_RETURN_ROUTES` rutas de hasta
 * `MAX_RETURN_STAGES` hitos. Los JSON de las unidades tienen una entrada por cada ruta y tramo.
 */
export const MAX_RETURN_ROUTES = 4;
export const MAX_RETURN_STAGES = 4;
/** Etiqueta de quien regresa por la ruta `route`. */
export const returnRouteTag = (route: number) => `bastion_route_${route}`;
/** Etiqueta de quien va hacia el hito `stage` de su ruta. */
export const returnStageTag = (stage: number) => `bastion_stage_${stage}`;
/** Etiqueta del marcador del hito `stage` de la ruta `route`. */
export const returnWaypointTag = (route: number, stage: number) => `bastion_wp_${route}_${stage}`;

export const TICKS_PER_SECOND = 20;

/** Cada cuántos ticks se evalúa el estado de la partida (1 segundo). */
export const LOGIC_INTERVAL_TICKS = TICKS_PER_SECOND;

/** Nombre del área de carga permanente de la arena. */
export const TICKING_AREA_NAME = "bastion_arena";

/** Propiedad dinámica del mundo donde se guarda el mapa elegido. */
export const PROP_ACTIVE_MAP = "bastion:map";
/** Modo espectador (para las pruebas): con él, el asedio deja a los jugadores en creativo en vez de en supervivencia. */
export const PROP_SPECTATE = "bastion:spectate";

/** Objeto que abre el menú al usarlo (se entrega en el equipo inicial). */
export const MENU_ITEM_ID = "minecraft:clock";

/** Objetos del equipo inicial que dan órdenes a los aliados. */
export const RETREAT_ITEM_ID = "minecraft:feather";
export const SORTIE_ITEM_ID = "minecraft:blaze_rod";

/** Dimensiones de las que se puede leer un mapa. */
export type DimensionName = "overworld" | "nether" | "the_end";
