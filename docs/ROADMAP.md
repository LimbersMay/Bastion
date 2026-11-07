# Roadmap de Bastion

**Empieza aquí en cada sesión.** Dice en qué fase vamos, dónde nos quedamos y qué sigue.
Al terminar una sesión, actualiza «Dónde nos quedamos» y marca lo que quedó hecho.

Cómo funciona el juego y cómo probarlo: [README](../README.md).

## Dónde nos quedamos

*Última actualización: 2026-11-07. Versión de los packs: 0.1.55 (última de Bedrock salvo que Limbers pida más). Rama: `feature/old-fallen-castle`, sin subir. La Fase 2 está commiteada (8a6bb88); lo de la Fase 3 (v0.1.44-0.1.45), aún no: Limbers pidió commitear solo al cerrar la fase.*

- **Fase actual:** Fase 3, combate orgánico. Orden elegido por Limbers (2026-11-06): variación, grupos contra la bolita, moral y cuerno de rescate. El cuerno va al final para aprovechar los grupos.
- **Variación entre unidades (v0.1.44), elegida por Limbers:** cada unidad nace con un ±10 % de vida y cada golpe varía otro ±10 % (`VARIATION` en `tools/units/generate.ts`). Las cifras pequeñas (golpes de 2 o 3) quedan fijas. La vida no lleva máximo fijo: el juego toma lo que sale y el descanso cura hasta ahí. Medido en el servidor: soldados aliados con 55 a 65 de vida y guerreros con 73 a 84; golpes de 9 a 11 (soldado aliado), 8 a 10 (invasor) y 12,5 a 13,5 (guerrero). Las flechas y los proyectiles no varían. Sin ver en juego.
- **Grupos y reserva (v0.1.45):** el director (`scripts/systems/squads.ts`, lógica en `squadLogic.ts`) junta a quienes pelean cuerpo a cuerpo en grupos de hasta 8 y da a cada grupo un enemigo distinto; avanzan como mucho 1,5 grupos por grupo enemigo y el resto espera 30 s como mucho. Medido en campo abierto (`tools/lab/field.ts`, resultados en [IA.md](IA.md), «Grupos en campo abierto»): repartir objetivos no deshace la bolita; la reserva sí la reduce. `scriptevent bastion:squads on|off` para comparar.
- **Moral (v0.1.45):** un grupo aliado superado y castigado se repliega al patio y después a la torre (`map.keep`, opcional; Stonehill aún no la tiene). En el descanso vuelven a su sitio. En la partida hubo varios repliegues por oleada, y la mayoría de los que se replegaban morían por el camino (2 de 13 vivos en la oleada 1).
- **Peleas estancadas (v0.1.45), elegidas por Limbers:** Limbers vio dos veces la oleada 2 de Stonehill parada.
  - **Último reducto:** si solo quedan tiradores aliados y pasan 20 s sin bajas, bajan al patio. En la prueba de la v0.1.45 el pirómano de lo alto de la torre de la esquina no bajó (no hay camino a pie desde allí) y los invasores se amontonaron debajo, en el pasaje. Desde la v0.1.46, quien en 10 s no se acerca al patio se lleva allí con una nube de humo (elegido por Limbers, 2026-11-07). **Es provisional: Limbers quiere analizarlo a fondo más adelante para mejorarlo**; su propuesta es que pongan escaleras de mano, por probar (ver [IA.md](IA.md), «Idea pendiente»).
  - **Grupos sin camino:** un grupo que pasa 15 s sin acercarse a su objetivo ni pelear lo deja y no lo vuelve a elegir; el invasor vuelve a la ruta de subida desde el hito más cercano. Causa vista: un grupo invasor perseguía a un arquero de la muralla trepando el acantilado (unos 14 bloques por debajo de la puerta) y el rescate de atascados lo dejaba siempre en el mismo hueco.
  - **Red de seguridad (`stallLogic.ts`):** tras 45 s sin bajas, sin bloques de muro rotos y sin brechas, los invasores que no se han movido 8 bloques en ese tiempo, y no tienen motivo para estar quietos, desaparecen con humo («abandonan el asedio») y la oleada termina. Tras 90 s sin bajas, estar junto a un enemigo ya no cuenta como pelear (v0.1.47: en el acantilado quedaron invasores y aliados en salientes distintos, a 2-5 bloques, sin poder golpearse).
- **Director de inalcanzables (v0.1.52), elegido por Limbers (2026-11-07), sin probar en juego:** cuando un grupo deja a su objetivo, de cualquier bando, el director busca una ruta a pie hasta él y guía al grupo (los invasores rompen dentro de la zona de asedio; los aliados solo caminan, y solo con la orden de ataque). Si nadie llega y la pelea lleva 20 s sin bajas, el inalcanzable baja a pelear (al patio el aliado, a la ruta de subida el invasor) y, sin camino, con humo. El último reducto usa la misma bajada; el abandono a los 45 s queda como red de seguridad. Fuera de este lote: tiradores a un sitio con vista y unidades aéreas. Detalle en [IA.md](IA.md), «el director decide qué hacer con las unidades inalcanzables».
  - **Prueba de escaleras de mano (2026-11-07, hecha, vista en vivo por Limbers):** las criaturas no se meten solas en la escalera, ni guiadas hasta el borde (0 de 5). Si el script las mete en ella (un bloque), **bajan solas** (5 de 5, 3 s); **subir no suben**, salvo que el script las suba a la velocidad de trepar (5 de 5, 6 s). Las fuentes coinciden: el buscador de caminos de andar no usa escaleras, y solo el de las arañas trepa ([refs/rutas-y-escalada.md](refs/rutas-y-escalada.md)). **Decidido por Limbers (2026-11-07):** primero, escaleras solo para bajar; después pidió también subir, aunque sea asistido (hecho en la v0.1.53, abajo). El modo araña, para una futura unidad que trepe muros. Detalle en [IA.md](IA.md), «Prueba de escaleras de mano».
