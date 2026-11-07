import { GameMode, system, world, type Dimension, type Entity, type Player } from "@minecraft/server";
import { FAMILY, LOGIC_INTERVAL_TICKS, PROP_SPECTATE, SQUAD_WAIT_TAG, TICKING_AREA_NAME, TICKS_PER_SECOND } from "../constants";
import type { GateDef, MapDef, Vec3 } from "../maps/types";
import { aliveAllies, healAlly, unleashAllies } from "../systems/allies";
import { CasualtyLog, type Side } from "../systems/casualties";
import { describeGateTerrain, findAimPoint, findObjective, gateTerrainMatches, invaderAtObjective, isAreaLoaded, moveAimPoint, spawnObjective } from "../systems/gate";
import { Intruders } from "../systems/intruders";
import { Morale } from "../systems/morale";
import { giveLoadout } from "../systems/loadout";
import { AllyOrders, ensureRallyPoints, type AllyOrder } from "../systems/orders";
import { Reinforcements, type ReinforcementTuning } from "../systems/reinforcements";
import { clearRafts } from "../systems/rafts";
import { ensureWaypoints, guideReturns, isApproaching, isReturning, startApproach } from "../systems/returnPath";
import { Rescue, type EscortHooks, type RescueCandidate } from "../systems/rescue";
import { RouteJobs } from "../systems/routeJobs";
import { ENGAGED, foesAround, rescueTier } from "../systems/rescueLogic";
import { Sappers } from "../systems/sappers";
import { Stance } from "../systems/stance";
import { isOutside } from "../systems/stanceLogic";
import type { SquadUnit } from "../systems/squadLogic";
import { Squads } from "../systems/squads";
import { stalledUnits, STALL_SECONDS, trackAnchors, type Anchor } from "../systems/stallLogic";
import { isBusy } from "../systems/stuckLogic";
import { Unreachable } from "../systems/unreachable";
import { Ladders } from "../systems/ladders";
import { biteWalls, countWall, findGateOpening, pickAimSpot, placeWalls, removeRetiredWall } from "../systems/wall";
import { integrityPercent } from "../systems/wallLogic";
import { WaveSpawner } from "../systems/waveSpawner";
import { S } from "../strings";
import { isShooter, unitOf } from "../units/catalog";
import { initialState, isActive, step, type SiegeConfig, type SiegeEffect, type SiegeEvent, type SiegeState } from "./siegeState";

const START_POLL_TICKS = 10;
const START_TIMEOUT_TICKS = 300;
/** Cada cuántas revisiones cambia de sitio el punto de mira (así el muro se rompe a trozos, no en un solo agujero). */
const AIM_MOVE_EVERY = 3;
/** Evita que un mismo toque dé la orden dos veces. */
const ORDER_COOLDOWN_TICKS = 10;
/** Cada cuántas revisiones (segundos) se escribe en el log el resumen de bajas. */
const CASUALTY_REPORT_EVERY = 30;
/** Cada cuántas revisiones se escribe en el log el resumen de los grupos. */
const SQUAD_REPORT_EVERY = 15;
/** Tanto tiempo sin avances en la pelea, los invasores que no se mueven de su sitio abandonan. */
const STALL_TICKS = STALL_SECONDS * TICKS_PER_SECOND;
/** Sin aliados cuerpo a cuerpo y tanto tiempo sin bajas en ningún bando, los tiradores bajan a resistir. */
const LAST_STAND_TICKS = 20 * TICKS_PER_SECOND;

/** Puntos de una puerta que deben estar en chunks cargados para tocar su muro y su meta. */
function gatePoints(gate: GateDef): Vec3[] {
  const points: Vec3[] = [gate.position, gate.objective];
  for (const b of gate.blockers ?? []) points.push(b.from, b.to);
  for (const w of gate.walls) {
    points.push(w.from, w.to);
    points.push({ x: (w.from.x + w.to.x) / 2, y: w.from.y, z: (w.from.z + w.to.z) / 2 });
  }
  return points;
}

/**
 * Orquesta una partida: traduce eventos del juego a eventos de la máquina de estados
 * y aplica sus efectos (oleadas, brecha, victoria, derrota) al mundo.
 */
export class SiegeManager {
  private state: SiegeState;
  private cfg: SiegeConfig;
  private spawner: WaveSpawner;
  private orders: AllyOrders;
  private reinforcements: Reinforcements;
  private sappers: Sappers;
  private intruders: Intruders;
  private squads: Squads;
  private readonly morale = new Morale();
  private rescue: Rescue;
  private stance: Stance;
  /** Cola de búsquedas de ruta, compartida por la caza y el director de inalcanzables. */
  private jobs: RouteJobs;
  private unreachable: Unreachable;
  private ladders: Ladders;
  private dimension: Dimension;
  private lastOrderTick = -ORDER_COOLDOWN_TICKS;
  private readonly casualties = new CasualtyLog();
  private casualtyClock = 0;
  private squadClock = 0;
  /** Última baja de cualquier bando, para notar que la pelea se ha estancado. */
  private lastDeathTick = 0;
  /** Los tiradores ya bajaron a resistir en esta oleada. */
  private lastStandDone = false;
  /** Último avance de la pelea: una baja, un bloque de muro roto, una brecha o una oleada nueva. */
  private lastProgressTick = 0;
  /** Dónde empezó a contar cada invasor para la red de seguridad (`stallLogic.ts`). */
  private anchors = new Map<string, Anchor>();
  /** Director de grupos y moral activos. Se apaga con `/scriptevent bastion:squads off`, para comparar en las pruebas. */
  private squadsOn = true;
  /** Puertas ya abiertas en esta partida (cada una abre una sola vez). */
  private readonly opened = new Set<string>();
  /** Bloques de muro con los que empezó cada puerta (para el porcentaje del HUD). */
  private readonly wallTotals = new Map<string, number>();
  private aimCounter = 0;
  /** Modo de juego de cada jugador antes del asedio, para devolvérselo al reiniciar. */
  private readonly previousModes = new Map<string, GameMode>();
  private starting = false;
  private intervalId: number | undefined;

