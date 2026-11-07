import type { Vec3 } from "../maps/types";

/**
 * Buscador de rutas para unidades de 2 bloques de alto. Lógica pura: no toca el juego, lee el mundo
 * a través de `cellAt`, así que sirve igual dentro del juego que con un mundo leído del disco.
 *
 * Una ruta puede pasar a través de bloques: romperlos cuesta más que caminar, de modo que la unidad
 * rodea si el rodeo es corto y atraviesa si no lo es.
 */

/** Cómo cuenta un bloque para quien quiere pasar. */
export interface RouteCell {
  /** Lo que cuesta quitarlo, en pasos de camino. 0 si se atraviesa sin más; `Infinity` si no se puede. */
  readonly cost: number;
  /** ¿Se puede estar de pie encima? */
  readonly ground: boolean;
  /** Una escalera de mano: se sube y se baja por dentro. */
  readonly climb?: boolean;
  /** No se puede subir a él de un salto, como una valla. */
  readonly noStep?: boolean;
  /**
   * No es un bloque entero (losa, escalón, vidrio fino...): una escalera de mano no se sostiene en él. En el asedio de
   * Stonehill (v0.1.53) las que se apoyaban así se cayeron al suelo como objetos.
   */
  readonly partial?: boolean;
  /**
   * Arde (madera, lana...): sostiene una escalera, pero el fuego de los pirómanos la quema con su apoyo. En el asedio
   * de Stonehill (v0.1.53) ardía el muro de tablones de la base de la torre y caían casi todas las escaleras.
   */
  readonly flammable?: boolean;
}

export const FREE: RouteCell = { cost: 0, ground: false };
export const CLIMB: RouteCell = { cost: 0, ground: true, climb: true };
/** Sólido que no se rompe, pero que se puede pisar. */
export const SOLID: RouteCell = { cost: Infinity, ground: true };
/** Ni se cruza ni se pisa: agua y lava. */
export const HAZARD: RouteCell = { cost: Infinity, ground: false };

export type CellAt = (x: number, y: number, z: number) => RouteCell;

export interface RouteStep {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Bloques que hay que quitar para dar este paso, en orden. */
  readonly breaks: readonly Vec3[];
  /**
   * El paso se da por una escalera de mano que hay que poner (opción `ladders`): se llega a este paso desde el
   * anterior subiendo o bajando por ella.
   */
  readonly ladder?: LadderMove;
}

/** Una casilla de una escalera de mano por poner, y hacia dónde mira: de la pared hacia fuera. */
export interface LadderCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly dx: number;
  readonly dz: number;
}

/**
 * Una escalera de mano por poner (Limbers, 2026-11-07). Las criaturas no las usan al buscar camino: al bajar hay
 * que meterlas en ella y bajan solas; al subir hay que subirlas (prueba de `tools/lab/ladder.ts`).
 */
export interface LadderMove {
  readonly up: boolean;
  /** De abajo arriba. */
  readonly cells: readonly LadderCell[];
}

export interface Route {
  readonly steps: readonly RouteStep[];
  /** `true` si llega a la meta; `false` si es lo más cerca que se pudo con el presupuesto. */
  readonly complete: boolean;
  /** Casillas exploradas: mide lo que costó calcularla. */
  readonly nodes: number;
}

export interface RouteOptions {
  /** Tope de casillas a explorar. */
  readonly maxNodes?: number;
  /** A esta distancia horizontal de la meta ya se ha llegado. */
  readonly reach?: number;
  /** Máxima altura de caída voluntaria: más que esto hace daño. */
  readonly maxFall?: number;
  /**
   * Puede poner escaleras de mano de hasta esta altura para bajar donde la caída es mayor que `maxFall`, o para
   * subir una pared de 2 o más bloques. Solo en casillas libres (no rompe para ponerlas) y apoyadas en un bloque
   * macizo. Sin esto, no pone ninguna.
   */
  readonly ladders?: number;
}

const DEFAULT_MAX_NODES = 1500;
const DEFAULT_REACH = 1.5;
const DEFAULT_MAX_FALL = 3;
/** Por encima de 1 busca más deprisa a cambio de rutas algo menos cortas. */
const GREED = 1.2;
const STEP_UP_COST = 1.5;
/** Poner una escalera cuesta como unos pasos de rodeo, más un poco por bloque: se prefiere andar si se puede. */
const LADDER_COST = 6;
const LADDER_COST_PER_BLOCK = 1.5;
/** De más por cada escalón apoyado en algo que arde: se busca antes una cara de piedra, pero la madera vale si no hay otra. */
const LADDER_FLAMMABLE_COST = 3;
const SEARCH_SLICE = 25;
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const keyOf = (x: number, y: number, z: number) => ((x + 16384) * 32768 + (z + 16384)) * 1024 + (y + 128);