- **Escaleras del director (v0.1.53), pedidas por Limbers (2026-11-07), probadas en el laboratorio y en un asedio (abajo):** el planificador pone escaleras de mano (hasta 24 bloques) para bajar o para subir, encadenadas en terreno irregular; el director mete en ellas a quien va por la ruta y lo sube o lo baja a la velocidad de trepar (`ladders.ts`). Sirve a los grupos guiados del paso 1 (los invasores también por fuera de la muralla, como asalto, elegido por Limbers) y a quien baja en el paso 3 y en el último reducto; el humo queda solo para cuando ni con escaleras hay ruta. En el laboratorio (`tools/lab/climb.ts`), 12 de 12: acantilado irregular con saliente, cornisa y bultos (bajar 3 de 3, 12-21 s; subir 3 de 3, 11-12 s, dos escaleras cada vez) y muralla con almenas (subir y bajar 3 de 3, 2-3 s). Detalle en [IA.md](IA.md), «Escaleras del director».
- **Limbers vio la v0.1.53 en un asedio de Stonehill (2026-11-07), en modo espectador:** los invasores subieron por escaleras a por los arqueros de una torre, cruzaron el puente a la otra y, cuando un arquero cayó al puente, bajaron a por él y volvieron a subir a por el que quedaba. Pero llegaban y golpeaban sin hacer daño, se quedaban arriba al acabar, y las escaleras de la base de la torre caían (el fuego de los pirómanos quemaba el muro de tablones).
- **Arreglos de la v0.1.54, subidos en caliente durante esa prueba:**
  - **Toque al llegar (elegido por Limbers):** quien llega junto a su objetivo recibe de él 1 de daño y así lo ataca de verdad. Antes golpeaba al marcador del grupo, porque el juego no cuenta las escaleras como camino. Ahora el objetivo cae 8-11 s después.
  - **Bajadas por la ruta (Limbers dijo sí):** quien sube por escaleras baja por la ruta al fallar, al morir su objetivo o a los 60 s; y quien baja sigue la ruta paso a paso, en lugar de empujar hacia el hito de abajo.
  - **Escaleras repuestas (Limbers dijo sí):** si una escalera en uso cae y su apoyo sigue en pie, se vuelve a poner. El planificador prefiere apoyarlas en piedra antes que en madera, y no las apoya en losas, trampillas ni otros bloques a medias.
  - **Plazo según la ruta:** de 30 a 120 s según los pasos y las escaleras; antes, 30 s fijos.
  - **Resultado en la oleada 1:** «Atasco» de 2 a 0, «Encajado» de 21 a 1 y 6 bajadas por la ruta (antes 0). Los ticks/s, a 20,0 de media y 19,2 en el peor momento. Lo que falta está en [IA.md](IA.md), «Escaleras del director».
  - **Cómo se probó sin reiniciar el servidor:** [tools/lab/README.md](../tools/lab/README.md), «Pruebas en vivo, sin reiniciar el servidor».
- **Evaluando ahora:** partida completa en Stonehill con la v0.1.47 (el cuerno no cambia nada sin jugador) (`siege_ab.mjs on 6`, sin jugador, sin monstruos del juego, de día). Se mira:
  1. que la oleada 2 termine en vez de quedarse parada;
  2. si salen las líneas «Sin camino», «Último reducto» y «Atasco» del registro, y cuántas veces;
  3. la duración y las bajas de cada oleada, comparadas con la partida sin director (oleada 1: 131 s; la oleada 2 se paró con aliados en la torre).
- **Prueba de la v0.1.47 (cortada para pasar el servidor a la v0.1.48):** la oleada 1 terminó en 159 s, con un grupo aliado y uno invasor que dejaron su objetivo; la oleada 2 llevaba 3 min en marcha. Falta una partida completa.
- **Cuerno de rescate (v0.1.48), valores por defecto de Claude, sin probar en juego:** si un jugador en supervivencia tiene 3 o más invasores a 5 bloques, suena el cuerno de cabra y los 6 aliados cuerpo a cuerpo más cercanos (a 40 bloques, sin contar regresando ni replegados) pasan a la orden de ataque, fuera de los grupos del director. Vuelven a su orden cuando el jugador no tiene invasores a 8 bloques o a los 30 s; un cuerno cada 30 s por jugador (`RESCUE_DEFAULTS` en `scripts/systems/rescueLogic.ts`). En el servidor no se puede probar: hace falta un jugador en supervivencia (`scriptevent bastion:spectate off`).
- **Limbers probó la v0.1.48:** los invasores no le atacaban porque el servidor le tenía en creativo (el modo espectador de `serve`), y sin ser operador no podía cambiarlo con comandos.
- **Cuerno en la mano y brújula de modo (v0.1.49), pedidos por Limbers:** el equipo trae un cuerno de cabra («Cuerno de rescate»): al tocarlo acude un grupo, los 8 aliados cuerpo a cuerpo más cercanos estén donde estén, 45 s como mucho, una vez por minuto (`HORN_RESCUE`). Limbers eligió un grupo y no a todos, para no vaciar la defensa. Y una brújula («Modo: jugar o mirar») que cambia entre supervivencia y creativo sin comandos ni permisos. El cuerno automático sigue igual. Quien ya tenía el equipo los recibe al empezar el siguiente asedio.
- **Limbers probó la v0.1.49:** el chat decía «8 aliados acuden», pero nadie llegaba. Causa: el cuerno les daba la orden de ataque general, que va a por el invasor más cercano *a cada aliado* (a 24 bloques), no hacia el jugador; y quien no tenía invasores cerca se quedaba quieto. Además sacaba a aliados en plena pelea.
- **Escolta del cuerno (v0.1.50), elegida por Limbers (2026-11-07), sin probar en juego:** el cuerno en la mano trae una **escolta de 4** que se queda con el jugador **hasta el fin de la oleada** y **no obedece las órdenes generales** (pluma, vara, brecha). Tocarlo otra vez (una vez por minuto) la completa si ha perdido a alguien; **agachado, la despide**. Sin nadie libre, el cuerno no se gasta.
  - **De dónde salen** (`rescueTier`): primero la reserva del director, luego los sueltos, luego los grupos que avanzan sin haber llegado al enemigo; nunca quien tiene un invasor a 6 bloques.
  - **Cómo siguen al jugador** (`rescue.ts`): un marcador invisible va con él. Lejos (más de 10 bloques), el escolta va hacia el marcador y solo se para con quien tenga a 6 (modo `bastion:escort`); a 4 bloques o menos pasa a vigilar: pelea con quien se acerque a 10 y pasea a su alrededor (modo `bastion:guard`).
  - **Cuerno automático** (te rodean 3 invasores): sigue siendo un rescate temporal, pero ahora también va hacia el jugador y con la misma preferencia; al quedar libre vuelven a su orden. Antes, al terminar la oleada quedaban en la orden de ataque; ya no.
