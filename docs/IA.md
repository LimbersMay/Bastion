# Inteligencia de las unidades

Investigación previa a la Fase 2 (2026-11-05). Reúne dos temas que resultaron ser uno: **cómo se comporta cada unidad** y **cómo se mueve por mapas enormes**.

Salvo que se indique otra cosa, las medidas son del servidor de prueba en la PC, sin jugador conectado, en Old Fallen Castle y con unidades de laboratorio. Nada de esto se ha probado aún en la tablet. Los arreglos pequeños (v0.1.21) y la caza (v0.1.22) ya están en las unidades reales; los grupos, no.

## Conclusiones

| Pregunta | Respuesta | Seguridad |
|---|---|---|
| ¿Se les puede dar más inteligencia? | Sí, por capas: el juego camina y el script decide a dónde ir y qué romper. | Medido |
| ¿Se puede ordenar una ruta a un mob? | No directamente. Sí con un marcador invisible que el mob persigue y el script mueve. | Medido |
| ¿Hace falta calcular rutas siempre? | No. Cuando hay camino, el juego lo encuentra solo. La ruta propia solo sirve cuando no lo hay. | Medido en 3 trayectos |
| ¿Por qué no salían del castillo? | En la prueba, una puerta cerrada bloqueaba a las unidades. Se resuelve con una línea en su archivo. | Medido en la unidad de prueba |
| ¿Rutas en mapas enormes? | Se pueden repartir entre ticks: el peor tick bajó de 284 a 29 ms. | Medido una vez, sin batalla |
| ¿Sirve para el rescate? | Sí: 6 de 6 llegaron a una sala cerrada en 13 s. | Sin jugador real |
| ¿Sirven las parejas 1 contra 1? | **No como las probé:** no reducen la bolita, duplican el ritmo y hunden el servidor a 100 contra 100. | Medido |
| ¿Qué es entonces la bolita? | Dos cosas: **la meta única e indestructible del corazón**, que los reúne a todos, y unidades de más en poco espacio. | Lo primero, medido en batalla; lo segundo, apoyado en medidas |
| ¿Por qué se estancaban las batallas? | Se quedaban sin nadie alcanzable y la excavación solo apuntaba al corazón. Con la caza, la batalla de referencia llegó hasta el final. | Medido en una batalla, con el jugador conectado |

## Lo que se vio en el juego

- Se amontonan intentando atacar a un enemigo que está debajo y no pueden alcanzar.
- Sin piromano, no rompen el bloque que tienen delante y se quedan atorados.
- Los aliados solo salen del castillo por el puente, todos en bola.
- Todo eso estancó la batalla de 200 contra 200.

Una batalla de referencia con 30 aliados y 60 soldados invasores, más los de las oleadas, apunta en la misma dirección. Los bloques derribados por cada 30 s fueron 38, 87, 70, 31, 23 y 11, y casi ninguno desde el minuto 3,5. A los 5,5 minutos quedaban 46 invasores y 12 aliados, a 20 ticks/s. La prueba se cortó ahí y no se registró dónde estaban, así que no demuestra la causa por sí sola.

## Batalla real: la meta del corazón

Es la medida más importante de este documento, y salió después de las demás. Son 30 aliados y 60 soldados invasores con las unidades reales, sin piromanos, hasta 9 minutos, una vez cada versión. El jugador estuvo conectado en parte de las tres y no sé cuánto influyó.

| Al final | Antes | Arreglos (v0.1.21) | Caza (v0.1.22) |
|---|---|---|---|
| Invasores y aliados vivos | 50 y 9 | 29 y 3 | 23 y 0 |
| Bajas de invasores y de aliados | 26 y 25 | 47 y 31 | 53 y 34 |
| Bloques derribados | 215 | 462 | 126 |
| Empieza el combate fuerte | Minuto 1,5 | Minuto 1,5 | Minuto 3,5 |
| Final | Estancada desde el 6 | Estancada desde el 5,5 | **Derrota del jugador en el minuto 8** |
| Invasores junto a la meta | Unos 31 | 8 | No hay meta |

**Causa de la bola de la captura:** `bastion:objective`, la meta invisible del corazón, contaba como un objetivo más. Al ser lo más cercano al llegar, nadie la soltaba, y como no muere, se quedaban golpeándola para siempre. Unos 31 de 50 estaban a 3 bloques o menos de ella, y los aliados a unos 22 bloques, sin que nadie los atacara.

**Qué cambió el arreglo:** la meta pasa a ser el último recurso, detrás de cualquier enemigo alcanzable. A los 8 minutos no había nadie junto a ella y se derribó el doble.

**Qué no resolvió el arreglo:** sin nadie alcanzable volvían a la meta, y la batalla se estancó desde el minuto 5,5, con los 3 últimos aliados en la ladera oeste.

**Qué cambió la caza:** ya no hay meta central. Mataron a todos los aliados hacia el minuto 5,5 y después al jugador, que perdió sus 5 vidas. Derribaron 126 bloques, cerca de una cuarta parte, porque la ruta rompe solo lo necesario.

**Lo que aún no está bien:**

- **Las búsquedas son lentas:** de 172, 126 agotaron el límite de 12.000 casillas sin llegar (73 %) y tardaron unos 3 s cada una, repartidos entre ticks. El servidor se mantuvo a 20 ticks/s con unas 100 unidades, pero falta medirlo en la tablet y a mayor escala.
- **Empiezan más tarde:** el combate fuerte llegó 2 minutos después. No medí por qué.
- **Falta repetirla:** es una sola batalla, y la derrota dependió de que hubiera un jugador conectado.
- **La tablet fue solo cliente:** jugó conectada al servidor de la PC, así que los cálculos no corrieron en ella.

**Las peleas de las tablas siguientes no tenían meta,** así que no podían mostrar nada de esto. Por eso mi primera conclusión, que la bolita era sobre todo densidad, estaba incompleta.

## Qué se puede hacer

### Oficial

La API estable no permite ordenar una ruta ni elegir el objetivo de un mob: `Entity.target` es de solo lectura y está en beta. Las herramientas válidas son estas:

| Herramienta | Para qué sirve | Estado |
|---|---|---|
| Marcador invisible (`bastion:waypoint`) | Llevar a un mob a un punto. Ya lo usa la retirada. | Funciona; base de lo demás |
| `minecraft:annotation.open_door` | Abrir puertas. `can_open_doors` no basta sin esto. | Funciona: de 0 a 18 de 20 |
| `minecraft:behavior.follow_target_leader` | Que un grupo siga a un líder. | Funciona, sin ventaja en la prueba |
| `system.runJob` | Repartir un cálculo largo entre ticks. | Funciona |
| `must_reach` | Atacar solo a quien se pueda alcanzar. | Sin coste visible; falta verlo en batalla |
| `minecraft:pushable_by_entity` | Ajustar cuánto se empujan entre sí, quizá para separarlas. | Sin probar |
| `minecraft:break_blocks` | Romper bloques al caminar. | Sin probar; rompe sin elegir |
| `minecraft:annotation.break_door` | Derribar puertas (12 s). Exige `can_break_doors` y, por defecto, dificultad difícil. | Sin probar; idea para invasores |
| `minecraft:behavior.break_door` | Derribar puertas a la antigua. | Descartado: ninguna entidad del juego lo usa |

### No oficial

Endstone y LeviLamina solo funcionan en servidores dedicados, y no encontré ningún complemento de rutas para mobs. Bastion debe jugarse en la tablet con un `.mcaddon` normal, así que **quedan descartados**.

