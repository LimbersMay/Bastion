import type { MapDef } from "./types";

/**
 * Stonehill Castle v1.4 (mapa de terceros, no incluido en el repositorio: ver assets/worlds/README.md).
 * Elegido por Limbers para el rush (2026-11-06): mediano y con un solo acceso a pie. Las coordenadas salieron de
 * leer el mundo sin abrir el juego, con las mismas reglas de paso que el planificador de rutas.
 *
 * Datos del mapa: un castillo de piedra sobre una colina (patio a y 125-129), con una aldea y campos al norte y al
 * suroeste. Por el valle del noreste (y ≈ 100) pasa un arroyo con un puentecito de madera; desde ahí un camino
 * empedrado sube por la ladera este hasta la puerta. Un largo puente de 3 bloques une el castillo con una torre
 * aislada al sureste, y una pasarela con almenas, con otra torre al oeste.
 *
 * Puerta: la entrada este, un pasaje de 10 bloques de ancho (entre dos jambas de piedra en z 201 y z 212, suelo a
 * y 125) bajo el paso de ronda (y 138). El muro de la partida lo cierra por la cara exterior del arco: madera de
 * roble oscuro de tres bloques de grosor (x -284..-282) y 6 de alto (y 125..130). Justo detrás (x -285) hay un
 * poste de madera de abeto; las explosiones de los magos rompen la madera, así que el muro no lo incluye: en la
 * primera prueba (con el muro en x -286..-284) volaron el poste y la brecha se abrió con solo 7 bloques rotos. Con el muro puesto no se llega a pie de fuera al patio (comprobado sobre el terreno real):
 * es el único acceso. Desde dentro sí se puede salir saltando (por las almenas del oeste, por ejemplo), pero no
 * volver a entrar.
 *
 * Sin `siege`: las laderas norte y oeste rodean el castillo a la altura del patio, y quien cavara allí se saltaría
 * el muro.
 */
