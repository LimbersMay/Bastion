import { Player, system, world } from "@minecraft/server";
import { MENU_ITEM_ID, NAMESPACE, PROP_ACTIVE_MAP } from "./constants";
import { SiegeManager } from "./game/siegeManager";
import { defaultMap, findMap, MAPS } from "./maps";
import { validateMap } from "./maps/validate";
import { giveMenuItem, hasMenuItem } from "./systems/loadout";
import { S } from "./strings";
import { openMainMenu } from "./ui/menus";

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
  if (!hasMenuItem(ev.player)) giveMenuItem(ev.player);
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (!ev.id.startsWith(`${NAMESPACE}:`)) return;
  const source = ev.sourceEntity instanceof Player ? ev.sourceEntity : undefined;
  handleScriptEvent(ev.id, ev.message, source);
});

// El reloj del equipo inicial abre el menú.
world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack.typeId !== MENU_ITEM_ID) return;
  const player = ev.source;
  const m = ensureManager(player);
  if (m) void openMainMenu(player, m, (mapId) => changeMap(mapId, player));
});

// Cada muerte de un jugador gasta una vida del equipo.
world.afterEvents.entityDie.subscribe(
  () => {
    manager?.onPlayerDied();
  },
  { entityTypes: ["minecraft:player"] }
);