### Lo óptimo: tres capas

1. **El juego camina.** Si hay camino, su navegación es rápida y no cuesta nada extra.
2. **El script planifica solo cuando hace falta.** Detecta a quien no avanza, busca la ruta más barata contando qué romper y la da al grupo, no a cada unidad.
3. **Un director reparte.** Decide qué grupo va a qué sitio, para que no vayan todos al mismo punto.

## Resultados

### Movimiento (20 unidades)

| Trayecto | Solo el juego | Con ruta propia | Con líder |
|---|---|---|---|
| Patio a cubierta, hay camino | 18/20 en 41 s | 18/20 en 40 s | 18/20 en 68 s |
| Patio a bosque norte, sin camino abierto | 0/20 | 18/20 en 61 s, 3 bloques | Sin medir |
| Ladera oeste al corazón, sin camino abierto | 0/20 | 16/20 en 61 s, 9 bloques | Sin medir |

- **Primer intento del patio al bosque:** dio 0/20. Las causas fueron una trampilla en la ruta y, sobre todo, una puerta cerrada. Con `annotation.open_door` y rompiendo la trampilla llegaron 18.
- **Unidades sin llegar:** los 4 de la ladera oeste se quedan cerca del inicio. Aún no sé por qué.

### Coste de calcular rutas

- **Leer un bloque:** 4,2 µs en un bucle cerrado.
- **Una ruta de una vez:** de 68 a 284 ms, por encima de los 100 ms en los que el juego avisa de un pico.
- **Búsqueda que no encuentra salida:** 532 ms al agotar el límite de 6.000 casillas. Es el caso a evitar. El mismo trayecto (patio a cubierta) dio ruta de 104 pasos con un límite de 12.000, así que un trayecto largo puede costar todavía más.
- **La misma ruta repartida entre ticks** (ladera oeste, sin batalla):

| | De una vez | Repartida |
|---|---|---|
| Peor tick | 284 ms | 29 ms |
| Tiempo total de cálculo | 284 ms | 313 ms |
| Espera hasta tener la ruta | Inmediata | 12 ticks (0,6 s) |

Medio segundo de espera no se nota en una unidad que ya estaba atorada. Dentro de una batalla el reparto puede ser más lento; falta medirlo.

### Rescate

Se cerró una sala de piedra en el patio y 6 unidades fueron hasta su interior: **6 de 6 en 13 s, 2 bloques rotos, 49 ms de cálculo.** Falta probarlo con el jugador encerrado de verdad y con el cuerno.

### Exigir camino (`must_reach`)

Con 280 unidades (240 invasores que no pueden llegar y 40 aliados): 20,0 ticks/s con y sin `must_reach`. No se ve coste, pero 20 es el máximo posible y no había combate, así que no demuestra que sea gratis. En plena batalla sí cuesta, y mucho: ver la sección siguiente.

### Coste en batallas grandes (v0.1.24)

Batalla de unos 200 contra 200 con `tools/lab/cost.mjs` (unas 390 unidades, sin jugador), cambiando una sola cosa cada vez. Una partida por versión.

| Versión | Ticks/s, 1.er minuto | Ticks/s, 2.º minuto | Unidades al final |
|---|---|---|---|
| v0.1.23 | 4,6 | 4,0 | 388 |
| Alcance de la marcha a 100 en vez de 256 | 3,8 | 4,0 | 387 |
| Sin gestos de adorno | 4,2 | 4,4 | 399 |
| Sin scripts del pack | 7,4 | 9,5 | 343 |
| Buscar enemigo cada 2 s (`scan_interval` 40) | 5,8 | 7,2 | 355 |
| `must_reach` solo hasta 24 bloques | 6,3 | 7,2 | 361 |
| Las dos cosas | 8,4 | 10,4 | 320 |
| Sin `must_reach` | 12,9 | 14,3 | 270 |
| **v0.1.24 (las dos cosas, en el pack)** | **7,7** | **7,2** | **394** |

- **Lo más caro es `must_reach`.** Cada unidad calcula si puede llegar a pie a cada enemigo posible, y con cientos de unidades eso crece mucho más rápido que su número. Explica la caída frente a la tabla de capacidad anterior a la v0.1.21.
- **Quitarlo del todo** devolvería la bola pegada al muro mirando a alguien inalcanzable. Por eso se queda hasta 24 bloques; lo lejano lo resuelve la caza, con una búsqueda a la vez compartida por hasta 12 soldados.
- **Las cifras con menos unidades al final están infladas:** murieron más durante la medición y quedaba menos carga. La comparación justa es la de la v0.1.24, con casi las mismas unidades que la v0.1.23: de unos 4,3 a unos 7,5 ticks/s.
- **Asedio de referencia con la v0.1.24, sin jugador:** acaba igual que con la caza. Todos los aliados caen hacia el minuto 5,5, 121 bloques derribados (antes 126) y 26 invasores en pie. De 130 búsquedas de ruta, 44 no llegaron hasta la presa (antes 126 de 172).
- **Para 400 por bando** no basta: hace falta el tope en el campo con reservas (Fase 4). Los grupos de la Fase 3 también ayudarían, porque comprobaría el camino el grupo y no cada unidad.

### Coste en batallas grandes, otra vez (v0.1.54 y v0.1.55, 2026-11-07): `reselect_targets`

**Resumen:** la batalla de unas 400 unidades había caído a 2-4 ticks/s (en la v0.1.24 iba a 7,5). La causa era `reselect_targets: true` en los buscadores de enemigo, multiplicada por las 16 entradas de grupo que añadió la Fase 3. Con `reselect_targets: false` la misma batalla va a **19-20 ticks/s**, mejor que nunca. Pero sin él las unidades no sueltan su objetivo cuando el script les cambia las etiquetas, y en Stonehill los invasores se atascaban en el primer hito. **Estado (v0.1.55): `reselect_targets` vuelve a estar puesto**, porque se decidió migrar a Minecraft Java (ver «Migración a Java» al final) y no seguir con más parches.

**Qué hace `reselect_targets`.** Una unidad que ya tiene objetivo, con él, vuelve a mirar en cada tick todas las entradas de su buscador por si hay alguien más cerca. Sin él, **quien tiene objetivo lo conserva** hasta que muere o se aleja, aunque sus filtros ya no se cumplan; `scan_interval` (2 s) solo marca cada cuánto busca quien no tiene objetivo. Esto se creyó al revés al principio (ver «El arreglo»). El coste con él crece con unidades con objetivo × entradas del buscador × entidades al alcance de cada entrada. La Fase 3 pasó a los aliados en salida de 4 a 20 entradas y a los invasores en marcha de 10 a 26, casi todas a 256 bloques.

**Cómo se encontró.** Todo con `tools/lab/cost.mjs` en Old Fallen Castle, en el mismo día y con el mismo banco (ver [tools/lab/README.md](../tools/lab/README.md)). Las batallas varían mucho de una vez a otra, así que solo cuentan los cambios grandes.

1. **Versiones viejas en el mismo banco** (`PACKS=`, con `git worktree`): la v0.1.24 va a 7,0 y 8,1; la Fase 2 (v0.1.43), a 6,5-7,0 y 8,0-9,6. La caída llega con la Fase 3.
2. **No son los scripts:** con el perfilador del servidor (`PERFIL=1`), los scripts trabajan 1,5 s de 63. Apagar los grupos, la moral y el director de inalcanzables (`sinGrupos`) deja 2,6 y 3,4: nada.
3. **Cruce de mitades** (`FICHAS=`): los scripts de hoy con las fichas de la Fase 2 van a 5,8 y 5,5; los scripts de la Fase 2 con las fichas de hoy, a 3,9 y 3,7. **Pesan las fichas.**
4. **Trasplantes** (`REF=`, un bloque de las fichas devuelto a la Fase 2 cada vez):

