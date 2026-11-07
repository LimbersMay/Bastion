import { system, world, type Entity } from "@minecraft/server";
import { ENTITY_IDS, huntTrailTag } from "../constants";
import type { Vec3 } from "../maps/types";
import { advanceWithLadders, firstLadder, markerStep } from "../systems/huntLogic";
import { Ladders } from "../systems/ladders";
import { RouteJobs } from "../systems/routeJobs";
import type { RouteStep } from "../systems/routeLogic";

/**
 * Laboratorio: las escaleras del director en terreno irregular (Limbers, 2026-11-07, tras la prueba de
 * `ladder.ts`, que solo usó una torre lisa). Usa las piezas reales: el planificador con escaleras (`RouteJobs`),
 * `Ladders` para ponerlas y llevar a la unidad, y el marcador que espera ante cada escalera (`advanceWithLadders`,
 * como un grupo guiado). `/scriptevent bastion:lab climb <acantilado|muralla> <bajar|subir> [intentos]`.
 * Activarlo: `tools/lab/README.md`.
 *
 * En la plataforma de `field.ts` (el cielo de Stonehill):
 * - `acantilado`: meseta de 14 de alto, un saliente a media altura (de pie en 207), una cornisa en lo alto que
 *   sobresale sobre el saliente en la mitad sur (sin pared debajo) y bultos en la cara del saliente.
 * - `muralla`: muralla de 3 de ancho y 8 de alto, con almenas en el borde exterior.
 * Quien se mueve es un soldado invasor que sigue un marcador de la caza (`huntTrailTag(0)`). Cada intento dura 60 s
 * como mucho. Al acabar escribe `FIN escalada ...` en el registro.
 */

const FLOOR_Y = 200;
const X0 = -286;
const X1 = -239;
const Z0 = 151;
const Z1 = 198;
const LAB_TAG = "bastion_lab_climb";
const TRAIL = huntTrailTag(0);
const TRIAL_TICKS = 60 * 20;
const GROUP_REACH = 3;
const ARRIVED_H = 3;
const ARRIVED_V = 1.5;

type Scenario = "acantilado" | "muralla";
type Direction = "bajar" | "subir";

/** Arriba y abajo de cada escenario (casillas donde se está de pie). */
const ENDS: Record<Scenario, { top: Vec3; bottom: Vec3 }> = {
  acantilado: { top: { x: -275, y: 214, z: 175 }, bottom: { x: -252, y: FLOOR_Y, z: 175 } },
  muralla: { top: { x: -245, y: 208, z: 175 }, bottom: { x: -241, y: FLOOR_Y, z: 175 } },
};

interface Run {
  readonly scenario: Scenario;
  readonly direction: Direction;
  readonly trials: number;
  trial: number;
  started: number;
  mover?: Entity;
  marker?: Entity;
  steps?: readonly RouteStep[];
  progress: number;
  readonly times: (number | undefined)[];
  falls: number;
  ladders: number;
  blocks: number;
}

let run: Run | undefined;
const say = (t: string) => console.log(`[lab] ${t}`);
const dim = () => world.getDimension("overworld");
const cmd = (c: string) => dim().runCommand(c);
const center = (s: Vec3): Vec3 => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });
// Se crean al primer uso: al cargar el script aún no se puede leer el mundo.
let jobsLazy: RouteJobs | undefined;
let laddersLazy: Ladders | undefined;
const jobs = () => (jobsLazy ??= new RouteJobs(dim(), undefined, () => false));
const ladders = () => (laddersLazy ??= new Ladders(dim()));

