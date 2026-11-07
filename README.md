# Bastion

Addon de **invasión y defensa** para Minecraft Bedrock. Un castillo, fortaleza o villa amurallada es asediado por oleadas de enemigos. Combates en primera persona junto a aliados con IA. No hay crafteo ni supervivencia: el equipo se entrega al empezar.

Estado: **v0.1.43 (Fase 2: fichas de unidad, armas en la mano, puestos de defensa, balsas, skins variadas, guerreros y arqueros, monstruos del juego como enemigos y el mapa Stonehill Castle), probado en el servidor oficial (BDS)**; mapas: The Combat Castle, Old Fallen Castle y Stonehill Castle (ver «Qué falta»).

## Retomar el trabajo

Para seguir en otra sesión, lee en este orden:

1. [docs/ROADMAP.md](docs/ROADMAP.md), «Dónde nos quedamos»: fase actual, último cambio y siguiente paso.
2. [docs/IA.md](docs/IA.md), «Conclusiones» y «Batalla real»: lo que sabemos de la IA de las unidades, con sus medidas.
3. [tools/lab/README.md](tools/lab/README.md), si hay que medir algo: la batalla de referencia y el laboratorio.

## Cómo funciona una partida

1. Entras al mundo y usas el **reloj** (o `/scriptevent bastion:menu`) → *Iniciar asedio*.
2. Se levanta el **muro** de la entrada (bloques reales, sin barra de vida), se crea una meta invisible detrás de él, se crean los aliados, se entrega el equipo y se te lleva al punto de inicio.
3. Cuenta atrás → **oleada 1**. Los invasores salen de los puntos exteriores y van hacia la meta. Los **magos** se quedan a distancia y lanzan bolas de fuego como las del Ghast que **deshacen el muro por partes** (cada impacto explota, prende fuego y se lleva el bloque tocado y sus vecinos). Si el muro queda escalonado, pueden cruzarlo por encima: en cuanto un invasor llega a la meta también cuenta como brecha. El HUD muestra «Muro N%».
4. Cuando el muro tiene un hueco por el que cabe un soldado (2 de alto, de lado a lado del grosor) → **BRECHA**: explosión sin daño al terreno, alarma y tropas enemigas aparecen dentro. Los aliados pasan de merodear a atacar.
5. Al limpiar una oleada hay un descanso y sale la siguiente. Limpiar la última = **victoria**. Cada muerte de un jugador gasta una **vida del equipo**; sin vidas = **derrota**.

## Requisitos

- Node.js 20 o superior.
- Minecraft Bedrock 1.21.90 o superior (módulo `@minecraft/server` 2.0.0, estable).

## Comandos

```bash
npm install          # una vez
npm test             # pruebas de la lógica (vitest)
npm run typecheck    # comprobar tipos
npm run build        # compila los scripts a dist/scripts/main.js
npm run mcaddon      # genera dist/packages/bastion.mcaddon
npm run local-deploy # copia a Minecraft y vigila cambios (ver abajo)
npm run art          # regenera el arte provisional
npm run units        # genera los archivos de las unidades a partir de sus fichas
```

### Instalar en el juego

- **Manual (siempre funciona):** `npm run mcaddon` y abre `dist/packages/bastion.mcaddon` (doble clic). Al crear o editar el mundo, activa el **Behavior pack** y el **Resource pack** de Bastion.
- **Automático:** `npm run local-deploy` usa la ruta de `MINECRAFT_PRODUCT` en `.env` (`BedrockGDK`, `PreviewGDK` o `Custom` con `CUSTOM_DEPLOYMENT_PATH`). Dentro del juego, `/reload` recarga los scripts.
- En el mundo activa **Experimentos → Beta APIs** solo si usas módulos beta; con `2.0.0` estable no hace falta.

## Comandos en el juego

| Comando | Qué hace |
| --- | --- |
| `/scriptevent bastion:menu` | Abre el menú (igual que el reloj) |
| `/scriptevent bastion:start` | Inicia el asedio |
| `/scriptevent bastion:reset` | Reinicia: borra unidades y vuelve a levantar los muros |
| `/scriptevent bastion:pos` | Te dice tus coordenadas, listas para pegar en un mapa |
| `/scriptevent bastion:map <id>` | Cambia el mapa activo (se guarda en el mundo) |
| `/scriptevent bastion:spectate on` / `off` | Modo espectador: el asedio te deja en creativo para mirar, en vez de en supervivencia (se guarda en el mundo) |

## Añadir un mapa (un mundo por mapa)

No hace falta medir nada dentro del juego: las coordenadas se sacan leyendo el mundo desde el disco.

