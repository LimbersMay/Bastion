# Laboratorio de IA

Pruebas de movimiento y combate de [docs/IA.md](../../docs/IA.md). No forma parte del addon: **nunca debe ir en una versión para jugar**.

## Pruebas en vivo, sin reiniciar el servidor

Así se probó la v0.1.53 (escaleras, toque, bajadas guiadas) con Limbers mirando la partida en directo: el servidor
queda encendido toda la sesión y cada cambio de código se sube con `reload`, sin apagarlo. Reiniciar el servidor
solo hace falta si cambian los JSON de entidades o bloques, los `manifest.json` o si el servidor se cae.

Rutas: `<BDS_DIR>` es la carpeta del servidor (por defecto `../BedrockServer/server`, junto al repo). Las órdenes
van a `<BDS_DIR>/../cmd.txt` y el registro sale en `<BDS_DIR>/../serve.log`.

### 1. Encender el servidor una vez

```bash
npm run mcaddon && node tools/bds.mjs sync
node tools/bds.mjs serve > <BDS_DIR>/../serve.out 2>&1    # en segundo plano; se queda encendido
```

Un agente lo lanza como tarea en segundo plano y no lo vuelve a arrancar en toda la sesión. `serve` activa el modo
espectador: quien entra (tablet o PC en la misma Wi-Fi, IP del PC y puerto 19132) mira en creativo.

### 2. Mandar órdenes

`serve` lee `cmd.txt` cada segundo, ejecuta cada línea como un comando de consola y lo vacía. Una orden por línea:

```bash
printf 'scriptevent bastion:start\n' >> <BDS_DIR>/../cmd.txt
```

Con `>>` (añadir): con `>` se pisa una orden que aún no se leyó si se mandan dos en el mismo segundo. Varias a la vez,
en el mismo `printf` separadas por `\n`.

Para llevar a Limbers a donde pasa algo: `tp <su nombre> x y z`.

### 3. Subir un cambio de código sin apagar

`reload` vuelve a cargar los scripts, pero borra su estado: si se hace a mitad de asedio, la partida queda a medias
(escaleras puestas, muros rotos, unidades sueltas). Por eso, siempre en este orden:

```bash
npx tsc --noEmit -p . && npx vitest run                  # antes de nada
printf 'scriptevent bastion:reset\n' >> cmd.txt          # quita escaleras, repone muros, para la partida
printf 'kill @e[type=item]\n' >> cmd.txt                 # objetos sueltos del suelo (escaleras caídas, grava...)
npm run mcaddon && node tools/bds.mjs sync               # compila e instala los packs en el servidor
printf 'reload\n' >> cmd.txt                             # carga los scripts nuevos
printf 'kill @e[family=bastion_unit]\n' >> cmd.txt       # unidades que sobrevivieron al reload (unos 5 s después)
printf 'scriptevent bastion:start\n' >> cmd.txt          # nueva partida
```

Tras el `reload` sale `[bastion] Listo. Mapa activo: ...`; si sale un error de scripts, también aparece en el
registro. `No targets matched selector` tras el `kill` solo dice que no quedaba nada que quitar.

### 4. Seguir la partida

Las líneas del addon llevan `[Scripting] [bastion]`. Un agente las vigila con un monitor que avisa de cada línea
que interesa, en vez de leer el registro una y otra vez:

```bash
tail -n 0 -F <BDS_DIR>/../serve.log | grep -E --line-buffered "fase |Inalcanzable|Bajada:|Escalera|Atasco|\[Scripting\].*(rror|Error)"
```

Los monitores caducan a los 30 minutos: hay que volver a ponerlos. Para hacer recuento de una oleada, se corta el
registro desde su línea `fase idle#0 -> countdown#0` y se cuentan las líneas de cada tipo (`grep -c`).

### 5. Mirar el mundo desde fuera

Los comandos responden en el registro, así que sirven de sonda:

| Para saber | Orden | Respuesta |
|---|---|---|
| Qué bloque hay en un sitio | `testforblock x y z air` | `The block at x,y,z is Stone Bricks (expected: Air)` |
| El estado de un bloque | `testforblock x y z stone_brick_slab ["minecraft:vertical_half"="top"]` | `Successfully found` o `did not match` |
| Dónde están unas entidades | `execute at @e[type=item,name=Ladder] run testforblock ~ ~ ~ ladder` | una línea con las coordenadas de cada una |
| Cuántas hay | `testfor @e[family=bastion_invader]` | `Found ...` con sus nombres |
| Ticks por segundo | `time query gametime` cada segundo | `Gametime is N`: (N₂ − N₁) / segundos entre líneas; 20 es lo normal |

