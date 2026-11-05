# Inteligencia de las unidades

Investigación previa a la Fase 2 (2026-11-05). Reúne dos temas que resultaron ser uno: **cómo se comporta cada unidad** y **cómo se mueve por mapas enormes**.

Salvo que se indique otra cosa, las medidas son del servidor de prueba en la PC, sin jugador conectado, en Old Fallen Castle y con unidades de laboratorio. Nada de esto se ha probado aún en la tablet. Los arreglos pequeños ya están en las unidades reales (v0.1.21); la caza y los grupos, no.

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
| ¿Por qué se estancan las batallas? | Se quedan sin nadie alcanzable y la excavación solo apunta al corazón. | En parte medido; la causa exacta del segundo estancamiento, leída en el código |

## Lo que se vio en el juego

- Se amontonan intentando atacar a un enemigo que está debajo y no pueden alcanzar.
- Sin piromano, no rompen el bloque que tienen delante y se quedan atorados.
- Los aliados solo salen del castillo por el puente, todos en bola.
- Todo eso estancó la batalla de 200 contra 200.

Una batalla de referencia con 30 aliados y 60 soldados invasores, más los de las oleadas, apunta en la misma dirección. Los bloques derribados por cada 30 s fueron 38, 87, 70, 31, 23 y 11, y casi ninguno desde el minuto 3,5. A los 5,5 minutos quedaban 46 invasores y 12 aliados, a 20 ticks/s. La prueba se cortó ahí y no se registró dónde estaban, así que no demuestra la causa por sí sola.

## Batalla real: la meta del corazón

Es la medida más importante de este documento, y salió después de las demás. Son 30 aliados y 60 soldados invasores con las unidades reales, sin piromanos, durante 9 minutos, con y sin los arreglos pequeños. El jugador se conectó a mitad de la primera y casi desde el inicio de la segunda, y no sé cuánto influyó.

| Al final | Antes | Con arreglos (v0.1.21) |
|---|---|---|
| Invasores y aliados vivos | 50 y 9 | 29 y 3 |
| Bajas de invasores y de aliados | 26 y 25 | 47 y 31 |
| Bloques derribados | 215 | 462 |
| Último minuto con combate o excavación | Hacia el 4 a 6 | Hacia el 5,5 |
| Invasores en el patio | 31 | 14 (8 junto a la meta) |

**Causa de la bola de la captura:** `bastion:objective`, la meta invisible del corazón, contaba como un objetivo más. Al ser lo más cercano al llegar, nadie la soltaba, y como no muere, se quedaban golpeándola para siempre. Unos 31 de 50 estaban a 3 bloques o menos de ella, y los aliados a unos 22 bloques, sin que nadie los atacara.

**Qué cambió el arreglo:** la meta pasa a ser el último recurso, detrás de cualquier enemigo alcanzable. A los 8 minutos no había nadie junto a ella y se derribó el doble.

**Qué no resuelve:**

- Sin nadie alcanzable, vuelven a la meta: a los 9 minutos ya había 8 junto a ella.
- La batalla se estanca igual desde el minuto 5,5. Los 3 aliados vivos estaban en la ladera oeste, unos 15 bloques por debajo del patio, y 8 invasores en el agua.
- Causas probables, leídas en el código: la excavación apunta siempre al corazón, se detiene a 12 bloques de él aunque la unidad esté dentro de la roca, y la meta solo se detecta a 100 bloques.

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

Con 280 unidades (240 invasores que no pueden llegar y 40 aliados): 20,0 ticks/s con y sin `must_reach`. No se ve coste, pero 20 es el máximo posible y no había combate, así que no demuestra que sea gratis.

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
| Marcha | Enemigos alcanzables a 100; si no hay, la meta a 100 | Llegar al corazón del castillo | Cae al agua |
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

### Propuesta sin aprobar: la caza, antes de la Fase 2

Idea de Limbers: sin meta fija. Su objetivo es acabar con los vivos, y derriban lo que les estorbe.

1. Quitar la meta del corazón. La de la puerta del puente se queda, porque también marca la brecha.
2. Quien no tiene objetivo alcanzable va a por el enemigo vivo más cercano, sea aliado o jugador. No solo a por el último jugador: si no, la bola se forma a su alrededor y los aliados sobran. Cuando solo queda el jugador, sí van todos a por él.
3. Si no puede llegar, abre camino con el planificador de rutas, no en línea recta: rompe solo lo necesario.
4. Repetir la batalla de referencia y comparar con la tabla de arriba.

**Por decidir:**

- Qué pasa si el jugador se aleja de la zona rompible, porque hoy no se cava en el puente ni en la orilla.
- Qué hacen si nadie es alcanzable, por ejemplo con un jugador volando.
- Si los aliados también deben abrirse paso.

Los **grupos** no son necesarios para esto y pueden esperar a la Fase 3, cuando las fichas de la Fase 2 permitan añadirlos en un solo sitio.

### Fase 2: fichas de unidad

Cada ficha incluye desde el principio sus sentidos, sus estados y sus cambios de idea. Conviene dar a cada unidad algo de variación en vida o daño, para evitar duelos decididos de antemano.

### Fase 3: combate orgánico

Cambia respecto al plan original:

- **Fuera:** parejas con etiquetas.
- **Dentro:** director por grupos, destinos repartidos, moral y rescate con cuerno.
- **Primer experimento:** el mismo combate en campo abierto, con grupos y con los ajustes de empuje, comparado con estas tablas.

### Fase 4: guerra progresiva

Sin cambios. El tope en el campo cobra más importancia: es lo que más directamente limita la densidad.

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
| `must_reach` y rutas repartidas en plena batalla | Servidor | Hasta ahora, sin combate |
| Causa de los 4 rezagados de la ladera oeste | Servidor | Puede ser un fallo del planificador |

## Código de esta investigación

- `scripts/systems/routeLogic.ts` y `tests/routeLogic.test.ts`: planificador puro, con pruebas. Se conserva.
- `tools/lab/`: laboratorio y batalla de referencia, fuera del pack. Cómo activarlo y usarlo: [tools/lab/README.md](../tools/lab/README.md).

## Fuentes

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