| Bloque devuelto a la Fase 2 | Ticks/s, 1.er minuto | Ticks/s, 2.º minuto |
|---|---|---|
| Nada (v0.1.54) | 2,8-3,9 | 1,8-3,9 |
| Los dos buscadores | 5,8 | 5,4 |
| **Solo el buscador prioritario** | **7,2** | **7,8** |
| Solo el que exige camino | 3,1 | 2,8 |
| `hurt_by_target` | 2,8 | 3,3 |
| Vida y golpe | 3,6 | 3,7 |

5. **Quitar entradas en la batalla** ayuda poco y de forma irregular: sin las 16 de grupo, 6,8 y 5,0; con solo 4, 3,9 y 4,3; a 32 bloques en vez de 256, 4,3 y 3,4. No era «demasiadas entradas» a secas.
6. **Banco aislado** (`tools/lab/entries.mjs`): 400 invasores quietos, sin scripts, con un buscador de K entradas que no encuentran a nadie.

| Prueba | Ticks/s |
|---|---|
| K de 2 a 100, nadie tiene objetivo | 20,0 |
| K = 100, la primera prueba de cada entrada se cumple | 18,1 |
| 1 entrada + la del objetivo (un marcador que todos encuentran) | 10,3 |
| 16 entradas a 256 + la del objetivo | 3,5 |
| 32 entradas a 256 + la del objetivo | 2,0 |
| 16 entradas a 8 bloques + la del objetivo | 13,4 |
| **16 entradas a 256 + la del objetivo, sin `reselect_targets`** | **20,0** |
| 1 entrada + la del objetivo, sin `reselect_targets` | 20,0 |

Las entradas solo cuestan cuando la unidad **ya tiene objetivo**: ahí `reselect_targets` las recorre todas en cada tick.

7. **En la batalla:**

| Variante | Ticks/s, 1.er minuto (mínimo) | Ticks/s, 2.º minuto (mínimo) | Unidades al final |
|---|---|---|---|
| v0.1.54 con `reselect_targets` | 2,8-3,9 | 1,8-3,9 | 375-396 |
| Sin él solo en el buscador prioritario | 19,2 (16,6) | 19,8 (19,6) | 307 |
| Sin él en los dos | 19,5 (16,4) | 20,0 (19,7) | 269 |
| **v0.1.54 con `reselect_targets: false` en las fichas, dos partidas** | **19,2 (17,2) y 19,4 (18,8)** | **19,0 (16,6) y 19,9 (19,8)** | **317 y 299** |

- **Hay menos unidades al final porque ahora la batalla avanza:** en dos minutos mueren unas 100. Con `reselect_targets` morían unas 12, porque el servidor iba tan lento que casi no peleaban. El mínimo del primer minuto, con 350 unidades vivas, ya va a 17.
- **Por qué la Fase 2 ya iba a 7 y no a 20:** también tenía `reselect_targets`, con menos entradas. El arreglo no solo deshace la Fase 3; quita un coste que estaba desde antes.

**El arreglo que se intentó, y por qué se deshizo:**

1. **`reselect_targets: false`** en todos los buscadores (`RESELECT_TARGETS` en `tools/units/behavior.ts`): da los 19-20 ticks/s.
2. **Efecto secundario, visto en un asedio de Stonehill:** los invasores llegaban al primer hito de la subida y se quedaban ahí. El script ya les había puesto la etiqueta de la etapa siguiente, pero el buscador seguía con el hito alcanzado como objetivo. A los 45 s los quitaba el abandono: 16 «Atasco» y la oleada 1 terminada sin pelear. El mismo problema afecta a todo lo que el script dirige cambiando etiquetas de la propia unidad: grupos, reserva, rastros de la caza y postura.
3. **Despertar a la unidad (probado en vivo):**
   - **Volver a añadir el grupo del modo** (re-disparar `bastion:return` a quien ya iba de regreso) sí la hace elegir de nuevo: de 33 atascados en el hito 0 quedaron 11 en 8 s, y en el hito 1, de 22 a 0, con unidades pasando de etapa. No les devuelve la vida.
   - **Añadir un grupo vacío no sirve**, ni quitarlo y ponerlo en el mismo evento. Una primera prueba pareció buena, pero el abandono iba quitando atascados mientras se contaba. Con ese despertar construido (v0.1.55), los invasores se atascaron igual.
   - **Lo que quedaría por construir:** una propiedad de entidad con el modo actual y un evento que vuelva a añadir el grupo de ese modo.
4. **Decisión (Limbers, 2026-11-07):** no seguir. Se vuelve a `reselect_targets: true` (la batalla grande, lenta, pero todo lo demás como antes) y se prepara la migración a Java, donde el objetivo se fija desde el código (`mob.setTarget`) y no hay que pelear con esto.

**Lo que se descartó por el camino:** el perfilador apuntaba el 70 % del tiempo a la búsqueda de rutas, pero eran los huecos de espera entre ticks (hay que separar las muestras de más de 1 ms). Las estadísticas del servidor (`diagnostics-capture-auto-start` en `server.properties`) solo dan el tiempo total del tick y del script, sin desglose. La medida de la v0.1.24 probablemente se hizo sin elegir el mapa; se volvió a medir hoy en el mismo banco.

### Peleas: quién golpea y quién se amontona

Cada unidad tiene 40 de vida y 4 de daño. Son 9 peleas de 30 contra 30 (3 sin reglas y 6 con parejas), más una de 100 contra 100 de cada tipo, todas en el patio. En otra tanda, el tope de 2 atacantes dio de 1,23 a 1,25 golpeadores, entre 73 y 90 s, y solo un 38 a 42 % bajo ataque: muchas unidades se quedan sin nadie a quien atacar.

| | 30 v 30, sin reglas | 30 v 30, parejas | 100 v 100, sin reglas | 100 v 100, parejas |
|---|---|---|---|---|
| Duración | 51 a 62 s | 25 a 30 s | 55 s | 28 s |
| Golpeadores por objetivo | 1,26 a 1,32 | 1,00 | 1,33 | 1,00 |
| Unidades recibiendo golpes | 51 a 58 % | 74 a 77 % | 50 % | 74 % |
| Enemigos alrededor de cada uno | 2,26 a 2,60 | 2,24 a 2,37 | 4,44 | 4,88 |
| Con 5 o más alrededor | 6 a 12 % | 4 a 9 % | 41 % | 50 % |
| Ticks/s, media (mínimo) | 20,0 (19,9) | 20,0 (19,9) | 19,1 (9,4) | **4,7 (3,3)** |

«Golpeadores» son los enemigos distintos que le pegaron en los últimos 3 s. «Alrededor» son los que están a 2,4 bloques o menos, peguen o no.

Lo que dicen estos datos:

1. **Aun sin reglas, casi nadie recibe golpes de tres a la vez:** entre el 2 y el 5 %. La bolita que se ve no es tanto «todos pegándole a uno» como unidades empujando sin alcanzar.
2. **Las parejas no deshacen la bolita.** Cada una pega solo a su pareja, pero siguen igual de juntas.
3. **Las parejas aceleran la pelea al doble,** porque todos pelean a la vez. Es lo contrario de lo que buscamos.
4. **Las parejas de 100 hunden el servidor.** Cada pareja es un filtro más en cada unidad. No separé cuánto se debe a los filtros y cuánto al script que empareja.
5. **La densidad pesa mucho.** Al pasar de 60 a 200 unidades en el mismo patio, los golpeadores siguen en 1,3, pero los que hay alrededor pasan de 2,4 a 4,4.

**Limitación:** los bandos salen de 60 puntos del patio y a 100 contra 100 varias unidades comparten punto. Un espacio abierto puede dar otros números.

**Un hallazgo aparte:** en las 6 peleas por parejas ganó el bando que apareció en segundo lugar, con 8 a 14 supervivientes, y al invertir el orden se invirtió el ganador. Con estadísticas idénticas, unos duelos 1 contra 1 los decide un detalle, probablemente quién pega primero. Hay que evitar equipos iguales enfrentados en duelos exactos.

## Grupos en campo abierto (Fase 3)

Medido el 2026-11-06 con `tools/lab/field.ts`: soldados reales (aliados con 60 de vida y golpe de 10, invasores con 40 y 9, los dos con la variación de ±10 %) en una plataforma plana de 48x48, sin jugador. Los aliados con la orden de ataque, los invasores en marcha. Tres variantes:

- **Sin grupos:** como juegan hoy.
- **Grupos:** el director (`scripts/systems/squads.ts`) junta a cada bando en grupos de hasta 8 y da a cada grupo un enemigo distinto, a 8 bloques o más de los objetivos de los demás. En grupo solo se lanzan contra enemigos a 8 bloques; más lejos siguen el marcador de su grupo.
- **Reserva:** lo mismo, pero solo avanzan tantos grupos como tiene el enemigo (`reserva`) o 1,5 veces más (`reserva:1.5`); el resto espera.

Dos líneas enfrentadas, 30 aliados contra 50 invasores, dos peleas de cada:

| | Sin grupos | Grupos | Reserva 1 | Reserva 1,5 |
|---|---|---|---|---|
| Duración | 22 a 24 s | 24 a 25 s | **42 a 46 s** | 27 s |
| Vecinos a 3 bloques de quien pelea | 7,5 a 7,9 | 7,4 a 8,2 | **4,6 a 6,4** | 5,7 a 6,7 |
| Con 5 o más enemigos encima | 13 a 18 % | 15 a 19 % | **3 a 11 %** | 12 a 14 % |
| Ganador | Invasores (25 a 31 vivos) | Invasores | **Aliados** (3 a 10 vivos) | Invasores (20 a 24 vivos) |

En bloque (los dos ejércitos apiñados, una pelea de cada): vecinos 16,9 sin grupos, 13,8 con grupos y 11,8 con reserva 1. A 60 contra 100 en línea (dos o tres peleas): vecinos 12,9 sin grupos, 11,1 con grupos, 9,8 con reserva 1 y 10,4 con reserva 1,5, sin cambiar el ganador. El director tardó de 4 a 5 ms por segundo con 160 unidades (el peor, 17 ms), en la PC.

Lo que dicen:

1. **Repartir objetivos no deshace la bolita,** igual que las parejas. Cuando los ejércitos chocan, todo enemigo está a menos de 8 bloques y cada uno pelea con el que tiene al lado.
2. **Lo que la reduce es limitar cuántos pelean a la vez:** la reserva baja la densidad y alarga la pelea.
3. **La reserva estricta cambia el resultado:** el bando más numeroso entra por partes y pierde su ventaja. Con 1,5 grupos activos por grupo enemigo conserva la ventaja y aún baja algo la densidad. Es el valor elegido (`SQUAD_DEFAULTS`).
4. **Una bola apiñada sigue siéndolo:** con todos los enemigos en pocos bloques no hay objetivos separados que repartir.

**Limitación:** pocas peleas por variante y mucha variación entre peleas iguales (sin grupos, a 60 contra 100, de 24 a 34 s). Las tendencias de la reserva se repiten en todas; las diferencias de los grupos solos, no.

**En la partida (Stonehill, 2026-11-06):** la reserva llegó a dejar 8 a 25 invasores esperando en el valle. Un riesgo encontrado: si los aliados se quedan sin grupos (todos replegados o muertos), la reserva no debe seguir esperando, porque la oleada no terminaría. Por eso sin grupos enemigos no hay reserva, y ningún grupo espera más de 30 s.

## Cada unidad, hoy

El código ya tiene una especie de máquina de estados: los grupos de componentes de cada JSON. Los cambia el script.

### Soldado aliado (60 de vida, 4 de daño)

| Estado | Percibe | Quiere | Cambia de idea cuando |
|---|---|---|---|
| Patrulla | Invasores alcanzables a 16 bloques | Quedarse cerca de su puesto | Cae la puerta, u orden del jugador |
| Pelea | Alcanzables a 40 | Atacar sin alejarse de su casa | Orden, o cae al agua |
| Salida | Alcanzables a 100; si no hay, el marcador del puente | Buscar invasores | Orden, o cae al agua |
| Retirada | Enemigos a 5; marcador a 200 | Correr al punto de reunión | Llega, o pasan 45 s |
| Defensa | Alcanzables a 16 | Defender el punto de reunión | Orden |
| Regreso | Enemigos a 12; hitos de la ruta | Volver a pie desde el agua | Termina la ruta |

**Problemas:** todos comparten el mismo marcador de salida, de ahí la bola en el puente. Ya abre puertas (v0.1.21), pero falta confirmar en el juego si eso los saca del castillo. No cava: si cae fuera, como los 3 de la batalla de referencia, depende de encontrar camino.

### Mago aliado (30 de vida)

Igual que el soldado, pero dispara y exige ver al objetivo. No se mueve hacia él: es una guardia fija. Al regresar del agua pelea cuerpo a cuerpo.

### Soldado invasor (40 de vida, 4 de daño)

| Estado | Percibe | Quiere | Cambia de idea cuando |
|---|---|---|---|
| Marcha | Enemigos alcanzables a 24 (cada 2 s); si no hay, el rastro de la caza o el enemigo vivo más cercano | Acabar con los vivos | Cae al agua |
| Regreso | Enemigos a 12; hitos de la ruta | Volver a pie | Termina la ruta |

Además, el script `sappers.ts` lo pone a cavar si avanza menos de 1,2 bloques en 3 s.

**Arreglado en v0.1.21:**

- Persigue solo a quien puede alcanzar, y la meta queda como último recurso.
- `isFighting` ya no cuenta a un enemigo en otro piso o tras una pared, así que ya no deja de cavar por eso.
- Abre puertas con `annotation.open_door`.
- Sin `behavior.break_door`, que ninguna entidad usa, ni `can_break_doors`, que sin `annotation.break_door` no servía para derribar.

**Problemas que siguen, leídos en el código:**

- **Solo cava hacia el corazón,** aunque su enemigo real esté en otro sitio.
- **Se detiene a 12 bloques del corazón,** aunque esté bajo tierra.
- **Nunca cava hacia abajo.** `digPlan` no lo contempla.

### Mago invasor (24 de vida)

En asedio dispara al muro con un punto de mira que el script mueve. En asalto dispara a los enemigos a 80 bloques, sin exigir verlos. Es el único que rompe mucho, y hay pocos a propósito: unos 8 a 10 de cada 80.

### Lo que falta en todos

