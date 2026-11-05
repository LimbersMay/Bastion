import { ItemStack, type Player } from "@minecraft/server";
import { MENU_ITEM_ID, RETREAT_ITEM_ID, SORTIE_ITEM_ID } from "../constants";
import { S } from "../strings";

/** Equipo inicial: no hay crafteo ni supervivencia, así que todo se entrega al empezar. */
const LOADOUT: ReadonlyArray<{ id: string; amount: number; name?: string; lore?: string; keep?: boolean }> = [
  { id: "minecraft:iron_sword", amount: 1 },
  { id: "minecraft:bow", amount: 1 },
  { id: "minecraft:arrow", amount: 64 },
  { id: "minecraft:shield", amount: 1 },
  { id: "minecraft:cooked_beef", amount: 16 },
  { id: MENU_ITEM_ID, amount: 1 },
  { id: RETREAT_ITEM_ID, amount: 1, name: S.retreatItemName, lore: S.retreatItemLore, keep: true },
  { id: SORTIE_ITEM_ID, amount: 1, name: S.sortieItemName, lore: S.sortieItemLore, keep: true },
];

export function giveLoadout(player: Player): void {
  try {
    player.runCommand("clear @s");
  } catch {
    // Sin permiso para ejecutar comandos: seguimos con lo que haya en el inventario.
  }
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  for (const item of LOADOUT) {
    const stack = new ItemStack(item.id, item.amount);
    if (item.name) stack.nameTag = item.name;
    if (item.lore) stack.setLore([item.lore]);
    if (item.keep) stack.keepOnDeath = true;
    container.addItem(stack);
  }
}

/** `true` si el jugador ya lleva el reloj del menú. */
export function hasMenuItem(player: Player): boolean {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return true;
  for (let i = 0; i < container.size; i++) {
    if (container.getItem(i)?.typeId === MENU_ITEM_ID) return true;
  }
  return false;
}

/** Entrega solo el reloj del menú, para quien no lo tenga. */
export function giveMenuItem(player: Player): void {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  container.addItem(new ItemStack(MENU_ITEM_ID, 1));
}
