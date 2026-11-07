import { system, world, type Entity } from "@minecraft/server";
import { ENTITY_IDS, huntTrailTag } from "../constants";

/**
 * Laboratorio: ¿bajan o suben las criaturas por una escalera de mano? Es la propuesta de Limbers (2026-11-07) para
 * sustituir la nube de humo del director de inalcanzables (`docs/IA.md`, «Unidades inalcanzables»). Sin
 * integrar en el juego: solo mide.
 * `/scriptevent bastion:lab ladder <sin|escalera|guiada|empujada|asistida> <bajar|subir> [intentos]`. Activarlo: `tools/lab/README.md`.
 *
 * Una torre de 5x5 y 10 de alto en la plataforma de `field.ts` (el cielo de Stonehill), sin otra subida.
 * - `bajar`: un soldado aliado con la orden de ataque arriba, libre; un invasor abajo, encerrado tras barreras.
 *   Llega si el aliado pisa el suelo.
 * - `subir`: un invasor en marcha abajo, libre; un aliado arriba, encerrado. Llega si el invasor pisa lo alto.
 * - `escalera`: una columna de escaleras de mano en la cara este de la torre, de arriba abajo. `sin`: nada.
 * - `guiada`: con la escalera, y quien se mueve es un invasor que sigue un marcador de la caza (`huntTrailTag(0)`),
 *   como haría el director: el marcador va al borde, a la escalera y al otro extremo, paso a paso. Así se ve si la
 *   criatura baja o sube por la escalera cuando se la lleva hasta ella, aunque no la use al buscar camino sola.
 * - `empujada`: como `guiada`, pero al llegar junto a la escalera se la mete en ella (un bloque), como podría hacer el
 *   director, y se mira si desde ahí baja o sube sola hasta el marcador.
 * - `asistida`: como `empujada`, y al subir el script la sube por la escalera a la velocidad de trepar y la deja arriba.
 * Cada intento dura 30 s como mucho. Al acabar escribe `FIN escalera ...` en el registro.
 */

const FLOOR_Y = 200;
const X0 = -286;
const X1 = -239;
const Z0 = 151;
const Z1 = 198;
const CX = -262;
const CZ = 175;
const HEIGHT = 10;
const TOP_Y = FLOOR_Y + HEIGHT;
const PEN_X = CX + 10;
const TRIAL_TICKS = 30 * 20;
const LAB_TAG = "bastion_lab_ladder";

type Variant = "sin" | "escalera" | "guiada" | "empujada" | "asistida";

const TRAIL = huntTrailTag(0);
/**
 * A esta distancia de un punto del recorrido guiado, el marcador pasa al siguiente. La criatura se para a unos 2
 * bloques del marcador (lo «ataca»), así que no puede ser menos.
 */
const GUIDE_H = 2.5;
const GUIDE_V = 1.5;
type Direction = "bajar" | "subir";

interface Run {
  readonly variant: Variant;
  readonly direction: Direction;
  readonly trials: number;
  trial: number;
  started: number;
  mover?: Entity;
  marker?: Entity;
  /** Recorrido del marcador en la variante guiada, y por qué punto va. */
  path: { x: number; y: number; z: number }[];
  step: number;
  /** Segundos que tardó cada intento; `undefined` si no llegó. */
  readonly times: (number | undefined)[];
  falls: number;
}

let run: Run | undefined;
const say = (t: string) => console.log(`[lab] ${t}`);
const dim = () => world.getDimension("overworld");
const cmd = (c: string) => dim().runCommand(c);

