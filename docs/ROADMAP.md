# Roadmap de Bastion

**Empieza aquí en cada sesión.** Dice en qué fase vamos, dónde nos quedamos y qué sigue.
Al terminar una sesión, actualiza «Dónde nos quedamos» y marca lo que quedó hecho.

Cómo funciona el juego y cómo probarlo: [README](../README.md).

## Dónde nos quedamos

*Última actualización: 2026-11-05. Versión de los packs: 0.1.20. Último commit: el de la investigación de la IA.*

- **Fase actual:** investigación de la IA, antes de la Fase 2. Resultados en [IA.md](IA.md).
- **Último cambio:** planificador de rutas probado en el servidor y peleas medidas; ninguna unidad real ha cambiado.
- **Siguiente paso:** decidir el cambio de la Fase 3 y hacer los arreglos pequeños en las unidades actuales.
- **Importante:** el laboratorio (`scripts/lab/` y `entities/lab_*.json`) sigue en la copia de trabajo, sin commit, y entra en el pack al compilar. Hay que quitarlo antes de una versión para jugar.
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

- [ ] Abrir puertas en todas las unidades que caminan.
- [ ] No contar como pelea a un enemigo detrás de un muro o en otro piso.
- [ ] Atacar solo a quien se pueda alcanzar, con la meta como alternativa.
- [ ] Quitar `behavior.break_door` y `can_break_doors`, que no hacen nada.
- [ ] Repetir la batalla de referencia hasta el final y comparar.
- [ ] Quitar el laboratorio del pack.

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

- Mismo tope de unidades en el campo para cada bando, y una reserva que entra por grupos conforme caen.
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

- **Parejas o grupos repartidos.** Las parejas 1 contra 1 no redujeron la bolita, duplicaron el ritmo y bajaron el servidor a 4,7 ticks/s con 100 contra 100. Propuesta: sustituirlas por grupos con destinos distintos, aún sin probar.
- **Unidad atorada en el regreso.** Si un invasor se atasca para siempre, la oleada no termina. Hoy no hay teletransporte, porque no se quiere. Opción: usarlo solo como último recurso tras varios minutos sin avanzar.
- **Invasores que llegan al centro.** Sin aliados vivos, se quedan en el corazón del castillo y la oleada no termina. Se resuelve con la regla de derrota de la Fase 4.
- **Aliados al otro lado del muro.** Quien cae regresa por el puente y queda fuera hasta que el muro se abre. Hoy pelea ahí.

- **Regla de derrota.** Hoy se pierde solo al agotar las vidas de los jugadores. Propuesta: perder también cuando no quedan aliados ni reservas.

## Decisiones tomadas

- **Sin teletransporte al caer:** se regresa caminando, para que las peleas ocurran en varios lugares.
- **La escalera se queda:** cruzar por encima de un muro escalonado es una mecánica válida.
- **Peleas en el agua:** solo se apunta a quien nada si uno también está en el agua; así nadie se queda mirando el lago desde el puente.
- **El servidor de prueba se reinicia sin preguntar.**
- **Peleas menos frenéticas:** ni lentas ni a toda velocidad; un duelo entre soldados dura unos 15 a 30 segundos.
- **Aliados inmunes al fuego:** causaba cerca de dos tercios de sus bajas y los invasores ya eran inmunes. La explosión sí les hace daño.
- **Piromanos escasos:** unos 8 a 10 de cada 80 unidades, porque hacen mucho daño y destrozan el mapa.
- **Los soldados derriban paredes solo en la zona del castillo:** ni el puente ni la orilla.
- **El muro de la puerta lo rompen sobre todo los magos.** Los soldados también lo golpean, muy despacio, para que una oleada sin magos vivos no se quede atascada.

## Cómo mantener este documento

- Una sesión termina con «Dónde nos quedamos» al día: fase, último cambio y siguiente paso.
- Lo probado solo con tests no se marca como confirmado en el juego.
- Las ideas nuevas van a su fase; las dudas, a «Decisiones abiertas».