Para revisar una zona, un bucle de `testforblock` (un bloque por orden) y se ordena la salida por coordenadas. Las que
no coinciden salen como `ERROR` en el registro: el monitor las recogerá si su filtro incluye `rror`.

Ticks por segundo durante una oleada, en segundo plano:

```bash
for i in $(seq 1 270); do printf 'time query gametime\n' >> cmd.txt; sleep 1; done
```

y luego, de las líneas `Gametime is N` con su hora, la media y el peor segundo (en la v0.1.53: 20,0 de media y
19,2 el peor, con rutas de 150 pasos calculándose).

### Cuidado

- Lo que se cambia en el mundo con comandos se queda en el mundo de pruebas. `node tools/bds.mjs setup` lo deja
  como estaba.
- Si Limbers está conectado en supervivencia, también es presa: el modo espectador (que activa `serve`) lo evita.
- `fill` no pasa de 32.768 bloques y, si se pasa, falla sin avisar: por capas.

## Activarlo

1. Copia `lab.ts` a `scripts/lab/lab.ts`.
2. Copia `entities/*.json` a `behavior_packs/bastion/entities/`.
3. En `scripts/main.ts`, añade `import { handleLab } from "./lab/lab";` y, al principio del `scriptEventReceive`, después de comprobar el espacio de nombres:

   ```ts
   if (ev.id === `${NAMESPACE}:lab`) {
     handleLab(ev.message);
     return;
   }
   ```

4. `npm run mcaddon`.

Para quitarlo, deshaz esos tres pasos y vuelve a compilar.

## Batalla de referencia

No necesita el laboratorio activado: usa las unidades reales del pack.

1. Descomprime `assets/worlds/Old Fallen Castle - v1.3.mcworld` en una carpeta (un `.mcworld` es un zip).
2. `npm run mcaddon && node tools/bds.mjs setup <esa-carpeta>`
3. `node tools/bds.mjs serve` en una terminal.
4. Escribe `scriptevent bastion:map old-fallen-castle` en `<BDS_DIR>/../cmd.txt`: un mundo recién preparado empieza con el primer mapa (The Combat Castle) y, si no, el asedio no arranca.
5. `node tools/lab/siege.mjs <etiqueta> 9` en otra terminal, **sin nadie conectado**: un jugador en supervivencia también es presa y cambia el resultado.

Enfrenta a 30 aliados y 60 soldados invasores, sin piromanos, durante 9 minutos. Cada 30 s anota vivos, bloques derribados y ticks/s; al final, dónde quedó cada unidad. El resultado queda en `tools/lab/siege-<etiqueta>.log`. Vuelve a `setup` antes de repetirla para restaurar el mundo.

## Peleas en campo abierto (Fase 3)

`field.ts` enfrenta a soldados reales (aliados con la orden de ataque contra invasores en marcha) sobre una plataforma de 48x48 en el cielo de Stonehill, con y sin el director de grupos. Resultados en [docs/IA.md](../../docs/IA.md), «Grupos en campo abierto».

1. Copia `field.ts` a `scripts/lab/field.ts`.
2. En `scripts/main.ts`, añade `import { handleField } from "./lab/field";` y, al principio del `scriptEventReceive`, después de comprobar el espacio de nombres:

   ```ts
   if (ev.id === `${NAMESPACE}:lab`) {
     const [cmd, ...args] = ev.message.trim().split(/\s+/);
     if (cmd === "field") handleField(args);
     return;
   }
   ```

3. `npm run mcaddon`, sincroniza el servidor con Stonehill activo y escribe en `cmd.txt` `tickingarea add circle -262 200 175 3 field` (la plataforma queda fuera del área del mapa).
4. `scriptevent bastion:lab field <sin|grupos|reserva|reserva:1.5> <aliados> <invasores> [bloque]`. `reserva` = 1 grupo activo por grupo enemigo; `bloque` los hace salir apiñados en vez de en línea.

Al acabar escribe una línea `FIN campo ...` en el registro: duración, golpeadores por objetivo, enemigos alrededor, vecinos a 3 bloques de quien pelea, focos de pelea, ancho del frente, unidades en reserva, coste del director y bajas por causa. Para quitarlo, deshaz los pasos 1 y 2.

## Escaleras de mano

`ladder.ts` mira si las criaturas bajan o suben por una columna de escaleras de mano. Es la alternativa de Limbers a la nube de humo del director de inalcanzables. Usa una torre de 5x5 y 10 de alto en la plataforma de `field.ts`. Resultados en [docs/IA.md](../../docs/IA.md), «Prueba de escaleras de mano».

