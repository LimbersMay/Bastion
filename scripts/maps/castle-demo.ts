import type { MapDef } from "./types";

/**
 * Mapa de DEMOSTRACIÓN para un mundo plano (superflat, suelo en y = -61).
 * Sirve para probar el motor sin tener un castillo: un muro de madera cerca del origen,
 * los invasores salen a unos 40 bloques al sur y las tropas de la brecha aparecen al norte.
 *
 * Para un castillo real: copia este archivo, cambia las coordenadas con `/scriptevent bastion:pos`
 * y regístralo en `maps/index.ts`.
 */
export const castleDemo: MapDef = {
  id: "castle-demo",
  name: "Castillo de prueba",
  description: "Mapa mínimo para un mundo plano. Sustituye las coordenadas por las de tu castillo.",
  dimension: "overworld",

  gates: [
    {
      id: "main",
      position: { x: 0.5, y: -60, z: 3.5 },
      objective: { x: 0.5, y: -60, z: -1.5 },
      // Un muro de madera de 3 de grosor; en un mundo plano se puede rodear, es solo para probar el motor.
      walls: [{ from: { x: -5, y: -60, z: 0 }, to: { x: 5, y: -57, z: 2 }, block: "oak_planks" }],
      breachSpawns: [
        { x: -6.5, y: -60, z: -14.5 },
        { x: 6.5, y: -60, z: -14.5 },
      ],
      breachTroops: [{ unit: "invader_soldier", count: 6 }],
    },
  ],

  playerSpawns: [
    { x: -3.5, y: -60, z: -6.5 },
    { x: 0.5, y: -60, z: -6.5 },
    { x: 3.5, y: -60, z: -6.5 },
  ],

  allies: [
    { unit: "ally_soldier", position: { x: -4.5, y: -60, z: -2.5 } },
    { unit: "ally_soldier", position: { x: 5.5, y: -60, z: -2.5 } },
    { unit: "ally_soldier", position: { x: -2.5, y: -60, z: -4.5 } },
    { unit: "ally_soldier", position: { x: 2.5, y: -60, z: -4.5 } },
  ],

  invaderSpawns: [
    { x: -12.5, y: -60, z: 40.5 },
    { x: 0.5, y: -60, z: 42.5 },
    { x: 12.5, y: -60, z: 40.5 },
  ],

  waves: [
    { name: "Exploradores", groups: [{ unit: "invader_soldier", count: 5 }], batchSize: 2, batchIntervalTicks: 60 },
    { name: "Asalto", groups: [{ unit: "invader_soldier", count: 8 }, { unit: "invader_wizard", count: 1 }], batchSize: 3, batchIntervalTicks: 80 },
    { name: "Gran ofensiva", groups: [{ unit: "invader_soldier", count: 13 }, { unit: "invader_wizard", count: 1 }], batchSize: 4, batchIntervalTicks: 80 },
  ],

  lives: 5,
  countdownSeconds: 15,
  intermissionSeconds: 20,

  tickingArea: { center: { x: 0, y: -60, z: 10 }, radiusChunks: 4 },
};
