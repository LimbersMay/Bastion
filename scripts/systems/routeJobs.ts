import { system, type Dimension } from "@minecraft/server";
import type { SiegeDef, Vec3 } from "../maps/types";
import { classifyBlock, FREE, routeSearch, SOLID, type Route, type RouteCell } from "./routeLogic";
import { inBox } from "./wallLogic";

/** Casillas que puede explorar una búsqueda. */
const MAX_NODES = 12000;
/** Altura máxima de una escalera de mano que puede poner el director (opción `ladders`). */
const LADDER_MAX = 24;
/** Búsquedas en espera, como mucho; si no cabe, quien la pide lo intenta más tarde. */
const QUEUE_MAX = 4;
/** Cada cuánto se olvidan los sitios por donde no se pudo pasar: el terreno cambia con la batalla. */
const FORGET_TICKS = 60 * 20;

export interface RouteRequest {
  readonly start: Vec3;
  readonly goal: Vec3;
  /**
   * Puede abrirse paso: lo rompible cuenta como rompible dentro de la zona de asedio (los invasores). Sin esto,
   * todo lo rompible cuenta como macizo: solo camina (los aliados, que no rompen su castillo).
   */
  readonly dig: boolean;
  /** Puede poner escaleras de mano para subir o bajar (`RouteOptions.ladders`): el director de inalcanzables. */
  readonly ladders?: boolean;
  /** Para el registro. */
  readonly label: string;
  /** `undefined` si no hay ni un paso útil, o si la partida se reinició mientras tanto. */
  readonly done: (route: Route | undefined) => void;
}

const cellKey = (x: number, y: number, z: number) => (x + 4096) * 8192 * 512 + (z + 4096) * 512 + (y + 64);

/**
 * Cola de búsquedas de ruta de toda la partida: la caza (`hunt.ts`) y el director de inalcanzables
 * (`unreachable.ts`) la comparten, así que nunca corre más de una a la vez y el peor tick no se duplica. Cada
 * búsqueda se reparte entre ticks con `system.runJob`.
 */
export class RouteJobs {
  private readonly queue: RouteRequest[] = [];
  private running = false;
  /** Sube al reiniciar la partida, para descartar la búsqueda que hubiera en curso. */
  private generation = 0;
  private avoid = new Set<number>();
  private forgetAt = 0;

  constructor(
    private readonly dimension: Dimension,
    private readonly siege: SiegeDef | undefined,
    private readonly isProtected: (at: Vec3) => boolean
  ) {}

  /** Hay una búsqueda en marcha o en espera. */
  get busy(): boolean {
    return this.running || this.queue.length > 0;
  }

  /** Pide una búsqueda. `false` si la cola está llena. */
  request(req: RouteRequest): boolean {
    if (this.queue.length >= QUEUE_MAX) return false;
    this.queue.push(req);
    this.next();
    return true;
  }

  /** Un sitio por donde no se pudo pasar: las búsquedas lo cuentan como macizo durante un rato. */
  avoidCell(at: Vec3): void {
    this.avoid.add(cellKey(at.x, at.y, at.z));
  }

  clear(): void {
    this.generation++;
    this.running = false;
    this.queue.length = 0;
    this.avoid = new Set();
  }

  private next(): void {
    if (this.running) return;
    const req = this.queue.shift();
    if (!req) return;
    const now = system.currentTick;
    if (now >= this.forgetAt) {
      this.avoid = new Set();
      this.forgetAt = now + FORGET_TICKS;
    }
    this.running = true;
    const generation = this.generation;
    const search = routeSearch(req.start, req.goal, this.cellAt(req.dig, req.ladders === true), { maxNodes: MAX_NODES, ladders: req.ladders ? LADDER_MAX : 0 });
    const jobs = this;
    const started = Date.now();
    system.runJob(
      (function* () {
        let route: Route | undefined;
        try {
          let step = search.next();
          while (!step.done) {
            yield;
            if (generation !== jobs.generation) return;
            step = search.next();
          }
          route = step.value;
          if (route) {
            const breaks = route.steps.reduce((n, s) => n + s.breaks.length, 0);
            const ladders = route.steps.filter((s) => s.ladder).length;
            console.log(
              `[bastion] ${req.label}: ruta de ${route.steps.length} pasos, rompe ${breaks}, ${ladders > 0 ? `${ladders} escaleras, ` : ""}${route.complete ? "llega" : "parcial"}, ${route.nodes} casillas, ${Date.now() - started} ms.`
            );
          }
        } catch (e) {
          console.warn(`[bastion] Error buscando ruta (${req.label}): ${e instanceof Error ? e.message : String(e)}`);
        }
        if (generation !== jobs.generation) return;
        jobs.running = false;
        try {
          req.done(route);
        } catch (e) {
          console.warn(`[bastion] Error al usar una ruta (${req.label}): ${e instanceof Error ? e.message : String(e)}`);
        }
        jobs.next();
      })()
    );
  }

  private cellAt(dig: boolean, ladders: boolean): (x: number, y: number, z: number) => RouteCell {
    const cache = new Map<number, RouteCell>();
    const avoid = this.avoid;
    return (x, y, z) => {
      const key = cellKey(x, y, z);
      let cell = cache.get(key);
      if (cell) return cell;
      cell = avoid.has(key) ? SOLID : this.readCell({ x, y, z }, dig, ladders);
      cache.set(key, cell);
      return cell;
    };
  }

  /**
   * Lo rompible fuera de la zona de asedio, lo que protege una puerta o, sin `dig`, todo, cuenta como macizo. Con
   * `ladders`, una escalera ya puesta cuenta como libre: así la ruta vuelve a pasar por ella como escalera
   * (`RouteStep.ladder`) y el director lleva a la unidad por ella, porque las criaturas no las usan solas.
   */
  private readCell(at: Vec3, dig: boolean, ladders: boolean): RouteCell {
    let cell: RouteCell;
    try {
      const block = this.dimension.getBlock(at);
      cell = block ? classifyBlock(block.typeId) : SOLID;
    } catch {
      return SOLID;
    }
    if (ladders && cell.climb) return FREE;
    const breakable = cell.cost > 0 && cell.cost !== Infinity;
    if (!breakable) return cell;
    if (dig && this.siege && inBox(at, this.siege.zone) && !this.isProtected(at)) return cell;
    // Macizo, pero conserva lo que importa a las escaleras y a los saltos: una losa no sostiene una escalera
    // (antes se perdía, y en Stonehill las escaleras se apoyaban en losas y se caían), la madera arde con ella y
    // una valla no se pisa.
    if (!cell.partial && !cell.noStep && !cell.flammable) return SOLID;
    return { ...SOLID, ...(cell.partial ? { partial: true } : {}), ...(cell.noStep ? { noStep: true } : {}), ...(cell.flammable ? { flammable: true } : {}) };
  }
}