1. Descarga el mapa y descomprímelo en una carpeta del repo (añádela a `.gitignore` si es de terceros).
2. Analízalo con `tools/world-scan.mjs` (ver abajo): suelo, perímetro, puertas, caminos.
3. Copia `scripts/maps/combat-castle.ts` a `scripts/maps/<mi-mapa>.ts` y cambia id, nombre y coordenadas:
   - `gates`: una o varias puertas (`id`, `position`, `objective`, `walls`, `breachSpawns`, `breachTroops`).
   - `walls`: los tramos de muro que cierran el paso (`from`, `to`, `block`: un id sin estados, como `dark_oak_planks`). Se levantan al empezar rellenando **solo el aire** (el terreno del mapa no se toca) y se reponen al reiniciar. El grosor es el lado horizontal más corto: hazlo de varios bloques para que cueste más abrirlo. La puerta se abre cuando **cualquier** tramo tiene un hueco de al menos 2 de alto y todo el grosor; para varias capas, haz un solo tramo más grueso. Solo se rompen los bloques del material indicado.
   - `objective`: dónde está la meta invisible, **detrás del muro** y en suelo libre. Los invasores la buscan y los magos apuntan a ella, así que ponla de forma que el muro quede entre ellos y ella.
   - `position`: punto de referencia **fuera del muro** (se usa para comprobar que el mundo es el del mapa y que el terreno está cargado).
   - `playerSpawns`, `allies`: dentro del castillo, sobre suelo libre.
   - `invaderSpawns`: **fuera**, a menos de ~70 bloques de la puerta (el alcance de la IA de los invasores es 80).
   - `breachSpawns`: dentro, para las tropas de la brecha.
   - `defensePosts` (opcional, hasta 12): puestos que ocupan los aliados con la orden de retirada. `kind` es `front` (cortar el paso, cuerpo a cuerpo), `side` (cubrir, cualquiera) o `high` (en alto, quien dispara); `capacity` cambia las plazas (por defecto 3, 2 y 2). Ponlos en suelo al que se llegue a pie desde el patio.
   - `rallyPoints`: el patio, donde espera quien no encuentra puesto libre.
   - `retiredWalls` (opcional): muros de versiones anteriores del mapa, que siguen en los mundos ya jugados; se quitan al empezar (solo los bloques de su material). Para los bloqueos invisibles, `block: "barrier"`.
   - `returnRoutes` (opcional, hasta 4): orillas de salida y sus hitos para quien cae al agua (ver `tools/shores.mjs` abajo).
   - `waves`: oleadas (qué unidades, cuántas, tandas e intervalo en ticks; 20 ticks = 1 s).
4. Regístralo en `scripts/maps/index.ts` (`MAPS`). El primero es el que se usa por defecto.
5. `npm test` valida todos los mapas registrados. `npm run mcaddon` y vuelve a instalar.
6. Para importarlo al juego, empaqueta el mundo como `.mcworld` (zip con `level.dat` y `db/` en la raíz, sin carpeta intermedia ni prefijo `./`) y déjalo en `worlds/`. Ojo: `npm run mcaddon` borra `dist/`, por eso los mundos no viven ahí.

### Leer un mundo sin abrir el juego

```bash
node tools/world-scan.mjs <carpeta-del-mundo> summary                 # rango, nivel del suelo, caja de lo construido
node tools/world-scan.mjs <carpeta-del-mundo> map x0 z0 x1 z1 [paso]  # vista cenital en ASCII
node tools/world-scan.mjs <carpeta-del-mundo> find "door|gate"        # busca bloques por nombre
node tools/world-scan.mjs <carpeta-del-mundo> slice <y> x0 z0 x1 z1   # un corte horizontal
```

Para las rutas de regreso de quien cae al agua (`returnRoutes`), `tools/shores.mjs` busca las orillas de un lago y dice desde cuáles se llega a pie a un punto:

```bash
node tools/shores.mjs <carpeta-del-mundo> x0 z0 x1 z1 <meta x y z>     # orillas y su ruta a la meta
node tools/shores.mjs <carpeta-del-mundo> route <x y z> <meta x y z>  # hitos de la ruta desde una orilla
```

Las coordenadas son las de Minecraft (norte = Z negativo). `tools/bedrock-world.mjs` es el lector (LevelDB + subchunks, sin dependencias, solo lectura) y se puede importar desde otros scripts. Solo lee el Overworld y la primera capa de bloques.

### Probar sin abrir el juego (servidor oficial)

`tools/bds.mjs` ejecuta el addon en el Bedrock Dedicated Server oficial y deja ver el log de scripts, para comprobar cambios sin tablet. Hace falta descargar el servidor (EULA de Mojang) y apuntar `BDS_DIR` a su carpeta (por defecto `../../BedrockServer/server`).