1. Copia `ladder.ts` a `scripts/lab/ladder.ts`.
2. En `scripts/main.ts`, añade `import { handleLadder } from "./lab/ladder";` y, en el mismo `if` del laboratorio que `field`, `if (cmd === "ladder") handleLadder(args);`.
3. `npm run mcaddon`, sincroniza el servidor con Stonehill activo y crea el área de carga `field` (paso 3 de la sección anterior).
4. `scriptevent bastion:lab ladder <variante> <bajar|subir> [intentos]`, 5 intentos de 30 s por defecto. `scriptevent bastion:lab ladder clean` corta la prueba en curso.
   - `bajar`: un aliado con la orden de ataque arriba, libre, y un invasor encerrado abajo.
   - `subir`: al revés.

   | Variante | Qué hace |
   |---|---|
   | `sin` | No pone escalera; sirve de comparación |
   | `escalera` | Pone la columna en la cara este de la torre y deja a la criatura buscar camino sola |
   | `guiada` | Un invasor sigue un marcador de la caza hasta el borde, la escalera y el otro extremo |
   | `empujada` | Como `guiada`, pero al llegar junto a la escalera el script lo mete en ella (un bloque) |
   | `asistida` | Como `empujada`, y al subir el script lo sube por la escalera a la velocidad de trepar |

   Si estás conectado, ponte en creativo: un jugador en supervivencia también es presa.

Al acabar escribe `FIN escalera ...`: cuántos llegaron, cuánto tardaron y cuántas caídas con daño hubo. Para quitarlo, deshaz los pasos 1 y 2.

## Escaleras del director en terreno irregular

`climb.ts` prueba las escaleras de la v0.1.53 con las piezas reales: el planificador con escaleras (`RouteJobs`), `Ladders` y el marcador que espera ante cada escalera, como un grupo guiado. Usa la plataforma de `field.ts`.

- `acantilado`: meseta de 14 de alto, un saliente a media altura, una cornisa que sobresale sobre medio saliente y bultos en la cara.
- `muralla`: 8 de alto, con almenas.

1. Copia `climb.ts` a `scripts/lab/climb.ts`.
2. En `scripts/main.ts`, añade `import { handleClimb } from "./lab/climb";` y, en el mismo `if` del laboratorio que `field`, `if (cmd === "climb") handleClimb(args);`.
3. `npm run mcaddon`, sincroniza el servidor con Stonehill activo y crea el área de carga `field` (paso 3 de «Peleas en campo abierto»).
4. `scriptevent bastion:lab climb <acantilado|muralla> <bajar|subir> [intentos]`, 3 intentos de 60 s por defecto. `scriptevent bastion:lab climb clean` corta la prueba en curso.

En el registro salen la ruta (cuántas escaleras, si suben o bajan y en qué columna), cada paso que avanza y, al acabar, `FIN escalada ...`: cuántos llegaron, cuánto tardaron, cuántas escaleras y cuántas caídas con daño. Resultados en [docs/IA.md](../../docs/IA.md), «Escaleras del director». Para quitarlo, deshaz los pasos 1 y 2.

## Coste de una batalla grande

`node tools/lab/cost.mjs <carpeta-del-mundo> [variante ...]`, con el servidor parado y tras `npm run mcaddon`. Arranca y para el servidor por su cuenta.

Unos 200 contra 200 por todos los frentes, con la orden de salida. Mide dos minutos de ticks/s y cuenta las unidades. Cada variante cambia una sola cosa, y solo en la copia de los packs del servidor:

| Variante | Qué cambia |
|---|---|
| `actual` | Nada |
| `sinExigirCamino` | Quita `must_reach` |
| `escaneoRapido` | Quita `scan_interval`: buscan enemigo a cada momento |
| `sinAdornos` | Quita mirar al jugador y mirar alrededor |
| `sinGrupos` | Apaga el director de grupos y la moral (`bastion:squads off`), y con ellos el de inalcanzables |
| `sinScripts` | Quita los scripts del pack |
| `sinReselect`, `sinReselectPrioritario` | `reselect_targets: false` en todos los buscadores, o solo en el prioritario: de 2-4 a 19-20 ticks/s, pero con unidades que no sueltan su objetivo (ver IA.md) |
| `sinEntradasDeGrupo`, `cuatroGrupos`, `grupoCerca` | Quita las 16 entradas de marcador de grupo, deja 4, o las deja a 32 bloques en vez de 256 |
| `sinGruposNiRastros` | Quita también las entradas de rastro de la caza |
| `salidaSinLejano`, `marchaSinLejano`, `nadieLejano` | Quita la entrada «cualquier enemigo a 256» de los aliados en salida, de los invasores en marcha, o de los dos |
| `salidaComoV024` | Los aliados en salida, como en la v0.1.24: solo al punto de salida |
| `unaExigencia` | El buscador con `must_reach`, con una sola entrada (la de 24) |
| `refBuscadores`, `refPrioritario`, `refExigeCamino`, `refHerido`, `refVidaGolpe` | Con `REF=<otra copia del repo>`: devuelve ese bloque de las fichas a la versión de esa copia |

