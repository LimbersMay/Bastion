// Analiza un mundo Bedrock SIN abrir el juego, para sacar las coordenadas de un mapa.
//
//   node tools/world-scan.mjs <carpeta-del-mundo> summary
//   node tools/world-scan.mjs <carpeta-del-mundo> map [x0 z0 x1 z1] [paso]   vista cenital en ASCII
//   node tools/world-scan.mjs <carpeta-del-mundo> find <regex> [maxResultados]  busca bloques por nombre
//   node tools/world-scan.mjs <carpeta-del-mundo> slice <y> x0 z0 x1 z1        un corte horizontal
//
// Las coordenadas son las de Minecraft (las mismas que ves con F3 o /scriptevent bastion:pos).

import { openWorld } from "./bedrock-world.mjs";

const [dir, cmd = "summary", ...args] = process.argv.slice(2);
if (!dir) {
  console.error("Uso: node tools/world-scan.mjs <carpeta-del-mundo> summary|map|find|slice ...");
  process.exit(1);
}

const world = openWorld(dir);
const chunks = new Map(); // "cx,cz,sy" -> capa
let minY = Infinity;
let maxY = -Infinity;
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const [cx, cz, sy, layer] of world.subchunks()) {
  chunks.set(`${cx},${cz},${sy}`, layer);
  minY = Math.min(minY, sy * 16);
  maxY = Math.max(maxY, sy * 16 + 15);
  minX = Math.min(minX, cx * 16);
  maxX = Math.max(maxX, cx * 16 + 15);
  minZ = Math.min(minZ, cz * 16);
  maxZ = Math.max(maxZ, cz * 16 + 15);
}

const floorDiv = (a, b) => Math.floor(a / b);
const mod = (a, b) => ((a % b) + b) % b;

function blockAt(x, y, z) {
  const layer = chunks.get(`${floorDiv(x, 16)},${floorDiv(z, 16)},${floorDiv(y, 16)}`);
  if (!layer) return null;
  const i = (mod(x, 16) << 8) | (mod(z, 16) << 4) | mod(y, 16);
  return layer.palette[layer.blocks[i]] ?? null;
}

const strip = (n) => (n ?? "").replace(/^minecraft:/, "");
const isAir = (n) => n === null || n === "minecraft:air";
const NATURAL = /^(air|dirt|grass|bedrock|tallgrass|red_flower|yellow_flower|double_plant|leaves|leaves2|water|flowing_water|snow_layer|podzol|sand|gravel|stone|sapling|vine|brown_mushroom|red_mushroom|grass_block|short_grass|tall_grass|deadbush|waterlily|reeds|sweet_berry_bush|farmland|carrots|wheat|potatoes|beetroot|pumpkin|melon_block|cocoa|lava|flowing_lava|ice|coarse_dirt|mycelium)$/;
const isNatural = (n) => NATURAL.test(strip(n));

// Altura de la superficie "construida" o natural en una columna (el bloque sólido más alto).
function topSolid(x, z, skipPlants = true) {
  for (let y = maxY; y >= minY; y--) {
    const n = blockAt(x, y, z);
    if (isAir(n)) continue;
    if (skipPlants && /tallgrass|flower|double_plant|vine|sapling|short_grass|tall_grass|carpet|snow_layer|deadbush/.test(n)) continue;
    return [y, n];
  }
  return [null, null];
}

const GLYPH = (n) => {
  const s = strip(n);
  if (s === "grass" || s === "grass_block") return ".";
  if (s === "dirt" || s === "podzol" || s === "coarse_dirt") return ",";
  if (s === "grass_path" || s === "dirt_path") return "=";
  if (s === "water" || s === "flowing_water") return "~";
  if (s === "farmland") return "f";
  if (/leaves/.test(s)) return "T";
  if (/log/.test(s)) return "t";
  if (/door/.test(s)) return "D";
  if (/fence_gate/.test(s)) return "G";
  if (/fence|wall/.test(s)) return "|";
  if (/stairs/.test(s)) return "/";
  if (/slab/.test(s)) return "-";
  if (/stonebrick|stone_brick|cobblestone|^stone$|andesite|diorite|granite/.test(s)) return "#";
  if (/planks|wood/.test(s)) return "p";
  if (/bed/.test(s)) return "b";
  if (/lantern|torch|campfire/.test(s)) return "*";
  if (/trapdoor/.test(s)) return "h";
  if (/glass/.test(s)) return "o";
  if (/ladder/.test(s)) return "H";
  if (/hay|wool|carpet/.test(s)) return "w";
  return "?";
};