interface Node {
  x: number;
  y: number;
  z: number;
  g: number;
  f: number;
  from?: Node;
  breaks: readonly Vec3[];
  ladder?: LadderMove;
  closed: boolean;
}

class Heap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= node.f) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = node;
  }

  pop(): Node {
    const items = this.items;
    const top = items[0];
    const last = items.pop() as Node;
    if (items.length > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= items.length) break;
        if (child + 1 < items.length && items[child + 1].f < items[child].f) child++;
        if (items[child].f >= last.f) break;
        items[i] = items[child];
        i = child;
      }
      items[i] = last;
    }
    return top;
  }
}

/** Calcula la ruta de una vez. Dentro del juego, mejor `routeSearch` con `system.runJob`. */
export function planRoute(start: Vec3, goal: Vec3, cellAt: CellAt, options: RouteOptions = {}): Route | undefined {
  const search = routeSearch(start, goal, cellAt, options);
  let step = search.next();
  while (!step.done) step = search.next();
  return step.value;
}

/**
 * La misma búsqueda, troceada: cede el control cada `SEARCH_SLICE` casillas para repartir el trabajo entre ticks.
 * `undefined` si no hay ni un paso útil que dar.
 */
export function* routeSearch(start: Vec3, goal: Vec3, cellAt: CellAt, options: RouteOptions = {}): Generator<void, Route | undefined, void> {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const reach = options.reach ?? DEFAULT_REACH;
  const maxFall = options.maxFall ?? DEFAULT_MAX_FALL;
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  const gz = Math.floor(goal.z);

  const estimate = (x: number, y: number, z: number) => Math.abs(x - gx) + Math.abs(y - gy) + Math.abs(z - gz);
  const arrived = (n: Node) => (n.x - gx) ** 2 + (n.z - gz) ** 2 <= reach ** 2 && Math.abs(n.y - gy) <= 1;

  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const sz = Math.floor(start.z);
  const first: Node = { x: sx, y: sy, z: sz, g: 0, f: 0, breaks: [], closed: false };
  const seen = new Map<number, Node>([[keyOf(sx, sy, sz), first]]);
  const open = new Heap();
  open.push(first);

  let best = first;
  let bestH = estimate(sx, sy, sz);
  let nodes = 0;

  const offer = (from: Node, x: number, y: number, z: number, cost: number, breaks: readonly Vec3[], ladder?: LadderMove) => {
    const g = from.g + cost;
    const key = keyOf(x, y, z);
    const known = seen.get(key);
    if (known && known.g <= g) return;
    const node: Node = { x, y, z, g, f: g + GREED * estimate(x, y, z), from, breaks, ...(ladder ? { ladder } : {}), closed: false };
    if (known) known.closed = true; // la versión antigua queda descartada en la cola
    seen.set(key, node);
    open.push(node);
  };

  /** Altura a la que aterriza quien queda en (x, y, z) sin suelo. `undefined` si caería demasiado o en agua. */
  const landing = (x: number, y: number, z: number): number | undefined => {
    for (let drop = 0; drop <= maxFall; drop++) {
      const below = cellAt(x, y - drop - 1, z);
      if (below.ground) return y - drop;
      if (below.cost !== 0) return undefined;
    }
    return undefined;
  };

  const ladderMax = options.ladders ?? 0;
  /** Casilla donde cabe una escalera: libre del todo, sin romper nada. */
  const fits = (c: RouteCell) => c.cost === 0 && !c.ground;
  /** Bloque al que se puede apoyar una escalera: macizo y entero (no una valla, ni otra escalera). */
  const holds = holdsLadder;
  /**
   * La pared para la casilla (x, y, z): primero la de detrás (`bx`, `bz`), si no cualquier otra; y antes una que no
   * arda que una que sí.
   */
  const wallFor = (x: number, y: number, z: number, bx: number, bz: number): readonly [number, number] | undefined => {
    const order: (readonly [number, number])[] = [[bx, bz], ...DIRECTIONS.filter(([wx, wz]) => wx !== bx || wz !== bz)];
    let fallback: readonly [number, number] | undefined;
    for (const [wx, wz] of order) {
      const c = cellAt(x + wx, y, z + wz);
      if (!holds(c)) continue;
      if (!c.flammable) return [wx, wz];
      fallback ??= [wx, wz];
    }
    return fallback;
  };
  /** Lo que cuestan de más los escalones de una escalera apoyados en algo que arde. */
  const burnCost = (cells: readonly LadderCell[]) =>
    LADDER_FLAMMABLE_COST * cells.filter((c) => cellAt(c.x - c.dx, c.y, c.z - c.dz).flammable).length;

  /**
   * Bajar por una escalera puesta en la columna (cx, cz), desde quien está en el borde a la altura `y`. Cada
   * casilla se apoya en la pared que tenga, así que vale para un acantilado que no es liso. `undefined` si la
   * columna no llega al suelo, termina en agua o hay un hueco sin pared.
   */
  const ladderDown = (cx: number, y: number, cz: number, dx: number, dz: number): { land: number; move: LadderMove } | undefined => {
    const cells: LadderCell[] = [];
    for (let yy = y - 1; yy >= y - ladderMax; yy--) {
      if (!fits(cellAt(cx, yy, cz))) return undefined;
      const wall = wallFor(cx, yy, cz, -dx, -dz);
      if (!wall) return undefined;
      cells.push({ x: cx, y: yy, z: cz, dx: -wall[0], dz: -wall[1] });
      const below = cellAt(cx, yy - 1, cz);
      if (below.ground) return { land: yy, move: { up: false, cells: cells.reverse() } };
      if (below.cost !== 0) return undefined;
    }
    return undefined;
  };

  /**
   * Subir por una escalera puesta en la propia casilla (x, z), apoyada en la pared de delante (dx, dz), hasta
   * salir por encima de ella. Solo para paredes de 2 o más: un bloque se sube de un salto.
   */
  const ladderUp = (x: number, y: number, z: number, dx: number, dz: number): { exit: Vec3; move: LadderMove } | undefined => {
    const cells: LadderCell[] = [];
    for (let top = y; top < y + ladderMax; top++) {
      if (!holds(cellAt(x + dx, top, z + dz)) || !fits(cellAt(x, top, z)) || !fits(cellAt(x, top + 1, z))) return undefined;
      cells.push({ x, y: top, z, dx: -dx, dz: -dz });
      if (fits(cellAt(x + dx, top + 1, z + dz)) && fits(cellAt(x + dx, top + 2, z + dz))) {
        if (top === y || !fits(cellAt(x, top + 2, z))) return undefined;
        return { exit: { x: x + dx, y: top + 1, z: z + dz }, move: { up: true, cells } };
      }
    }
    return undefined;
  };

  while (open.size > 0 && nodes < maxNodes) {
    const n = open.pop();
    if (n.closed) continue;
    n.closed = true;
    nodes++;
    if (nodes % SEARCH_SLICE === 0) yield;

    if (arrived(n)) return { steps: unwind(n), complete: true, nodes };
    const h = estimate(n.x, n.y, n.z);
    if (h < bestH) {
      best = n;
      bestH = h;
    }

    const { x, y, z } = n;
    const headroom = cellAt(x, y + 2, z);

    for (const [dx, dz] of DIRECTIONS) {
      const nx = x + dx;
      const nz = z + dz;
      const feet = cellAt(nx, y, nz);
      const head = cellAt(nx, y + 1, nz);

      // Al mismo nivel, o cayendo si no hay suelo.
      if (feet.cost !== Infinity && head.cost !== Infinity) {
        const land = landing(nx, y, nz);
        if (land !== undefined) {
          const breaks: Vec3[] = [];
          if (head.cost > 0) breaks.push({ x: nx, y: y + 1, z: nz });
          if (feet.cost > 0) breaks.push({ x: nx, y, z: nz });
          offer(n, nx, land, nz, 1 + feet.cost + head.cost + (y - land), breaks);
        }
      }

      // Un escalón: lo de delante se queda para pisarlo.
      if (feet.ground && !feet.climb && !feet.noStep && headroom.cost !== Infinity) {
        const upperFeet = head;
        const upperHead = cellAt(nx, y + 2, nz);
        if (upperFeet.cost !== Infinity && upperHead.cost !== Infinity) {
          const breaks: Vec3[] = [];
          if (headroom.cost > 0) breaks.push({ x, y: y + 2, z });
          if (upperHead.cost > 0) breaks.push({ x: nx, y: y + 2, z: nz });
          if (upperFeet.cost > 0) breaks.push({ x: nx, y: y + 1, z: nz });
          offer(n, nx, y + 1, nz, STEP_UP_COST + headroom.cost + upperHead.cost + upperFeet.cost, breaks);
        }
      }

      if (ladderMax > 0) {
        // Por una escalera puesta: hacia abajo, donde la caída es demasiado alta; hacia arriba, por una pared.
        if (fits(feet) && fits(head) && landing(nx, y, nz) === undefined) {
          const down = ladderDown(nx, y, nz, dx, dz);
          if (down) offer(n, nx, down.land, nz, LADDER_COST + LADDER_COST_PER_BLOCK * (y - down.land) + burnCost(down.move.cells), [], down.move);
        }
        if (holds(feet) && !fits(head)) {
          const up = ladderUp(x, y, z, dx, dz);
          if (up) offer(n, up.exit.x, up.exit.y, up.exit.z, LADDER_COST + LADDER_COST_PER_BLOCK * (up.exit.y - y) + burnCost(up.move.cells), [], up.move);
        }
      }
    }

    // Por la escalera de mano, hacia arriba.
    if ((cellAt(x, y, z).climb || cellAt(x, y + 1, z).climb) && headroom.cost !== Infinity) {
      offer(n, x, y + 1, z, 1 + headroom.cost, headroom.cost > 0 ? [{ x, y: y + 2, z }] : []);
    }

    // Hacia abajo: por la escalera de mano, o abriendo el suelo que pisa.
    const floor = cellAt(x, y - 1, z);
    if (floor.climb) {
      offer(n, x, y - 1, z, 1, []);
    } else if (floor.ground && floor.cost !== Infinity) {
      const land = landing(x, y - 1, z);
      if (land !== undefined) offer(n, x, land, z, 1 + floor.cost + (y - 1 - land), [{ x, y: y - 1, z }]);
    }
  }

  if (best === first) return undefined;
  return { steps: unwind(best), complete: false, nodes };
}