export const stonehillCastle: MapDef = {
  id: "stonehill-castle",
  name: "Stonehill Castle",
  description: "Castillo de piedra sobre una colina; a la única puerta se sube por un camino empedrado desde el valle.",
  dimension: "overworld",

  gates: [
    {
      id: "gate",
      // Delante del muro, donde acaba la subida.
      position: { x: -279.5, y: 125, z: 207.5 },
      // Meta invisible de los invasores, detrás del muro, en el pasaje.
      objective: { x: -289.5, y: 125, z: 207.5 },
      // Solo se rellena el aire: las jambas y los adornos del arco quedan igual.
      walls: [{ from: { x: -284, y: 125, z: 201 }, to: { x: -282, y: 130, z: 212 }, block: "dark_oak_planks" }],
      breachSpawns: [
        { x: -290.5, y: 125, z: 204.5 },
        { x: -290.5, y: 125, z: 210.5 },
      ],
      breachTroops: [{ unit: "invader_soldier", count: 12 }],
    },
  ],

  // En el paso de ronda, encima de la puerta: se ve toda la subida.
  playerSpawns: [
    { x: -283.5, y: 138, z: 207.5 },
    { x: -284.5, y: 138, z: 207.5 },
    { x: -283.5, y: 138, z: 206.5 },
  ],

  // Detrás del muro, en el pasaje. Los pirómanos solo disparan a lo que ven: desde el paso de ronda no ven nada
  // (el parapeto tapa la subida y el pasaje queda debajo), así que uno va en lo alto de la torre de la esquina, que
  // ve la puerta y parte de la subida, y otro al final del pasaje, en el patio, que ve casi todo el pasaje
  // (calculado con líneas de visión sobre el terreno real). Los arqueros, en esos mismos dos sitios. Los dos
  // guerreros, delante, pegados al muro: aguantan la brecha.
  allies: [
    { unit: "ally_warrior", position: { x: -289.5, y: 125, z: 205.5 } },
    { unit: "ally_warrior", position: { x: -289.5, y: 125, z: 211.5 } },
    { unit: "ally_soldier", position: { x: -291.5, y: 125, z: 205.5 } },
    { unit: "ally_soldier", position: { x: -291.5, y: 125, z: 209.5 } },
    { unit: "ally_soldier", position: { x: -293.5, y: 126, z: 203.5 } },
    { unit: "ally_soldier", position: { x: -293.5, y: 125, z: 211.5 } },
    { unit: "ally_soldier", position: { x: -295.5, y: 126, z: 206.5 } },
    { unit: "ally_soldier", position: { x: -295.5, y: 126, z: 209.5 } },
    { unit: "ally_wizard", position: { x: -284.5, y: 150, z: 212.5 } },
    { unit: "ally_wizard", position: { x: -310.5, y: 128, z: 203.5 } },
    { unit: "ally_archer", position: { x: -283.5, y: 149, z: 213.5 } },
    { unit: "ally_archer", position: { x: -312.5, y: 129, z: 207.5 } },
  ],

  // En el valle del noreste, a 29-41 bloques en línea recta de la puerta, sobre suelo abierto (5x5 libre a su
  // alrededor). Al principio uno estaba en el puentecito del arroyo y otro pegado a la ladera: al salir varios a la
  // vez se empujaban contra los bloques y se asfixiaban.
  invaderSpawns: [
    { x: -266.5, y: 100, z: 175.5 },
    { x: -257.5, y: 101, z: 175.5 },
    { x: -266.5, y: 98, z: 168.5 },
    { x: -269.5, y: 102, z: 180.5 },
  ],

  // La subida por el camino empedrado: hacia el norte por la ladera este (x ≈ -266), al oeste por z 217 y al sur
  // hasta la puerta. Sin ella, desde el valle el juego llevaba a muchos al pie de los barrancos de debajo del
  // castillo (el sitio alcanzable más cercano en línea recta) y se quedaban allí, encajados entre bloques. Los
  // cuatro caminos más cortos, uno por punto de aparición, coinciden en este trazado.
  approachRoutes: [
    [
      { x: -266.5, y: 104, z: 187.5 },
      { x: -265.5, y: 110, z: 202.5 },
      { x: -265.5, y: 118, z: 216.5 },
      { x: -279.5, y: 124, z: 212.5 },
    ],
  ],

  // Puestos de la retirada, todos alcanzables a pie desde el patio con el muro puesto.
  defensePosts: [
    // Pegados al muro por dentro.
    { at: { x: -287.5, y: 125, z: 204.5 }, kind: "front" },
    { at: { x: -287.5, y: 125, z: 209.5 }, kind: "front" },
    // A lo largo del pasaje hacia el patio.
    { at: { x: -290.5, y: 125, z: 203.5 }, kind: "side" },
    { at: { x: -291.5, y: 126, z: 211.5 }, kind: "side" },
    { at: { x: -294.5, y: 126, z: 204.5 }, kind: "side" },
    { at: { x: -294.5, y: 126, z: 210.5 }, kind: "side" },
    { at: { x: -298.5, y: 127, z: 207.5 }, kind: "side" },
    // Para los que disparan, donde ven algo: lo alto de la torre de la esquina sureste y el final del pasaje.
    { at: { x: -284.5, y: 150, z: 212.5 }, kind: "high" },
    { at: { x: -283.5, y: 149, z: 213.5 }, kind: "high" },
    { at: { x: -310.5, y: 128, z: 203.5 }, kind: "high" },
    { at: { x: -312.5, y: 129, z: 207.5 }, kind: "high" },
  ],

  // El patio: la reserva de la retirada.
  rallyPoints: [
    { x: -316.5, y: 129, z: 212.5 },
    { x: -318.5, y: 129, z: 207.5 },
    { x: -314.5, y: 129, z: 214.5 },
  ],

  sortiePoint: { x: -288.5, y: 125, z: 207.5 },

  reinforcements: {
    spawns: [
      { x: -316.5, y: 129, z: 205.5 },
      { x: -312.5, y: 129, z: 210.5 },
      { x: -320.5, y: 129, z: 208.5 },
      { x: -314.5, y: 129, z: 214.5 },
    ],
    // De cada 10: 5 soldados, 2 guerreros, 2 arqueros y 1 pirómano.
    units: ["ally_soldier", "ally_warrior", "ally_soldier", "ally_archer", "ally_soldier", "ally_wizard", "ally_soldier", "ally_warrior", "ally_soldier", "ally_archer"],
    minField: 12,
    reservePerWave: 30,
    batch: 3,
    everySeconds: 5,
  },

  // Los mismos totales que Old Fallen Castle (elegidos por Limbers, 2026-11-06); parte de los soldados pasan a
  // ser arqueros, tantos como magos.
  waves: [
    {
      name: "Exploradores",
      groups: [
        { unit: "invader_soldier", count: 15 },
        { unit: "invader_archer", count: 5 },
        { unit: "invader_wizard", count: 5 },
      ],
      batchSize: 5,
      batchIntervalTicks: 50,
    },
    {
      name: "Asalto",
      groups: [
        { unit: "invader_soldier", count: 34 },
        { unit: "invader_archer", count: 6 },
        { unit: "invader_wizard", count: 6 },
      ],
      batchSize: 6,
      batchIntervalTicks: 50,
    },
    {
      name: "Gran ofensiva",
      groups: [
        { unit: "invader_soldier", count: 52 },
        { unit: "invader_archer", count: 8 },
        { unit: "invader_wizard", count: 8 },
      ],
      batchSize: 8,
      batchIntervalTicks: 50,
    },
  ],

  lives: 5,
  countdownSeconds: 15,
  intermissionSeconds: 20,

  // La subida desde el valle, la puerta y el patio (x -354..-226, z 131..259).
  tickingArea: { center: { x: -290, y: 115, z: 195 }, radiusChunks: 4 },
  // La mitad oeste del castillo, por si alguien se aleja del patio.
  extraTickingAreas: [{ center: { x: -345, y: 130, z: 205 }, radiusChunks: 3 }],
};