```bash
node tools/bds.mjs setup <carpeta-del-mundo>     # una vez: copia el mundo y configura el servidor
npm run mcaddon && node tools/bds.mjs sync       # tras cada build: instala los packs en el servidor
node tools/bds.mjs run "wait 3" "scriptevent bastion:start" "wait 25" "testfor @e[type=bastion:invader_wizard]" "kill @e[type=bastion:invader_wizard]" "wait 5" "testfor @e[type=bastion:invader_soldier]"
```

Para probar con la tablet en la misma Wi-Fi: `node tools/bds.mjs serve` deja el servidor encendido (puerto 19132, solo red local; no lo expongas a Internet). Las órdenes se escriben en `<BDS_DIR>/../cmd.txt` (`stop` lo apaga) y hay que hacerse operador (`op <nombre>`) para usar `/scriptevent`. `serve` activa el modo espectador al arrancar: quien entra a mirar se queda en creativo (`scriptevent bastion:spectate off` para jugar).

`run` arranca el servidor, ejecuta los pasos (`wait N` espera N segundos; lo demás son comandos de consola) y lo apaga. El log queda en `<BDS_DIR>/../last-run.log`; las líneas `[Scripting]` son las del addon. Cada cambio de fase de la partida (`fase wave#1 -> intermission#1 ...`) queda registrado ahí, así se sigue una partida entera sin jugador. Las entidades persisten en el mundo de pruebas: repite `setup` para empezar de cero. No sirve para ver modelos, texturas ni animaciones.

## Estructura

```
scripts/
  main.ts                 arranque y eventos de Minecraft
  constants.ts            ids y familias compartidos con los JSON
  strings.ts              todos los textos visibles
  game/siegeState.ts      máquina de estados PURA (sin Minecraft)
  game/siegeManager.ts    aplica el estado al mundo (HUD, brecha, victoria)
  systems/wavePlan.ts     reparto de oleadas PURO
  systems/waveSpawner.ts  apariciones programadas
  systems/gate.ts         meta invisible de cada puerta y comprobaciones del terreno
  systems/wall.ts         muros: levantarlos, morder bloques, detectar el hueco
  systems/wallLogic.ts    lógica PURA de los muros (mordisco, hueco, porcentaje)
  systems/loadout.ts      equipo inicial
  maps/                   un archivo por mapa (combat-castle, old-fallen-castle) + validación
  systems/allies.ts       pasa a los aliados de merodear a atacar
  systems/hunt.ts         la caza: invasores que se abren camino hasta el enemigo vivo más cercano
  systems/huntLogic.ts    lógica PURA de la caza
  systems/routeLogic.ts   planificador de rutas PURO
  units/catalog.ts        fichas de las unidades (las lee el generador)
  ui/menus.ts             formularios
tests/                    pruebas de la lógica pura
behavior_packs/bastion/   entidades (comportamiento)
resource_packs/bastion/   modelos, texturas, animaciones, textos
tools/                    arte provisional y lectores de mundos (bedrock-world, world-scan)
tools/units/              generador de unidades: de cada ficha, sus archivos de los packs
tools/lab/                pruebas de IA, fuera del pack: laboratorio y batalla de referencia
worlds/                   mundos empaquetados (.mcworld), fuera de dist/
```

La lógica que no depende de Minecraft está separada para poder probarla con `npm test`.

## Añadir una unidad

Cada unidad es una **ficha** en `scripts/units/catalog.ts`: bando, rol, vida, daño, velocidad, arma, skins y nombres. El generador (`tools/units/`) crea con ella sus archivos del juego, así que **no se editan a mano**:

- `behavior_packs/bastion/entities/<unidad>.json` y `loot_tables/entities/<unidad>_gear.json` (su arma).
- `resource_packs/bastion/entity/<unidad>.entity.json`, su render controller en `render_controllers/units.render_controllers.json` y sus nombres en `texts/*.lang`.

1. Añade la ficha y su id a `UnitId`.
2. Pon sus skins 64x64 (brazos anchos) en `resource_packs/bastion/textures/entity/<skin>.png` y anota en `docs/SKINS.md` de dónde sale cada una. Al aparecer, la unidad toma una al azar (`minecraft:variant`).
3. `npm run units` (también lo hace `npm run build`). `npm test` avisa si los archivos quedaron viejos.

El **bando** decide a quién ataca, de qué daño se libra y qué órdenes obedece. El **rol** decide cómo pelea: cuerpo a cuerpo (`melee`), proyectiles mágicos (`caster`) o flechas (`archer`, con `ranged` en la ficha: ritmo y alcance; el daño de la flecha está en su entidad, `ally_arrow.json` o `invader_arrow.json`). Cada combinación está en `tools/units/roles.ts`. Lo común a todas (regreso a pie, peleas en el agua, cada cuánto buscan enemigo) está una sola vez en `tools/units/behavior.ts`.