function unwind(last: Node): RouteStep[] {
  const steps: RouteStep[] = [];
  for (let n: Node | undefined = last; n?.from; n = n.from) steps.push({ x: n.x, y: n.y, z: n.z, breaks: n.breaks, ...(n.ladder ? { ladder: n.ladder } : {}) });
  return steps.reverse();
}

/** Bloques que se atraviesan sin romperlos. */
const PASSABLE = /:air$|grass|fern|flower$|snow_layer|vine|bush|tulip|dandelion|poppy|orchid|allium|azure|cornflower|lily|carpet|torch|sapling|mushroom$|leaf_litter|:fire$|soul_fire|(?<!iron)_door$|button|lever|pressure_plate|rail$|redstone_wire|tripwire|structure_void|kelp|seagrass/;
const LIQUID = /water|lava|bubble_column/;
const LADDER = /:ladder$|scaffolding/;
/** No se pisa para subir: una valla pasa de un bloque, y los mobs no cruzan una trampilla. */
const NO_STEP = /fence|_wall$|trapdoor/;
/** Lo que nadie rompe: los del propio juego, y los que guardan algo que se perdería. */
const UNBREAKABLE = /bedrock|barrier|command_block|structure_|border_block|:allow|:deny|portal|light_block|reinforced_deepslate|chest|barrel|shulker|hopper|dispenser|dropper|furnace|smoker|sign|banner|lectern|jukebox|spawner|:bed$/;
/** No son bloques enteros: no sostienen una escalera de mano. La losa doble sí es entera. */
const PARTIAL = /(?<!double_)slab|stairs|fence|_wall$|trapdoor|_pane$|iron_bars|chain|lantern|leaves|campfire|anvil|cake|candle|flower_pot|_head$|skull|chest|:bed$|lectern|hopper|bell|grindstone|stonecutter|enchanting_table|end_rod|lightning_rod|cactus|bamboo|composter|cauldron|brewing_stand|daylight_detector|_sign$|banner/;
/** Arde: no conviene apoyar una escalera en ello. */
const FLAMMABLE = /planks|_log$|_wood$|_stem$|hyphae|leaves|wool|hay_block|bookshelf|bamboo_block|_fence$|fence_gate/;
const SOFT = /planks|log|wood|fence|door|leaves|wool|glass|hay|bookshelf|ladder|dirt|grass_block|mud|sand|gravel/;