if (cmd === "summary") {
  console.log(`Mundo: ${dir}`);
  console.log(`Subchunks: ${chunks.size}`);
  console.log(`Rango X: ${minX}..${maxX}  Y: ${minY}..${maxY}  Z: ${minZ}..${maxZ}`);

  // Nivel del suelo: altura más frecuente de la superficie
  const heights = new Map();
  let builtMinX = Infinity, builtMaxX = -Infinity, builtMinZ = Infinity, builtMaxZ = -Infinity, builtMaxY = -Infinity, builtCount = 0;
  const names = new Map();
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const [y, n] = topSolid(x, z);
      if (y === null) continue;
      heights.set(y, (heights.get(y) ?? 0) + 1);
      if (!isNatural(n)) {
        builtCount++;
        builtMinX = Math.min(builtMinX, x); builtMaxX = Math.max(builtMaxX, x);
        builtMinZ = Math.min(builtMinZ, z); builtMaxZ = Math.max(builtMaxZ, z);
        builtMaxY = Math.max(builtMaxY, y);
        names.set(strip(n), (names.get(strip(n)) ?? 0) + 1);
      }
    }
  }
  const ground = [...heights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log("Alturas de superficie más comunes (Y, columnas):", ground.map(([y, c]) => `${y}:${c}`).join("  "));
  console.log(`Columnas con construcción: ${builtCount}`);
  console.log(`Caja de lo construido: X ${builtMinX}..${builtMaxX}  Z ${builtMinZ}..${builtMaxZ}  Y máx ${builtMaxY}`);
  console.log("Bloques construidos más comunes (superficie):", [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `${n}:${c}`).join("  "));
} else if (cmd === "map") {
  const [x0 = minX, z0 = minZ, x1 = maxX, z1 = maxZ, step = 2] = args.map(Number);
  console.log(`Vista cenital X ${x0}..${x1}, Z ${z0}..${z1}, 1 carácter = ${step}x${step} bloques. Norte (Z-) arriba, Este (X+) a la derecha.`);
  console.log(`Leyenda: . césped  , tierra  = camino  ~ agua  f cultivo  T hojas  t tronco  D puerta  G portón  | valla/muro  / escalera  - losa  # piedra  p madera  b cama  * luz  h trampilla  o cristal  H escala  w tela  ? otro`);
  const head = "      " + Array.from({ length: Math.ceil((x1 - x0 + 1) / step) }, (_, i) => ((x0 + i * step) % 20 === 0 ? "+" : " ")).join("");
  console.log(head);
  for (let z = z0; z <= z1; z += step) {
    let row = String(z).padStart(5) + " ";
    for (let x = x0; x <= x1; x += step) {
      // dentro del bloque de step×step, elige el glifo "más interesante" (lo no natural gana)
      let best = null;
      let bestY = -Infinity;
      for (let dx = 0; dx < step; dx++) {
        for (let dz = 0; dz < step; dz++) {
          const [y, n] = topSolid(x + dx, z + dz);
          if (n === null) continue;
          const score = isNatural(n) ? y : y + 1000;
          if (score > bestY) { bestY = score; best = n; }
        }
      }
      row += best === null ? " " : GLYPH(best);
    }
    console.log(row);
  }
} else if (cmd === "find") {
  const re = new RegExp(args[0], "i");
  const limit = Number(args[1] ?? 200);
  let shown = 0;
  const counts = new Map();
  for (const [key, layer] of chunks) {
    const [cx, cz, sy] = key.split(",").map(Number);
    for (let i = 0; i < 4096; i++) {
      const n = layer.palette[layer.blocks[i]];
      if (!n || !re.test(n)) continue;
      const x = cx * 16 + (i >> 8);
      const z = cz * 16 + ((i >> 4) & 15);
      const y = sy * 16 + (i & 15);
      counts.set(n, (counts.get(n) ?? 0) + 1);
      if (shown < limit) { console.log(`${strip(n)}  ${x} ${y} ${z}`); shown++; }
    }
  }
  console.log("Totales:", Object.fromEntries(counts));
} else if (cmd === "slice") {
  const [y, x0, z0, x1, z1] = args.map(Number);
  for (let z = z0; z <= z1; z++) {
    let row = String(z).padStart(5) + " ";
    for (let x = x0; x <= x1; x++) {
      const n = blockAt(x, y, z);
      row += isAir(n) ? " " : GLYPH(n);
    }
    console.log(row);
  }
} else {
  console.error(`Comando desconocido: ${cmd}`);
  process.exit(1);
}