- **Limbers probó la v0.1.50 en la tablet (2026-11-07): la escolta funciona.** En Stonehill, oleadas 1 y 2: la escolta se formó con 1, 3 y 3 aliados, y una vez se completó con 1 más; nunca llegó a 4 porque había pocos libres (los demás peleaban o la moral los había replegado al patio, que tampoco acuden). Una vez no acudió nadie. La moral replegó grupos 8 veces en dos oleadas. Desde entonces, quien entra al servidor sin la brújula de modo la recibe (antes solo el reloj).
- **Lo que vio Limbers en esa prueba:** las peleas bien, pero los aliados se lanzaban a la pelea aunque fueran 5 contra 40, y salían del castillo de uno en uno en vez de aguantar la posición. En el registro: el grupo de 8 del pasaje se replegó al patio por la moral y, desde entonces, los refuerzos (1 a 3 cada 5 s) salían del patio con la orden de ataque a por el invasor más cercano; se gastaron 19 de 30 en 2 minutos.
- **Postura defensiva (v0.1.51), elegida por Limbers (2026-11-07), sin probar en juego:** el defensor aguanta y deja que el atacante venga a él. Con la orden de ataque (la vara) no cambia nada: decide el jugador.
  - **A. Los refuerzos defienden:** al aparecer corren a un puesto de defensa libre (o al patio) y lo defienden, en vez de salir a atacar (`AllyOrders.deploy`).
  - **B. No salen del castillo:** quien cuerpo a cuerpo pasa al otro lado de una puerta (más cerca del frente que de la meta, a ±6 de su altura y a 48 bloques como mucho) vuelve a un puesto (`stanceLogic.ts`, `isOutside`). Comprobado que en los 4 mapas ningún aliado, puesto, patio, torre ni refuerzo queda «fuera».
  - **C. Miden fuerzas:** quien tiene a 16 bloques el doble de invasores que aliados (y jugadores) a 12 aguanta: solo va a por quien se le acerca a 5 y no sale tras quien le dispara de lejos (a más de 8). Deja de aguantar cuando quedan 1,5 o menos por aliado (`HOLD_LINE_TAG`, `stance.ts`). El registro de grupos dice cuántos aguantan.
  - **D. Refuerzos en grupo:** para la Fase 4.
- **Torre de Stonehill (v0.1.51):** la sala grande al norte del patio (x -330..-316, z 184..192), con la puerta al patio en x -318, z 193; marcador en -325.5, 128, 188.5. Se llega a pie desde el patio en 29 pasos (comprobado con `tools/shores.mjs route` sobre el mundo real).
- **Siguiente paso:** la prueba inicial en `../Bastion-Java` (ver su `docs/PRUEBA-INICIAL.md`). En este repositorio queda pendiente el commit de la Fase 3 (v0.1.44-0.1.55), cuando Limbers dé el OK.
- **Coste de la batalla grande: causa encontrada (2026-11-07, Limbers pidió buscar la causa).** Con unas 400 unidades había caído a 2-4 ticks/s (la v0.1.24 daba 7,5). La causa es `reselect_targets: true` en los buscadores de enemigo: quien ya tiene objetivo revisa en cada tick todas las entradas, y la Fase 3 añadió 16 entradas de grupo a cada buscador. Sin él la batalla va a 19-20 ticks/s, pero las unidades no sueltan su objetivo cuando el script les cambia las etiquetas: en Stonehill los invasores se atascaban en el primer hito. Despertarlas con un grupo vacío no funcionó. **En la v0.1.55 `reselect_targets` vuelve a estar puesto** (todo como antes de la investigación). Detalle en [IA.md](IA.md), «Coste en batallas grandes, otra vez».
- **Migración a Minecraft Java decidida (Limbers, 2026-11-07).** Jugará en Arch Linux y quiere realismo: muros que se pican con animación, escaleras que ponen los propios invasores, barcos de verdad, rutas sin rescates; y más adelante aéreas, acuáticas, arietes y dragones. Bedrock no deja controlar la navegación y obliga a parches. Stack: Fabric + Kotlin + GeckoLib + GameTest + Spark. El proyecto nuevo y su guía están en `../Bastion-Java`; lo primero es una prueba acotada. Este repositorio queda como referencia y no se sigue desarrollando salvo que Limbers lo pida.
- **Anotado para la Fase 4 (Limbers, 2026-11-07):** pasar de «un castillo por mapa» a **lugares** (castillo, aldeas, torres...) con reglas comunes: defender su lugar, aguantar en desventaja y retirarse al lugar amigo más cercano con tropas o a la base principal. Detalle en [IA.md](IA.md), «Primer paso de la Fase 4».