function build(): void {
  cmd(`fill ${X0 - 1} ${FLOOR_Y - 1} ${Z0 - 1} ${X1 + 1} ${FLOOR_Y - 1} ${Z1 + 1} grass_block`);
  // Por tramos de 10 capas: un fill no puede pasar de 32.768 bloques.
  for (let y = FLOOR_Y; y <= FLOOR_Y + 30; y += 10) cmd(`fill ${X0 - 1} ${y} ${Z0 - 1} ${X1 + 1} ${Math.min(y + 9, FLOOR_Y + 30)} ${Z1 + 1} air`);
  for (const [a, b] of [
    [`${X0 - 1} ${FLOOR_Y} ${Z0 - 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z0 - 1}`],
    [`${X0 - 1} ${FLOOR_Y} ${Z1 + 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
    [`${X0 - 1} ${FLOOR_Y} ${Z0 - 1}`, `${X0 - 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
    [`${X1 + 1} ${FLOOR_Y} ${Z0 - 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
  ]) {
    cmd(`fill ${a} ${b} barrier`);
  }
  // Acantilado: meseta (de pie en 214) y saliente al este (de pie en 207), de z 165 a 185, cerrado por barreras al
  // norte y al sur para que solo se baje por el este.
  cmd(`fill -280 ${FLOOR_Y} 165 -266 ${FLOOR_Y + 13} 185 stone`);
  cmd(`fill -265 ${FLOOR_Y} 165 -262 ${FLOOR_Y + 6} 185 stone`);
  cmd(`fill -280 ${FLOOR_Y + 14} 164 -262 ${FLOOR_Y + 15} 164 barrier`);
  cmd(`fill -280 ${FLOOR_Y + 14} 186 -262 ${FLOOR_Y + 15} 186 barrier`);
  cmd(`fill -281 ${FLOOR_Y + 14} 164 -281 ${FLOOR_Y + 15} 186 barrier`);
  // Cornisa: sobresale un bloque sobre el saliente en la mitad sur (z 165-176); bajo ella no hay pared.
  cmd(`fill -265 ${FLOOR_Y + 13} 165 -265 ${FLOOR_Y + 13} 176 stone`);
  // Bultos en la cara este del saliente.
  cmd(`fill -261 ${FLOOR_Y + 2} 172 -261 ${FLOOR_Y + 4} 178 cobblestone`);
  // Muralla de 3 de ancho y 8 de alto (de pie en 208), almenas en el borde exterior (este) en las z pares.
  cmd(`fill -246 ${FLOOR_Y} 155 -244 ${FLOOR_Y + 7} 195 stone_bricks`);
  for (let z = 156; z <= 194; z += 2) cmd(`setblock -244 ${FLOOR_Y + 8} ${z} stone_bricks`);
}

function clean(): void {
  for (const e of dim().getEntities({ tags: [LAB_TAG] })) e.remove();
}

function startTrial(r: Run): void {
  clean();
  ladders().removeAll();
  build();
  r.steps = undefined;
  r.progress = 0;
  r.marker = undefined;
  const { top, bottom } = ENDS[r.scenario];
  const [from, to] = r.direction === "bajar" ? [top, bottom] : [bottom, top];
  const mover = dim().spawnEntity(ENTITY_IDS.invaderSoldier, center(from));
  mover.addTag(LAB_TAG);
  mover.addTag(TRAIL);
  system.runTimeout(() => {
    if (mover.isValid) mover.triggerEvent("bastion:march");
  }, 5);
  r.mover = mover;
  r.started = system.currentTick;
  const trial = r.trial;
  jobs().request({
    start: center(from),
    goal: center(to),
    dig: false,
    ladders: true,
    label: `Lab escalada ${r.scenario} ${r.direction}`,
    done: (route) => {
      if (run !== r || r.trial !== trial) return;
      if (!route?.complete) {
        say(`escalada: sin ruta (${route ? `parcial, ${route.steps.length} pasos` : "ninguna"})`);
        return;
      }
      const first = route.steps[0]?.ladder ? [{ ...from, breaks: [] }, ...route.steps] : route.steps;
      r.steps = first;
      const used = first.filter((s) => s.ladder);
      r.ladders = used.length;
      r.blocks = ladders().place(first);
      ladders().ride("lab", first, () => (r.mover?.isValid ? [r.mover.id] : []), GROUP_REACH);
      say(
        `escalada: ruta de ${first.length} pasos, ${used.map((s) => `${s.ladder!.up ? "sube" : "baja"} ${s.ladder!.cells.length} en ${s.ladder!.cells[0].x},${s.ladder!.cells[0].z}`).join("; ")}; ${r.blocks} bloques puestos`
      );
      const marker = dim().spawnEntity(ENTITY_IDS.waypoint, center(first[markerStep(0, firstLadder(first, 0), first.length - 1)]));
      marker.addTag(TRAIL);
      marker.addTag(LAB_TAG);
      r.marker = marker;
    },
  });
}

function finish(r: Run): void {
  const arrived = r.times.filter((t) => t !== undefined) as number[];
  const avg = arrived.length > 0 ? (arrived.reduce((a, b) => a + b, 0) / arrived.length).toFixed(1) : "-";
  say(
    `FIN escalada ${r.scenario} ${r.direction}: llegaron ${arrived.length} de ${r.trials} | tiempos ${r.times.map((t) => (t === undefined ? "no" : `${t.toFixed(0)} s`)).join(", ")} | media ${avg} s | escaleras ${r.ladders} | caídas con daño ${r.falls}`
  );
  run = undefined;
  ladders().clearRides();
  clean();
}

/** Cada segundo: llegada y fin del intento. */
function tick(): void {
  const r = run;
  if (!r) return;
  const elapsed = system.currentTick - r.started;
  const m = r.mover;
  const { top, bottom } = ENDS[r.scenario];
  const goal = r.direction === "bajar" ? bottom : top;
  const at = m?.isValid ? m.location : undefined;
  const arrived = !!at && Math.hypot(at.x - (goal.x + 0.5), at.z - (goal.z + 0.5)) <= ARRIVED_H && Math.abs(at.y - goal.y) <= ARRIVED_V;
  if (!arrived && elapsed < TRIAL_TICKS && m?.isValid) return;
  r.times.push(arrived ? elapsed / 20 : undefined);
  say(`escalada ${r.scenario} ${r.direction}, intento ${r.trial + 1}: ${arrived ? `llega en ${(elapsed / 20).toFixed(0)} s` : `no llega${at ? ` (en ${at.x.toFixed(1)},${at.y.toFixed(1)},${at.z.toFixed(1)})` : ""}`}`);
  ladders().clearRides();
  r.trial++;
  if (r.trial >= r.trials) finish(r);
  else startTrial(r);
}

/** Cada 5 ticks: el marcador avanza por la ruta como el de un grupo guiado, esperando ante cada escalera. */
function guide(): void {
  const r = run;
  const m = r?.mover;
  if (!r?.steps || !m?.isValid || !r.marker?.isValid) return;
  const before = r.progress;
  r.progress = advanceWithLadders(r.steps, r.progress, undefined, [m.location]);
  const target = center(r.steps[markerStep(r.progress, firstLadder(r.steps, r.progress), r.steps.length - 1)]);
  const at = r.marker.location;
  if (Math.hypot(at.x - target.x, at.y - target.y, at.z - target.z) > 0.1) r.marker.teleport(target);
  if (r.progress !== before) say(`escalada: paso ${r.progress} de ${r.steps.length - 1} a los ${((system.currentTick - r.started) / 20).toFixed(1)} s`);
}

export function handleClimb(args: readonly string[]): void {
  if (args[0] === "clean") {
    run = undefined;
    ladders().clearRides();
    clean();
    return;
  }
  const scenario: Scenario = args[0] === "muralla" ? "muralla" : "acantilado";
  const direction: Direction = args[1] === "subir" ? "subir" : "bajar";
  run = { scenario, direction, trials: Math.max(1, Number(args[2] ?? 3)), trial: 0, started: 0, progress: 0, times: [], falls: 0, ladders: 0, blocks: 0 };
  say(`escalada ${scenario} ${direction}: ${run.trials} intentos de 60 s`);
  startTrial(run);
}

world.afterEvents.entityHurt.subscribe((ev) => {
  const r = run;
  if (r && ev.hurtEntity.id === r.mover?.id && ev.damageSource.cause === "fall") r.falls++;
});

system.runInterval(() => laddersLazy?.tick(), 1);
system.runInterval(() => {
  try {
    guide();
  } catch (e) {
    say(`error guiando: ${e instanceof Error ? e.message : String(e)}`);
  }
}, 5);
system.runInterval(() => {
  try {
    tick();
  } catch (e) {
    say(`error en escalada: ${e instanceof Error ? e.message : String(e)}`);
    run = undefined;
  }
}, 20);
