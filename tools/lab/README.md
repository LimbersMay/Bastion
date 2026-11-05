# Laboratorio de IA

Pruebas de movimiento y combate de [docs/IA.md](../../docs/IA.md). No forma parte del addon: **nunca debe ir en una versión para jugar**.

## Activarlo

1. Copia `lab.ts` a `scripts/lab/lab.ts`.
2. Copia `entities/*.json` a `behavior_packs/bastion/entities/`.
3. En `scripts/main.ts`, añade `import { handleLab } from "./lab/lab";` y, al principio del `scriptEventReceive`, después de comprobar el espacio de nombres:

   ```ts
   if (ev.id === `${NAMESPACE}:lab`) {
     handleLab(ev.message);
     return;
   }
   ```

4. `npm run mcaddon`.

Para quitarlo, deshaz esos tres pasos y vuelve a compilar.

## Batalla de referencia

No necesita el laboratorio activado: usa las unidades reales del pack.

1. Descomprime `assets/worlds/Old Fallen Castle - v1.3.mcworld` en una carpeta (un `.mcworld` es un zip).
2. `npm run mcaddon && node tools/bds.mjs setup <esa-carpeta>`
3. `node tools/bds.mjs serve` en una terminal.
4. `node tools/lab/siege.mjs <etiqueta> 9` en otra.

Enfrenta a 30 aliados y 60 soldados invasores, sin piromanos, durante 9 minutos. Cada 30 s anota vivos, bloques derribados y ticks/s; al final, dónde quedó cada unidad. El resultado queda en `tools/lab/siege-<etiqueta>.log`. Vuelve a `setup` antes de repetirla para restaurar el mundo.

## Órdenes

Todas son `/scriptevent bastion:lab ...`:

| Orden | Qué hace |
|---|---|
| `bench` | Mide lo que cuesta leer bloques y calcular rutas |
| `benchjob` | La misma ruta, repartida entre ticks |
| `walk <direct\|hops\|leader> <n> x y z gx gy gz [radio]` | Lleva `n` unidades de un punto a otro |
| `fight <vanilla\|cap\|pair>` | Hace pelear a las `lab_a` y `lab_b` ya colocadas |
| `clean` | Quita todo lo del laboratorio |

## Límites

- La zona de trabajo y los trayectos de `bench` están escritos para Old Fallen Castle.
- `lab_a` y `lab_b` traen 30 parejas. Para más, hay que ampliar sus `entity_types` y `PAIR_SLOTS` a la vez.