Ninguna unidad reacciona a sus compañeros: no sabe si su grupo va ganando, ni si otro necesita ayuda, ni si ya hay muchos en el mismo sitio. Esa información solo la puede tener el director.

## El director de batalla

Hoy las decisiones colectivas están repartidas:

| Decisión | Dónde está | Cómo |
|---|---|---|
| Órdenes del jugador | `orders.ts` | A todos a la vez |
| Liberar aliados tras la brecha | `allies.ts` | A todos a la vez |
| Refuerzos | `reinforcements.ts` | Reserva limitada |
| Cavar | `sappers.ts` | Cada unidad por separado |
| Regreso del agua | `returnPath.ts` | Cada unidad por separado |

**Propuesta:** un director que piense en **grupos de 6 a 10 unidades**, no en unidades sueltas ni en el ejército entero. El grupo es la pieza que resuelve varios problemas a la vez:

| Problema | Qué haría el director |
|---|---|
| Bolita | Dar un destino distinto a cada grupo y repartir el frente |
| Aliados en bola por el puente | Sacar cada grupo por una ruta o marcador propio |
| Unidades atoradas | Calcular una sola ruta por grupo, repartida entre ticks |
| Rescate | Enviar al grupo más cercano, no a todos |
| Moral y repliegue | Replegar al grupo que va perdiendo |
| Guerra progresiva | Mantener un tope en el campo y hacer entrar a la reserva por grupos |

No está probado todavía. Es la consecuencia lógica de los datos: separar y repartir, en lugar de limitar quién ataca a quién.

## Plan propuesto

### Hecho: arreglos pequeños (v0.1.21)

Puertas, `isFighting`, `must_reach` con la meta como último recurso y limpieza de componentes. Mejoran mucho, pero la batalla aún se estanca (ver «Batalla real»).

### Hecho y confirmado por Limbers en juego: la caza (v0.1.22)

Idea de Limbers: sin meta fija. Su objetivo es acabar con los vivos, y derriban lo que les estorbe. Está en `scripts/systems/hunt.ts` y `huntLogic.ts`.

1. Sin meta del corazón. La de la puerta se queda para marcar la brecha, y solo se persigue si no queda ningún enemigo vivo.
2. Quien no alcanza a nadie va a por el enemigo vivo más cercano, sea aliado o jugador. Cuando solo queda el jugador, van todos a por él.
3. Si se atasca, el script busca una ruta, repartida entre ticks y una sola a la vez, y crea un rastro que siguen hasta 12 soldados. Hay 8 rastros como máximo.

**Elegido por ahora, se puede cambiar:**

- No se rompe nada fuera de la zona de asedio, ni en el puente ni en la orilla.
- Un jugador en modo creativo o espectador no cuenta como presa.
- Solo cazan los invasores; los aliados no se abren paso.
- El mago invasor busca enemigos a 256 bloques tras la brecha, pero no cava.

Los **grupos** no son necesarios para esto y pueden esperar a la Fase 3, cuando las fichas de la Fase 2 permitan añadirlos en un solo sitio.

### Fase 2: fichas de unidad

Cada ficha incluye desde el principio sus sentidos, sus estados y sus cambios de idea. Conviene dar a cada unidad algo de variación en vida o daño, para evitar duelos decididos de antemano.

### Fase 3: combate orgánico

Cambia respecto al plan original:

- **Fuera:** parejas con etiquetas.
- **Dentro:** director por grupos, destinos repartidos, moral y rescate con cuerno.
- **Primer experimento, hecho:** ver «Grupos en campo abierto». Los destinos repartidos no bastan; la reserva sí ayuda. Los ajustes de empuje quedan sin probar.

### Hecho (v0.1.52), sin probar en juego: el director decide qué hacer con las unidades inalcanzables

Elegido por Limbers el 2026-11-07, tras ver las opciones con sus costes:

- **Entran** el paso 1 (ruta a pie) y el paso 3 (el inalcanzable baja a pelear), en los dos bandos.
- **Fuera:** el paso 2 (tiradores a un sitio con vista), por ser el más caro y el que menos garantiza.
- **Las escaleras,** primero como prueba de laboratorio (`tools/lab/ladder.ts`).
- **El abandono a los 45 s** se queda como red de seguridad.
- **Los aliados solo caminan:** no rompen su castillo.

Cómo funciona (`scripts/systems/unreachable.ts`, lógica pura en `unreachableLogic.ts`):

1. Un grupo deja a su objetivo (15 s sin acercarse, como antes) y se abre un **caso** para ese objetivo.
2. **Ruta a pie.** Se busca camino desde el grupo hasta el objetivo. Las búsquedas comparten con la caza una cola común (`routeJobs.ts`), una a la vez, así que el peor tick no se duplica.
   - Si la ruta llega, se guía al grupo: el marcador del grupo va unos pasos por delante en la ruta.
   - Si hay que romper (solo invasores, dentro de la zona de asedio), se usa un rastro de la caza.
   - El grupo guiado conserva su objetivo aunque esté a otra altura y no espera en la reserva.
   - Falla si no hay ruta, si el grupo pasa 12 s sin avanzar por ella o si no llega en 30 s. Entonces el grupo invasor vuelve a la ruta de subida, como antes del director. Otro grupo que deje al mismo objetivo lo reintenta, hasta 2 fallos.
   - Los aliados solo persiguen al marcador con la orden de ataque, así que sin ella el director no toma sus grupos.
3. **Tropas adecuadas:** sin hacer. Queda marcado en `unreachableLogic.ts` dónde iría (tiradores con vista o unidades aéreas).
4. **Baja a pelear.** Con algún fallo y 20 s sin bajas en ningún bando, el inalcanzable baja: el aliado al patio (sin patio, sale a atacar) y el invasor a la ruta de subida.
   - Desde la v0.1.53 busca ruta a su destino con escaleras de mano y, si la hay, baja por ellas (ver «Escaleras del director»).
   - Si ni así tiene ruta y en 10 s no se acerca 2 bloques a su destino, humo: el aliado aparece en un punto del patio; el invasor, en el hito de subida más cercano (si no hay, en la brecha o donde aparecen los invasores).
   - Se espera a que no haya bajas para no mover al arquero de la muralla mientras la pelea sigue. Un jugador nunca baja.
   - El último reducto usa la misma bajada.
5. La red de seguridad (45 s) actúa después: 20 s sin bajas llegan siempre antes que 45 s sin avances.

**Por medir:** que el pirómano de la torre de la esquina de Stonehill baje por el paso 3; cuántas veces salen «Inalcanzable», «Bajada» y «Atasco» en el registro; y los ticks/s frente a la v0.1.51.

#### Prueba de escaleras de mano (2026-11-07)

`tools/lab/ladder.ts`: torre maciza de 5x5 y 10 de alto, columna de escaleras de mano en su cara este, intentos de 30 s como mucho. Visto también en vivo por Limbers.

| Variante | Bajar | Subir |
|---|---|---|
| Sin escalera | 0 de 5 | — |
| Escalera, la criatura busca camino sola | 0 de 5 | 0 de 3 |
| Guiada por un marcador de la caza hasta el borde y la escalera | 0 de 3 | — |
| **Empujada:** el script la mete en la escalera (un bloque) | **5 de 5, 3 s** | 0 de 5 (cae al pie y se queda) |
| **Asistida:** empujada, y el script la sube a la velocidad de trepar (0,12 bloques por tick) | — | **5 de 5, 6 s** |