Lo que sigue es el historial de la Fase 2.
- **Fichas (v0.1.25):** cada unidad es una ficha en `scripts/units/catalog.ts` y `npm run units` genera sus archivos. Las 4 unidades salen iguales que antes, comprobado campo por campo. La única diferencia es que el evento de asedio del mago ahora también le quita el modo de asalto. Batalla de referencia sin jugador: 34 aliados y 45 invasores caídos, 146 bloques; antes, 34 y 50, 121 bloques. Mismo resultado.
- **Armas (v0.1.26), sin ver en juego:** espada de hierro (soldado aliado), hacha de hierro (invasor), vara de blaze (pirómano) y vara de breeze (mago). No se sueltan al morir. El arma suma su daño al golpe (medido en el servidor). El generador hace que el golpe sea siempre el de la ficha.
- **Daño completo de las armas (v0.1.27), elegido por Limbers, sin probar en juego:** golpe de 10 el soldado aliado y 9 el invasor, antes 4. Duelos de 6 a 10,5 s, antes 15 a 22,5. Al jugador le pegan 9.
- **Nado al regresar (v0.1.27), sin medir:** mientras regresa del agua, la unidad nada como un ahogado y busca ruta por el agua; en tierra sigue evitándola. El empujón queda como respaldo. Falta la batalla de referencia para compararlo con el empujón solo.
- **Salir del agua (v0.1.26):** Limbers vio invasores atascados en el lago y pidió una solución (un barco no sirve: las criaturas no lo dirigen). Ahora cada mapa tiene varias rutas de regreso y quien cae elige la orilla más cercana. Un hito solo cuenta fuera del agua, y quien nada 3 s sin acercarse recibe un empujón hacia la orilla. Batalla de referencia: 45 caídas y 45 regresos, con 108 empujones; antes, 38 caídas y 35 regresos.
- **Puestos de defensa (v0.1.28), sin ver en juego:** con la retirada, cada aliado va a un puesto del castillo (`defensePosts`): cuerpo a cuerpo al frente o a los lados, quien dispara arriba. Lo defiende y vuelve si se aleja más de 16 bloques. Sin puesto libre, espera en el patio. Old Fallen Castle tiene 9 puestos (2 al frente, 4 a los lados, 3 arriba).
- **Salida sin límite (v0.1.28):** con la orden de ataque van a por el invasor vivo más cercano, esté donde esté (antes, solo hasta 24 bloques).
- **Balsas (v0.1.28), elegidas por Limbers:** quien cae al agua sube a una balsa que el guion lleva en línea recta a la orilla de su ruta; allí baja con un empujón hacia tierra. El nado y el empujón quedan de respaldo. Batalla de referencia, con Limbers conectado (no es comparable del todo): 45 caídas, 90 balsas, 25 empujones y 35 regresos completos. Que salgan el doble de balsas que caídas indica que muchas atracan antes de tiempo, al chocar con la orilla en línea recta.
- **Limbers probó la v0.1.28:** las balsas sacan rápido del agua a quien cae. Vio unidades varadas en repisas junto al lago, sin salida a pie porque en tierra evitan el agua; oleadas demasiado pequeñas; el muro mal puesto, en el puente; y aliados que no atacan a zombis ni esqueletos.
- **Muro en la entrada del castillo (v0.1.29), elegido por Limbers:** el mapa trae una pared de abeto en ruinas donde el puente llega al castillo (x = -14), con un hueco de 6 bloques. El muro de la partida lo cierra (x -16..-14, y 120..125, z -441..-436); con él puesto no se llega a pie del puente al patio. La zona donde se cava acaba justo detrás (x -17), para que nadie rodee el muro cavando. El muro viejo del puente se quita solo al empezar (`retiredWalls`). Meta, aliados iniciales (8 soldados y 2 pirómanos arriba), puestos y salida, detrás del muro; los invasores aparecen en el tramo norte del puente. En el servidor, los 5 magos de la primera oleada lo abrieron unos 40 s después de empezar.
- **Oleadas grandes (v0.1.29), elegidas por Limbers:** 20 + 5 magos, 40 + 6 y 60 + 8; 12 de tropa de brecha. Refuerzos aliados: 30 por oleada, mínimo 12 en el campo. El tope de magos pasa de 1 de cada 10 a 1 de cada 4.
- **Varados (v0.1.29):** quien lleva 12 s quieto, sin enemigos a 10 bloques y con agua al lado o debajo de una caída, pasa al regreso (puede nadar); si en 3 s no llega al agua, un empujón hacia ella, y allí le recoge una balsa. Sin medir en juego.
- **Monstruos (v0.1.29):** los aliados atacan a los monstruos que se acercan (zombis, esqueletos, arañas...), salvo creepers (su explosión rompería el castillo) y endermen (neutrales). Con la orden de ataque no se van a cazarlos lejos. Desde la v0.1.30 también al revés: los aliados llevan la familia del gólem de hierro, la que persiguen zombis, esqueletos y arañas. Comprobado en el servidor: un zombi del desierto mató a un pirómano aliado.
- **Skins (v0.1.31):** Limbers dijo que las mismas skins aburrían y no iban con el escenario, y dejó la elección a Claude. Ahora salen de The Skindex y cada unidad aparece con una al azar: 4 caballeros aliados, 4 pirómanos con túnica de fuego, 5 orcos guerreros y 4 chamanes orcos o goblins. Origen, autor y retoques de cada una en `docs/SKINS.md`. Ya están elegidas las del guerrero y el arquero aliados; faltan las del arquero invasor (las dos candidatas no se dejaron descargar: Limbers puede bajarlas a mano). Sin licencia de reutilización: antes de publicar hay que pedir permiso a los autores.
- **Stonehill Castle, el mapa del rush (v0.1.32-0.1.33):** Limbers trajo Ice Castle (aldeas, más accesos), pero es enorme (54 MB, castillo de 290 de alto, caminatas largas); para un rush eligió Stonehill, mediano, que también tenía en `assets/worlds/`. Ice Castle queda para un mapa grande con varios frentes (Fase 6). Análisis del terreno con las reglas del planificador: el castillo tiene una sola entrada a pie, la puerta este, a la que se sube por un camino empedrado desde el valle del noreste. El muro cierra el arco de la puerta (x -284..-282, z 201..212, y 125..130); con él puesto no se llega al patio desde fuera. Los invasores aparecen en el valle, a unos 60 bloques de camino. Pirómanos aliados y jugadores, en el paso de ronda encima de la puerta (y 138). Sin `siege`: las laderas rodean el castillo a la altura del patio y quien cavara allí se saltaría el muro.
- **Primera prueba en el servidor:** suben en unos 52 s y el muro cae 11 s después del primer disparo (las explosiones prenden fuego y el muro es de madera). En la v0.1.32 el muro tapaba un poste de abeto del mapa; las explosiones lo volaron y la brecha se abrió con 7 bloques rotos, por eso se movió a la cara exterior del arco. Las explosiones rompen madera del mapa y ese daño queda en el mundo entre partidas.
- **Desde dentro se puede salir saltando** (por ejemplo, entre las almenas de la pasarela oeste), pero no volver a entrar: un aliado que salte queda fuera. Pendiente de ver si pasa en partida.
- **Limbers probó Stonehill (v0.1.33):** los pirómanos del paso de ronda no hacían nada, y en la retirada los aliados se quedaban golpeando al aire. Origen del mapa: https://mcpedl.com/stonehill-castle-medieval-castle/
- **Pirómanos donde ven (v0.1.34):** solo disparan a lo que ven a 32 bloques, y desde el paso de ronda no veían ni una casilla (el parapeto tapa la subida; el pasaje queda debajo). Calculadas las líneas de visión sobre el terreno: uno va en lo alto de la torre de la esquina (ve la puerta y algo de la subida; ningún sitio de piedra ve más del 3 % de la subida) y otro al final del pasaje, en el patio (ve casi todo el pasaje). Los puestos de retirada para los que disparan, ahí mismo. Además no los empuja nada (`knockback_resistance`), para que no caigan. En la prueba ya causan bajas.
- **Retirada sin golpes al aire (v0.1.34):** al llegar a su puesto pasaban a defenderlo, pero el juego no les quitaba el objetivo: el marcador invisible del puesto, al que seguían golpeando (o disparando). Ahora, al llegar alguien, ese marcador se cambia por otro igual: quien lo tenía de objetivo lo pierde. Sin ver en juego.
- **Invasores asfixiados (v0.1.35):** dos puntos de aparición estaban en el puentecito y junto a la ladera; al salir varios a la vez se empujaban contra los bloques. Ahora están en suelo abierto del valle. Suben en unos 60 s y el muro cae 5 s después del primer disparo.
- **Limbers probó la v0.1.35:** le gustó cómo se retiran y atacan. Pega: invasores atascados entre bloques o metidos en ellos; acababan llegando, pero se veían bugeados. Aún no hay arqueros (pendientes de sus cifras).
- **Causa de los atascados: el césped (v0.1.39).** La lista de «decoración que se atraviesa» (`PASSABLE_DECORATION`, en `gate.ts`) buscaba la palabra `grass`, que también está en `grass_block`: el césped contaba como aire. Al buscar sitio para aparecer (o para rescatar), las unidades quedaban con los pies hundidos en el césped, y el rescate no las veía empotradas. Pasaba en el valle de Stonehill (césped) y no en el castillo (piedra). Ahora la lista nombra cada planta (`short_grass`, `tall_grass`...), no confunde los bloques de seta gigante y recoge las flores altas (lilas, peonías), los cultivos, raíles, botones y telarañas, que antes contaban como macizos. Afecta también a la brecha del muro y al cavado de Old Fallen Castle: allí el césped ya se puede derribar.
- **Ruta de subida (v0.1.37, `approachRoutes`):** desde el valle, el juego llevaba a los soldados al sitio alcanzable más cercano al castillo en línea recta, y algunos se quedaban parados. Los invasores de las oleadas siguen ahora 4 hitos por el camino empedrado (los mismos hitos y etiquetas que el regreso del agua), pelean con quien tengan cerca y, al llegar al último, siguen como siempre. Ningún teletransporte. En la prueba, 25 de 25 subieron por la ruta y el muro cayó en unos 50-60 s.
- **Rescate de atascados ampliado (v0.1.36, `stuckLogic.ts`):** mira cinco puntos del cuerpo y basta con uno dentro de un bloque macizo (vallas, losas, escaleras y puertas no cuentan). Además, el invasor que lleva 15 s quieto sin pelear, sin disparar a algo a tiro y sin esperar ante el muro se lleva a un sitio libre a pocos bloques, nunca lejos: la subida no se salta. Los sitios libres son siempre el centro de una casilla (v0.1.38). El registro dice qué unidad era y dónde estaba. En los mapas con asedio los soldados quietos siguen cavando como antes.
- **Guerrero y arqueros (v0.1.41), cifras elegidas por Limbers:** guerrero aliado 80 de vida, 13 de golpe (hacha), velocidad 0,26, no lo empujan. Arquero aliado 30 de vida, flecha de 5 cada 1,5-2 s a 24 bloques, fijo en su puesto. Arquero invasor 24 de vida, flecha de 4 cada 2-3 s a 20 bloques; sube con la oleada (por la ruta), dispara a quien vea y, si no ve a nadie, se acerca al aliado más cercano; nunca apunta a la meta ni al muro. Rol nuevo `archer`, flechas propias (`ally_arrow`, `invader_arrow`: no hieren a los suyos ni rompen el muro; modelo y textura de la flecha del juego) y postura de apuntar (`animation.bastion.humanoid.aim`, con objetivo). Skins: las reservadas de templarios y ballesteros, y una de arquero orco (Orc Archer, Horns of War); faltan más para el arquero invasor.
- **En Stonehill:** dos guerreros en lugar de dos soldados, pegados al muro; dos arqueros en los dos sitios altos que ven algo. Las oleadas mantienen sus totales, pero parte de los soldados pasan a ser arqueros, tantos como magos: 15+5+5, 34+6+6, 52+8+8. Refuerzos, de cada 10: 5 soldados, 2 guerreros, 2 arqueros, 1 pirómano. Primera prueba: ya hay bajas por flechas en los dos bandos, y los guerreros hicieron 14 de las 36 bajas invasoras. Sin ver en el juego: la postura de apuntar y el aspecto de las flechas (el servidor no dibuja).
- **Limbers probó la v0.1.41:** las unidades nuevas, de momento solo en Stonehill (no en los otros mapas). Los arqueros salían sin arco: la postura de apuntar sí se veía.
- **Arco visible y arqueros que mantienen la distancia (v0.1.42):** el arco del juego se dibuja con su propio modelo («attachable», por la cuerda); sin `enable_attachables` en la entidad de cliente no aparece. Las espadas y hachas no lo necesitan. Además, a petición de Limbers, el arquero que tiene un enemigo a menos de 5 bloques se aparta unos 8 (`avoid_mob_type`, por delante del disparo) y vuelve a disparar; acorralado, sin camino, sigue disparando. El aliado, pasado el peligro, vuelve a su sitio (`minecraft:home`, salvo en la retirada).
- **Limbers probó la v0.1.42:** todo bien (arco y retroceso de los arqueros incluidos).
- **Monstruos del juego como enemigos (v0.1.43), pedido por Limbers:** los aliados reconocen como enemigos a todos los monstruos, también creepers, endermen y brujas, pero siempre van antes a por los invasores (`nearest_prioritized_attackable_target`: invasores en rango 0, monstruos en rango 1). A un monstruo solo lo buscan si está dentro del castillo o ha atacado a un jugador en los últimos 30 s (etiqueta `bastion_intruder`, que pone `scripts/systems/intruders.ts` cada segundo), o si lo tienen a menos de 6 bloques. La zona del castillo es un cilindro alrededor de los puntos del mapa (aliados, puestos, patio, metas); en Stonehill, 30 bloques de radio. En el servidor: un zombi, un creeper, una bruja y un enderman soltados en el patio murieron en menos de 20 s; un zombi y un esqueleto fuera, en el valle, siguieron vivos. Ojo: el creeper explota y daña a los aliados y al castillo.
- **Fin de la salida (v0.1.43):** con la orden de ataque salen solo a por los invasores; cuando muere el último y no queda ninguno por salir, vuelven solos a los puestos de defensa (o a los suyos, sin puestos) con un aviso en el chat.
- **Modo espectador para las pruebas (v0.1.43):** `/scriptevent bastion:spectate on|off`. Con él, el asedio deja a los jugadores en creativo en vez de en supervivencia. `tools/bds.mjs serve` lo activa al arrancar.
- **Limbers probó la v0.1.43:** todo bien. Fase 2 cerrada.
- Pendiente de la Fase 2: más skins de arquero invasor.
- **Vigilar:** el 73 % de las búsquedas de ruta agotan su límite. Falta medirlas con la partida corriendo dentro de la tablet.
- **Pendiente de decidir:** ver «Decisiones abiertas».

