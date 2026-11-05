# Roadmap de Bastion

**Empieza aquí en cada sesión.** Dice en qué fase vamos, dónde nos quedamos y qué sigue.
Al terminar una sesión, actualiza «Dónde nos quedamos» y marca lo que quedó hecho.

Cómo funciona el juego y cómo probarlo: [README](../README.md).

## Dónde nos quedamos

*Última actualización: 2026-11-05. Versión de los packs: 0.1.18. Sin commit desde `c41bf1c`.*

- **Fase actual:** Fase 1, muros rompibles, con adelantos de las fases 3 y 5 que pidió la prueba a gran escala.
- **Último cambio:** soldados que derriban paredes por las laderas, refuerzos durante la oleada, órdenes de retirada y ataque (pluma y vara de blaze), pirómano aliado, y el jugador empieza en el techo del castillo.
- **Siguiente paso:** ver la batalla grande con el jugador dentro, confirmar el commit de todo lo acumulado y empezar la Fase 2, unidades estándar.
- **Pendiente de decidir:** qué hacer con una unidad que de verdad se atore en el regreso (ver «Decisiones abiertas»).

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

- [x] Refuerzos aliados durante la oleada, desde una reserva limitada (de la Fase 3). Cuando la reserva se acaba, no hay más hasta el descanso.
- [x] Oleadas con soldados por las laderas norte y oeste (de las fases 4 y 5).
- [x] Los soldados atascados derriban lo que les estorba, con rampas en la roca (de la Fase 5). Al reiniciar la partida se repone lo que derribaron a mano, no lo que quemó o voló el fuego.
- [x] Meta en el centro del castillo: los invasores siempre tienen a dónde ir.
- [x] Órdenes con dos objetos: retirada al patio y salida al ataque.
- [x] Pirómano aliado, guardia fija que dispara desde su puesto.
- [x] El jugador empieza en el techo central del castillo.

Falta confirmar en el juego:

- [x] Los dos objetos de órdenes en manos del jugador: funcionan.
- [ ] Que derribar paredes se vea bien y dure lo justo.

Medido en el PC: 20 ticks/s con unas 145 unidades a la vez (79 aliados y 65 invasores). Conectado desde la tablet, con unas 130 unidades a la vez, no se trabó.

Limitaciones conocidas:

- Los soldados aliados no cruzan su propio muro: con la orden de ataque esperan en la cubierta hasta que cae.
- En la retirada desde la cubierta, de 3 a 9 de cada 30 caen al lago por la cornisa y vuelven a pie.

### Propuesta: Fase 2, unidades estándar

Una unidad se define con una ficha de datos, y un generador crea sus archivos del juego. Sin esto, cada unidad nueva son cientos de líneas repetidas.

- Ficha por unidad: bando, rol, vida, daño, velocidad, skin, arma y coste.
- Roles reutilizables: cuerpo a cuerpo, arquero, mago y, más tarde, asedio. El bando decide quiénes son sus enemigos.
- Los comportamientos comunes (regreso a pie, peleas en el agua) viven en un solo sitio.
- Migrar las 3 unidades actuales sin cambiar cómo se juegan.
- Armas en las manos con objetos normales del juego (espada, arco): el modelo aún no tiene dónde sostenerlas. Sin modelado propio.
- Primeras unidades nuevas: guerrero y arquero aliados, arquero invasor.

### Propuesta: Fase 3, oleadas con reservas

- Tope de unidades a la vez en el campo y una reserva por bando que las va reemplazando.
- Regla de derrota: perder también cuando no quedan aliados ni reservas.
- Cada oleada tiene un presupuesto de puntos que se gasta en unidades, según su coste.
- El presupuesto se ajusta con moderación según los aliados vivos y los jugadores.

### Propuesta: Fase 4, gran escala

- Prueba de capacidad en la tablet para fijar el tope real de unidades.
- La guarnición inicial en el centro y lo alto del castillo; hoy solo los refuerzos salen de ahí.
- Soldados que esperan a distancia mientras los magos rompen el muro, y avanzan cuando cae.

### Propuesta: Fase 5, más frentes

- Más formas de entrar además de cavar: escaleras de asalto, unidades voladoras o entradas extra.
- Varias capas de muro, picos y arietes.
- Reparar el muro durante el descanso.

### Más adelante

- Unidades aéreas y acuáticas, con más frentes en Old Fallen Castle.
- Civiles que huyen.
- Modelos y accesorios propios (armaduras, armas a medida) y arte definitivo.
- Revisar autor y licencia de las skins de `assets/skins/`.

## Decisiones abiertas

- **Unidad atorada en el regreso.** Si un invasor se atasca para siempre, la oleada no termina. Hoy no hay teletransporte, porque no se quiere. Opción: usarlo solo como último recurso tras varios minutos sin avanzar.
- **Invasores que llegan al centro.** Sin aliados vivos, se quedan en el corazón del castillo y la oleada no termina. Se resuelve con la regla de derrota de la Fase 3.
- **Aliados al otro lado del muro.** Quien cae regresa por el puente y queda fuera hasta que el muro se abre. Hoy pelea ahí.

- **Combate orgánico.** Se siente frenético y en bolita: todos atacan al más cercano, se amontonan y mueren rápido. Pendiente de aprobar: un análisis de comportamiento antes de la Fase 2 y un orden nuevo de fases (ritmo, parejas de combate, guerra progresiva, rescate del jugador).
- **Regla de derrota.** Hoy se pierde solo al agotar las vidas de los jugadores. Propuesta: perder también cuando no quedan aliados ni reservas.

## Decisiones tomadas

- **Sin teletransporte al caer:** se regresa caminando, para que las peleas ocurran en varios lugares.
- **La escalera se queda:** cruzar por encima de un muro escalonado es una mecánica válida.
- **Peleas en el agua:** solo se apunta a quien nada si uno también está en el agua; así nadie se queda mirando el lago desde el puente.
- **El servidor de prueba se reinicia sin preguntar.**
- **Los soldados derriban, el muro de la puerta sigue siendo de los magos.** Fuera de la zona del castillo no rompen nada: ni el puente ni la orilla.

## Cómo mantener este documento

- Una sesión termina con «Dónde nos quedamos» al día: fase, último cambio y siguiente paso.
- Lo probado solo con tests no se marca como confirmado en el juego.
- Las ideas nuevas van a su fase; las dudas, a «Decisiones abiertas».