Ninguna prueba tuvo caídas con daño. Las criaturas, a la vez, cuentan con las escaleras al moverse (`can_climb`) pero no al buscar camino: no se meten en ellas solas, ni guiadas hasta el borde. Una vez dentro, **bajan solas**, porque la gravedad hace el trabajo, pero **no suben**: su buscador de caminos no encuentra ruta hacia arriba y no empujan.

Por eso, si las escaleras sustituyen al humo, el director tiene que poner la columna, llevar a la unidad hasta su pie o su borde, meterla en ella y, para subir, subirla él. La bajada se ve natural. La subida asistida se ve como trepar, pero la mueve el script. El planificador de rutas ya cuenta las escaleras como subibles (`CLIMB` en `routeLogic.ts`), así que el paso 1 encontraría esas rutas y el director sabría dónde empujar.

Lo que dicen las fuentes coincide con la prueba ([refs/rutas-y-escalada.md](refs/rutas-y-escalada.md)):
- el buscador de caminos de andar (`navigation.walk`) no tiene ninguna opción para las escaleras de mano;
- hay un error abierto en Mojang sobre `can_climb`;
- Bedrock no tiene un componente para hacer trepable un bloque propio.

La única forma de que una criatura suba sola es el buscador de caminos de las arañas (`navigation.climb`), que trepa cualquier pared.

**Decidido por Limbers (2026-11-07):**
- Primero, escaleras **solo para bajar**, sin la subida asistida.
- Ese mismo día pidió también **subir**, aunque sea asistido y no se vea del todo natural. Para los invasores, también por fuera de la muralla, **como asalto**. Hecho en la v0.1.53: ver «Escaleras del director».
- El modo araña queda para una **unidad nueva que trepe muros** (un monstruo), más adelante, y no para los soldados.

Un fallo de la prueba que se arregló por el camino: un `fill` de más de 32.768 bloques falla sin avisar, y dejaba barreras de un intento anterior. Las primeras subidas y la primera bajada guiada se repitieron por eso.

#### Escaleras del director (v0.1.53 y v0.1.54), probadas en el laboratorio y en un asedio de Stonehill

**El planificador las pone** (`routeLogic.ts`, opción `ladders`, hasta 24 bloques). Hay dos movimientos nuevos:
- **Bajar:** desde un borde donde la caída pasa de 3 bloques, la columna de al lado hasta el suelo.
- **Subir:** desde el pie de una pared de 2 o más, la propia casilla hasta salir por encima.

Condiciones de cada escalera:
- Va solo en casillas libres; no rompe nada para ponerla.
- Cada casilla tiene que apoyarse en un bloque macizo y entero. Si no hay pared detrás, vale cualquier otra pared al lado.
- No se baja hasta el agua.
- Para salir por encima hacen falta 2 casillas libres, así que una valla o una almena lo impiden.
- Poner una escalera cuesta como unos pasos de rodeo: si se puede andar, se anda.

Así **funciona en terreno irregular**: la ruta encadena escaleras con tramos a pie y busca columnas con pared, rodeando cornisas y bultos. Lo comprueban 12 pruebas en `tests/ladderRoute.test.ts`: saliente a media altura, cornisa que sobresale en parte o por todas partes, agua abajo, almenas, valla en lo alto y altura máxima.

**El director las usa** (`ladders.ts`, lógica pura en `ladderLogic.ts`):
- Las rutas del paso 1 (los dos bandos) y las de quien baja (paso 3 y último reducto) se piden con escaleras.
- Al tener la ruta, pone los bloques. Solo donde sigue libre, y guarda lo que había.
- El marcador del grupo espera en la entrada de cada escalera (`firstLadder`, `advanceWithLadders` en `huntLogic.ts`).
- A quien llega a 3 bloques de la entrada (6 si baja solo, porque no tiene marcador) lo mete en la escalera y lo lleva tick a tick, de cara a la pared:
  - al subir, a la velocidad de trepar (0,12 bloques por tick); arriba lo pasa al borde;
  - al bajar, a 0,2 bloques por tick, lo medido en el laboratorio. Lo baja también el director porque el marcador sigue arriba, en la entrada, y la criatura podría volver a trepar hacia él.
- Si alguien se atasca en la escalera, al rato lo deja al otro extremo con humo.
- Quien va por una escalera cuenta como avanzar: el caso no falla por «no avanza».
- **El humo** queda solo para quien baja y no tiene ruta ni con escaleras.
- Las escaleras se quedan hasta reiniciar, como los muros rotos, y entonces se repone lo que había. Como los muros, si el servidor se cae a mitad de partida, se quedan puestas.

**Laboratorio** (`tools/lab/climb.ts`). Usa las piezas reales: el planificador, `Ladders` y el marcador que espera ante cada escalera. 3 intentos por prueba, 0 caídas con daño:

| Terreno | Llegaron | Tiempos | Escaleras |
|---|---|---|---|
| Acantilado irregular (meseta de 14, saliente a media altura, cornisa sobre medio saliente, bultos en la cara), bajar | 3 de 3 | 21, 12, 14 s | 2: rodea la cornisa y los bultos por el norte |
| El mismo, subir | 3 de 3 | 11, 12, 12 s | 2 |
| Muralla de 8 con almenas, subir | 3 de 3 | 3 s | 1, en un hueco entre almenas |
| La misma, bajar | 3 de 3 | 2 s | 1 |

El primer intento de bajada tuvo una pausa de 10 s a media ruta que no se repitió; no se encontró la causa.

**En un asedio de Stonehill (v0.1.53, 2026-11-07),** con Limbers mirando en modo espectador y los arreglos subidos en caliente:

- **Lo que salió bien:** los invasores llegaron a los arqueros de lo alto de una torre por escaleras, cruzaron el puente a la otra torre y subieron a por los de allí. Un arquero cayó al puente y bajaron a por él; como quedaba otro arriba, volvieron a subir.
- **Lo que salió mal, y su arreglo en la v0.1.54:**

| Problema visto | Causa | Arreglo |
|---|---|---|
| Los invasores llegaban junto al arquero y lo golpeaban sin hacerle daño | Golpeaban al marcador del grupo. `nearest_attackable_target` exige camino (`must_reach`), y el navegador del juego no cuenta las escaleras, así que no elegían al arquero | **Un toque del objetivo al llegar** (elegido por Limbers): durante 20 s, quien llega a 3 bloques recibe 1 de daño de su objetivo, como si este le hubiera golpeado, y `hurt_by_target`, que no exige camino, lo lanza contra él. Muertos 8-11 s después de llegar; antes un arquero aguantó más de 60 s |
| Un grupo no llegaba en 30 s por una ruta de 101 pasos con 4 escaleras | El plazo era fijo | Plazo según la ruta (`guideBudget`): 0,4 s por paso y, por escalera, 4 s más su recorrido; entre 30 y 120 s |
| Invasores que se quedaban en lo alto de la torre al morir su objetivo o al fallar la ruta | Nadie los bajaba | Bajan por la ruta, con escaleras si hace falta (`bringDown`): al fallar la ruta, al morir su objetivo o, si sigue vivo, a los 60 s de llegar |
| Las bajadas no seguían la ruta: los invasores se quedaban empujando hacia el hito de abajo | La caza no existía en Stonehill (no tiene zona de asedio), y quien baja seguía al hito y no a la ruta | La caza existe en todos los mapas; sin zona, solo guía (no busca presas). El invasor que baja sigue su ruta como un rastro (`Hunts.lead`) |
| Escaleras sobre losas o trampillas, que se caían al suelo | El lector de casillas fuera de la zona perdía la marca de «bloque a medias» | Se conserva la marca; una escalera solo se apoya en un bloque macizo y entero (`holdsLadder`) |
| Casi todas las escaleras de la base de una torre caían | Los pirómanos quemaban el muro de tablones donde se apoyaban; también las explosiones arcanas | Si la escalera cae y el apoyo sigue en pie, se repone mientras alguien la usa. El planificador prefiere apoyarse en piedra: una pared que arde suma 3 al coste de la escalera |

