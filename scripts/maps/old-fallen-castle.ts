import type { MapDef } from "./types";

/**
 * Old Fallen Castle v1.3 (mapa de terceros, no incluido en el repositorio: ver assets/worlds/README.md).
 * Las coordenadas salieron de leer el mundo con `tools/world-scan.mjs`, sin abrir el juego.
 *
 * Datos del mapa: un castillo en ruinas sobre una roca en un lago (el agua está en y = 79) al que solo se
 * llega por un largo puente de piedra que sale de su lado este y baja en arco hacia el sur hasta la orilla
 * (z ≈ -340). El puente mide unos 10 bloques de ancho, con un borde bajo a cada lado.
 *
 * Puerta: la entrada este del castillo, donde llega el puente. El mapa trae ahí una pared de madera de abeto en
 * ruinas (x = -14, de y 120 hacia arriba) con un hueco de 6 bloques (z -441..-436); el muro de la partida lo
 * cierra: madera de roble oscuro de tres bloques de grosor (x -16..-14) y 6 de alto (y 120..125). Con el muro
 * puesto no se llega a pie del puente al patio (comprobado sobre el terreno real). Delante queda el rellano al
 * que sube el puente; detrás, el pasillo que baja al patio, con los puestos de defensa.
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
      id: "gate",
      // En el rellano, delante del muro, donde llegan los invasores.
      position: { x: -10.5, y: 120, z: -438.5 },
      // Meta invisible de los invasores, detrás del muro: les da un sitio al que ir y a los magos a quién apuntar.
      objective: { x: -20.5, y: 120, z: -438.5 },
      // Cierra el hueco de la pared en ruinas. Solo se rellena el aire: la madera de abeto del mapa queda igual.
      walls: [{ from: { x: -16, y: 120, z: -441 }, to: { x: -14, y: 125, z: -436 }, block: "dark_oak_planks" }],
      // Detrás del muro, en el pasillo.
      breachSpawns: [
        { x: -19.5, y: 120, z: -439.5 },
        { x: -19.5, y: 120, z: -436.5 },
      ],
      breachTroops: [{ unit: "invader_soldier", count: 12 }],
    },
  ],

  // El muro y los bloqueos invisibles de cuando la puerta estaba en el puente (hasta la v0.1.28).
  retiredWalls: [
    { from: { x: 32, y: 113, z: -417 }, to: { x: 44, y: 116, z: -415 }, block: "dark_oak_planks" },
    { from: { x: 31, y: 114, z: -418 }, to: { x: 32, y: 119, z: -418 }, block: "barrier" },
    { from: { x: 42, y: 114, z: -418 }, to: { x: 43, y: 119, z: -418 }, block: "barrier" },
  ],

  // En el techo central, el punto ancho más alto: desde aquí se ve toda la batalla. Las agujas más altas son vallas de un bloque.
  playerSpawns: [
    { x: -47.5, y: 143, z: -424.5 },
    { x: -48.5, y: 143, z: -424.5 },
    { x: -47.5, y: 143, z: -425.5 },
  ],

  // Detrás del muro, en el pasillo; los dos pirómanos, arriba, desde donde ven el rellano.
  allies: [
    { unit: "ally_soldier", position: { x: -18.5, y: 120, z: -443.5 } },
    { unit: "ally_soldier", position: { x: -20.5, y: 120, z: -443.5 } },
    { unit: "ally_soldier", position: { x: -22.5, y: 121, z: -442.5 } },
    { unit: "ally_soldier", position: { x: -18.5, y: 120, z: -441.5 } },
    { unit: "ally_soldier", position: { x: -21.5, y: 120, z: -440.5 } },
    { unit: "ally_soldier", position: { x: -23.5, y: 121, z: -439.5 } },
    { unit: "ally_soldier", position: { x: -21.5, y: 120, z: -436.5 } },
    { unit: "ally_soldier", position: { x: -23.5, y: 121, z: -436.5 } },
    { unit: "ally_wizard", position: { x: -18.5, y: 130, z: -426.5 } },
    { unit: "ally_wizard", position: { x: -29.5, y: 130, z: -422.5 } },
  ],

  // En el tramo norte del puente, a 52-58 bloques del muro (el alcance de la IA invasora es 80).
  invaderSpawns: [
    { x: 35.5, y: 114, z: -419.5 },
    { x: 39.5, y: 114, z: -419.5 },
    { x: 37.5, y: 114, z: -424.5 },
    { x: 38.5, y: 113, z: -412.5 },
  ],

  // Laderas norte y oeste: sin camino al castillo, así que quien sale por aquí se abre paso derribando la roca y las paredes.
  flankSpawns: [
    { x: -42.5, y: 115, z: -475.5 },
    { x: -92.5, y: 118.5, z: -449.5 },
  ],

  siege: {
    // Todo el castillo y sus laderas hasta justo detrás del muro (x -17), sin la entrada ni el puente: mientras
    // el muro aguante, por ahí no se cava alrededor; hay que romperlo.
    zone: { from: { x: -125, y: 90, z: -510 }, to: { x: -17, y: 145, z: -395 } },
  },

  // Puestos de la retirada, a lo largo del pasillo que baja del muro al patio. Todos se alcanzan a pie desde el
  // patio con el muro puesto (recorrido calculado sobre el terreno real).
  defensePosts: [
    // Pegados al muro por dentro: cortan el paso cuando se abra.
    { at: { x: -17.5, y: 120, z: -440.5 }, kind: "front" },
    { at: { x: -17.5, y: 120, z: -437.5 }, kind: "front" },
    // A los lados del pasillo.
    { at: { x: -19.5, y: 120, z: -441.5 }, kind: "side" },
    { at: { x: -20.5, y: 120, z: -437.5 }, kind: "side" },
    { at: { x: -26.5, y: 121, z: -432.5 }, kind: "side" },
    { at: { x: -34.5, y: 122, z: -441.5 }, kind: "side" },
    { at: { x: -33.5, y: 123, z: -431.5 }, kind: "side" },
    // En lo alto, a 10-14 bloques del pasillo.
    { at: { x: -18.5, y: 130, z: -426.5 }, kind: "high" },
    { at: { x: -29.5, y: 130, z: -422.5 }, kind: "high" },
    { at: { x: -44.5, y: 130, z: -426.5 }, kind: "high" },
  ],

  // Patio central, conectado a pie con la cubierta norte del puente: la reserva de la retirada.
  rallyPoints: [
    { x: -50.5, y: 124, z: -435.5 },
    { x: -47.5, y: 124, z: -439.5 },
    { x: -45.5, y: 124, z: -429.5 },
  ],

  // Detrás del muro: desde aquí salen en cuanto se abre.
  sortiePoint: { x: -18.5, y: 120, z: -438.5 },

  reinforcements: {
    spawns: [
      { x: -52.5, y: 124, z: -435.5 },
      { x: -48.5, y: 124, z: -432.5 },
      { x: -46.5, y: 124, z: -441.5 },
      { x: -47.5, y: 124, z: -428.5 },
    ],
    // Uno de cada diez es pirómano, igual que en las oleadas enemigas.
    units: ["ally_soldier", "ally_soldier", "ally_soldier", "ally_soldier", "ally_soldier", "ally_wizard", "ally_soldier", "ally_soldier", "ally_soldier", "ally_soldier"],
    minField: 12,
    reservePerWave: 30,
    batch: 3,
    everySeconds: 5,
  },

  // Del lago al puente, ladera arriba (rutas calculadas sobre el terreno real). Son las dos únicas orillas
  // desde las que se sube a pie sin romper nada: la sureste y la este.
  returnRoutes: [
    [
      { x: 60.5, y: 80, z: -381.5 },
      { x: 57.5, y: 106, z: -350.5 },
      { x: 50.5, y: 108, z: -363.5 },
    ],
    [
      { x: 86.5, y: 80, z: -419.5 },
      { x: 97.5, y: 93, z: -423.5 },
      { x: 85.5, y: 113, z: -385.5 },
      { x: 60.5, y: 107, z: -352.5 },
    ],
  ],

  // Oleadas grandes (elegidas por Limbers, 2026-11-06): de 25 a 68 invasores, con magos desde la primera
  // para abrir el muro pronto.
  waves: [
    {
      name: "Exploradores",
      groups: [
        { unit: "invader_soldier", count: 20 },
        { unit: "invader_wizard", count: 5 },
      ],
      batchSize: 5,
      batchIntervalTicks: 50,
    },
    {
      name: "Asalto",
      groups: [
        { unit: "invader_soldier", count: 40 },
        { unit: "invader_wizard", count: 6 },
      ],
      batchSize: 6,
      batchIntervalTicks: 50,
    },
    {
      name: "Gran ofensiva",
      groups: [
        { unit: "invader_soldier", count: 60 },
        { unit: "invader_wizard", count: 8 },
      ],
      batchSize: 8,
      batchIntervalTicks: 50,
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
