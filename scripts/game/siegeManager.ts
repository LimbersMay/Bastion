import { system, world, type Dimension, type Player } from "@minecraft/server";
import { LOGIC_INTERVAL_TICKS, TICKING_AREA_NAME, TICKS_PER_SECOND } from "../constants";
import type { GateDef, MapDef } from "../maps/types";
import { barrierCenter, closeBarriers, openBarriers } from "../systems/barrier";
import { unleashAllies } from "../systems/allies";
import { findGate, describeGateTerrain, gateTerrainMatches, isAreaLoaded, readGateHealth, removeGates, spawnGate, sumGateHealth } from "../systems/gate";
import { giveLoadout } from "../systems/loadout";
import { WaveSpawner } from "../systems/waveSpawner";
import { S } from "../strings";
import { initialState, isActive, step, type SiegeConfig, type SiegeEffect, type SiegeEvent, type SiegeState } from "./siegeState";

const START_POLL_TICKS = 10;
const START_TIMEOUT_TICKS = 300;

/**
 * Orquesta una partida: traduce eventos del juego a eventos de la máquina de estados
 * y aplica sus efectos (oleadas, brecha, victoria, derrota) al mundo.
 */
export class SiegeManager {
  private state: SiegeState;
  private cfg: SiegeConfig;
  private spawner: WaveSpawner;
  private dimension: Dimension;
  /** Ids de las puertas que se han visto vivas en esta partida (para detectar cuándo caen). */
  private readonly gatesSeen = new Set<string>();
  private starting = false;
  private intervalId: number | undefined;

  constructor(private map: MapDef) {
    this.cfg = SiegeManager.configFor(map);
    this.state = initialState(this.cfg);
    this.dimension = world.getDimension(map.dimension);
    this.spawner = new WaveSpawner(this.dimension, map);
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
  }

  /**
   * Inicia la partida. Primero crea el área de carga y espera a que el terreno de la puerta esté
   * cargado (sin jugadores cerca tarda unos segundos); solo entonces coloca la puerta y las unidades.
   * Devuelve `false` si ya hay una partida o un inicio en marcha.
   */
  start(): boolean {
    if (this.state.phase !== "idle" || this.starting) return false;
    this.starting = true;
    this.ensureTickingArea();
    let waited = 0;
    const poll = system.runInterval(() => {
      waited += START_POLL_TICKS;
      const ready = this.map.gates.every((g) => isAreaLoaded(this.dimension, g.position));
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

  private begin(): void {
    this.closeAllBarriers();
    for (const gate of this.map.gates) {
      spawnGate(this.dimension, gate);
      this.gatesSeen.add(gate.id);
    }
    for (const ally of this.map.allies) this.spawner.spawnUnit(ally.unit, ally.position, 0.5);

    const players = world.getAllPlayers();
    players.forEach((player, i) => {
      giveLoadout(player);
      const spawn = this.map.playerSpawns[i % this.map.playerSpawns.length];
      player.teleport(spawn, { dimension: this.dimension });
    });
    this.dispatch({ type: "start" });
    world.sendMessage(S.started);
  }

  reset(): void {
    this.spawner.clear();
    removeGates(this.dimension);
    this.closeAllBarriers();
    this.gatesSeen.clear();
    this.dispatch({ type: "reset" });
    for (const player of world.getAllPlayers()) player.onScreenDisplay.setActionBar("");
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
  }

  private logicTick(): void {
    if (!isActive(this.state.phase)) return;
    this.dispatch({ type: "tick", ticks: LOGIC_INTERVAL_TICKS });
    this.checkGates();
    this.spawner.rescueStuck();
    this.checkWaveCleared();
    this.drawHud();
  }

  private closeAllBarriers(): void {
    for (const gate of this.map.gates) closeBarriers(this.dimension, gate.barriers);
  }

  /** Detecta qué puertas han caído: una puerta vista viva que ya no está (con su zona cargada). */
  private checkGates(): void {
    for (const gate of this.map.gates) {
      if (!isAreaLoaded(this.dimension, gate.position)) continue;
      if (findGate(this.dimension, gate.id)) {
        this.gatesSeen.add(gate.id);
        continue;
      }
      if (this.gatesSeen.delete(gate.id)) {
        this.breachGate(gate);
        this.dispatch({ type: "gateDestroyed" });
      }
    }
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

  /** Lo que provoca la caída de UNA puerta: se abren sus barricadas, explota y entran sus tropas. */
  private breachGate(gate: GateDef): void {
    openBarriers(this.dimension, gate.barriers);
    const blasts = gate.barriers?.length ? gate.barriers.map(barrierCenter) : [gate.position];
    for (const at of blasts) {
      try {
        this.dimension.createExplosion(at, 4, { breaksBlocks: false, causesFire: false });
      } catch (e) {
        console.warn(`[bastion] Explosión de brecha fallida: ${e}`);
      }
    }
    this.spawner.spawnBreachTroops(gate);
  }

  /** Aviso global de brecha: solo salta una vez, con la primera puerta que cae. */
  private onBreach(): void {
    this.title(S.titleBreach, S.titleBreachSub);
    this.sound("mob.wither.spawn");
    unleashAllies(this.dimension);
    // Pendiente: huida de civiles (ver README, "Qué falta").
  }

  private drawHud(): void {
    const s = this.state;
    const secs = Math.ceil(s.ticksLeft / TICKS_PER_SECOND);
    const foes = this.spawner.aliveInvaders() + this.spawner.pending;
    let text: string;

    if (s.phase === "countdown") {
      text = S.hudCountdown(secs);
    } else if (s.phase === "intermission") {
      text = S.hudIntermission(secs, s.lives);
    } else if (s.breached) {
      text = S.hudBreached(s.wave + 1, this.cfg.totalWaves, foes, s.lives);
    } else {
      const health = sumGateHealth(
        this.map.gates.map((g) => {
          const entity = findGate(this.dimension, g.id);
          return entity ? readGateHealth(entity) : undefined;
        })
      );
      const gateText = health ? `${health.current}/${health.max}` : "?";
      text = S.hudWave(s.wave + 1, this.cfg.totalWaves, gateText, foes, s.lives);
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
    const area = this.map.tickingArea;
    if (!area) return;
    const { x, y, z } = area.center;
    const name = `${TICKING_AREA_NAME}_${this.map.id}`;
    try {
      const result = this.dimension.runCommand(
        `tickingarea add circle ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${area.radiusChunks} ${name} true`
      );
      if (result.successCount === 0) console.log(`[bastion] El área de carga "${name}" ya existía.`);
    } catch (e) {
      console.warn(`[bastion] No se pudo crear el ticking area: ${e}`);
    }
  }
}
