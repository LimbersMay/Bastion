import type { DimensionName } from "../constants";
import type { UnitId } from "../units/catalog";
import type { WaveDef } from "../systems/wavePlan";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TickingAreaDef {
  readonly center: Vec3;
  readonly radiusChunks: number;
}

/**
 * Aliados de refuerzo durante la oleada: cuando quedan menos de `minField` en el campo, cada
 * `everySeconds` salen hasta `batch` unidades de una reserva de `reservePerWave`.
 */
export interface ReinforcementsDef {
  readonly spawns: readonly Vec3[];
  /** Unidades que salen, en rotación. */
  readonly units: readonly UnitId[];
  readonly minField: number;
  readonly reservePerWave: number;
  readonly batch: number;
  readonly everySeconds: number;
}

/** Asalto al castillo por donde no hay camino: dónde pueden derribar los invasores que cazan a alguien. */
export interface SiegeDef {
  /** Caja de bloques (esquinas inclusivas) en la que los soldados atascados pueden derribar lo que les estorba. */
  readonly zone: { readonly from: Vec3; readonly to: Vec3 };
}

export interface UnitSpawn {
  readonly unit: UnitId;
  readonly position: Vec3;
}

export interface BreachTroops {
  readonly unit: UnitId;
  readonly count: number;
}

/**
 * Tramo de muro: una caja de bloques (esquinas inclusivas) hecha de un material. Se coloca al empezar
 * (solo sobre aire: el terreno que ya hay se respeta) y los proyectiles de los magos se lo van comiendo
 * bloque a bloque. Solo se pueden romper los bloques de ese material, no el terreno.
 * `block` es un id de bloque sin estados (ej. `dark_oak_planks`, `stone_bricks`).
 *
 * El GROSOR del muro es su lado horizontal más corto: el hueco se abre cuando alguna columna de 2 de
 * alto queda libre a lo largo de todo ese grosor. Más grosor = más proyectiles para abrirlo.
 */
export interface WallDef {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly block: string;
}

/** Un punto de entrada al castillo: un muro que romper y lo que ocurre cuando se abre. */
export interface GateDef {
  /** Identificador único dentro del mapa (minúsculas, números, _ y -). */
  readonly id: string;

  /**
   * Punto de referencia FUERA del muro, a nivel del suelo y sobre terreno firme. Sirve para
   * comprobar que el mundo cargado es el del mapa y que la zona está cargada antes de empezar.
   */
  readonly position: Vec3;

  /**
   * Meta de los invasores: un marcador invisible justo DETRÁS del muro (en el interior). Es lo
   * que atacan cuando no ven a nadie, así que llegan al muro y, si no pueden pasar, esperan
   * a que los magos lo abran.
   */
  readonly objective: Vec3;

  /** Los muros que cierran este acceso (uno o varios tramos; pueden ir en capas). */
  readonly walls: readonly WallDef[];

  /**
   * Cajas de bloques invisibles (`barrier`, solo sobre aire) que cierran caminos que el terreno deja abiertos.
   * Por ejemplo, pretiles por los que los defensores podrían subirse al muro y caer por el otro lado.
   */
  readonly blockers?: readonly { readonly from: Vec3; readonly to: Vec3 }[];

  /** Puntos INTERIORES donde aparecen las tropas cuando se abre esta puerta. */
  readonly breachSpawns: readonly Vec3[];
  readonly breachTroops: readonly BreachTroops[];
}

/**
 * Definición completa de un mapa. Un mapa = un archivo en `scripts/maps/`.
 * Las coordenadas son absolutas del mundo donde está el castillo.
 * Truco para sacarlas: en el juego, `/scriptevent bastion:pos` te dice dónde estás.
 */
export type PostKind = "front" | "side" | "high";

export interface DefensePost {
  readonly at: Vec3;
  readonly kind: PostKind;
  /** Cuántos caben; por defecto 3 en el frente y 2 en los demás. */
  readonly capacity?: number;
}

