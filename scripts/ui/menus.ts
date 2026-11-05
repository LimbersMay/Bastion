import { system, type Player } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import type { SiegeManager } from "../game/siegeManager";
import { MAPS } from "../maps";
import { S } from "../strings";

/** Muestra un formulario reintentando si el jugador tiene otra pantalla abierta (chat, inventario...). */
async function showWhenFree(player: Player, form: ActionFormData) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await form.show(player);
    if (response.cancelationReason !== FormCancelationReason.UserBusy) return response;
    await system.waitTicks(10);
  }
  return undefined;
}

export async function openMainMenu(player: Player, manager: SiegeManager, onMapChange: (id: string) => void): Promise<void> {
  const map = manager.currentMap;
  const phase = manager.currentState.phase;

  const form = new ActionFormData()
    .title(S.menuTitle)
    .body(S.menuBody(map.name, map.description, manager.statusText()));

  type Action = "start" | "reset" | "map" | "close";
  const actions: Action[] = [];
  const add = (label: string, action: Action) => {
    form.button(label);
    actions.push(action);
  };

  if (phase === "idle") add(S.menuStart, "start");
  else add(S.menuReset, "reset");
  if (phase === "idle" && MAPS.length > 1) add(S.menuMap, "map");
  add(S.menuClose, "close");

  const response = await showWhenFree(player, form);
  if (!response || response.canceled || response.selection === undefined) return;

  switch (actions[response.selection]) {
    case "start":
      manager.start();
      break;
    case "reset":
      manager.reset();
      player.sendMessage(S.resetDone);
      break;
    case "map":
      await openMapMenu(player, onMapChange);
      break;
    default:
      break;
  }
}

async function openMapMenu(player: Player, onMapChange: (id: string) => void): Promise<void> {
  const form = new ActionFormData().title(S.menuMap);
  for (const map of MAPS) form.button(`${map.name}\n§7${map.description.slice(0, 40)}`);

  const response = await showWhenFree(player, form);
  if (!response || response.canceled || response.selection === undefined) return;
  onMapChange(MAPS[response.selection].id);
}