  constructor(private map: MapDef) {
    this.cfg = SiegeManager.configFor(map);
    this.state = initialState(this.cfg);
    this.dimension = world.getDimension(map.dimension);
    this.spawner = new WaveSpawner(this.dimension, map);
    this.orders = new AllyOrders(this.dimension, map);
    this.reinforcements = new Reinforcements(map);
    this.jobs = new RouteJobs(this.dimension, map.siege, (at) => this.sappers.isProtected(at));
    this.sappers = new Sappers(this.dimension, map, this.jobs);
    this.intruders = new Intruders(this.dimension, map);
    this.squads = new Squads(this.dimension);
    this.rescue = new Rescue(this.dimension, this.escortHooks);
    this.stance = new Stance(this.dimension);
    this.ladders = new Ladders(this.dimension);
    this.unreachable = new Unreachable(this.dimension, map, this.jobs, this.squads, this.sappers.hunts, this.orders, () => this.opened, this.ladders);
  }

  private static configFor(map: MapDef): SiegeConfig {
    return {
      totalWaves: map.waves.length,
      countdownTicks: map.countdownSeconds * TICKS_PER_SECOND,
      intermissionTicks: map.intermissionSeconds * TICKS_PER_SECOND,
      lives: map.lives,
    };
  }

  get currentMap(): MapDef {
    return this.map;
  }

  get currentState(): SiegeState {
    return this.state;
  }

  /** Descripción corta de la fase para los menús. */
  statusText(): string {
    const s = this.state;
    const secs = Math.ceil(s.ticksLeft / TICKS_PER_SECOND);
    switch (s.phase) {
      case "idle":
        return S.statusIdle;
      case "countdown":
        return S.statusCountdown(secs);
      case "wave":
        return S.statusWave(s.wave + 1, this.cfg.totalWaves);
      case "intermission":
        return S.statusIntermission(secs);
      case "victory":
        return S.statusVictory;
      case "defeat":
        return S.statusDefeat;
    }
  }

  /** Arranca el bucle de lógica (1 vez por segundo). */
  run(): void {
    if (this.intervalId !== undefined) return;
    this.intervalId = system.runInterval(() => this.logicTick(), LOGIC_INTERVAL_TICKS);
    // Las escaleras del director llevan a las unidades tick a tick (`ladders.ts`); sin nadie en ellas no hace nada.
    system.runInterval(() => this.ladders.tick(), 1);
  }

  /** Cambia de mapa. Solo con la partida parada. */
  setMap(map: MapDef): void {
    this.reset();
    this.map = map;
    this.cfg = SiegeManager.configFor(map);
    this.state = initialState(this.cfg);
    this.dimension = world.getDimension(map.dimension);
    this.spawner = new WaveSpawner(this.dimension, map);
    this.orders = new AllyOrders(this.dimension, map);
    this.reinforcements = new Reinforcements(map);
    this.jobs = new RouteJobs(this.dimension, map.siege, (at) => this.sappers.isProtected(at));
    this.sappers = new Sappers(this.dimension, map, this.jobs);
    this.intruders = new Intruders(this.dimension, map);
    this.squads = new Squads(this.dimension);
    this.rescue = new Rescue(this.dimension, this.escortHooks);
    this.stance = new Stance(this.dimension);
    this.ladders = new Ladders(this.dimension);
    this.unreachable = new Unreachable(this.dimension, map, this.jobs, this.squads, this.sappers.hunts, this.orders, () => this.opened, this.ladders);
  }

  /**
   * Inicia la partida. Primero crea el área de carga y espera a que el terreno de la puerta esté
   * cargado (sin jugadores cerca tarda unos segundos); solo entonces levanta los muros y coloca las unidades.
   * Devuelve `false` si ya hay una partida o un inicio en marcha.
   */
  start(): boolean {
    if (this.state.phase !== "idle" || this.starting) return false;
    this.starting = true;
    this.ensureTickingArea();
    let waited = 0;
    const poll = system.runInterval(() => {
      waited += START_POLL_TICKS;
      const ready = this.requiredPoints().every((p) => isAreaLoaded(this.dimension, p));
      if (!ready && waited < START_TIMEOUT_TICKS) return;
      system.clearRun(poll);
      this.starting = false;
      if (!ready) console.warn("[bastion] El terreno de la puerta no se cargó a tiempo; se intenta igualmente.");
      const wrong = this.map.gates.find((g) => !gateTerrainMatches(this.dimension, g.position));
      if (wrong) {
        console.warn(`[bastion] El terreno no coincide con el mapa ${this.map.id} (puerta ${wrong.id}: ${describeGateTerrain(this.dimension, wrong.position)}); no se inicia.`);
        world.sendMessage(S.wrongMap(this.map.name));
        return;
      }
      try {
        this.begin();
      } catch (e) {
        const msg = `[Bastion] No se pudo iniciar: ${e instanceof Error ? e.message : String(e)}`;
        console.warn(msg);
        world.sendMessage(msg);
        this.reset();
      }
    }, START_POLL_TICKS);
    return true;
  }