## Órdenes a los aliados

El equipo inicial trae dos objetos. Se usan como el reloj y funcionan durante el asedio:

- **Pluma, «Orden: retirada»:** cada aliado corre a un puesto de defensa del castillo (`defensePosts`): los de cuerpo a cuerpo al frente o a los lados, los que disparan arriba. Al llegar lo defiende y, si se aleja más de 16 bloques persiguiendo a alguien, vuelve. Quien no encuentra puesto libre espera en el patio.
- **Vara de blaze, «Orden: al ataque»:** salen a por el invasor vivo más cercano, esté donde esté. Es solo contra los invasores: cuando muere el último (y no queda ninguno por salir), vuelven solos al castillo, a los puestos de defensa (o a los suyos, si el mapa no tiene).

Con comandos: `/scriptevent bastion:order retreat` o `sortie`. Para pruebas a gran escala, `/scriptevent bastion:reserve <mínimo> <reserva> <tanda>` cambia los refuerzos de la partida en curso.

## Qué falta (decisiones y trabajo pendiente)

- **Pruebas:** la lógica pasa `npm test` y el flujo se comprueba en BDS. Falta revisar a mano en el juego el aspecto de las skins y las oleadas completas con magos.
- **Skins:** de la comunidad de The Skindex, varias por unidad (`docs/SKINS.md`), sobre `geometry.bastion.humanoid`. No traen licencia de reutilización: antes de publicar hay que pedir permiso a sus autores. Los originales están en `assets/skins/`, que está en `.gitignore`.
- **Stonehill Castle** (`stonehill-castle`, el del rush): una sola entrada a pie, la puerta este, a la que se sube por un camino empedrado desde el valle. Sin zona de asedio: nadie cava alrededor del muro. Los invasores suben por una ruta de hitos marcada en el camino empedrado. Desde dentro se puede salir saltando por algunas almenas, pero no volver a entrar. Los pirómanos y arqueros aliados van en lo alto de la torre de la esquina y al final del pasaje: desde el paso de ronda no ven la subida. Dos guerreros aguantan la brecha, pegados al muro por dentro.
- **Old Fallen Castle:** solo hay un frente: el puente, que acaba en la entrada este del castillo, cerrada por el muro. Los demás accesos (agua, aire) quedan para futuras unidades.
- **No incluido aún:** civiles que huyen, unidades aéreas, arietes, modelos y armaduras propios.
- **Muros (etapa 1):** el mago dispara `arcane_bolt`, una copia de la bola de fuego del Ghast (la explosión no rompe piedra, sí madera, y deja fuego), y un guion rompe además los bloques del muro donde choca. No hay reparación entre oleadas (el muro roto sigue roto hasta reiniciar). Como un mob solo dispara a lo que ve, hasta la brecha los magos apuntan a un marcador invisible (`aim_point`) que salta entre los bloques visibles del muro.
- **Siguientes etapas:** 2) los soldados esperan a que el muro caiga y entonces avanzan; 3) varias capas y más unidades (picos, espadas, arcos, arietes de asedio); reparar el muro en el descanso.
- **Aliados:** merodean cerca de su punto de aparición (grupo `bastion:patrol`) y atacan a los invasores cercanos que puedan alcanzar; tras la brecha se les lanza el evento `bastion:fight` y los buscan desde más lejos. Los monstruos del juego (todos: zombis, creepers, endermen, brujas...) también son enemigos, pero siempre después de los invasores, y solo si están dentro del castillo, acaban de atacar a un jugador o los tienen a menos de 6 bloques. La zona del castillo sale de los puntos del mapa (aliados, puestos, patio, metas) y la marca `scripts/systems/intruders.ts`.
- **Caídas al agua:** quien cae sube a una balsa (`bastion:raft`) que le lleva a la orilla más cercana de `returnRoutes`; allí baja y sube a pie por sus hitos, peleando por el camino. Si no hay balsa para él (16 a la vez como mucho, y no otra en 10 s tras bajar), nada, y si nadando no avanza recibe un empujón hacia la orilla. Quien queda varado en una repisa junto al agua (12 s quieto, sin enemigos cerca) pasa también al regreso y, si no se mueve, recibe un empujón hacia el agua. Nunca se teletransporta. Solo se apunta a quien nada si uno también está en el agua.
- **Roadmap:** el plan por fases y dónde nos quedamos está en [docs/ROADMAP.md](docs/ROADMAP.md).
- **Animaciones:** se usa el control `look_at_target` de Mojang; caminar y atacar son animaciones propias simples (`animations/bastion.animation.json`).
- **Mapas de terceros:** respeta la licencia del autor; no se incluyen en este repositorio.