function build(variant: Variant): void {
  cmd(`fill ${X0 - 1} ${FLOOR_Y - 1} ${Z0 - 1} ${X1 + 1} ${FLOOR_Y - 1} ${Z1 + 1} grass_block`);
  // Por tramos de 10 capas: un fill no puede pasar de 32.768 bloques, y si falla quedan barreras de otros intentos.
  for (let y = FLOOR_Y; y <= FLOOR_Y + 30; y += 10) cmd(`fill ${X0 - 1} ${y} ${Z0 - 1} ${X1 + 1} ${Math.min(y + 9, FLOOR_Y + 30)} ${Z1 + 1} air`);
  for (const [a, b] of [
    [`${X0 - 1} ${FLOOR_Y} ${Z0 - 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z0 - 1}`],
    [`${X0 - 1} ${FLOOR_Y} ${Z1 + 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
    [`${X0 - 1} ${FLOOR_Y} ${Z0 - 1}`, `${X0 - 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
    [`${X1 + 1} ${FLOOR_Y} ${Z0 - 1}`, `${X1 + 1} ${FLOOR_Y + 2} ${Z1 + 1}`],
  ]) {
    cmd(`fill ${a} ${b} barrier`);
  }
  // La torre: 5x5, maciza, con el suelo de arriba en TOP_Y.
  cmd(`fill ${CX - 2} ${FLOOR_Y} ${CZ - 2} ${CX + 2} ${TOP_Y - 1} ${CZ + 2} stone`);
  // Escaleras de mano pegadas a la cara este (facing_direction 5 = mira al este).
  if (variant !== "sin") cmd(`fill ${CX + 3} ${FLOOR_Y} ${CZ} ${CX + 3} ${TOP_Y - 1} ${CZ} ladder ["facing_direction"=5]`);
}

/** Barreras de 2 de alto alrededor de una casilla: quien está dentro no sale, pero se le ve. */
function pen(x: number, y: number, z: number): void {
  cmd(`fill ${x - 1} ${y} ${z - 1} ${x + 1} ${y + 1} ${z + 1} barrier`);
  cmd(`fill ${x} ${y} ${z} ${x} ${y + 1} ${z} air`);
}

function clean(): void {
  for (const e of dim().getEntities({ tags: [LAB_TAG] })) e.remove();
}

function spawn(id: string, x: number, y: number, z: number, event: string): Entity {
  const e = dim().spawnEntity(id, { x: x + 0.5, y, z: z + 0.5 });
  e.addTag(LAB_TAG);
  system.runTimeout(() => {
    if (e.isValid) e.triggerEvent(event);
  }, 5);
  return e;
}

function startTrial(r: Run): void {
  clean();
  build(r.variant);
  r.path = [];
  r.step = 0;
  r.marker = undefined;
  if (r.variant === "guiada" || r.variant === "empujada" || r.variant === "asistida") {
    // El que se mueve es un invasor que sigue el marcador; el aliado, encerrado, solo está para que haya enemigo.
    if (r.direction === "bajar") {
      pen(PEN_X, FLOOR_Y, CZ);
      spawn(ENTITY_IDS.allySoldier, PEN_X, FLOOR_Y, CZ, "bastion:sortie");
      r.mover = spawn(ENTITY_IDS.invaderSoldier, CX - 1, TOP_Y, CZ, "bastion:march");
      r.path = [
        { x: CX + 2, y: TOP_Y, z: CZ },
        // A media escalera: desde el borde, la criatura va recta hacia él y se mete en la escalera.
        { x: CX + 3, y: TOP_Y - 4, z: CZ },
        { x: CX + 3, y: FLOOR_Y, z: CZ },
        { x: CX + 6, y: FLOOR_Y, z: CZ },
      ];
    } else {
      pen(CX, TOP_Y, CZ);
      spawn(ENTITY_IDS.allySoldier, CX, TOP_Y, CZ, "bastion:sortie");
      r.mover = spawn(ENTITY_IDS.invaderSoldier, PEN_X, FLOOR_Y, CZ, "bastion:march");
      r.path = [
        { x: CX + 4, y: FLOOR_Y, z: CZ },
        // Arriba, al otro lado de la escalera: para ir hacia él empuja contra la torre desde la escalera.
        { x: CX + 1, y: TOP_Y, z: CZ },
      ];
    }
    r.mover.addTag(TRAIL);
    const first = r.path[0];
    r.marker = dim().spawnEntity(ENTITY_IDS.waypoint, { x: first.x + 0.5, y: first.y, z: first.z + 0.5 });
    r.marker.addTag(TRAIL);
    r.marker.addTag(LAB_TAG);
    r.started = system.currentTick;
    return;
  }
  if (r.direction === "bajar") {
    pen(PEN_X, FLOOR_Y, CZ);
    spawn(ENTITY_IDS.invaderSoldier, PEN_X, FLOOR_Y, CZ, "bastion:march");
    r.mover = spawn(ENTITY_IDS.allySoldier, CX, TOP_Y, CZ, "bastion:sortie");
  } else {
    pen(CX, TOP_Y, CZ);
    spawn(ENTITY_IDS.allySoldier, CX, TOP_Y, CZ, "bastion:sortie");
    r.mover = spawn(ENTITY_IDS.invaderSoldier, PEN_X, FLOOR_Y, CZ, "bastion:march");
  }
  r.started = system.currentTick;
}

function finish(r: Run): void {
  const arrived = r.times.filter((t) => t !== undefined) as number[];
  const avg = arrived.length > 0 ? (arrived.reduce((a, b) => a + b, 0) / arrived.length).toFixed(1) : "-";
  say(
    `FIN escalera ${r.variant} ${r.direction}: llegaron ${arrived.length} de ${r.trials} | tiempos ${r.times.map((t) => (t === undefined ? "no" : `${t.toFixed(0)} s`)).join(", ")} | media ${avg} s | caídas con daño ${r.falls}`
  );
  run = undefined;
  clean();
}

function tick(): void {
  const r = run;
  if (!r) return;
  const elapsed = system.currentTick - r.started;
  const m = r.mover;
  const y = m?.isValid ? m.location.y : undefined;
  const arrived = y !== undefined && (r.direction === "bajar" ? y <= FLOOR_Y + 1 : y >= TOP_Y - 0.5);
  if (!arrived && elapsed < TRIAL_TICKS && m?.isValid) return;
  r.times.push(arrived ? elapsed / 20 : undefined);
  say(`escalera ${r.variant} ${r.direction}, intento ${r.trial + 1}: ${arrived ? `llega en ${(elapsed / 20).toFixed(0)} s` : "no llega"}`);
  r.trial++;
  if (r.trial >= r.trials) finish(r);
  else startTrial(r);
}

world.afterEvents.entityHurt.subscribe((ev) => {
  const r = run;
  if (r && ev.hurtEntity.id === r.mover?.id && ev.damageSource.cause === "fall") r.falls++;
});

export function handleLadder(args: readonly string[]): void {
  if (args[0] === "clean") {
    run = undefined;
    clean();
    return;
  }
  const variant: Variant = args[0] === "escalera" || args[0] === "guiada" || args[0] === "empujada" || args[0] === "asistida" ? args[0] : "sin";
  const direction: Direction = args[1] === "subir" ? "subir" : "bajar";
  run = { variant, direction, trials: Math.max(1, Number(args[2] ?? 5)), trial: 0, started: 0, times: [], falls: 0, path: [], step: 0 };
  say(`escalera ${variant} ${direction}: ${run.trials} intentos de 30 s`);
  startTrial(run);
}

system.runInterval(() => {
  try {
    tick();
  } catch (e) {
    say(`error en escalera: ${e instanceof Error ? e.message : String(e)}`);
    run = undefined;
  }
}, 20);

/** Variante guiada: el marcador pasa al siguiente punto del recorrido cuando el invasor llega al actual. */
function guide(): void {
  const r = run;
  const m = r?.mover;
  if (!r || !m?.isValid || !r.marker?.isValid || r.step >= r.path.length - 1) return;
  const p = r.path[r.step];
  const at = m.location;
  if (Math.hypot(at.x - (p.x + 0.5), at.z - (p.z + 0.5)) > GUIDE_H || Math.abs(at.y - p.y) > GUIDE_V) return;
  r.step++;
  const next = r.path[r.step];
  if (r.step === 1 && (r.variant === "empujada" || r.variant === "asistida")) {
    // Lo que haría el director: al llegar junto a la escalera, se le mete en ella (un bloque).
    const ladder = r.direction === "bajar" ? { x: CX + 3.5, y: TOP_Y - 1, z: CZ + 0.5 } : { x: CX + 3.5, y: FLOOR_Y + 1, z: CZ + 0.5 };
    m.teleport(ladder);
    say(`escalera empujada: metido en la escalera en ${ladder.x},${ladder.y},${ladder.z}`);
  }
  r.marker.teleport({ x: next.x + 0.5, y: next.y, z: next.z + 0.5 });
  say(`escalera guiada: punto ${r.step} (${next.x},${next.y},${next.z}) a los ${((system.currentTick - r.started) / 20).toFixed(1)} s`);
}

system.runInterval(() => {
  try {
    guide();
  } catch (e) {
    say(`error guiando: ${e instanceof Error ? e.message : String(e)}`);
  }
}, 5);

/** Velocidad de trepar por una escalera de mano en el juego: unos 2,35 bloques por segundo. */
const CLIMB_PER_TICK = 0.12;

/**
 * Variante asistida, al subir: las criaturas no trepan solas (su buscador de caminos no sube por escaleras), así que
 * el director las sube por la columna de la escalera a la velocidad de trepar y, arriba, las pasa al borde.
 */
system.runInterval(() => {
  const r = run;
  const m = r?.mover;
  if (!r || r.variant !== "asistida" || r.direction !== "subir" || r.step < 1 || !m?.isValid) return;
  const at = m.location;
  if (Math.abs(at.x - (CX + 3.5)) > 0.7 || Math.abs(at.z - (CZ + 0.5)) > 0.7) return;
  if (at.y < TOP_Y - 0.2) m.teleport({ x: CX + 3.5, y: Math.min(at.y + CLIMB_PER_TICK, TOP_Y), z: CZ + 0.5 }, { facingLocation: { x: CX, y: at.y, z: CZ + 0.5 } });
  else m.teleport({ x: CX + 2.5, y: TOP_Y, z: CZ + 0.5 });
}, 1);
