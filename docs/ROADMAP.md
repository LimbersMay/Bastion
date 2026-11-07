# Roadmap de Bastion

**Empieza aquí en cada sesión.** Dice en qué fase vamos, dónde nos quedamos y qué sigue.
Al terminar una sesión, actualiza «Dónde nos quedamos» y marca lo que quedó hecho.

Cómo funciona el juego y cómo probarlo: [README](../README.md).

## Dónde nos quedamos

*Última actualización: 2026-11-06. Versión de los packs: 0.1.43. Rama: `feature/old-fallen-castle`, sin subir. Cambios de la Fase 2 sin commitear.*

- **Fase actual:** Fase 2, unidades estándar. Hechas la ficha, el generador, la migración y las armas en la mano.
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
- **Siguiente paso:** Limbers mira en la tablet a los aliados contra los monstruos y la vuelta tras la salida. Pendiente: más skins de arquero invasor.
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

Esa tabla es anterior a `must_reach` en los invasores (v0.1.21). Con la v0.1.23, unas 390 unidades iban a 4 ticks/s; con el aligerado (v0.1.24), a unos 7,5. Se mide con `tools/lab/cost.mjs`.

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

### En curso: Fase 2, unidades estándar

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
- [ ] Ver en juego los puestos de la retirada (Limbers).
- [x] Rescate de los varados en repisas junto al agua.
- [x] Los aliados atacan también a los monstruos del juego.
- [ ] Rol de arquero: arco en la mano, postura de apuntar y flecha propia que desaparece al chocar.
- [ ] Primeras unidades nuevas: guerrero y arquero aliados, arquero invasor.
- [ ] Algo de variación en vida o daño por unidad, para que los duelos no estén decididos de antemano (propuesto en [IA.md](IA.md)).

### Fase 3, combate orgánico

Para que no se pelee en bolita ni a toda velocidad.

- Evitar la bolita. Las parejas con etiquetas se probaron y no la reducen; la propuesta es un director que reparta grupos por el frente (ver «Decisiones abiertas» e [IA.md](IA.md)).
- Moral: un grupo superado se repliega de la muralla al patio y luego a la torre.
- Rescate: si rodean al jugador, suena un cuerno y acuden los aliados más cercanos.

### Fase 4, guerra progresiva

- Mismo tope de unidades en el campo para cada bando, y una reserva que entra por grupos conforme caen. Es lo que permitiría batallas de 400 por bando: con unas 400 a la vez el servidor ya va a 7,5 ticks/s.
- Ritmo por etapas: escaramuzas, choque fuerte, respiro y nuevo empuje.
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
- Civiles que huyen.
- Modelos y accesorios propios (armaduras, armas a medida) y arte definitivo.
- Pedir permiso a los autores de las skins (`docs/SKINS.md`) o cambiarlas antes de publicar.

## Decisiones abiertas

- **Límites de la caza.** Hoy no se rompe nada fuera de la zona de asedio, el modo creativo no es presa y los aliados no se abren paso. Falta decidir si se queda así.
- **Parejas o grupos repartidos.** Las parejas 1 contra 1 no redujeron la bolita, duplicaron el ritmo y bajaron el servidor a 4,7 ticks/s con 100 contra 100. Propuesta: sustituirlas en la Fase 3 por grupos con destinos distintos, aún sin probar.
- **Unidad atorada en el regreso.** Si un invasor se atasca para siempre, la oleada no termina. Hoy no hay teletransporte, porque no se quiere. Opción: usarlo solo como último recurso tras varios minutos sin avanzar.
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
- **Ritmo de las peleas:** un duelo entre soldados dura de 6 a 10,5 s desde la v0.1.27, con el daño completo de las armas. Antes: 15 a 30 s, y 15 a 22,5 s desde la v0.1.23.
- **Aliados inmunes al fuego:** causaba cerca de dos tercios de sus bajas y los invasores ya eran inmunes. La explosión sí les hace daño.
- **Piromanos escasos:** unos 8 a 10 de cada 80 unidades, porque hacen mucho daño y destrozan el mapa.
- **Los soldados derriban paredes solo en la zona del castillo:** ni el puente ni la orilla.
- **El muro de la puerta lo rompen sobre todo los magos.** Los soldados también lo golpean, muy despacio, para que una oleada sin magos vivos no se quede atascada.

## Cómo mantener este documento

- Una sesión termina con «Dónde nos quedamos» al día: fase, último cambio y siguiente paso.
- Lo probado solo con tests no se marca como confirmado en el juego.
- Las ideas nuevas van a su fase; las dudas, a «Decisiones abiertas».
