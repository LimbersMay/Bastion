import type { MapDef } from "./types";

/**
 * Old Fallen Castle v1.3 (mapa de terceros, no incluido en el repositorio: ver assets/worlds/README.md).
 * Las coordenadas salieron de leer el mundo con `tools/world-scan.mjs`, sin abrir el juego.
 *
 * Datos del mapa: un castillo en ruinas sobre una roca en un lago (el agua está en y = 79) al que solo se
 * llega por un largo puente de piedra que sale de su lado este y baja en arco hacia el sur hasta la orilla
 * (z ≈ -340). El puente mide unos 10 bloques de ancho, con un borde bajo a cada lado.
 *
 * Puerta: un muro de madera de tres bloques de grosor que cruza todo el puente en z = -417..-415 (cubierta x 34..42,
 * lisa en y = 112, de pie en y = 113; el muro llega hasta x 32..44 para tapar los pretiles y repisas de los lados). Detrás va la meta invisible de los invasores; el punto de
 * referencia está 2,5 bloques al sur del muro, hacia donde vienen. Los
 * defensores esperan al norte, en el tramo más alto del puente (cubierta en y = 113, de pie en y = 114).
 *
 * Por ahora solo hay un frente (el puente). Cuando existan unidades acuáticas o aéreas, los otros
 * accesos (agua, laterales) se añaden como más puertas o puntos de entrada.
 */
export const oldFallenCastle: MapDef = {
  id: "old-fallen-castle",
  name: "Old Fallen Castle",
  description: "Castillo en ruinas sobre una roca en un lago; el único acceso por tierra es un largo puente.",
  dimension: "overworld",

  gates: [
    {
      id: "bridge",
      position: { x: 38.5, y: 113, z: -412.5 },
      // Meta invisible de los invasores, detrás del muro: les da un sitio al que ir y a los magos a quién apuntar.
      objective: { x: 37.5, y: 114, z: -419.5 },
      // Un muro de tres bloques de grosor que cierra el puente; los proyectiles de los magos lo deshacen por partes.
      // Va de x 32 a 44 (más ancho que la cubierta, x 34..42) porque el puente tiene a cada lado un pretil bajo y una
      // repisa que siguen de largo; con el muro más corto los soldados rodeaban por ahí. Solo se rellena el aire.
      walls: [{ from: { x: 32, y: 113, z: -417 }, to: { x: 44, y: 116, z: -415 }, block: "dark_oak_planks" }],
      // Los pretiles del lado norte llegan casi a lo alto del muro: sin esto los aliados suben por ahí, cruzan
      // por encima y caen al lago. Los invasores no se ven afectados: bajan del muro por el centro.
      blockers: [
        { from: { x: 31, y: 114, z: -418 }, to: { x: 32, y: 119, z: -418 } },
        { from: { x: 42, y: 114, z: -418 }, to: { x: 43, y: 119, z: -418 } },
      ],
      // Detrás del muro, en el puente, a ambos lados del centro.
      breachSpawns: [
        { x: 35.5, y: 114, z: -419.5 },
        { x: 39.5, y: 114, z: -419.5 },
      ],
      breachTroops: [{ unit: "invader_soldier", count: 8 }],
    },
  ],

  // En el techo central, el punto ancho más alto: desde aquí se ve toda la batalla. Las agujas más altas son vallas de un bloque.
  playerSpawns: [
    { x: -47.5, y: 143, z: -424.5 },
    { x: -48.5, y: 143, z: -424.5 },
    { x: -47.5, y: 143, z: -425.5 },
  ],

  allies: [
    { unit: "ally_soldier", position: { x: 33.5, y: 114, z: -424.5 } },
    { unit: "ally_soldier", position: { x: 37.5, y: 114, z: -424.5 } },
    { unit: "ally_soldier", position: { x: 35.5, y: 114, z: -421.5 } },
    { unit: "ally_soldier", position: { x: 37.5, y: 114, z: -422.5 } },
  ],

  // En el puente y la orilla sur, a 45-58 bloques de la puerta (el alcance de la IA invasora es 80).
  invaderSpawns: [
    { x: 49.5, y: 108, z: -368.5 },
    { x: 51.5, y: 107, z: -362.5 },
    { x: 54.5, y: 107, z: -356.5 },
  ],

  // Laderas norte y oeste: sin camino al castillo, así que quien sale por aquí se abre paso derribando la roca y las paredes.
  flankSpawns: [
    { x: -42.5, y: 115, z: -475.5 },
    { x: -92.5, y: 118.5, z: -449.5 },
  ],

  siege: {
    heart: { x: -49.5, y: 124, z: -437.5 },
    // Todo el castillo y sus laderas, sin el puente (x 32 en adelante) ni la orilla del lago: no tiene sentido romper eso.
    zone: { from: { x: -125, y: 90, z: -510 }, to: { x: 28, y: 145, z: -395 } },
  },

  // Patio central, conectado a pie con la cubierta norte del puente.
  rallyPoints: [
    { x: -50.5, y: 124, z: -435.5 },
    { x: -47.5, y: 124, z: -439.5 },
    { x: -45.5, y: 124, z: -429.5 },
  ],

  // Cubierta norte del puente, junto al muro: desde aquí salen en cuanto se abre.
  sortiePoint: { x: 37.5, y: 114, z: -422.5 },

  reinforcements: {
    spawns: [
      { x: -52.5, y: 124, z: -435.5 },
      { x: -48.5, y: 124, z: -432.5 },
      { x: -46.5, y: 124, z: -441.5 },
      { x: -47.5, y: 124, z: -428.5 },
    ],
    units: ["ally_soldier", "ally_soldier", "ally_soldier", "ally_wizard"],
    minField: 6,
    reservePerWave: 12,
    batch: 2,
    everySeconds: 6,
  },

  // Del lago a la orilla sur, ladera arriba y de vuelta al puente (ruta calculada sobre el terreno real).
  returnPath: [
    { x: 60.5, y: 80, z: -381.5 },
    { x: 57.5, y: 106, z: -350.5 },
    { x: 50.5, y: 108, z: -363.5 },
  ],

  waves: [
    {
      name: "Exploradores",
      groups: [
        { unit: "invader_soldier", count: 6 },
        { unit: "invader_wizard", count: 2 },
      ],
      batchSize: 3,
      batchIntervalTicks: 50,
    },
    {
      name: "Asalto",
      groups: [
        { unit: "invader_soldier", count: 11 },
        { unit: "invader_wizard", count: 3 },
      ],
      batchSize: 4,
      batchIntervalTicks: 60,
    },
    {
      name: "Gran ofensiva",
      groups: [
        { unit: "invader_soldier", count: 17 },
        { unit: "invader_wizard", count: 5 },
      ],
      batchSize: 5,
      batchIntervalTicks: 60,
    },
  ],

  lives: 5,
  countdownSeconds: 15,
  intermissionSeconds: 20,

  // Cubre la puerta, el puente hasta los puntos de invasión y el tramo de los defensores (radio máximo 4 chunks).
  tickingArea: { center: { x: 40, y: 110, z: -390 }, radiusChunks: 4 },
  // El castillo y las laderas norte y oeste: ahí están el patio, los flancos y el corazón.
  extraTickingAreas: [{ center: { x: -49, y: 120, z: -440 }, radiusChunks: 4 }],
};
