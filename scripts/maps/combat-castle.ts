import type { MapDef } from "./types";

/**
 * The Combat Castle (mapa de terceros, no incluido en el repositorio).
 * Las coordenadas salieron de leer el mundo con `tools/world-scan.mjs`, sin abrir el juego.
 *
 * Datos del mapa: suelo de césped en y = -61 (de pie en y = -60); muralla hueca con el
 * perímetro aproximado X -38..42, Z -46..40. La puerta principal es la del NORTE: dos pasos
 * de 3 bloques (x -2..0 y x 4..6), cada uno cerrado por una compuerta de tablones de abeto en
 * z = -43, y entre ellos un hueco de piedra sellado en x = 2. Los caminos del patio
 * desembocan en esos pasos. Fuera de la muralla hay césped plano en todas direcciones.
 */
export const combatCastle: MapDef = {
  id: "combat-castle",
  name: "The Combat Castle",
  description: "Castillo amurallado con patio, casas y torres. La puerta principal mira al norte.",
  dimension: "overworld",

  gates: [
    {
      id: "north",
      // Fuera de la muralla, entre los dos pasos y a la vista de los invasores. (En z = -42 quedaba
      // dentro de un hueco de piedra sellado y nadie podía atacarla.)
      position: { x: 2.5, y: -60, z: -47.5 },
      health: 600,
      // Las compuertas del mapa: tablones de abeto de 3x3 en cada paso. Caen con la puerta.
      barriers: [
        { from: { x: -2, y: -60, z: -43 }, to: { x: 0, y: -58, z: -43 }, block: "spruce_planks" },
        { from: { x: 4, y: -60, z: -43 }, to: { x: 6, y: -58, z: -43 }, block: "spruce_planks" },
      ],
      // Dentro, junto a la muralla norte, a ambos lados del camino.
      breachSpawns: [
        { x: -14.5, y: -60, z: -38.5 },
        { x: 20.5, y: -60, z: -38.5 },
      ],
      breachTroops: [{ unit: "invader_soldier", count: 8 }],
    },
  ],

  // Dentro de la muralla, en el camino que sale de la puerta norte.
  playerSpawns: [
    { x: -2.5, y: -60, z: -35.5 },
    { x: 1.5, y: -60, z: -35.5 },
    { x: 4.5, y: -60, z: -35.5 },
  ],

  allies: [
    { unit: "ally_soldier", position: { x: -0.5, y: -60, z: -38.5 } },
    { unit: "ally_soldier", position: { x: 5.5, y: -60, z: -38.5 } },
    { unit: "ally_soldier", position: { x: -1.5, y: -60, z: -36.5 } },
    { unit: "ally_soldier", position: { x: 5.5, y: -60, z: -36.5 } },
  ],

  // Fuera, al norte de la puerta, a unos 38-41 bloques (el alcance de la IA invasora es 80).
  invaderSpawns: [
    { x: -14.5, y: -60, z: -85.5 },
    { x: 2.5, y: -60, z: -88.5 },
    { x: 19.5, y: -60, z: -85.5 },
  ],

  waves: [
    { name: "Exploradores", groups: [{ unit: "invader_soldier", count: 8 }], batchSize: 3, batchIntervalTicks: 50 },
    { name: "Asalto", groups: [{ unit: "invader_soldier", count: 14 }], batchSize: 4, batchIntervalTicks: 60 },
    { name: "Gran ofensiva", groups: [{ unit: "invader_soldier", count: 22 }], batchSize: 5, batchIntervalTicks: 60 },
  ],

  lives: 5,
  countdownSeconds: 15,
  intermissionSeconds: 20,

  // Mantiene cargado el entorno de la puerta aunque nadie esté cerca (radio máximo 4 chunks).
  tickingArea: { center: { x: 2, y: -60, z: -42 }, radiusChunks: 4 },
};
