# Roadmap de Bastion

**Empieza aquí en cada sesión.** Dice en qué fase vamos, dónde nos quedamos y qué sigue.
Al terminar una sesión, actualiza «Dónde nos quedamos» y marca lo que quedó hecho.

Cómo funciona el juego y cómo probarlo: [README](../README.md).

## Dónde nos quedamos

*Última actualización: 2026-11-05. Versión de los packs: 0.1.24. Rama: `feature/old-fallen-castle`, sin subir. Último commit: el del aligerado.*

- **Fase actual:** investigación de la IA, cerrada. Resultados en [IA.md](IA.md); empieza por «Conclusiones» y «Batalla real».
- **Último cambio:** la caza. Sin meta central, los invasores van a por el enemigo vivo más cercano y se abren camino con una ruta calculada.
- **Resultado:** la batalla de referencia ya no se estancó: mataron a todos los aliados y derrotaron al jugador hacia el minuto 8, con 126 bloques derribados. Es una sola batalla.
- **Confirmado por Limbers (2026-11-05):** «se sintió bastante mejor»; rompieron el castillo por un lado e invadieron. Pidió las peleas un poco más frenéticas.
- **Ajuste de ritmo (v0.1.23), aprobado por Limbers:** golpes cada 1,5 s en lugar de 1,75, y soldados un 12 % más rápidos. Duelos de 15 a 22,5 s.
- **Aligerado (v0.1.24), sin probar en juego:** Limbers pidió batallas de 300 a 400 por bando y con 400 unidades el servidor iba a 4 ticks/s. Lo más caro era comprobar si se puede llegar a pie a cada enemigo. Ahora solo se comprueba hasta 24 bloques (lo lejano lo resuelve la caza) y se busca enemigo cada 2 s. Con unas 400 unidades pasa de 4,0–4,6 a 7,2–7,7 ticks/s. El asedio de referencia acaba igual. Detalle en [IA.md](IA.md), «Coste en batallas grandes».
- **Batallas de 400 por bando:** ni con el aligerado caben todas a la vez. Hace falta el tope en el campo con reservas (Fase 4).
- **Siguiente paso:** empezar la Fase 2, unidades estándar. Limbers la retoma en otra sesión.
- **Vigilar:** el 73 % de las búsquedas de ruta agotan su límite. La tablet jugó conectada al servidor de la PC, así que falta medir las búsquedas con la partida corriendo dentro de la tablet.
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

- Los soldados aliados no cruzan su propio muro: con la orden de ataque esperan en la cubierta hasta que cae.
- En la retirada desde la cubierta, de 3 a 9 de cada 30 caen al lago por la cornisa y vuelven a pie.

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

### Fase 2, unidades estándar

Una unidad se define con una ficha de datos, y un generador crea sus archivos del juego. Sin esto, cada unidad nueva son cientos de líneas repetidas.

- Ficha por unidad: bando, rol, vida, daño, velocidad, skin, arma y coste.
- Roles reutilizables: cuerpo a cuerpo, arquero, mago y, más tarde, asedio. El bando decide quiénes son sus enemigos.
- Los comportamientos comunes (regreso a pie, peleas en el agua) viven en un solo sitio.
- Migrar las 3 unidades actuales sin cambiar cómo se juegan.
- Armas en las manos con objetos normales del juego (espada, arco): el modelo aún no tiene dónde sostenerlas. Sin modelado propio.
- Primeras unidades nuevas: guerrero y arquero aliados, arquero invasor.

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

### Más adelante

- Unidades aéreas y acuáticas, con más frentes en Old Fallen Castle.
- Civiles que huyen.
- Modelos y accesorios propios (armaduras, armas a medida) y arte definitivo.
- Revisar autor y licencia de las skins de `assets/skins/`.

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
- **Comprobar el camino solo de cerca:** `must_reach` solo hasta 24 bloques y búsqueda de enemigo cada 2 s, porque era lo que más pesaba en batallas grandes. Elegido por Limbers entre tres opciones (2026-11-05).
- **Ritmo de las peleas:** ni tan frenético como al principio ni lento; un duelo entre soldados dura unos 15 a 30 segundos. Tras probar la caza, Limbers lo pidió un poco más rápido (v0.1.23: 15 a 22,5 s).
- **Aliados inmunes al fuego:** causaba cerca de dos tercios de sus bajas y los invasores ya eran inmunes. La explosión sí les hace daño.
- **Piromanos escasos:** unos 8 a 10 de cada 80 unidades, porque hacen mucho daño y destrozan el mapa.
- **Los soldados derriban paredes solo en la zona del castillo:** ni el puente ni la orilla.
- **El muro de la puerta lo rompen sobre todo los magos.** Los soldados también lo golpean, muy despacio, para que una oleada sin magos vivos no se quede atascada.

## Cómo mantener este documento

- Una sesión termina con «Dónde nos quedamos» al día: fase, último cambio y siguiente paso.
- Lo probado solo con tests no se marca como confirmado en el juego.
- Las ideas nuevas van a su fase; las dudas, a «Decisiones abiertas».
