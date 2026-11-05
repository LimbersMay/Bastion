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
  hudWave: (n: number, total: number, gate: string, foes: number, lives: number) =>
    `§cOleada ${n}/${total}  §7|  §6Puerta ${gate}  §7|  §4Enemigos ${foes}  §7|  §aVidas ${lives}`,
  hudBreached: (n: number, total: number, foes: number, lives: number) =>
    `§4¡BRECHA!  §cOleada ${n}/${total}  §7|  §4Enemigos ${foes}  §7|  §aVidas ${lives}`,
  hudIntermission: (secs: number, lives: number) => `§aDescanso §f${secs} s  §7|  §aVidas ${lives}`,

  titleWave: (n: number, total: number) => `Oleada ${n}/${total}`,
  titleWaveSub: (name: string) => name,
  titleBreach: "¡BRECHA!",
  titleBreachSub: "La puerta ha caído. ¡Defended el interior!",
  titleVictory: "¡VICTORIA!",
  titleVictorySub: "El castillo resiste.",
  titleDefeat: "DERROTA",
  titleDefeatSub: "No quedan vidas.",

  started: "§aAsedio iniciado. Usa el reloj para abrir el menú.",
  resetDone: "§7Partida reiniciada.",
  notIdle: "§cYa hay una partida en curso. Reinicia primero.",
  mapChanged: (name: string) => `§aMapa activo: §f${name}`,
  mapUnknown: (id: string) => `§cMapa desconocido: ${id}`,
  mapInvalid: (errors: string[]) => `§cMapa inválido:\n${errors.join("\n")}`,
  posReport: (x: number, y: number, z: number) => `§7Posición: §f{ x: ${x}, y: ${y}, z: ${z} }`,
  loaded: (map: string) => `§a[Bastion] Scripts cargados. §7Mapa: §f${map}§7. Usa el reloj o /scriptevent bastion:menu`,
  wrongMap: (name: string) =>
    `§cEste mundo no parece ser «${name}»: no hay suelo donde va la puerta. §7Cambia de mapa en el menú (Cambiar mapa) o con /scriptevent bastion:map <id>.`,
  scriptHelp: "§7Comandos: /scriptevent bastion:menu | start | reset | pos | map <id>",
} as const;