## Fases

### Hecho: Base del juego

- Partida completa: cuenta atrás, oleadas, descanso, victoria y derrota, con vidas compartidas.
- Mapas por mundo: The Combat Castle y Old Fallen Castle, más uno de demostración.
- Aliados que se reponen en el descanso y unidades que aparecen en sitios seguros.
- Servidor de prueba (BDS) y herramientas para leer el mapa sin abrir el juego.

### En curso: Fase 1, muros rompibles

Hecho:

- [x] Muro de bloques reales, sin barra de vida, que se rompe por partes.
- [x] El muro tapa los pretiles y repisas del puente en Old Fallen Castle.
- [x] Magos que atacan primero el muro, con un punto de mira invisible que salta entre los bloques visibles.
- [x] Proyectil copiado de la bola de fuego del Ghast: explosión, fuego y se puede devolver de un golpe.
- [x] Brecha por hueco o por escalera: si un invasor llega a la meta cruzando por encima, también cuenta.
- [x] La meta desaparece tras la brecha, para que no se queden pegados a ella.
- [x] Aliados que se defienden antes de la brecha.
- [x] Regreso a pie desde el agua, peleando por el camino, sin teletransporte.

Falta confirmar en el juego:

- [ ] Una oleada entera hasta el final, con la brecha y el aviso en pantalla.
- [ ] Una pelea real en el agua entre aliados e invasores.
- [ ] El aspecto de la bola de fuego y del fuego sobre el muro.
- [ ] Que el muro no caiga demasiado rápido: el impacto rompe bloques además de la explosión.

