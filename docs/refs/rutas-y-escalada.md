# Rutas y escalada

Buscado el 2026-11-07, tras la prueba de escaleras de mano (ver [IA.md](../IA.md), «Prueba de escaleras de mano»). Limbers pidió guardarlo para la Fase 4.

**Fiabilidad.** Lo de Microsoft Learn es documentación oficial. jaylydev.github.io es un espejo de la documentación de la API de scripts, hecho por la comunidad. Bedrock Wiki la mantiene la comunidad y suele ser fiable. Los blogs y foros son orientativos: se contradicen a menudo.

## 1. Trepar en Bedrock

### Lo que dicen las fuentes

- **`minecraft:can_climb`** es una capacidad, no un buscador de caminos: «permite a la entidad subir escaleras de mano». Con ella la criatura trepa cuando ya está contra la escalera, pero el buscador de caminos no la tiene en cuenta. [Entity Movement, Bedrock Wiki](https://wiki.bedrock.dev:443/entities/entity-movement)
- **`minecraft:navigation.walk`** genera caminos andando y saltando un bloque, como los mobs normales. Entre sus opciones (`can_jump`, `can_open_doors`, `can_pass_doors`, `can_path_from_air`, `blocks_to_avoid`, `avoid_water`...) no hay ninguna para las escaleras de mano. [navigation.walk, Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_navigation.walk) · [EntityNavigationWalkComponent](https://jaylydev.github.io/scriptapi-docs/latest/classes/_minecraft_server.EntityNavigationWalkComponent.html)
- **`minecraft:navigation.climb`** «permite generar caminos que incluyen paredes verticales, como las arañas». Es otro buscador de caminos, no una opción del de andar. [EntityNavigationClimbComponent](https://jaylydev.github.io/scriptapi-docs/latest/classes/_minecraft_server.EntityNavigationClimbComponent.html)
- **`minecraft:navigation.generic`**: un solo buscador de caminos para andar, nadar, volar o trepar. [navigation.generic, Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_navigation.generic)
- **Error abierto en Mojang (MCPE-140575):** `can_climb` debería permitir a los mobs subir escaleras de mano y no lo hace bien. Hay otro, «Ladders break monster pathfinding», marcado como duplicado. [MCPE-140575](https://bugs.mojang.com/browse/MCPE-140575)
- **Blogs (orientativo):** los mobs trepan una escalera si los empujan contra ella, pero no la usan a propósito para llegar a un sitio. Algunos dicen que los zombis sí trepan a propósito y otros que solo dan vueltas. [Sportskeeda](https://sportskeeda.com/minecraft/can-mobs-climb-ladders-minecraft)
- **Bloques trepables propios:** no hay un componente de bloque que haga trepable un bloque custom. Los addons que lo consiguen, como Climbable Chains, lo hacen con scripts. En el sitio de sugerencias de Minecraft se pide como función nueva. [Componentes de bloque, Microsoft Learn](https://docs.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponentslist) · [Climbable Chains](https://mcpedl.com/climbable-chains-addon/) · [Sugerencia «Add climbing»](https://feedback.minecraft.net/hc/en-us/community/posts/34676905067917-Add-climbing)

### Lo que vale para Bastion

- Coincide con la prueba del laboratorio: no entran solas en la escalera; si se las mete, bajan; subir no suben.
- Un bloque de escalera propio no resolvería nada: habría que moverlas con el script igual.
- **Modo araña** (`navigation.climb`): sería la única forma de que una criatura suba sola. Como trepa cualquier pared, encaja mejor en una **unidad nueva que trepe muros** (un monstruo) que en los soldados (Limbers, 2026-11-07).

## 2. Rutas eficientes para muchas unidades en mapas grandes

### Bedrock

- **No hay buscador de caminos en la API de scripts.** Lo que hay que calcular, se calcula a mano.
- **`system.runJob`** reparte un trabajo largo entre ticks con un generador: se para al acercarse al límite del tick y sigue en el siguiente. La guía pide pasos pequeños (en su ejemplo, un bloque por paso). Sirve para lo que no tiene que acabar en un tick concreto. [Guía de system.run, Microsoft Learn](https://learn.microsoft.com/minecraft/creator/documents/scripting/system-run-guide)
- **Vigilante de scripts:** avisa de un script lento a partir de 2 ms por tick (valor por defecto). [Script Watchdog, Bedrock Wiki](https://wiki.bedrock.dev/scripting/script-watchdog)
- Bedrock usa su propia versión de JavaScript, basada en QuickJS. La API cambia a menudo. [Entorno de la API, Bedrock Wiki](https://wiki.bedrock.dev/scripting/api-environment)
- **No se encontró:**
  - mediciones de cuánto cuesta `getBlock`; las nuestras están en [IA.md](../IA.md), «Coste de calcular rutas»;
  - ningún buscador de caminos de la comunidad para los scripts de Bedrock. Los que hay son para Java ([MC-AStar](https://github.com/Flopticode/MC-AStar)), Minescript ([AShortPath](https://github.com/BitMap7487/AShortPath), que usa Theta* y avisa de que el coste crece con el radio y los obstáculos) o bots externos ([mineflayer for bedrock](https://github.com/torzodmc/mineflayer-for-bedrock)).

### Juegos de estrategia en general

- **Búsqueda por niveles (HPA\*, Botea, Müller y Schaeffer, 2004).**
  - Cómo funciona: divide el mapa en zonas, guarda de antemano cuánto cuesta cruzar cada una entre sus entradas y busca primero entre zonas y luego dentro de cada una. Admite más de dos niveles.
  - Resultado del artículo: hasta 10 veces más rápido que una búsqueda normal (A\*) muy optimizada, con rutas a menos del 1 % de la mejor.
  - Pega, según otro estudio: en rutas cortas o en línea recta, la búsqueda normal es mejor.
  - [Artículo HPA\*](https://webdocs.cs.ualberta.ca/%7emmueller/ps/hpastar.pdf) · [Ficha del artículo](https://papersdb.cs.ualberta.ca/~papersdb/view_publication.php?pub_id=585) · [Implementación de ejemplo](https://github.com/hugoscurti/hierarchical-pathfinding) · [Comparación con la búsqueda normal](https://eprints.hud.ac.uk/6885/1/26_M_Naveed.pdf)
- **Campos de flujo.**
  - Cómo funcionan: en vez de una ruta por unidad, se calcula una vez, para todo el mapa, hacia dónde ir desde cada casilla hasta un destino. Mover 100 unidades cuesta lo mismo que mover una.
  - Pegas: hace falta un campo por cada destino distinto, y la memoria pesa. Un aficionado midió unos 11 MB por campo en una prueba de 31x31, aunque depende mucho de cómo se guarde.
  - Supreme Commander 2: unos dicen que usa campos de flujo; un análisis de 2012 dice que es A\* hacia atrás, compartido entre unidades, más esquivar obstáculos de cerca. Otro mensaje describe una mezcla: zonas para la ruta general y campos de flujo de cerca.
  - La referencia que más citan es el capítulo de Game AI Pro sobre multitudes con campos de flujo por baldosas.
  - [Foro GameDev.net](https://gamedev.net/forums/topic/701267-flow-field-architecture-advice) · [Supreme Commander 2, Wildfire Games](https://wildfiregames.com/forum/topic/16018-supreme-commander-2-pathfinding/) · [StarCraft 2, GameDev.net](https://www.gamedev.net/forums/topic/563819-whats-starcraft2s-pathfinding-tech/) · [Cientos de unidades, foro de A\* Pathfinding Project](https://forum.arongranberg.com/t/moving-hundreds-of-units-effectively/459)
- **No se encontró nada específico para mundos de bloques en 3D**, donde las zonas y lo vertical (escaleras, caídas, saltos) se manejan distinto que en un mapa plano.

### Cómo encajaría en Bastion (por decidir en la Fase 4)

- **Hoy:**
  - las rutas de subida son hitos puestos a mano en cada mapa, una versión manual de la búsqueda por niveles;
  - la búsqueda (`routeLogic.ts`) va repartida con `runJob`, es una a la vez y mira como mucho 12.000 casillas.
- **Búsqueda por niveles:** con «lugares» (aldeas, torres, castillo) cada lugar podría ser una zona, y los caminos entre lugares se calcularían una vez al cargar el mapa o por adelantado con `tools/bedrock-world.mjs` (la idea sin probar de «Mapas nuevos» en IA.md).
- **Campos de flujo:** encajan con la oleada (muchos invasores hacia una misma meta) y con la retirada a un lugar amigo (todos hacia el mismo sitio). Habría que medir la memoria y el coste de calcularlos en la tablet.