- **Cifras de la oleada 1, antes y después de los arreglos:** «Atasco» de 2 a 0, «Encajado» de 21 a 1 y bajadas por la ruta de 0 a 6.
- **Coste:** 20,0 ticks/s de media y 19,2 en el peor momento, durante toda la oleada 1, con búsquedas de 143 a 152 pasos. El tirón que vio Limbers en los movimientos de la oleada 1 no se repitió al medir.
- **Quedan:** la preferencia por la piedra está construida pero sin probar en una partida; algún fallo «no avanza» en rutas cortas a pie; y una bajada con humo desde la ladera oeste (-295, 131, 198).
- **Un diagnóstico equivocado que se corrigió:** en la esquina de la torre parecía haber un hueco de medio bloque. Era una losa y una trampilla cerrada, y los invasores empujaban hacia el hito de abajo; lo arregló la bajada por la ruta, sin tocar el mundo.

**Por medir:** cuántas escaleras ponen los invasores en la muralla en un asedio completo y si eso cambia el ritmo. El coste en la batalla grande ya está medido: no eran las escaleras, sino `reselect_targets` (ver «Coste en batallas grandes, otra vez»).

Lo que sigue es la idea tal como se anotó, antes de decidir:

- **Anotada por Limbers el 2026-11-07,** para retomarla en esta fase o en otra.

- **Alcance (Limbers, 2026-11-07):** vale para cualquier unidad a la que no se llegue, aliada o enemiga, no solo cuando quedan pocos aliados. Funciona igual para los dos bandos.
- **El problema (ejemplo):** aliados o invasores donde no se llega a pie (arqueros y pirómanos en lo alto de una torre, en una muralla, al otro lado de un barranco), los soldados invasores no los alcanzan. Los arqueros y magos invasores tampoco son una solución segura: solo disparan a lo que ven y a su alcance.
- **La idea:** que el director lo note, para cualquiera de los dos bandos, y decida qué hacer:
  1. Primero, buscar una ruta a pie hasta ellos (hitos, como la ruta de subida) y mandar por ella a un grupo.
  2. Si por ahí no llegan, mandar las tropas adecuadas. Hoy serían arqueros o magos llevados a un sitio desde el que vean al objetivo. Cuando haya **unidades aéreas** (Fase 6 / «Más adelante»), serían ellas las que vayan a por los arqueros o las unidades muy fuera de alcance.
  3. Si de plano nadie puede llegar (ni a pie ni con tropas adecuadas, por ejemplo porque aún no hay unidades aéreas), se usa lo de hoy: las unidades inalcanzables bajan a pelear, como en el último reducto (Limbers, 2026-11-07).
- **Provisional (v0.1.46):** en Stonehill el pirómano de lo alto de la torre de la esquina no tiene camino a pie para bajar. Si en el último reducto un tirador pasa 10 s sin acercarse al patio, se le lleva allí con una nube de humo. Limbers lo aceptó de momento y quiere **analizarlo a fondo más adelante para mejorarlo**, junto con esta idea.
- **Alternativa propuesta por Limbers (2026-11-07): escaleras.** La unidad sin camino pone una columna de escaleras de mano en una pared con caída libre (de lo alto de la torre al patio, por ejemplo) y baja por ella; al reiniciar se quitan, como los muros. Al revés serviría a los invasores para subir a por los tiradores de la muralla, y encaja con las «escaleras de asalto» de la Fase 6. **Antes hay que probar** si las criaturas cuentan con las escaleras al buscar camino (`minecraft:can_climb` las deja trepar, pero puede que solo cuando ya las tienen delante). Si funciona, sustituiría a la nube de humo. **Probado** (2026-11-07): ver «Prueba de escaleras de mano» más arriba.
- **Atasco visto en la v0.1.46:** invasores y aliados en salientes distintos del acantilado bajo la puerta de Stonehill, a 2-5 bloques, sin poder golpearse. Como estaban cerca, ni el abandono de objetivo (15 s) ni la red de seguridad actuaban. Desde la v0.1.47, tras 90 s sin ninguna baja estar cerca de un enemigo ya no cuenta como pelear.
- **Antes descartado (2026-11-06):** que el director lleve tiradores a un sitio con vista. Exige calcular desde dónde se ve a cada enemigo y no garantiza que la oleada termine, porque puede no haber ningún sitio con vista. Por eso se eligieron, de momento, las opciones de abajo.
- **Lo que hay hoy (v0.1.45):** el grupo que no se acerca a su objetivo en 15 s lo deja y vuelve a la ruta de subida; si solo quedan tiradores aliados y pasan 20 s sin bajas, bajan al patio (último reducto); y tras 45 s sin avances, los invasores que no se mueven de su sitio abandonan el asedio. La idea de arriba sustituiría a la última por algo más vistoso.

### Fase 4: guerra progresiva

El tope en el campo cobra más importancia: es lo que más directamente limita la densidad.

#### Primer paso de la Fase 4: «lugares» en vez de un solo castillo

Pedido por Limbers (2026-11-07) al ver la postura defensiva de la v0.1.51: que los conceptos no dependan del mapa y que cada mapa los aplique a su manera. Ejemplo suyo: un mapa con aldeas y soldados en cada una. Deben defender su posición; si los superan, retirarse a la aldea más cercana donde pueda haber más unidades, o a la base inicial si ya no queda nada. Se hace al empezar la Fase 4, antes del presupuesto de oleadas, porque las reservas que entran por grupos también necesitan saber a qué lugar va cada refuerzo.

**Estado actual (v0.1.51).** Ningún código depende de un mapa concreto: cada mapa es un archivo de datos (`scripts/maps/`) y los mismos sistemas sirven en los cuatro. Pero el modelo supone **un solo castillo por mapa**:

| Concepto | Hoy | Por qué no sirve con aldeas |
|---|---|---|
| Base | Una por mapa | No se puede declarar más de una |
| Escalera de la moral | Campo, patio y torre, fija (`Layer` en `moraleLogic.ts`) | No existe «retirarse a la aldea vecina» |
| «Fuera del castillo» (postura B) | Respecto a las puertas (`stanceLogic.ts`, `isOutside`) | Una aldea sin muralla no tiene puertas: nadie la vigilaría |
| Puestos y patio | Una lista para todo el mapa (`defensePosts`, `rallyPoints`) | No se sabe qué puesto es de qué aldea |
| Refuerzos | Unos puntos de aparición y van a los puestos de todo el mapa | No pueden ir a la aldea que más los necesita |
| Zona de la base (intrusos) | Un cilindro alrededor de todo (`intruderLogic.ts`, `baseZone`) | Con aldeas separadas abarcaría el mapa entero |
| Órdenes del jugador | A todos los aliados a la vez (`orders.ts`) | Falta decidir si se dan por lugar |

Lo que ya es general y no cambia: el director de grupos y la reserva, la moral (salvo a dónde se repliega), medir fuerzas (postura C), la escolta del cuerno, la caza y el regreso desde el agua.