### Adelantos de otras fases (probados en el servidor, sin jugador)

- [x] Refuerzos aliados durante la oleada, desde una reserva limitada (de la Fase 4). Cuando la reserva se acaba, no hay más hasta el descanso.
- [x] Oleadas con soldados por las laderas norte y oeste (de las fases 5 y 6).
- [x] Los soldados atascados derriban lo que les estorba, con rampas en la roca (de la Fase 6). Al reiniciar la partida se repone lo que derribaron a mano, no lo que quemó o voló el fuego.
- [x] Meta en el centro del castillo: los invasores siempre tienen a dónde ir.
- [x] Órdenes con dos objetos: retirada al patio y salida al ataque.
- [x] Pirómano aliado, guardia fija que dispara desde su puesto.
- [x] El jugador empieza en el techo central del castillo.

Falta confirmar en el juego:

- [x] Los dos objetos de órdenes en manos del jugador: funcionan.
- [ ] Que derribar paredes se vea bien y dure lo justo.

Capacidad medida en el servidor (PC), con 20 ticks/s como velocidad normal:

| Unidades a la vez | Ticks/s |
|---|---|
| hasta unas 220 | 20 |
| unas 275 | 15 |
| unas 320 a 350 | 12 |
| unas 390 | de 15 a 11, con bajones a 9 |

Esa tabla es anterior a `must_reach` en los invasores (v0.1.21). Con la v0.1.23, unas 390 unidades iban a 4 ticks/s; con el aligerado (v0.1.24), a unos 7,5; desde la Fase 3, a 2-4 (sin `reselect_targets` irían a 19-20, pero con atascos). Se mide con `tools/lab/cost.mjs`.

Primera referencia para el tope: unas 220 unidades. Con unas 130 la tablet no se trabó; con más, aún no hay respuesta.

Batalla de 200 contra 200 (2026-11-05), con el ritmo nuevo: a los 10 minutos quedaban 50 aliados y 82 invasores. El fuego, las explosiones y los proyectiles de los piromanos causaron unas 99 de las 154 bajas aliadas registradas (64%); en la de 150 contra 150, interrumpida antes de acabar, unas 60 de 96 (62%). Los invasores son inmunes al fuego y los aliados no. Entre los minutos 7 y 10 casi no hubo bajas, con unos 40 aliados y 42 invasores en el castillo: falta averiguar por qué.

Limitaciones conocidas:

- Los soldados aliados no cruzan su propio muro: con la orden de ataque esperan detrás hasta que cae.
- Hasta la v0.1.28 el muro estaba en el puente y, en la retirada desde la cubierta, de 3 a 9 de cada 30 caían al lago. Con el muro en la entrada del castillo (v0.1.29) falta volver a medirlo.