  /** Puntos que tienen que estar cargados antes de empezar: referencia, meta, esquinas de los muros y aliados. */
  private requiredPoints(): Vec3[] {
    const points: Vec3[] = [];
    for (const g of this.map.gates) points.push(...gatePoints(g));
    for (const a of this.map.allies) points.push(a.position);
    return points;
  }

  private gateLoaded(gate: GateDef): boolean {
    return gatePoints(gate).every((p) => isAreaLoaded(this.dimension, p));
  }

  /** Un fallo al colocar la meta no aborta la partida: `ensureObjectives` lo reintenta en el siguiente pulso. */
  private trySpawnObjective(gate: GateDef): void {
    try {
      spawnObjective(this.dimension, gate);
    } catch (e) {
      console.warn(`[bastion] No se pudo colocar la meta de ${gate.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private begin(): void {
    this.raiseWalls();
    for (const gate of this.map.gates) this.trySpawnObjective(gate);
    for (const def of this.map.allies) {
      this.spawner.spawnUnit(def.unit, def.position, 0.5);
    }

    const players = world.getAllPlayers();
    players.forEach((player, i) => {
      this.enlist(player);
      giveLoadout(player);
      const spawn = this.map.playerSpawns[i % this.map.playerSpawns.length];
      player.teleport(spawn, { dimension: this.dimension });
    });
    this.dispatch({ type: "start" });
    world.sendMessage(S.started);
  }

  reset(): void {
    this.spawner.clear();
    clearRafts(this.dimension);
    this.opened.clear();
    this.orders.reset();
    this.reinforcements.reset();
    this.sappers.restore();
    this.ladders.removeAll();
    this.jobs.clear();
    this.intruders.clear();
    this.unreachable.clear();
    this.squads.clear();
    this.morale.clear();
    this.rescue.clear();
    this.stance.clear();
    this.raiseWalls();
    this.dispatch({ type: "reset" });
    this.restoreGameModes();
    for (const player of world.getAllPlayers()) player.onScreenDisplay.setActionBar("");
  }

  /**
   * El asedio se juega en supervivencia: en creativo los enemigos ni te atacan. Con el modo espectador
   * (`/scriptevent bastion:spectate on`, para las pruebas) se queda en creativo y mira.
   */
  private enlist(player: Player): void {
    if (!this.previousModes.has(player.id)) this.previousModes.set(player.id, player.getGameMode());
    player.setGameMode(world.getDynamicProperty(PROP_SPECTATE) === true ? GameMode.Creative : GameMode.Survival);
  }

  /** Al cambiar el modo espectador con un asedio en marcha: aplica el modo nuevo a quien ya juega. */
  refreshGameModes(): void {
    if (!isActive(this.state.phase)) return;
    for (const player of world.getAllPlayers()) this.enlist(player);
  }

  private restoreGameModes(): void {
    for (const player of world.getAllPlayers()) {
      const mode = this.previousModes.get(player.id);
      if (mode !== undefined) player.setGameMode(mode);
    }
    this.previousModes.clear();
  }

  /** Lo llama main.ts cuando un jugador entra al mundo: si hay asedio en marcha, se une en supervivencia. */
  onPlayerJoined(player: Player): void {
    if (isActive(this.state.phase)) this.enlist(player);
  }

  /** Lo llama main.ts cuando un jugador usa uno de los objetos de órdenes. */
  orderAllies(order: AllyOrder, player?: Player): void {
    if (system.currentTick - this.lastOrderTick < ORDER_COOLDOWN_TICKS) return;
    if (!isActive(this.state.phase)) {
      player?.sendMessage(S.orderNotActive);
      return;
    }
    if (order === "retreat" && !this.orders.canRetreat) {
      player?.sendMessage(S.orderNoRally);
      return;
    }
    this.lastOrderTick = system.currentTick;
    // La escolta del cuerno no obedece las órdenes generales: va con su jugador (elegido por Limbers, 2026-11-07).
    const reached = this.orders.give(order, this.state.breached, (id) => this.rescue.isRescuer(id));
    console.log(`[bastion] Orden ${order}: ${reached} aliados.`);
    world.sendMessage(order === "retreat" ? S.orderRetreat(reached) : S.orderSortie(reached));
    this.sound("raid.horn");
  }

  /** Para las pruebas a gran escala: cambia el mínimo en el campo, la reserva y la tanda de refuerzos. */
  tuneReinforcements(tuning: ReinforcementTuning): void {
    this.reinforcements.tune(tuning);
    console.log(`[bastion] Refuerzos: mínimo ${tuning.minField}, reserva ${tuning.reservePerWave}, tanda ${tuning.batch}.`);
  }

  /** Lo llama main.ts cuando cae una unidad. */
  onUnitDied(side: Side, cause: string, killerId?: string): void {
    if (!isActive(this.state.phase)) return;
    this.casualties.record(side, cause, killerId);
    this.lastDeathTick = system.currentTick;
    this.lastProgressTick = system.currentTick;
  }

  /** Lo llama main.ts cuando algo hiere a un jugador: si es un monstruo, los aliados van a por él. */
  onPlayerHurt(attacker: Entity | undefined): void {
    if (isActive(this.state.phase)) this.intruders.onPlayerHurt(attacker);
  }

  /** Lo llama main.ts cuando muere un jugador. */
  onPlayerDied(): void {
    this.dispatch({ type: "playerDied" });
  }

  // ---------------------------------------------------------------- interno

  private dispatch(event: SiegeEvent): void {
    const before = this.state;
    const result = step(this.state, event, this.cfg);
    this.state = result.state;
    // Registro de transiciones: permite seguir una partida desde el log del servidor (tools/bds.mjs).
    if (before.phase !== result.state.phase || before.wave !== result.state.wave) {
      console.log(`[bastion] fase ${before.phase}#${before.wave + 1} -> ${result.state.phase}#${result.state.wave + 1} (vidas ${result.state.lives})`);
    }
    for (const effect of result.effects) this.apply(effect);
    if (before.phase !== "intermission" && result.state.phase === "intermission") this.restoreAllies();
  }

  /**
   * En el descanso: quien se replegó por la moral vuelve a su sitio, los aliados vivos se curan y se reponen los
   * caídos en los puntos del mapa.
   */
  private restoreAllies(): void {
    this.unreachable.clear();
    this.orders.recall(this.state.breached);
    this.squads.clear();
    this.morale.clear();
    this.rescue.dismissAll();
    this.stance.clear();
    const alive = aliveAllies(this.dimension);
    alive.forEach(healAlly);
    const missing = this.map.allies.length - alive.length;
    let added = 0;
    for (let i = 0; i < missing; i++) {
      const def = this.map.allies[(alive.length + i) % this.map.allies.length];
      const ally = this.spawner.spawnUnit(def.unit, def.position, 0.5);
      if (!ally) continue;
      added++;
      this.orders.applyTo(ally, this.state.breached);
    }
    if (added > 0) world.sendMessage(S.alliesRestored(added));
    console.log(`[bastion] Descanso: aliados ${alive.length} vivos, ${added} repuestos.`);
  }

  private logicTick(): void {
    if (!isActive(this.state.phase)) return;
    this.dispatch({ type: "tick", ticks: LOGIC_INTERVAL_TICKS });
    this.ensureObjectives();
    this.moveAimPoints();
    this.checkGates();
    this.spawner.rescueStuck(this.state.breached);
    ensureWaypoints(this.dimension, this.map);
    ensureRallyPoints(this.dimension, this.map);
    guideReturns(this.dimension, this.map, this.state.breached, (ally) => this.orders.applyTo(ally, this.state.breached));
    this.orders.tick();
    this.intruders.tick();
    this.checkSortieDone();
    if (this.state.phase === "wave") {
      this.sendReinforcements();
      this.digThroughWalls();
      this.callForHelp();
      this.holdTheLine();
      this.directSquads();
      this.checkLastStand();
      this.unreachable.tick((system.currentTick - this.lastDeathTick) / TICKS_PER_SECOND);
      this.checkStall();
    }
    this.checkWaveCleared();
    this.drawHud();
    if (++this.casualtyClock >= CASUALTY_REPORT_EVERY) {
      this.casualtyClock = 0;
      const report = this.casualties.flush();
      if (report) console.log(`[bastion] ${report}`);
    }
  }

  private sendReinforcements(): void {
    const spawns = this.map.reinforcements?.spawns;
    if (!spawns) return;
    const { arrived, emptied } = this.reinforcements.tick(aliveAllies(this.dimension).length, (unit, index) =>
      this.spawner.spawnUnit(unit, spawns[index % spawns.length], 1.5)
    );
    for (const ally of arrived) this.orders.deploy(ally);
    if (arrived.length > 0) console.log(`[bastion] Refuerzos: ${arrived.length} al campo, quedan ${this.reinforcements.remaining}.`);
    if (emptied) world.sendMessage(S.reinforcementsEmpty);
  }

  private digThroughWalls(): void {
    const first = !this.sappers.breachedSomewhere;
    const broken = this.sappers.tick();
    if (broken === 0) return;
    this.lastProgressTick = system.currentTick;
    console.log(`[bastion] Paredes: ${broken} bloques derribados.`);
    if (first && this.sappers.breachedSomewhere) world.sendMessage(S.wallsBreached);
  }

  /** Levanta (o repone) los muros de todas las puertas y anota con cuántos bloques empieza cada una. */
  private raiseWalls(): void {
    for (const wall of this.map.retiredWalls ?? []) removeRetiredWall(this.dimension, wall);
    for (const gate of this.map.gates) {
      if (!this.gateLoaded(gate)) continue;
      this.wallTotals.set(gate.id, placeWalls(this.dimension, gate));
    }
  }

  /** Si la meta de una puerta ha desaparecido (por ejemplo con /kill), se vuelve a colocar. */
  private ensureObjectives(): void {
    for (const gate of this.map.gates) {
      if (this.opened.has(gate.id) || !this.gateLoaded(gate)) continue;
      if (!findObjective(this.dimension, gate.id)) this.trySpawnObjective(gate);
    }
  }

  /**
   * Un mob solo dispara a lo que ve, y la meta queda tras el muro: los magos apuntan a un marcador
   * delante de lo que queda del muro, y el marcador salta de sitio para que lo rompan por partes.
   */
  private moveAimPoints(): void {
    this.aimCounter++;
    for (const gate of this.map.gates) {
      if (this.opened.has(gate.id) || !this.gateLoaded(gate)) continue;
      if (this.aimCounter % AIM_MOVE_EVERY !== 1 && findAimPoint(this.dimension, gate.id)) continue;
      const spot = pickAimSpot(this.dimension, gate);
      if (!spot) continue;
      try {
        moveAimPoint(this.dimension, gate, spot);
      } catch (e) {
        console.warn(`[bastion] No se pudo mover el punto de mira de ${gate.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /**
   * Abre las puertas cuyo muro ya tiene un hueco por el que cabe un soldado, o que ya han sido superadas:
   * el muro se va escalonando con los impactos y un invasor puede cruzar por encima sin abrir ningún hueco.
   */
  private checkGates(): void {
    for (const gate of this.map.gates) {
      if (this.opened.has(gate.id)) continue;
      if (!this.gateLoaded(gate)) continue;
      const opening = findGateOpening(this.dimension, gate);
      const climbed = !opening && invaderAtObjective(this.dimension, gate);
      if (!opening && !climbed) continue;
      this.opened.add(gate.id);
      console.log(
        opening
          ? `[bastion] Puerta ${gate.id} abierta en ${opening.x.toFixed(1)},${opening.y},${opening.z.toFixed(1)}.`
          : `[bastion] Puerta ${gate.id} superada: un invasor cruzó el muro por encima.`
      );
      this.breachGate(gate, opening);
      this.lastProgressTick = system.currentTick;
      this.dispatch({ type: "gateDestroyed" });
    }
  }

  /** Lo llama main.ts cuando un proyectil arcano choca con un bloque: muerde el muro y comprueba el hueco. */
  onBoltHit(hit: Vec3): void {
    if (!isActive(this.state.phase)) return;
    const result = biteWalls(this.dimension, this.map.gates, hit);
    if (result.broken === 0) return;
    this.lastProgressTick = system.currentTick;
    console.log(`[bastion] Proyectil en ${hit.x},${hit.y},${hit.z}: ${result.broken} bloques de muro rotos (puerta ${result.gate?.id}).`);
    this.checkGates();
  }

  /**
   * La orden de ataque es contra los invasores: cuando no queda ninguno (ni por salir), los aliados vuelven al
   * castillo, a sus puestos de defensa si el mapa los tiene y si no a los suyos.
   */
  /**
   * Último reducto (elegido por Limbers, 2026-11-06): si solo quedan tiradores (arqueros y pirómanos), los
   * invasores no llegan hasta ellos (en lo alto de una torre, por ejemplo) y pasan 20 s sin bajas en ningún
   * bando, bajan al patio a resistir; sin patio, salen a por los invasores. Una vez por oleada. Sin esto la
   * pelea se estancaba: los soldados no encuentran camino hasta lo alto y la oleada no terminaba nunca.
   */
  private checkLastStand(): void {
    if (this.lastStandDone || system.currentTick - this.lastDeathTick < LAST_STAND_TICKS) return;
    if (this.spawner.pending > 0 || this.spawner.aliveInvaders() === 0) return;
    const allies = aliveAllies(this.dimension).filter((a) => !isReturning(a));
    if (allies.length === 0 || allies.some((a) => unitOf(a.typeId)?.role === "melee")) return;
    this.lastStandDone = true;
    for (const ally of allies) {
      // Al patio y, si en 10 s no se acerca, con humo (`Unreachable.descendAlly`); sin patio, a por los invasores.
      this.unreachable.descendAlly(ally);
    }
    console.log(`[bastion] Último reducto: ${allies.length} tiradores bajan ${this.orders.hasCourtyard ? "al patio" : "a por los invasores"}.`);
    world.sendMessage(S.lastStand(this.orders.hasCourtyard));
  }

  /**
   * Red de seguridad (elegida por Limbers, 2026-11-06): tras `STALL_SECONDS` sin avances en la pelea, los invasores
   * que no se han movido de su sitio en todo ese tiempo, ni tienen motivo para estar quietos (pelear, disparar,
   * esperar ante el muro; tras el doble de tiempo, eso ya no cuenta), abandonan el asedio: desaparecen con una nube de humo y la oleada puede terminar. No hay
   * camino de vuelta a las balsas por el que mandarlos.
   * Desde la v0.1.52 es el último recurso: antes actúa el director de inalcanzables (`unreachable.ts`), que busca
   * ruta o hace bajar a quien nadie alcanza tras 20 s sin bajas.
   */
  private checkStall(): void {
    if (this.spawner.pending > 0) {
      this.anchors.clear();
      return;
    }
    const now = system.currentTick;
    const enemies = [...aliveAllies(this.dimension), ...this.dimension.getPlayers({ excludeGameModes: [GameMode.Creative, GameMode.Spectator] })].map(
      (e) => e.location
    );
    const ctx = { breached: this.state.breached, enemies, gates: this.map.gates.map((g) => g.position), objectives: this.map.gates.map((g) => g.objective) };
    const invaders = new Map<string, Entity>();
    for (const e of this.dimension.getEntities({ families: [FAMILY.invader] })) {
      if (!e.isValid || e.isInWater || e.hasTag(SQUAD_WAIT_TAG) || (isReturning(e) && !isApproaching(e, this.map))) continue;
      invaders.set(e.id, e);
    }
    this.anchors = trackAnchors(this.anchors, [...invaders.values()].map((e) => ({ id: e.id, at: e.location })), now);
    // Tras el doble de espera sin ninguna baja, estar junto a un enemigo ya no cuenta como pelear: en el acantilado
    // de Stonehill quedaron invasores y aliados a 2-5 bloques, en salientes distintos, sin poder golpearse.
    const relaxed = now - this.lastProgressTick >= 2 * STALL_TICKS;
    const stuck = stalledUnits(this.anchors, now, this.lastProgressTick, STALL_TICKS)
      .flatMap((id) => invaders.get(id) ?? [])
      .filter((e) => relaxed || !isBusy(e.location, { ...ctx, caster: isShooter(unitOf(e.typeId)) }));
    if (stuck.length === 0) return;
    const where = stuck.map((e) => `${e.location.x.toFixed(0)},${e.location.y.toFixed(0)},${e.location.z.toFixed(0)}`).join(" ");
    for (const e of stuck) {
      try {
        this.dimension.spawnParticle("minecraft:basic_smoke_particle", e.location);
        e.remove();
      } catch {
        // Ya no está.
      }
      this.anchors.delete(e.id);
    }
    console.log(`[bastion] Atasco: ${stuck.length} invasores sin salida abandonan el asedio (${where}).`);
    world.sendMessage(S.invadersFlee(stuck.length));
  }

  /**
   * El cuerno (`rescue.ts`): si rodean a un jugador en supervivencia, acuden unos aliados cuerpo a cuerpo hasta que
   * queda libre; y la escolta del cuerno en la mano sigue a su jugador.
   */
  private callForHelp(): void {
    const players = this.dimension.getPlayers({ excludeGameModes: [GameMode.Creative, GameMode.Spectator] });
    const invaders = this.dimension.getEntities({ families: [FAMILY.invader] }).filter((e) => e.isValid && !e.isInWater);
    this.rescue.tick(players, invaders, this.rescueCandidates(invaders));
  }

  /**
   * Postura de los que defienden (`stanceLogic.ts`, elegida por Limbers, 2026-11-07): con la orden de defender o la
   * de retirada, quien cuerpo a cuerpo sale del castillo por una puerta vuelve a un puesto, y quien tiene delante el
   * doble de enemigos que aliados aguanta en su sitio. Con la orden de ataque, nada de esto: decide el jugador.
   * La escolta del cuerno va con su jugador.
   */
  private holdTheLine(): void {
    const allies = aliveAllies(this.dimension);
    const fighters =
      this.orders.current === "sortie"
        ? []
        : allies.filter((a) => unitOf(a.typeId)?.role === "melee" && !isReturning(a) && !this.rescue.isRescuer(a.id));
    let back = 0;
    for (const ally of fighters) if (isOutside(ally.location, this.map.gates) && this.orders.bringBack(ally)) back++;
    if (back > 0) console.log(`[bastion] Postura: ${back} aliados fuera del castillo vuelven a un puesto.`);
    const players = this.dimension.getPlayers({ excludeGameModes: [GameMode.Creative, GameMode.Spectator] });
    const invaders = this.dimension.getEntities({ families: [FAMILY.invader] }).filter((e) => e.isValid && !e.isInWater);
    this.stance.tick(
      fighters,
      [...allies, ...players].map((e) => e.location),
      invaders.map((i) => i.location)
    );
  }

  /**
   * Aliados que pueden acudir a un cuerno: cuerpo a cuerpo, ni regresando ni replegados, y no en plena pelea. Con
   * su preferencia según el director (`rescueTier`): primero la reserva, luego los sueltos, luego los grupos que
   * aún no han llegado al enemigo.
   */
  private rescueCandidates(invaders: readonly Entity[]): RescueCandidate[] {
    const foes = invaders.map((i) => i.location);
    const squadOf = new Map<string, "advance" | "wait">();
    for (const s of this.squads.current) if (s.side === "ally") for (const id of s.members) squadOf.set(id, s.state);
    return aliveAllies(this.dimension)
      .filter((a) => unitOf(a.typeId)?.role === "melee" && !isReturning(a) && !a.isInWater && this.orders.layerOf(a.id) === "field")
      .flatMap((entity) => {
        const tier = rescueTier(squadOf.get(entity.id), foesAround(entity.location, foes, ENGAGED) > 0);
        return tier === undefined ? [] : [{ entity, tier }];
      });
  }

  /** La escolta del cuerno sale de las órdenes al formarse y vuelve a la vigente al terminar. */
  private readonly escortHooks: EscortHooks = {
    restore: (ally) => this.orders.applyTo(ally, this.state.breached),
    claim: (ally) => this.orders.forget(ally),
  };

  /** El jugador toca el cuerno de rescate de su equipo. */
  blowHorn(player: Player): void {
    if (this.state.phase !== "wave") {
      player.sendMessage(S.hornNoSiege);
      return;
    }
    const invaders = this.dimension.getEntities({ families: [FAMILY.invader] }).filter((e) => e.isValid && !e.isInWater);
    this.rescue.call(player, this.rescueCandidates(invaders));
  }

  /** Enciende o apaga el director de grupos y la moral (para las pruebas). */
  setSquads(on: boolean): void {
    this.squadsOn = on;
    if (!on) {
      this.unreachable.clear();
      this.squads.clear();
      this.morale.clear();
      this.rescue.dismissAll();
    }
  }

  /**
   * El director de grupos y la moral (Fase 3). Agrupa a los que pelean cuerpo a cuerpo de cada bando, reparte el
   * frente y deja en reserva a los grupos que sobran (`squads.ts`); los jugadores y los que disparan cuentan como
   * objetivo, pero no se agrupan. Después, el grupo aliado superado y castigado se repliega (`morale.ts`).
   * Quien regresa del agua o sube por la ruta de subida va a lo suyo.
   */
  private directSquads(): void {
    if (!this.squadsOn) return;
    const units: SquadUnit[] = [];
    const entities = new Map<string, Entity>();
    const invaders: Entity[] = [];
    const add = (e: Entity, side: "ally" | "invader", groupable: boolean) => {
      units.push({ id: e.id, side, at: e.location, groupable });
      entities.set(e.id, e);
    };
    for (const e of aliveAllies(this.dimension)) {
      if (isReturning(e) || e.isInWater) continue;
      // Quien ya llegó al último reducto no tiene a dónde replegarse: resiste, sin grupo.
      const last = this.orders.layerOf(e.id) === (this.orders.hasKeep ? "keep" : "courtyard");
      // Quien acude a un cuerno va a lo suyo, sin grupo.
      add(e, "ally", unitOf(e.typeId)?.role === "melee" && !last && !this.rescue.isRescuer(e.id));
    }
    for (const p of this.dimension.getPlayers({ excludeGameModes: [GameMode.Creative, GameMode.Spectator] })) add(p, "ally", false);
    for (const e of this.dimension.getEntities({ families: [FAMILY.invader] })) {
      if (!e.isValid || isReturning(e) || e.isInWater) continue;
      add(e, "invader", unitOf(e.typeId)?.role === "melee");
      invaders.push(e);
    }
    // El director de inalcanzables busca ruta hasta el objetivo que dejan; con los que no toma, lo de antes.
    for (const gave of this.unreachable.onGaveUp(this.squads.tick(units, entities), entities)) {
      // Un grupo invasor que no sabe llegar a su objetivo vuelve a la ruta de subida, desde el hito más cercano.
      const back = gave.side === "invader" ? gave.members.filter((id) => entities.get(id)?.isValid && startApproach(entities.get(id)!, this.map, true)).length : 0;
      console.log(
        `[bastion] Sin camino: un grupo ${gave.side === "ally" ? "aliado" : "invasor"} de ${gave.members.length} deja su objetivo${back > 0 ? ` y ${back} vuelven a la ruta de subida` : ""}.`
      );
    }
    if (++this.squadClock >= SQUAD_REPORT_EVERY) {
      this.squadClock = 0;
      const summary = (side: "ally" | "invader") => {
        const list = this.squads.current.filter((s) => s.side === side);
        const waiting = list.filter((s) => s.state === "wait").reduce((n, s) => n + s.members.length, 0);
        return `${list.length} (${list.reduce((n, s) => n + s.members.length, 0)} unidades, ${waiting} en reserva)`;
      };
      console.log(`[bastion] Grupos: aliados ${summary("ally")}, invasores ${summary("invader")}. Aguantan en su sitio: ${this.stance.count}.`);
    }

    const routs = this.morale.check(this.squads.current, entities, invaders, (id) => this.orders.layerOf(id), this.orders);
    for (const rout of routs) {
      for (const ally of rout.members) this.orders.fallBack(ally, rout.to);
      console.log(`[bastion] Moral: ${rout.members.length} aliados se repliegan ${rout.to === "keep" ? "a la torre" : "al patio"}.`);
      world.sendMessage(S.squadFallsBack(rout.members.length, rout.to));
    }
  }

  private checkSortieDone(): void {
    if (this.orders.current !== "sortie" || this.spawner.pending > 0 || this.spawner.aliveInvaders() > 0) return;
    const order = this.orders.canRetreat ? "retreat" : "defend";
    const reached = this.orders.give(order, this.state.breached, (id) => this.rescue.isRescuer(id));
    console.log(`[bastion] Sin invasores: fin de la orden de ataque (${order}, ${reached} aliados).`);
    world.sendMessage(S.sortieDone);
  }

  private checkWaveCleared(): void {
    if (this.state.phase !== "wave") return;
    if (this.spawner.pending === 0 && this.spawner.aliveInvaders() === 0) {
      this.dispatch({ type: "waveCleared" });
    }
  }

  private apply(effect: SiegeEffect): void {
    switch (effect.type) {
      case "spawnWave": {
        const def = this.map.waves[effect.wave];
        this.spawner.startWave(effect.wave);
        this.reinforcements.startWave();
        this.lastStandDone = false;
        this.unreachable.clear();
        this.lastDeathTick = system.currentTick;
        this.lastProgressTick = system.currentTick;
        this.anchors.clear();
        this.title(S.titleWave(effect.wave + 1, this.cfg.totalWaves), def?.name ? S.titleWaveSub(def.name) : "");
        this.sound("mob.ravager.roar");
        break;
      }
      case "breach":
        this.onBreach();
        break;
      case "victory":
        this.title(S.titleVictory, S.titleVictorySub);
        this.sound("random.levelup");
        break;
      case "defeat":
        this.title(S.titleDefeat, S.titleDefeatSub);
        this.sound("mob.wither.death");
        break;
    }
  }

  /**
   * Lo que provoca abrir UNA puerta: explota (sin romper bloques) en el hueco, si lo hay, y entran sus tropas.
   * La meta desaparece: si siguiera, los invasores se quedarían pegados a ella, que no se puede destruir.
   */
  private breachGate(gate: GateDef, opening: Vec3 | undefined): void {
    if (opening) {
      try {
        this.dimension.createExplosion(opening, 3, { breaksBlocks: false, causesFire: false });
      } catch (e) {
        console.warn(`[bastion] Explosión de brecha fallida: ${e}`);
      }
    }
    findObjective(this.dimension, gate.id)?.remove();
    findAimPoint(this.dimension, gate.id)?.remove();
    this.spawner.spawnBreachTroops(gate);
  }

  /** Aviso global de brecha: solo salta una vez, con la primera puerta que cae. */
  private onBreach(): void {
    this.title(S.titleBreach, S.titleBreachSub);
    this.sound("mob.wither.spawn");
    // Si el jugador ya ha dado una orden, la brecha no se la cambia.
    if (this.orders.current === "defend") unleashAllies(this.dimension, (id) => this.rescue.isRescuer(id));
    this.spawner.startAssault();
    // Pendiente: huida de civiles (ver README, "Qué falta").
  }

  private drawHud(): void {
    const s = this.state;
    const secs = Math.ceil(s.ticksLeft / TICKS_PER_SECOND);
    const foes = this.spawner.aliveInvaders() + this.spawner.pending;
    const allies = S.hudAllies(aliveAllies(this.dimension).length, this.reinforcements.remaining);
    let text: string;

    if (s.phase === "countdown") {
      text = S.hudCountdown(secs);
    } else if (s.phase === "intermission") {
      text = S.hudIntermission(secs, s.lives);
    } else if (s.breached) {
      text = S.hudBreached(s.wave + 1, this.cfg.totalWaves, foes, allies, s.lives);
    } else {
      let remaining = 0;
      let total = 0;
      for (const g of this.map.gates) {
        remaining += countWall(this.dimension, g);
        total += this.wallTotals.get(g.id) ?? 0;
      }
      text = S.hudWave(s.wave + 1, this.cfg.totalWaves, `${integrityPercent(remaining, total)}%`, foes, allies, s.lives);
    }
    for (const player of world.getAllPlayers()) player.onScreenDisplay.setActionBar(text);
  }

  private title(title: string, subtitle: string): void {
    for (const player of world.getAllPlayers()) this.titleFor(player, title, subtitle);
  }

  private titleFor(player: Player, title: string, subtitle: string): void {
    player.onScreenDisplay.setTitle(title, {
      subtitle,
      fadeInDuration: 10,
      stayDuration: 60,
      fadeOutDuration: 20,
    });
  }

  private sound(id: string): void {
    for (const player of world.getAllPlayers()) {
      try {
        player.playSound(id);
      } catch {
        // Un sonido que no existe no debe romper la partida.
      }
    }
  }

  /**
   * Mantiene el área de la arena cargada para que las oleadas aparezcan aunque nadie esté cerca.
   * Cada mapa tiene la suya (mundo = mapa). Si ya existe, `add` no hace nada: no se borra y se
   * recrea, porque el borrado no es inmediato y el `add` siguiente fallaba dejando el terreno sin cargar.
   */
  private ensureTickingArea(): void {
    const areas = [...(this.map.tickingArea ? [this.map.tickingArea] : []), ...(this.map.extraTickingAreas ?? [])];
    areas.forEach((area, i) => {
      const { x, y, z } = area.center;
      const name = `${TICKING_AREA_NAME}_${this.map.id}${i === 0 ? "" : `_${i + 1}`}`;
      try {
        const result = this.dimension.runCommand(
          `tickingarea add circle ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${area.radiusChunks} ${name} true`
        );
        if (result.successCount === 0) console.log(`[bastion] El área de carga "${name}" ya existía.`);
      } catch (e) {
        console.warn(`[bastion] No se pudo crear el ticking area: ${e}`);
      }
    });
  }
}