Sin variantes, las mide todas (unos 4 minutos cada una). El resultado queda en `tools/lab/cost.log`, que se vacía en cada ejecución (con `SEGUIR=1`, se añade al final).

**Comparar versiones.** Saca la versión vieja con `git worktree add <carpeta> <commit>`, copia ahí el `.env` y haz `npm install` y `npm run mcaddon` dentro. Después:

- `PACKS=<carpeta>` mide los packs de esa copia enteros (fichas y scripts).
- `FICHAS=<carpeta>` mide los scripts de hoy con las fichas de esa copia: separa lo que pesa de cada lado.
- `REF=<carpeta>` con las variantes `ref…`: devuelve a esa copia un solo bloque de las fichas.

Cada línea del registro lleva delante la copia medida. Las batallas varían mucho de una vez a otra: una diferencia de 1 o 2 ticks/s no dice nada, hay que repetirla.

**Censo:** con `CENSO=1`, cada 10 s se cuentan las unidades, las que vuelven del agua, las que van en grupo, en reserva o aguantando, las balsas, los marcadores, los proyectiles, los objetos sueltos y el total de entidades, junto a los ticks/s de ese rato, en `tools/lab/cost-censo.log`. Sirve para ver qué crece cuando el servidor se frena.

### Coste de las entradas del buscador

`node tools/lab/entries.mjs <carpeta-del-mundo> [K ...]` (por defecto 2, 10, 26 y 50). Sin batalla: 400 invasores quietos y sin scripts, con un buscador prioritario de K entradas que nunca encuentran a nadie. Solo cambia K, así que la diferencia de ticks/s es lo que cuestan las entradas. Escribe `tools/lab/entries.log`.

| Opción | Qué hace |
|---|---|
| `OBJETIVO=1` | Añade una entrada que sí encuentra un marcador en el centro: todos tienen objetivo |
| `CASA=1` | La primera prueba de cada entrada se cumple, como un miembro de grupo con su etiqueta |
| `ALCANCE=<n>` | Alcance de las K entradas (por defecto 256) |
| `RESELECCION=0` | `reselect_targets: false` |
| `SEGUIR=1` | Añade al registro en vez de vaciarlo |

Así se encontró la causa del frenazo de la v0.1.54: con objetivo y `reselect_targets`, 16 entradas bajaban a 3,5 ticks/s; sin `reselect_targets`, 20. La batalla es en Old Fallen Castle: el script elige ese mapa antes de empezar. El mundo de pruebas queda con el de la batalla; para volver a otro, `node tools/bds.mjs setup <carpeta>`. Resultados en [docs/IA.md](../../docs/IA.md), «Coste en batallas grandes».

**Perfil de los scripts:** con `PERFIL=1` delante, el servidor graba el primer minuto con `script profiler`. La ruta del `.cpuprofile` sale en `serve.log` («Profile saved to …»). Al leerlo, separa las muestras con más de 1 ms desde la anterior: son espera entre ticks, y el perfil se las apunta a la primera función que corre después. Si no, una búsqueda de ruta pausada parece el 70 % del tiempo.

## Órdenes

Todas son `/scriptevent bastion:lab ...`:

| Orden | Qué hace |
|---|---|
| `bench` | Mide lo que cuesta leer bloques y calcular rutas |
| `benchjob` | La misma ruta, repartida entre ticks |
| `walk <direct\|hops\|leader> <n> x y z gx gy gz [radio]` | Lleva `n` unidades de un punto a otro |
| `fight <vanilla\|cap\|pair>` | Hace pelear a las `lab_a` y `lab_b` ya colocadas |
| `clean` | Quita todo lo del laboratorio |

## Límites

- La zona de trabajo y los trayectos de `bench` están escritos para Old Fallen Castle.
- `lab_a` y `lab_b` traen 30 parejas. Para más, hay que ampliar sus `entity_types` y `PAIR_SLOTS` a la vez.
