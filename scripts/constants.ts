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

/**
 * Escolta del cuerno (`scripts/systems/rescue.ts`): quien acude va hacia el marcador que sigue al jugador
 * (`escort`) y, al llegar, le guarda las espaldas sin pegarse a él (`guard`).
 */
export const ALLY_ESCORT_EVENT = "bastion:escort";
export const ALLY_GUARD_EVENT = "bastion:guard";
/** Escoltas a la vez (una por jugador); los JSON de los aliados cuerpo a cuerpo tienen una entrada por cada una. */
export const MAX_ESCORTS = 4;
/** Etiqueta de quien escolta al jugador de la escolta `slot`. */
export const escortTag = (slot: number) => `bastion_escort_${slot}`;
/** Etiqueta del marcador que sigue al jugador de la escolta `slot`. */
export const escortMarkerTag = (slot: number) => `bastion_escortmark_${slot}`;

/**
 * Etiqueta del aliado que aguanta en su sitio porque tiene delante el doble de enemigos (`stance.ts`): solo pelea
 * con quien se le acerca. Los JSON de los aliados cuerpo a cuerpo la miran al buscar enemigo.
 */
export const HOLD_LINE_TAG = "bastion_hold_line";

/** Etiqueta de los marcadores de los puntos de reunión; los JSON de los aliados la buscan. */
export const RALLY_TAG = "bastion_rally";
/** Etiqueta del marcador de la torre (`map.keep`), el último reducto de la moral. */
export const KEEP_TAG = "bastion_keep";
/** Etiqueta del aliado que se repliega a la torre (los demás repliegues van al patio, como la retirada). */
export const TO_KEEP_TAG = "bastion_to_keep";
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

/**
 * Grupos del director (`scripts/systems/squads.ts`), entre los dos bandos. Las unidades cuerpo a cuerpo tienen
 * una entrada por cada uno: siguen el marcador de su grupo y solo se lanzan contra enemigos a `SQUAD_ENGAGE`.
 */
export const MAX_SQUADS = 16;
/** Etiqueta de quien está en el grupo `slot`. */
export const squadTag = (slot: number) => `bastion_sq_${slot}`;
/** Etiqueta del marcador del grupo `slot`. */
export const squadMarkerTag = (slot: number) => `bastion_sqmark_${slot}`;
/** Etiqueta de quien está en un grupo, sea cual sea. */
export const SQUAD_TAG = "bastion_squad";
/** Etiqueta de quien está en un grupo de reserva: espera, y solo pelea con quien se le acerca. */
export const SQUAD_WAIT_TAG = "bastion_squad_wait";
/** Distancia a la que quien está en un grupo se lanza contra un enemigo (sin grupo, la de siempre). */
export const SQUAD_ENGAGE = 8;

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
/** El cuerno de rescate en la mano: el cuerno de cabra del juego, que ya suena al usarlo. */
export const HORN_ITEM_ID = "minecraft:goat_horn";
/** Cambia entre jugar (supervivencia) y mirar (creativo) sin escribir comandos. */
export const MODE_ITEM_ID = "minecraft:compass";

/** Dimensiones de las que se puede leer un mapa. */
export type DimensionName = "overworld" | "nether" | "the_end";
