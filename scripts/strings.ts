/** Textos que ve el jugador (todos en un sitio para poder traducirlos o retocarlos). */

export const S = {
  menuTitle: "Bastion — Asedio",
  menuStart: "Iniciar asedio",
  menuReset: "Reiniciar partida",
  menuMap: "Cambiar mapa",
  menuClose: "Cerrar",
  menuBody: (mapName: string, description: string, status: string) =>
    `Mapa: ${mapName}\n${description}\n\nEstado: ${status}`,

  statusIdle: "listo para empezar",
  statusCountdown: (secs: number) => `preparación (${secs} s)`,
  statusWave: (n: number, total: number) => `oleada ${n}/${total} en curso`,
  statusIntermission: (secs: number) => `descanso (${secs} s)`,
  statusVictory: "victoria",
  statusDefeat: "derrota",

  hudCountdown: (secs: number) => `§eLos invasores llegan en §f${secs} s`,
  hudWave: (n: number, total: number, gate: string, foes: number, allies: string, lives: number) =>
    `§cOleada ${n}/${total}  §7|  §6Muro ${gate}  §7|  §4Enemigos ${foes}  §7|  §2Aliados ${allies}  §7|  §aVidas ${lives}`,
  hudBreached: (n: number, total: number, foes: number, allies: string, lives: number) =>
    `§4¡BRECHA!  §cOleada ${n}/${total}  §7|  §4Enemigos ${foes}  §7|  §2Aliados ${allies}  §7|  §aVidas ${lives}`,
  hudAllies: (alive: number, reserve: number) => (reserve > 0 ? `${alive} (+${reserve})` : `${alive}`),
  hudIntermission: (secs: number, lives: number) => `§aDescanso §f${secs} s  §7|  §aVidas ${lives}`,

  titleWave: (n: number, total: number) => `Oleada ${n}/${total}`,
  titleWaveSub: (name: string) => name,
  titleBreach: "¡BRECHA!",
  titleBreachSub: "El muro ha cedido. ¡Defended el interior!",
  titleVictory: "¡VICTORIA!",
  titleVictorySub: "El castillo resiste.",
  titleDefeat: "DERROTA",
  titleDefeatSub: "No quedan vidas.",

  started: "§aAsedio iniciado. Usa el reloj para abrir el menú.",
  resetDone: "§7Partida reiniciada.",
  spectateOn: "§7Modo espectador: el asedio te deja en creativo para mirar (los enemigos no te atacan).",
  spectateOff: "§7Modo espectador desactivado: el asedio se juega en supervivencia.",
  sortieDone: "§7No queda ningún invasor: los aliados vuelven al castillo.",
  notIdle: "§cYa hay una partida en curso. Reinicia primero.",
  mapChanged: (name: string) => `§aMapa activo: §f${name}`,
  mapUnknown: (id: string) => `§cMapa desconocido: ${id}`,
  mapInvalid: (errors: string[]) => `§cMapa inválido:\n${errors.join("\n")}`,
  posReport: (x: number, y: number, z: number) => `§7Posición: §f{ x: ${x}, y: ${y}, z: ${z} }`,
  loaded: (map: string) => `§a[Bastion] Scripts cargados. §7Mapa: §f${map}§7. Usa el reloj o /scriptevent bastion:menu`,
  alliesRestored: (n: number) => `§aRefuerzos: ${n} ${n === 1 ? "aliado se une" : "aliados se unen"} a la defensa.`,
  wrongMap: (name: string) =>
    `§cEste mundo no parece ser «${name}»: no hay suelo donde va la puerta. §7Cambia de mapa en el menú (Cambiar mapa) o con /scriptevent bastion:map <id>.`,
  scriptHelp: "§7Comandos: /scriptevent bastion:menu | start | reset | pos | map <id> | order <retreat|sortie> | reserve <mínimo> <reserva> <tanda> | spectate <on|off>",

  retreatItemName: "§eOrden: retirada",
  retreatItemLore: "§7Úsala para que los aliados corran al castillo",
  sortieItemName: "§cOrden: al ataque",
  sortieItemLore: "§7Úsala para que los aliados salgan a buscar al enemigo",
  orderRetreat: (n: number) => `§e¡Retirada! ${n} ${n === 1 ? "aliado corre" : "aliados corren"} al castillo.`,
  orderSortie: (n: number) => `§c¡Al ataque! ${n} ${n === 1 ? "aliado sale" : "aliados salen"} a buscar al enemigo.`,
  orderNotActive: "§7Las órdenes solo funcionan durante un asedio.",
  orderNoRally: "§7Este mapa no tiene punto de reunión para la retirada.",
  reinforcementsEmpty: "§6Se agotaron los refuerzos de esta oleada.",
  wallsBreached: "§c¡Los invasores están derribando las paredes del castillo!",
} as const;