const SOFT_COST = 4;
const HARD_COST = 6;

/** ¿Sostiene una escalera de mano? Un bloque entero que se pisa, que no es otra escalera ni una valla. */
export function holdsLadder(c: RouteCell): boolean {
  return c.ground && c.cost !== 0 && !c.climb && !c.noStep && !c.partial;
}

/** Traduce un tipo de bloque a lo que significa para una ruta. */
export function classifyBlock(typeId: string): RouteCell {
  if (typeId === "minecraft:grass_block") return { cost: SOFT_COST, ground: true };
  if (LIQUID.test(typeId)) return HAZARD;
  if (LADDER.test(typeId)) return CLIMB;
  if (PASSABLE.test(typeId)) return FREE;
  const partial = PARTIAL.test(typeId);
  const flammable = FLAMMABLE.test(typeId);
  if (UNBREAKABLE.test(typeId)) return partial || flammable ? { ...SOLID, ...(partial ? { partial } : {}), ...(flammable ? { flammable } : {}) } : SOLID;
  const cost = SOFT.test(typeId) ? SOFT_COST : HARD_COST;
  return { cost, ground: true, ...(NO_STEP.test(typeId) ? { noStep: true } : {}), ...(partial ? { partial } : {}), ...(flammable ? { flammable } : {}) };
}
