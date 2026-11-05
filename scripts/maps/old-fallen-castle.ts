import type { MapDef } from "./types";

/**
 * Old Fallen Castle v1.3 (mapa de terceros, no incluido en el repositorio: ver assets/worlds/README.md).
 * Las coordenadas salieron de leer el mundo con `tools/world-scan.mjs`, sin abrir el juego.
 *
 * Datos del mapa: un castillo en ruinas sobre una roca en un lago (el agua está en y = 79) al que solo se
 * llega por un largo puente de piedra que sale de su lado este y baja en arco hacia el sur hasta la orilla
 * (z ≈ -340). El puente mide unos 10 bloques de ancho, con un borde bajo a cada lado.
 *
 * Puerta: una barricada que cruza todo el puente en z = -415 (x 34..42, cubierta lisa en y = 112, de pie
 * en y = 113). La entidad puerta se coloca 2,5 bloques al sur, hacia donde vienen los invasores. Los
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
      health: 600,
      barriers: [{ from: { x: 34, y: 113, z: -415 }, to: { x: 42, y: 116, z: -415 }, block: "dark_oak_planks" }],
      // Detrás de la barricada, en el puente, a ambos lados del centro.
      breachSpawns: [
        { x: 35.5, y: 114, z: -419.5 },
        { x: 39.5, y: 114, z: -419.5 },
      ],
      breachTroops: [{ unit: "invader_soldier", count: 8 }],
    },
  ],

  playerSpawns: [
    { x: 33.5, y: 114, z: -426.5 },
    { x: 36.5, y: 114, z: -426.5 },
    { x: 35.5, y: 114, z: -423.5 },
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

  waves: [
    { name: "Exploradores", groups: [{ unit: "invader_soldier", count: 8 }], batchSize: 3, batchIntervalTicks: 50 },
    { name: "Asalto", groups: [{ unit: "invader_soldier", count: 14 }], batchSize: 4, batchIntervalTicks: 60 },
    { name: "Gran ofensiva", groups: [{ unit: "invader_soldier", count: 22 }], batchSize: 5, batchIntervalTicks: 60 },
  ],

  lives: 5,
  countdownSeconds: 15,
  intermissionSeconds: 20,

  // Cubre la puerta, el puente hasta los puntos de invasión y el tramo de los defensores (radio máximo 4 chunks).
  tickingArea: { center: { x: 40, y: 110, z: -390 }, radiusChunks: 4 },
};