### En curso: investigación de la IA

Documento: [IA.md](IA.md). Une el análisis de comportamiento y la investigación de movimiento.

- [x] Qué se puede hacer: opciones oficiales y no oficiales.
- [x] Cada unidad: qué percibe, qué quiere y cuándo cambia de idea.
- [x] Medidas en el servidor: rutas, puertas, coste, rescate, `must_reach` y peleas.
- [ ] Medidas en la tablet: coste y capacidad.
- [ ] Rescate con el jugador encerrado de verdad.

Arreglos pequeños propuestos antes de la Fase 2:

- [x] Abrir puertas en todas las unidades que caminan.
- [x] No contar como pelea a un enemigo detrás de un muro o en otro piso.
- [x] Atacar solo a quien se pueda alcanzar, con la meta como último recurso.
- [x] Quitar `behavior.break_door` y `can_break_doors`.
- [x] Repetir la batalla de referencia hasta el final y comparar.
- [x] Quitar el laboratorio del pack: ahora está en `tools/lab/`.

La caza:

- [x] Sin meta central: a por el enemigo vivo más cercano, abriendo camino con el planificador.
- [x] Batalla de referencia hasta el final, sin estancarse (una vez, con el jugador conectado).
- [x] Limbers la prueba en juego y le convence.
- [ ] Medir el coste de las búsquedas con la partida corriendo dentro de la tablet (POCO Pad, Snapdragon 7s Gen 2, 8 GB).

### Hecho: Fase 2, unidades estándar

Una unidad se define con una ficha de datos, y un generador crea sus archivos del juego. Sin esto, cada unidad nueva son cientos de líneas repetidas. Cómo añadir una: [README](../README.md), «Añadir una unidad».

- [x] Ficha por unidad: bando, rol, vida, daño, velocidad, skins, arma y nombres. El coste se añade en la Fase 4, cuando haya presupuesto.
- [x] Roles reutilizables: cuerpo a cuerpo y mago (`tools/units/roles.ts`). El bando decide quiénes son sus enemigos.
- [x] Los comportamientos comunes (regreso a pie, peleas en el agua, cada cuánto buscan enemigo) viven en un solo sitio (`tools/units/behavior.ts`).
- [x] Migrar las 4 unidades actuales sin cambiar cómo se juegan: batalla de referencia igual.
- [x] Los scripts preguntan a la ficha (bando y rol) en lugar de comparar ids: una unidad nueva no obliga a tocar cada sistema.
- [x] Armas en las manos con objetos normales del juego, sin cambiar el golpe.
- [x] Salir del agua: varias orillas, hitos solo fuera del agua y empujón. Herramienta `tools/shores.mjs` para elegir orillas.
- [x] Ver las armas en la tablet (Limbers).
- [x] Retirada a puestos de defensa (frente, lados y en alto) y orden de ataque sin límite de distancia.
- [x] Balsas para salir del agua, con el nado y el empujón de respaldo.
- [x] Ver en juego las balsas (Limbers): sacan rápido del agua.
- [x] Ver en juego los puestos de la retirada (Limbers).
- [x] Rescate de los varados en repisas junto al agua.
- [x] Los aliados atacan también a los monstruos del juego, todos (creepers, endermen y brujas incluidos), siempre después de los invasores.
- [x] La orden de ataque termina sola cuando no quedan invasores.
- [x] Rol de arquero: arco en la mano, postura de apuntar y flecha propia que desaparece al chocar.
- [x] Primeras unidades nuevas: guerrero y arquero aliados, arquero invasor (de momento solo en Stonehill).
- [x] Algo de variación en vida o daño por unidad, para que los duelos no estén decididos de antemano. Hecho en la Fase 3 (v0.1.44).

### En curso: Fase 3, combate orgánico

Para que no se pelee en bolita ni a toda velocidad. Orden: variación, grupos, moral y cuerno.

- [x] Variación: ±10 % de vida al nacer y ±10 % en cada golpe (v0.1.44). Medido en el servidor.
- [ ] Ver la variación en juego (Limbers).
- [x] Grupos con objetivos repartidos y reserva (v0.1.45). Medido en campo abierto y en Stonehill.
- [x] Moral: un grupo superado se repliega al patio y luego a la torre (v0.1.45). Torre de Stonehill elegida (v0.1.51).
- [x] Postura defensiva: los refuerzos defienden un puesto, nadie sale del castillo con la orden de defender y quien está en desventaja aguanta en su sitio (v0.1.51). Sin probar en juego.
- [x] Peleas estancadas: último reducto, grupos sin camino y red de seguridad (v0.1.45). En prueba.
- [ ] Ver grupos, moral y peleas estancadas en juego (Limbers).
- [x] Director de inalcanzables: ruta a pie y, si nadie llega, bajan a pelear, en los dos bandos (v0.1.52). Sin probar en juego.
- [x] Prueba de escaleras de mano en el laboratorio (`scriptevent bastion:lab ladder`): bajan si se las mete; para subir hay que subirlas.
- [x] Escaleras de mano del director, para bajar y para subir, en lugar del humo (v0.1.53). Probadas en el laboratorio en terreno irregular y vistas por Limbers en la oleada 1 de Stonehill; toque al llegar, bajadas por la ruta y escaleras repuestas (v0.1.54).
- Idea: tropas adecuadas (tiradores con vista, aéreas) contra las unidades inalcanzables.
- [x] Rescate: si rodean al jugador, suena un cuerno y acuden los aliados más cercanos (v0.1.48). Sin probar en juego.
- [x] Escolta del cuerno en la mano: 4 aliados libres que se quedan con el jugador hasta el fin de la oleada (v0.1.50). Sin probar en juego.
- [x] Ver el cuerno en juego (Limbers, en supervivencia, v0.1.50).

### Fase 4, guerra progresiva

