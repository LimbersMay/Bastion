// Orillas de un lago y si desde ellas se llega a pie a un punto: para elegir las rutas de regreso
// (`returnRoutes`) de un mapa sin abrir el juego. Usa el mismo planificador que la caza.
//
// Uso:
//   node tools/shores.mjs <carpeta-del-mundo> x0 z0 x1 z1 <meta x y z>        orillas de la zona y su ruta a la meta
//   node tools/shores.mjs <carpeta-del-mundo> route <x y z> <meta x y z>     hitos de la ruta a pie desde una orilla
//
// «A pie» no rompe nada; «rompiendo» es lo que haría la caza. Solo sirven de salida las que llegan a pie.
// Necesita Node 23.6 o superior (lee el planificador en TypeScript directamente).

import { openWorld } from "./bedrock-world.mjs";

// Node avisa de que el planificador no declara si es un módulo; es inofensivo.
process.removeAllListeners("warning");
const { classifyBlock, planRoute, SOLID } = await import("../scripts/systems/routeLogic.ts");

const [dir, mode, ...rest] = process.argv.slice(2);
if (!dir || !mode) {
  console.error("Uso: node tools/shores.mjs <mundo> x0 z0 x1 z1 gx gy gz | route x y z gx gy gz");
  process.exit(1);
}

const chunks = new Map();
for (const [cx, cz, sy, layer] of openWorld(dir).subchunks()) chunks.set(`${cx},${cz},${sy}`, layer);
const fd = (a, b) => Math.floor(a / b);
const md = (a, b) => ((a % b) + b) % b;
function name(x, y, z) {
  const l = chunks.get(`${fd(x, 16)},${fd(z, 16)},${fd(y, 16)}`);
  if (!l) return "minecraft:air";
  const n = l.palette[l.blocks[(md(x, 16) << 8) | (md(z, 16) << 4) | md(y, 16)]];
  return typeof n === "string" ? n : n?.name ?? "minecraft:air";
}
const cell = (x, y, z) => classifyBlock(name(x, y, z));
/** Sin romper: lo que se puede romper cuenta como pared. */
const onFoot = (x, y, z) => {
  const c = cell(x, y, z);
  return c.cost > 0 && c.cost < Infinity ? SOLID : c;
};
const isWater = (x, y, z) => /water/.test(name(x, y, z));
const free = (x, y, z) => {
  const c = cell(x, y, z);
  return c.cost === 0 && !c.ground;
};
const OPTIONS = { maxNodes: 60000, reach: 4 };
const describe = (r) => (r ? `${r.complete ? "llega" : "parcial"}, ${r.steps.length} pasos` : "sin ruta");

if (mode === "route") {
  const [sx, sy, sz, gx, gy, gz] = rest.map(Number);
  const r = planRoute({ x: sx, y: sy, z: sz }, { x: gx, y: gy, z: gz }, onFoot, OPTIONS);
  console.log(`A pie: ${describe(r)}. Un hito cada 10 pasos:`);
  r?.steps.forEach((s, i) => {
    if (i % 10 === 0 || i === r.steps.length - 1) console.log(`  ${i}: ${s.x}, ${s.y}, ${s.z}`);
  });
  process.exit(0);
}

const [X0, Z0, X1, Z1, gx, gy, gz] = [mode, ...rest].map(Number);
const goal = { x: gx, y: gy, z: gz };

// Nivel del agua: la altura más común de su superficie.
const levels = new Map();
for (let x = X0; x <= X1; x += 3)
  for (let z = Z0; z <= Z1; z += 3)
    for (let y = 320; y > -64; y--) {
      if (isWater(x, y, z)) {
        levels.set(y, (levels.get(y) ?? 0) + 1);
        break;
      }
      if (cell(x, y, z).ground) break;
    }
if (levels.size === 0) {
  console.log("No hay agua en esa zona.");
  process.exit(0);
}
const W = [...levels].sort((a, b) => b[1] - a[1])[0][0];
console.log(`Nivel del agua: ${W}`);

// Orilla: casilla donde se puede estar de pie a la altura del agua, junto al agua.
const shore = [];
for (let x = X0; x <= X1; x++)
  for (let z = Z0; z <= Z1; z++)
    for (let y = W - 1; y <= W + 1; y++) {
      const g = cell(x, y, z);
      if (!g.ground || g.noStep || !free(x, y + 1, z) || !free(x, y + 2, z) || isWater(x, y + 1, z)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isWater(x + dx, W, z + dz))) shore.push({ x, y: y + 1, z });
    }

// Grupos de casillas a 3 bloques o menos.
const near = (p, q) => Math.abs(p.x - q.x) <= 3 && Math.abs(p.z - q.z) <= 3;
const groups = [];
for (const p of shore) {
  const touching = groups.filter((g) => g.some((q) => near(p, q)));
  const merged = [p, ...touching.flat()];
  for (const g of touching) groups.splice(groups.indexOf(g), 1);
  groups.push(merged);
}

for (const g of groups.sort((a, b) => b.length - a.length)) {
  if (g.length < 3) continue;
  const c = { x: g.reduce((s, p) => s + p.x, 0) / g.length, z: g.reduce((s, p) => s + p.z, 0) / g.length };
  const rep = g.reduce((b, p) => ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (b.x - c.x) ** 2 + (b.z - c.z) ** 2 ? p : b));
  const walk = planRoute(rep, goal, onFoot, OPTIONS);
  const dig = planRoute(rep, goal, cell, OPTIONS);
  const breaks = dig ? dig.steps.reduce((s, t) => s + t.breaks.length, 0) : 0;
  const xs = g.map((p) => p.x);
  const zs = g.map((p) => p.z);
  console.log(
    `Orilla de ${g.length} casillas (x ${Math.min(...xs)}..${Math.max(...xs)}, z ${Math.min(...zs)}..${Math.max(...zs)}), punto ${rep.x}, ${rep.y}, ${rep.z}` +
      ` | a pie: ${describe(walk)} | rompiendo: ${describe(dig)}${dig ? `, rompe ${breaks}` : ""}`
  );
}
