import { Player, system, world } from "@minecraft/server";
import { ENTITY_IDS, HORN_ITEM_ID, MENU_ITEM_ID, MODE_ITEM_ID, NAMESPACE, PROP_ACTIVE_MAP, PROP_SPECTATE, RETREAT_ITEM_ID, SORTIE_ITEM_ID } from "./constants";
import { SiegeManager } from "./game/siegeManager";
import { defaultMap, findMap, MAPS } from "./maps";
import { validateMap } from "./maps/validate";
import { giveEssentials } from "./systems/loadout";
import { S } from "./strings";
import { openMainMenu } from "./ui/menus";
import { unitOf, UNIT_LIST } from "./units/catalog";

let manager: SiegeManager | undefined;

/**
 * Crea el gestor si aún no existe. Se llama al cargar el mundo y también al recibir
 * una orden, para no quedarse mudo si el evento de carga no llegó o falló.
 * Si falla, el motivo se muestra en el chat en vez de perderse.
 */
function ensureManager(announceTo?: Player): SiegeManager | undefined {
  if (manager) return manager;
  try {
    const map = chooseInitialMap();
    const errors = MAPS.flatMap(validateMap);
    if (errors.length > 0) console.warn(`[bastion] Mapas con problemas:\n${errors.join("\n")}`);
    manager = new SiegeManager(map);
    manager.run();
    console.warn(`[bastion] Listo. Mapa activo: ${map.id}`);
  } catch (e) {
    const msg = `[Bastion] Error al iniciar: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(msg);
    (announceTo ?? world).sendMessage(msg);
  }
  return manager;
}

function chooseInitialMap() {
  const saved = world.getDynamicProperty(PROP_ACTIVE_MAP);
  return findMap(typeof saved === "string" ? saved : undefined) ?? defaultMap();
}

function changeMap(id: string, announceTo?: Player): void {
  const map = findMap(id);
  if (!map) {
    announceTo?.sendMessage(S.mapUnknown(id));
    return;
  }
  const errors = validateMap(map);
  if (errors.length > 0) {
    announceTo?.sendMessage(S.mapInvalid(errors));
    return;
  }
  manager?.setMap(map);
  world.setDynamicProperty(PROP_ACTIVE_MAP, map.id);
  world.sendMessage(S.mapChanged(map.name));
}

function handleScriptEvent(id: string, message: string, source: Player | undefined): void {
  const manager = ensureManager(source);
  if (!manager) return;
  const command = id.slice(NAMESPACE.length + 1);

  switch (command) {
    case "menu":
      if (source) void openMainMenu(source, manager, (mapId) => changeMap(mapId, source));
      break;
    case "start":
      if (!manager.start() && manager.currentState.phase !== "idle") source?.sendMessage(S.notIdle);
      break;
    case "reset":
      manager.reset();
      source?.sendMessage(S.resetDone);
      break;
    case "map":
      changeMap(message.trim(), source);
      break;
    case "order":
      if (message.trim() === "retreat" || message.trim() === "sortie") manager.orderAllies(message.trim() as "retreat" | "sortie", source);
      else source?.sendMessage(S.scriptHelp);
      break;
    case "reserve": {
      const [minField, reservePerWave, batch] = message.trim().split(/\s+/).map(Number);
      if ([minField, reservePerWave, batch].every((n) => Number.isInteger(n) && n >= 0)) manager.tuneReinforcements({ minField, reservePerWave, batch });
      else source?.sendMessage(S.scriptHelp);
      break;
    }
    case "spectate":
      setSpectate(manager, message.trim() !== "off");
      break;
    case "squads": {
      const on = message.trim() !== "off";
      manager.setSquads(on);
      console.log(`[bastion] Director de grupos y moral ${on ? "activados" : "desactivados"}.`);
      break;
    }
    case "pos":
      if (source) {
        const { x, y, z } = source.location;
        source.sendMessage(S.posReport(Math.round(x * 2) / 2, Math.round(y * 2) / 2, Math.round(z * 2) / 2));
      }
      break;
    default:
      source?.sendMessage(S.scriptHelp);
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  ensureManager();
});

// Aviso al entrar: si no lo ves, los scripts de Bastion no se cargaron (pack no activado o error).
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const m = ensureManager(ev.player);
  if (m) ev.player.sendMessage(S.loaded(m.currentMap.name));
  giveEssentials(ev.player);
  m?.onPlayerJoined(ev.player);
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (!ev.id.startsWith(`${NAMESPACE}:`)) return;
  const source = ev.sourceEntity instanceof Player ? ev.sourceEntity : undefined;
  handleScriptEvent(ev.id, ev.message, source);
});

/** Modo espectador: el asedio deja a los jugadores en creativo (mirar) o en supervivencia (jugar). */
function setSpectate(manager: SiegeManager, on: boolean): void {
  world.setDynamicProperty(PROP_SPECTATE, on);
  manager.refreshGameModes();
  console.log(`[bastion] Modo espectador ${on ? "activado" : "desactivado"}.`);
  world.sendMessage(on ? S.spectateOn : S.spectateOff);
}

// El reloj del equipo inicial abre el menú; la pluma y la vara dan órdenes a los aliados; el cuerno pide rescate;
// la brújula cambia entre jugar y mirar (sin escribir comandos ni ser operador).
const ITEMS = new Set([MENU_ITEM_ID, RETREAT_ITEM_ID, SORTIE_ITEM_ID, HORN_ITEM_ID, MODE_ITEM_ID]);
world.afterEvents.itemUse.subscribe((ev) => {
  const { typeId } = ev.itemStack;
  if (!ITEMS.has(typeId)) return;
  const player = ev.source;
  const m = ensureManager(player);
  if (!m) return;
  if (typeId === MENU_ITEM_ID) void openMainMenu(player, m, (mapId) => changeMap(mapId, player));
  else if (typeId === HORN_ITEM_ID) m.blowHorn(player);
  else if (typeId === MODE_ITEM_ID) setSpectate(m, world.getDynamicProperty(PROP_SPECTATE) !== true);
  else m.orderAllies(typeId === RETREAT_ITEM_ID ? "retreat" : "sortie", player);
});

// Los proyectiles arcanos de los magos se llevan bloques del muro.
world.afterEvents.projectileHitBlock.subscribe((ev) => {
  try {
    if (ev.projectile.typeId !== ENTITY_IDS.arcaneBolt) return;
    const block = ev.getBlockHit()?.block;
    const at = block ? block.location : { x: Math.floor(ev.location.x), y: Math.floor(ev.location.y), z: Math.floor(ev.location.z) };
    manager?.onBoltHit(at);
  } catch (e) {
    console.warn(`[bastion] Error al procesar el impacto de un proyectil: ${e}`);
  }
});

// Chocar con el punto de mira, o con un soldado pegado al muro, también muerde lo que tenga al lado.
world.afterEvents.projectileHitEntity.subscribe((ev) => {
  try {
    if (ev.projectile.typeId !== ENTITY_IDS.arcaneBolt) return;
    manager?.onBoltHit({ x: Math.floor(ev.location.x), y: Math.floor(ev.location.y), z: Math.floor(ev.location.z) });
  } catch (e) {
    console.warn(`[bastion] Error al procesar el impacto de un proyectil: ${e}`);
  }
});

// Cada baja de una unidad se anota, para saber qué las está matando.
world.afterEvents.entityDie.subscribe(
  (ev) => {
    try {
      const { damageSource: source, deadEntity } = ev;
      const side = unitOf(deadEntity.typeId)?.side ?? "invader";
      manager?.onUnitDied(side, source.cause, source.damagingProjectile?.typeId ?? source.damagingEntity?.typeId);
    } catch (e) {
      console.warn(`[bastion] Error al anotar una baja: ${e}`);
    }
  },
  { entityTypes: UNIT_LIST.map((u) => u.entityId) }
);

// Un monstruo del juego que ataca a un jugador pasa a ser objetivo de los aliados.
world.afterEvents.entityHurt.subscribe(
  (ev) => {
    try {
      manager?.onPlayerHurt(ev.damageSource.damagingEntity);
    } catch (e) {
      console.warn(`[bastion] Error al procesar un golpe a un jugador: ${e}`);
    }
  },
  { entityTypes: ["minecraft:player"] }
);

// Cada muerte de un jugador gasta una vida del equipo.
world.afterEvents.entityDie.subscribe(
  () => {
    manager?.onPlayerDied();
  },
  { entityTypes: ["minecraft:player"] }
);