- **Primero: «lugares» en vez de un solo castillo** (pedido por Limbers, 2026-11-07). Cada mapa declara sus lugares (castillo, aldeas, torres de vigía...), cada uno con su zona, sus puestos, su punto de reunión y su guarnición. Reglas iguales en todos: defender su lugar sin salir de su zona, aguantar en desventaja y, si los superan, retirarse al lugar amigo más cercano que aún tenga tropas o a la base principal. Los mapas de hoy pasan a ser un mapa con un solo lugar, sin reescribirlos. Estado actual, diseño y coste en [IA.md](IA.md), «Primer paso de la Fase 4».
- Mismo tope de unidades en el campo para cada bando, y una reserva que entra por grupos conforme caen. Es lo que permitiría batallas de 400 por bando: con unas 400 a la vez el servidor va a 2-4 ticks/s por `reselect_targets` (ver «Coste de la batalla grande»).
- Ritmo por etapas: escaramuzas, choque fuerte, respiro y nuevo empuje.
- Rutas para mapas grandes: búsqueda por niveles (cada lugar, una zona) o campos de flujo (muchas unidades hacia la misma meta). Investigado, sin probar: [IA.md](IA.md), «Rutas en mapas grandes», y [refs/rutas-y-escalada.md](refs/rutas-y-escalada.md).
- Regla de derrota: perder también cuando no quedan aliados ni reservas.
- Cada oleada tiene un presupuesto de puntos que se gasta en unidades, según su coste.
- El presupuesto se ajusta con moderación según los aliados vivos y los jugadores.

### Fase 5, gran escala

- Prueba de capacidad en la tablet para fijar el tope real de unidades.
- La guarnición inicial en el centro y lo alto del castillo; hoy solo los refuerzos salen de ahí.
- Soldados que esperan a distancia mientras los magos rompen el muro, y avanzan cuando cae.

### Fase 6, más frentes

- Más formas de entrar además de cavar: escaleras de asalto, unidades voladoras o entradas extra.
- Varias capas de muro, picos y arietes.
- Reparar el muro durante el descanso.
- Cuando haya entradas por agua: que unos invasores crucen el lago y otros vayan por tierra (pedido por Limbers, 2026-11-06).

### Más adelante

- Unidades aéreas y acuáticas, con más frentes en Old Fallen Castle.
- Una unidad que trepe muros (un monstruo), con el buscador de caminos de las arañas (`navigation.climb`). Idea de Limbers (2026-11-07) tras la prueba de escaleras.
- Civiles que huyen.
- Modelos y accesorios propios (armaduras, armas a medida) y arte definitivo.
- Pedir permiso a los autores de las skins (`docs/SKINS.md`) o cambiarlas antes de publicar.

## Decisiones abiertas

- **Límites de la caza.** Hoy no se rompe nada fuera de la zona de asedio, el modo creativo no es presa y los aliados no se abren paso. Falta decidir si se queda así.
- **Unidades inalcanzables (de cualquier bando).** Desde la v0.1.52 el director busca ruta y, si nadie llega, las hace bajar; el abandono a los 45 s queda como red de seguridad. Desde la v0.1.53 pone escaleras para bajar y para subir; el humo queda para cuando ni así hay ruta. Desde la v0.1.54 quien llega por escaleras recibe un toque de su objetivo para atacarlo de verdad. Falta decidir si se añaden tiradores con vista o unidades aéreas. Ver [IA.md](IA.md).
- **Oleada sin jugadores que cazar.** Con la caza, sin aliados vivos van a por el jugador y la partida termina al agotar sus vidas. Si todos los jugadores están en creativo o desconectados, no termina. Se resuelve con la regla de derrota de la Fase 4.
- **Aliados al otro lado del muro.** Quien cae regresa por el puente y queda fuera hasta que el muro se abre. Hoy pelea ahí.

- **Regla de derrota.** Hoy se pierde solo al agotar las vidas de los jugadores. Propuesta: perder también cuando no quedan aliados ni reservas.

## Decisiones tomadas

- **Sin teletransporte al caer:** se regresa caminando, para que las peleas ocurran en varios lugares.
- **La escalera se queda:** cruzar por encima de un muro escalonado es una mecánica válida.
- **Peleas en el agua:** solo se apunta a quien nada si uno también está en el agua; así nadie se queda mirando el lago desde el puente.
- **El servidor de prueba se reinicia sin preguntar.**
- **Salir del agua en balsa:** las criaturas no dirigen un barco, así que la balsa es propia y la lleva el guion. Se suma a las varias orillas de salida y al empujón (elegido por Limbers, 2026-11-06; antes, solo orillas y empujón, 2026-11-05).
- **Las armas dan su daño completo (2026-11-06):** golpe de 10 y 9 en los soldados. La ficha guarda el golpe total y el generador descuenta lo que suma el arma del daño base, así que cambiar de arma no cambia el golpe sin querer.
- **Comprobar el camino solo de cerca:** `must_reach` solo hasta 24 bloques y búsqueda de enemigo cada 2 s, porque era lo que más pesaba en batallas grandes. Elegido por Limbers entre tres opciones (2026-11-05).
- **Migrar a Minecraft Java con Fabric (2026-11-07):** Limbers jugará en Arch Linux y quiere realismo que Bedrock no permite sin parches. Mientras tanto, Bedrock se queda con `reselect_targets: true`.
- **Ritmo de las peleas:** un duelo entre soldados dura de 6 a 10,5 s desde la v0.1.27, con el daño completo de las armas. Antes: 15 a 30 s, y 15 a 22,5 s desde la v0.1.23.
- **Aliados inmunes al fuego:** causaba cerca de dos tercios de sus bajas y los invasores ya eran inmunes. La explosión sí les hace daño.
- **Piromanos escasos:** unos 8 a 10 de cada 80 unidades, porque hacen mucho daño y destrozan el mapa.
- **Los soldados derriban paredes solo en la zona del castillo:** ni el puente ni la orilla.
- **El muro de la puerta lo rompen sobre todo los magos.** Los soldados también lo golpean, muy despacio, para que una oleada sin magos vivos no se quede atascada.

## Cómo mantener este documento

- Una sesión termina con «Dónde nos quedamos» al día: fase, último cambio y siguiente paso.
- Lo probado solo con tests no se marca como confirmado en el juego.
- Las ideas nuevas van a su fase; las dudas, a «Decisiones abiertas».
