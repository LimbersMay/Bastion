import { ItemStack, type Player } from "@minecraft/server";
import { HORN_ITEM_ID, MENU_ITEM_ID, MODE_ITEM_ID, RETREAT_ITEM_ID, SORTIE_ITEM_ID } from "../constants";
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
  { id: HORN_ITEM_ID, amount: 1, name: S.hornItemName, lore: S.hornItemLore, keep: true },
  { id: MODE_ITEM_ID, amount: 1, name: S.modeItemName, lore: S.modeItemLore, keep: true },
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

/**
 * Al entrar, quien no lleve el reloj del menú o la brújula de modo los recibe: sin ellos no podría abrir el menú ni
 * salir del modo espectador (el servidor de pruebas arranca con él) sin escribir comandos ni ser operador.
 */
export function giveEssentials(player: Player): void {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  const carried = new Set<string>();
  for (let i = 0; i < container.size; i++) {
    const id = container.getItem(i)?.typeId;
    if (id) carried.add(id);
  }
  for (const item of LOADOUT.filter((i) => i.id === MENU_ITEM_ID || i.id === MODE_ITEM_ID)) {
    if (carried.has(item.id)) continue;
    const stack = new ItemStack(item.id, item.amount);
    if (item.name) stack.nameTag = item.name;
    if (item.lore) stack.setLore([item.lore]);
    if (item.keep) stack.keepOnDeath = true;
    container.addItem(stack);
  }
}
