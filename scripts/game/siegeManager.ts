import { GameMode, system, world, type Dimension, type Player } from "@minecraft/server";
import { LOGIC_INTERVAL_TICKS, TICKING_AREA_NAME, TICKS_PER_SECOND } from "../constants";
import type { GateDef, MapDef, Vec3 } from "../maps/types";
import { aliveAllies, healAlly, unleashAllies } from "../systems/allies";
import { describeGateTerrain, ensureHeart, findAimPoint, findObjective, gateTerrainMatches, invaderAtObjective, isAreaLoaded, moveAimPoint, spawnObjective } from "../systems/gate";
import { giveLoadout } from "../systems/loadout";
import { AllyOrders, ensureRallyPoints, type AllyOrder } from "../systems/orders";
import { Reinforcements, type ReinforcementTuning } from "../systems/reinforcements";
import { ensureWaypoints, guideReturns } from "../systems/returnPath";
import { Sappers } from "../systems/sappers";
import { biteWalls, countWall, findGateOpening, pickAimSpot, placeWalls } from "../systems/wall";
import { integrityPercent } from "../systems/wallLogic";
import { WaveSpawner } from "../systems/waveSpawner";
import { S } from "../strings";
import { initialState, isActive, step, type SiegeConfig, type SiegeEffect, type SiegeEvent, type SiegeState } from "./siegeState";

const START_POLL_TICKS = 10;
const START_TIMEOUT_TICKS = 300;
/** Cada cuántas revisiones cambia de sitio el punto de mira (así el muro se rompe a trozos, no en un solo agujero). */
const AIM_MOVE_EVERY = 3;
/** Evita que un mismo toque dé la orden dos veces. */
const ORDER_COOLDOWN_TICKS = 10;

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
  private dimension: Dimension;
  private lastOrderTick = -ORDER_COOLDOWN_TICKS;
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
    this.sappers = new Sappers(this.dimension, map);
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
    this.sappers = new Sappers(this.dimension, map);
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
    this.opened.clear();
    this.orders.reset();
    this.reinforcements.reset();
    this.sappers.restore();
    this.raiseWalls();
    this.dispatch({ type: "reset" });
    this.restoreGameModes();
    for (const player of world.getAllPlayers()) player.onScreenDisplay.setActionBar("");
  }

  /** El asedio se juega en supervivencia: en creativo los enemigos ni te atacan. */
  private enlist(player: Player): void {
    if (!this.previousModes.has(player.id)) this.previousModes.set(player.id, player.getGameMode());
    player.setGameMode(GameMode.Survival);
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
    const reached = this.orders.give(order, this.state.breached);
    console.log(`[bastion] Orden ${order}: ${reached} aliados.`);
    world.sendMessage(order === "retreat" ? S.orderRetreat(reached) : S.orderSortie(reached));
    this.sound("raid.horn");
  }

  /** Para las pruebas a gran escala: cambia el mínimo en el campo, la reserva y la tanda de refuerzos. */
  tuneReinforcements(tuning: ReinforcementTuning): void {
    this.reinforcements.tune(tuning);
    console.log(`[bastion] Refuerzos: mínimo ${tuning.minField}, reserva ${tuning.reservePerWave}, tanda ${tuning.batch}.`);
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

  /** En el descanso: cura a los aliados vivos y repone los caídos en los puntos del mapa. */
  private restoreAllies(): void {
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
    this.spawner.rescueStuck();
    ensureWaypoints(this.dimension, this.map);
    ensureRallyPoints(this.dimension, this.map);
    ensureHeart(this.dimension, this.map);
    guideReturns(this.dimension, this.map, this.state.breached, (ally) => this.orders.applyTo(ally, this.state.breached));
    this.orders.tick();
    if (this.state.phase === "wave") {
      this.sendReinforcements();
      this.digThroughWalls();
    }
    this.checkWaveCleared();
    this.drawHud();
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
    console.log(`[bastion] Paredes: ${broken} bloques derribados.`);
    if (first) world.sendMessage(S.wallsBreached);
  }

  /** Levanta (o repone) los muros de todas las puertas y anota con cuántos bloques empieza cada una. */
  private raiseWalls(): void {
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
      this.dispatch({ type: "gateDestroyed" });
    }
  }

  /** Lo llama main.ts cuando un proyectil arcano choca con un bloque: muerde el muro y comprueba el hueco. */
  onBoltHit(hit: Vec3): void {
    if (!isActive(this.state.phase)) return;
    const result = biteWalls(this.dimension, this.map.gates, hit);
    if (result.broken === 0) return;
    console.log(`[bastion] Proyectil en ${hit.x},${hit.y},${hit.z}: ${result.broken} bloques de muro rotos (puerta ${result.gate?.id}).`);
    this.checkGates();
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
    if (this.orders.current === "defend") unleashAllies(this.dimension);
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
