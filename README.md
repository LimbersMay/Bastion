# Bastion

Addon de **invasión y defensa** para Minecraft Bedrock. Un castillo, fortaleza o villa amurallada es asediado por oleadas de enemigos. Combates en primera persona junto a aliados con IA. No hay crafteo ni supervivencia: el equipo se entrega al empezar.

Estado: **v0.1.10, probado en el servidor oficial (BDS) y en tablet**; mapas: The Combat Castle y Old Fallen Castle (ver «Qué falta»).

## Cómo funciona una partida

1. Entras al mundo y usas el **reloj** (o `/scriptevent bastion:menu`) → *Iniciar asedio*.
2. Se coloca la **puerta principal** (entidad con barra de vida de jefe), se crean los aliados, se entrega el equipo y se te lleva al punto de inicio.
3. Cuenta atrás → **oleada 1**. Los invasores salen de los puntos exteriores y atacan a aliados, jugadores y puerta.
4. Si la puerta cae → **BRECHA**: explosión, alarma y tropas enemigas aparecen dentro.
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
| `/scriptevent bastion:reset` | Reinicia: borra unidades y puerta |
| `/scriptevent bastion:pos` | Te dice tus coordenadas, listas para pegar en un mapa |
| `/scriptevent bastion:map <id>` | Cambia el mapa activo (se guarda en el mundo) |

## Añadir un mapa (un mundo por mapa)

No hace falta medir nada dentro del juego: las coordenadas se sacan leyendo el mundo desde el disco.

1. Descarga el mapa y descomprímelo en una carpeta del repo (añádela a `.gitignore` si es de terceros).
2. Analízalo con `tools/world-scan.mjs` (ver abajo): suelo, perímetro, puertas, caminos.
3. Copia `scripts/maps/combat-castle.ts` a `scripts/maps/<mi-mapa>.ts` y cambia id, nombre y coordenadas:
   - `gates`: una o varias puertas (`id`, `position`, `health`, `barriers`, `breachSpawns`, `breachTroops`). La entidad aparece en `position`; tiene que estar **fuera y alcanzable**: si queda en un hueco cerrado, los invasores se amontonan en la muralla sin poder atacarla.
   - `health` (por puerta): solo 150, 300, 600, 1200 o 2400 (el motor no deja cambiar la vida máxima desde script, así que `gate_core.json` tiene un evento por nivel). Por defecto 300.
   - `barriers`: (opcional) los bloques que cierran el paso, como compuertas de madera; se cierran al empezar y desaparecen con la brecha. Se sacan con `world-scan.mjs slice`.
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
node tools/bds.mjs run "wait 3" "scriptevent bastion:start" "wait 25" "testfor @e[type=bastion:gate_core]" "kill @e[type=bastion:gate_core]" "wait 5" "testfor @e[type=bastion:invader_soldier]"
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
  systems/gate.ts         puerta (entidad con barra de jefe)
  systems/loadout.ts      equipo inicial
  maps/                   un archivo por mapa (combat-castle, old-fallen-castle) + validación
  systems/allies.ts       pasa a los aliados de merodear a atacar
  units/catalog.ts        catálogo de unidades
  ui/menus.ts             formularios
tests/                    pruebas de la lógica pura
behavior_packs/bastion/   entidades (comportamiento)
resource_packs/bastion/   modelos, texturas, animaciones, textos
tools/                    arte provisional y lectores de mundos (bedrock-world, world-scan)
worlds/                   mundos empaquetados (.mcworld), fuera de dist/
```

La lógica que no depende de Minecraft está separada para poder probarla con `npm test`.

## Añadir una unidad

1. Crea `behavior_packs/bastion/entities/<unidad>.json` (copia un soldado y cambia familia, vida, daño).
2. Crea `resource_packs/bastion/entity/<unidad>.entity.json` y su textura 64x64 en `textures/entity/`.
3. Añade la entrada en `scripts/units/catalog.ts` y su nombre en `texts/*.lang`.

## Qué falta (decisiones y trabajo pendiente)

- **Pruebas:** la lógica pasa `npm test` y el flujo (inicio, puerta, brecha, aliados) se comprobó en BDS. Falta revisar a mano en el juego el aspecto de las skins y las oleadas 2 y 3 completas.
- **Skins:** `resource_packs/bastion/textures/entity/` usa skins de `assets/skins/warriors/` (64x64, brazos clásicos, con capas), sobre `geometry.bastion.humanoid`. Su autor y licencia no están confirmados; `assets/skins/` está en `.gitignore`.
- **Old Fallen Castle:** solo hay un frente (el puente); los demás accesos (agua, aire) quedan para futuras unidades.
- **No incluido aún:** civiles que huyen, rangers y piromantes, unidades aéreas, arietes, armas visibles en las manos, skins y modelo de puerta definitivos (el arte actual es provisional).
- **Vida de la puerta:** se define por mapa y puerta (`health`, niveles 150/300/600/1200/2400). Para añadir un nivel hay que añadirlo en `GATE_HEALTH_TIERS` y en `gate_core.json`; `npm test` comprueba que coinciden.
- **Aliados:** merodean cerca de su punto de aparición (grupo `bastion:patrol`) y no atacan hasta la brecha; entonces se les lanza el evento `bastion:fight` y buscan a los invasores.
- **Barra de jefe:** puede no reaparecer al salir y volver a entrar en su rango (problema conocido con rangos mayores de 55), y el oscurecimiento del cielo no funciona en addons.
- **Animaciones:** se usa el control `look_at_target` de Mojang; caminar y atacar son animaciones propias simples (`animations/bastion.animation.json`).
- **Mapas de terceros:** respeta la licencia del autor; no se incluyen en este repositorio.
