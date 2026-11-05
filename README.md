# Bastion

Addon de **invasión y defensa** para Minecraft Bedrock. Un castillo, fortaleza o villa amurallada es asediado por oleadas de enemigos. Combates en primera persona junto a aliados con IA. No hay crafteo ni supervivencia: el equipo se entrega al empezar.

Estado: **v0.1.24 (etapa 1 de los muros rompibles), probado en el servidor oficial (BDS)**; mapas: The Combat Castle y Old Fallen Castle (ver «Qué falta»).

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

Las coordenadas son las de Minecraft (norte = Z negativo). `tools/bedrock-world.mjs` es el lector (LevelDB + subchunks, sin dependencias, solo lectura) y se puede importar desde otros scripts. Solo lee el Overworld y la primera capa de bloques.

### Probar sin abrir el juego (servidor oficial)

`tools/bds.mjs` ejecuta el addon en el Bedrock Dedicated Server oficial y deja ver el log de scripts, para comprobar cambios sin tablet. Hace falta descargar el servidor (EULA de Mojang) y apuntar `BDS_DIR` a su carpeta (por defecto `../../BedrockServer/server`).

```bash
node tools/bds.mjs setup <carpeta-del-mundo>     # una vez: copia el mundo y configura el servidor
npm run mcaddon && node tools/bds.mjs sync       # tras cada build: instala los packs en el servidor
node tools/bds.mjs run "wait 3" "scriptevent bastion:start" "wait 25" "testfor @e[type=bastion:invader_wizard]" "kill @e[type=bastion:invader_wizard]" "wait 5" "testfor @e[type=bastion:invader_soldier]"
```

Para probar con la tablet en la misma Wi-Fi: `node tools/bds.mjs serve` deja el servidor encendido (puerto 19132, solo red local; no lo expongas a Internet). Las órdenes se escriben en `<BDS_DIR>/../cmd.txt` (`stop` lo apaga) y hay que hacerse operador (`op <nombre>`) para usar `/scriptevent`.

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
  units/catalog.ts        catálogo de unidades
  ui/menus.ts             formularios
tests/                    pruebas de la lógica pura
behavior_packs/bastion/   entidades (comportamiento)
resource_packs/bastion/   modelos, texturas, animaciones, textos
tools/                    arte provisional y lectores de mundos (bedrock-world, world-scan)
tools/lab/                pruebas de IA, fuera del pack: laboratorio y batalla de referencia
worlds/                   mundos empaquetados (.mcworld), fuera de dist/
```

La lógica que no depende de Minecraft está separada para poder probarla con `npm test`.

## Añadir una unidad

1. Crea `behavior_packs/bastion/entities/<unidad>.json` (copia un soldado y cambia familia, vida, daño).
2. Crea `resource_packs/bastion/entity/<unidad>.entity.json` y su textura 64x64 en `textures/entity/`.
3. Añade la entrada en `scripts/units/catalog.ts` y su nombre en `texts/*.lang`.

## Órdenes a los aliados

El equipo inicial trae dos objetos. Se usan como el reloj y funcionan durante el asedio:

- **Pluma, «Orden: retirada»:** los aliados corren al punto de reunión del castillo y lo defienden al llegar.
- **Vara de blaze, «Orden: al ataque»:** salen a buscar a los invasores que puedan alcanzar; si no hay ninguno, esperan junto a la puerta.

Con comandos: `/scriptevent bastion:order retreat` o `sortie`. Para pruebas a gran escala, `/scriptevent bastion:reserve <mínimo> <reserva> <tanda>` cambia los refuerzos de la partida en curso.

## Qué falta (decisiones y trabajo pendiente)

- **Pruebas:** la lógica pasa `npm test` y el flujo se comprueba en BDS. Falta revisar a mano en el juego el aspecto de las skins y las oleadas completas con magos.
- **Skins:** `resource_packs/bastion/textures/entity/` usa skins de `assets/skins/warriors/` (64x64, brazos clásicos, con capas), sobre `geometry.bastion.humanoid`. Su autor y licencia no están confirmados; `assets/skins/` está en `.gitignore`.
- **Old Fallen Castle:** solo hay un frente (el puente); los demás accesos (agua, aire) quedan para futuras unidades.
- **No incluido aún:** civiles que huyen, rangers y piromantes, unidades aéreas, arietes, armas visibles en las manos, skins definitivas (el arte actual es provisional).
- **Muros (etapa 1):** el mago dispara `arcane_bolt`, una copia de la bola de fuego del Ghast (la explosión no rompe piedra, sí madera, y deja fuego), y un guion rompe además los bloques del muro donde choca. No hay reparación entre oleadas (el muro roto sigue roto hasta reiniciar). Como un mob solo dispara a lo que ve, hasta la brecha los magos apuntan a un marcador invisible (`aim_point`) que salta entre los bloques visibles del muro.
- **Siguientes etapas:** 2) los soldados esperan a que el muro caiga y entonces avanzan; 3) varias capas y más unidades (picos, espadas, arcos, arietes de asedio); reparar el muro en el descanso.
- **Aliados:** merodean cerca de su punto de aparición (grupo `bastion:patrol`) y atacan a los invasores cercanos que puedan alcanzar; tras la brecha se les lanza el evento `bastion:fight` y los buscan desde más lejos.
- **Caídas al agua:** quien cae regresa a pie por los hitos de `returnPath` y pelea por el camino; nunca se teletransporta. Solo se apunta a quien nada si uno también está en el agua.
- **Roadmap:** el plan por fases y dónde nos quedamos está en [docs/ROADMAP.md](docs/ROADMAP.md).
- **Animaciones:** se usa el control `look_at_target` de Mojang; caminar y atacar son animaciones propias simples (`animations/bastion.animation.json`).
- **Mapas de terceros:** respeta la licencia del autor; no se incluyen en este repositorio.