**Diseño propuesto.** Cada mapa declara una lista de **lugares** (castillo, aldea, torre de vigía, puesto avanzado). Cada uno tiene:
- su **zona**, un área con o sin muralla; las puertas pasan a ser opcionales;
- sus **puestos**, su **punto de reunión** y, si quiere, su **último reducto**;
- su **guarnición**: cada aliado pertenece a un lugar (el de su posición inicial, o el que le toque al llegar como refuerzo);
- si es la **base principal**, el último sitio al que retirarse.

Reglas iguales para todos los lugares:
1. **Defender su lugar:** no salir de su zona (la postura B, generalizada).
2. **Aguantar en desventaja:** la postura C, tal como está.
3. **Retirarse si los superan:** primero dentro de su lugar (puesto, reunión, último reducto); si el lugar cae, al **lugar amigo más cercano que aún tenga tropas**; si no queda ninguno, a la base principal.
4. **Refuerzos al lugar que más los necesita.**

Los mapas actuales pasan a ser «un mapa con un solo lugar, el castillo», con una conversión automática de sus datos de hoy: no hay que reescribirlos y deben comportarse igual (lo comprueban las pruebas).

**Coste estimado:** mediano o grande. Toca órdenes, moral, postura, refuerzos, intrusos, el formato y la validación de los mapas, y las entidades (un marcador de reunión por lugar, con un máximo de lugares por mapa, como hoy los puestos). Para validarlo, un mapa de prueba con 2 o 3 aldeas y una base.

**Por decidir al empezar:** si las órdenes del jugador (pluma y vara) se dan a todo el mapa o al lugar más cercano; cómo se mide «aún tiene tropas» (número de aliados o fuerza frente a los invasores cercanos); y si un lugar caído se puede recuperar.

#### Rutas en mapas grandes (investigado el 2026-11-07, sin probar)

Con lugares, los mapas crecen y la búsqueda de hoy se quedará corta: una a la vez y 12.000 casillas como mucho. Sobre Bedrock hay muy poco: la API de scripts no trae buscador de caminos, y no hay mediciones públicas de leer bloques ni buscadores de la comunidad para scripts. De los juegos de estrategia salen dos técnicas probadas. Fuentes y detalle en [refs/rutas-y-escalada.md](refs/rutas-y-escalada.md).

- **Búsqueda por niveles (HPA\*).** El mapa se divide en zonas y se guarda de antemano cuánto cuesta cruzar cada una. Según su artículo, es hasta 10 veces más rápida que la búsqueda normal, con rutas a menos del 1 % de la mejor; en rutas cortas, la normal gana. Nuestros hitos de subida ya son una versión hecha a mano. Con lugares, cada lugar sería una zona y los caminos entre lugares se calcularían al cargar el mapa o por adelantado con `tools/bedrock-world.mjs`.
- **Campos de flujo.** Se calcula una vez, para todo el mapa, hacia dónde ir desde cada casilla hasta un destino, y mover 100 unidades cuesta lo mismo que mover una. Encaja con la oleada (muchos invasores hacia la misma meta) y con la retirada a un lugar amigo. La pega: un campo por destino, y memoria. Habría que medirlo en la tablet.
- **No resuelto en ninguna fuente:** cómo se hacen las zonas en un mundo de bloques en 3D, con escaleras, caídas y saltos.

### Mapas nuevos

El planificador de rutas no depende del mapa: solo lee bloques. Lo propio de cada mapa son sus marcadores y frentes. **Queda como idea sin probar** calcular rutas por adelantado con `tools/bedrock-world.mjs` y guardarlas con el mapa.

## Falta por medir

| Prueba | Quién | Por qué importa |
|---|---|---|
| `/scriptevent bastion:lab bench` en la tablet | Limbers | El coste en la PC no vale para la tablet |
| Capacidad de unidades en la tablet | Limbers | Fija el tope real; hasta ahora, unas 130 sin trabarse |
| Rescate con el jugador encerrado | Limbers | Solo se probó sin jugador |
| Ver una batalla con los arreglos | Limbers | Que se sienta orgánico solo se puede juzgar mirándolo |
| Peleas en campo abierto, con grupos y empuje | Servidor | Es la solución que propongo y sigue sin medir |
| Coste separado: filtros o script de parejas | Servidor | Solo si se quiere retomar la idea de parejas |
| Rutas repartidas en plena batalla | Servidor | `must_reach` ya se midió en batalla; las rutas, no. En la oleada 1 de Stonehill, con escaleras, no bajaron de 19,2 ticks/s (v0.1.54) |
| Escaleras apoyadas en piedra en un asedio | Servidor | La v0.1.54 prefiere la piedra a los tablones que queman los pirómanos; sin probar en una partida |
| Batalla grande con la partida corriendo en la tablet | Limbers | Con unas 400 unidades la PC iba a 7,5 ticks/s en la v0.1.24 y va a 2-4 desde la Fase 3 por `reselect_targets` (19-20 sin él, pero con atascos); la tablet, sin medir. Pierde importancia con la migración a Java |
| Causa de los 4 rezagados de la ladera oeste | Servidor | Puede ser un fallo del planificador |

## Migración a Java (decidida el 2026-11-07)

Limbers jugará en Arch Linux (PC) y quiere realismo: invasores que pican muros con animación, ponen ellos mismos las escaleras, usan barcos de verdad y encuentran rutas sin rescates; y, más adelante, unidades aéreas y acuáticas, arietes y dragones. En Bedrock la navegación es una caja negra y casi todo lo de este documento son formas de empujarla (marcadores, etiquetas como filtros, el toque, balsas, rescates, el coste de `reselect_targets`). En Java con Fabric se puede leer y cambiar el código del juego, fijar objetivos y rutas desde el código, depurar con puntos de parada y probar con GameTest.

El proyecto nuevo está en `../Bastion-Java` (junto a esta carpeta), con la guía completa: por qué, stack, qué se porta de aquí, la prueba inicial y cómo retomarlo. Este repositorio queda como referencia: su lógica pura (`scripts/systems/*Logic.ts`) y sus pruebas se traducen a Kotlin.

## Código de esta investigación

- `scripts/systems/routeLogic.ts` y `tests/routeLogic.test.ts`: planificador puro, con pruebas. Se conserva.
- `tools/lab/`: laboratorio y batalla de referencia, fuera del pack. Cómo activarlo y usarlo: [tools/lab/README.md](../tools/lab/README.md).

## Fuentes

Lo investigado después, con lo que dice cada fuente, está en [refs/](refs/README.md).

- [Clase Entity, API de scripts](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity)
- [Movimiento de entidades, Bedrock Wiki](https://wiki.bedrock.dev/entities/entity-movement)
- [Vigilante de scripts, Bedrock Wiki](https://wiki.bedrock.dev/scripting/script-watchdog)
- [`system.runJob` y programación por ticks](https://learn.microsoft.com/minecraft/creator/documents/scripting/system-run-guide)
- [`follow_target_leader`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_follow_target_leader)
- [`nearest_attackable_target`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_nearest_attackable_target)
- [`melee_attack`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_melee_attack)
- [`navigation.walk`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_navigation.walk)
- [`pushable_by_entity`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_pushable_by_entity)
- [`annotation.open_door`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_annotation_open_door)
- [`annotation.break_door`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_annotation_break_door)
- [`break_door`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_break_door)
- [`break_blocks`](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_break_blocks)
- [Endstone](https://pypi.org/project/endstone)
- [LeviLamina](https://minecraft.how/blog/post/levilamina-bedrock-mod-loader)