export interface MapDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly dimension: DimensionName;

  /**
   * Los accesos del mapa (uno o varios). Cada uno tiene su muro, su meta y sus tropas de brecha.
   * La brecha del asedio salta cuando se abre el primero.
   */
  readonly gates: readonly GateDef[];

  /**
   * Muros (y bloqueos, con `block: "barrier"`) de versiones anteriores del mapa. Siguen en pie en los mundos ya
   * jugados, porque los muros se reponen al reiniciar; al levantar los actuales se quitan sus bloques (solo los
   * de su material, el terreno no se toca).
   */
  readonly retiredWalls?: readonly WallDef[];

  /** Dónde aparecen los jugadores al empezar. Se reparten en rotación. */
  readonly playerSpawns: readonly Vec3[];

  /** Aliados que se colocan al empezar. */
  readonly allies: readonly UnitSpawn[];

  /** Puntos EXTERIORES por donde entran las oleadas. Mantenlos a menos de ~70 bloques del acceso. */
  readonly invaderSpawns: readonly Vec3[];

  /** Otros frentes: uno de cada tres soldados de la oleada sale por aquí y se abre paso derribando. Requiere `siege`. */
  readonly flankSpawns?: readonly Vec3[];

  readonly siege?: SiegeDef;

  /** Con la orden de retirada, la reserva: quien no cabe en un puesto de defensa espera aquí (el patio). */
  readonly rallyPoints?: readonly Vec3[];

  /**
   * La torre: el último reducto. Un grupo de aliados superado en el patio se repliega aquí (moral, Fase 3). Debe
   * poder alcanzarse a pie desde el patio y caber unos cuantos. Sin ella, el repliegue acaba en el patio.
   */
  readonly keep?: Vec3;

  /**
   * Puestos de defensa (máximo 12): con la orden de retirada cada aliado ocupa uno y lo defiende. `front` corta
   * el paso de los invasores, `side` lo cubre desde un costado y `high` es para los que disparan. Deben poder
   * alcanzarse a pie desde el patio.
   */
  readonly defensePosts?: readonly DefensePost[];

  /** Con la orden de ataque, a donde marchan los soldados si no pueden alcanzar a ningún enemigo: junto a la puerta, por dentro. */
  readonly sortiePoint?: Vec3;

  readonly reinforcements?: ReinforcementsDef;

  /**
   * Rutas a pie de quien cae al agua (máximo 4). Cada una son hitos en orden (máximo 4, a unos 40 bloques
   * entre sí): el primero, en una orilla a la altura del agua; el último, en el camino normal. Quien cae elige
   * la ruta cuya orilla tiene más cerca. Se llega nadando y andando, nunca por teletransporte. Sin rutas, se
   * quedan donde caen. Para encontrar orillas desde las que se llega a pie, ver `tools/lab/README.md`.
   */
  readonly returnRoutes?: readonly (readonly Vec3[])[];

  /**
   * Rutas de subida de los invasores, de sus puntos de aparición hasta la puerta (hitos en orden, máximo 4, a
   * menos de 30 bloques de camino entre sí). Para los mapas en los que el juego no encuentra solo el camino: desde
   * lejos lleva a cada soldado al sitio alcanzable más cercano en línea recta, que puede ser el pie de un barranco.
   * Cada invasor de las oleadas sigue la ruta cuyo primer hito tiene más cerca y, al llegar al último, sigue como
   * siempre; por el camino pelea con quien tenga cerca. Comparten con `returnRoutes` el máximo de 4 rutas.
   */
  readonly approachRoutes?: readonly (readonly Vec3[])[];

  readonly waves: readonly WaveDef[];

  /** Vidas del equipo: cada muerte de un jugador gasta una. */
  readonly lives: number;
  readonly countdownSeconds: number;
  readonly intermissionSeconds: number;

  /** Área que se mantiene cargada aunque estés lejos (radio en chunks, 1 a 4). */
  readonly tickingArea?: TickingAreaDef;
  /** Más áreas cargadas, si el campo de batalla no cabe en una sola. */
  readonly extraTickingAreas?: readonly TickingAreaDef[];
}
