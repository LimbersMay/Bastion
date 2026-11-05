// Genera arte PROVISIONAL (sin dependencias): skins 64x64 de soldados, textura de la puerta e iconos de los packs.
// Uso: npm run art
// Cuando haya arte real, sustituye los PNG de resource_packs/bastion/textures/entity/ y no vuelvas a ejecutar esto.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- PNG mínimo
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profundidad
  header[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- lienzo
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4); // transparente
  }
  rect(x, y, w, h, [r, g, b, a = 255]) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const o = (j * this.w + i) * 4;
        this.data[o] = r;
        this.data[o + 1] = g;
        this.data[o + 2] = b;
        this.data[o + 3] = a;
      }
    }
  }
  save(path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(this.w, this.h, this.data));
    console.log("escrito", path.replace(root, "."));
  }
}

// ---------------------------------------------------------------- skin humanoide 64x64
// Diseño estándar de skin 64x64: cabeza (0,0), cuerpo (16,16), brazo der. (40,16), pierna der. (0,16),
// pierna izq. (16,48), brazo izq. (32,48). Se pinta cada bloque por zonas.
function soldierSkin(p) {
  const c = new Canvas(64, 64);

  // Cabeza: 4 caras laterales en y=8..16, tapa y base en y=0..8
  c.rect(0, 8, 32, 8, p.skin);
  c.rect(8, 0, 16, 8, p.helmet); // tapa y base
  c.rect(0, 8, 32, 3, p.helmet); // casco sobre la frente en las 4 caras
  c.rect(8, 11, 8, 1, p.helmetShade); // sombra bajo el casco (cara frontal)
  // Ojos en la cara frontal (x 8..15, y 8..15)
  c.rect(9, 12, 2, 1, p.eye);
  c.rect(13, 12, 2, 1, p.eye);

  // Cuerpo (16..40, 16..32): frente y espalda con peto, lados con tela
  c.rect(16, 16, 24, 16, p.body);
  c.rect(20, 20, 8, 12, p.armor); // frente (20..28)
  c.rect(32, 20, 8, 12, p.armor); // espalda (32..40)
  c.rect(20, 20, 8, 2, p.accent); // banda del cuello

  // Brazos
  c.rect(40, 16, 16, 16, p.body);
  c.rect(44, 16, 4, 4, p.armor); // hombro (der.)
  c.rect(44, 28, 4, 4, p.skin); // mano
  c.rect(32, 48, 16, 16, p.body);
  c.rect(36, 48, 4, 4, p.armor); // hombro (izq.)
  c.rect(36, 60, 4, 4, p.skin);

  // Piernas
  c.rect(0, 16, 16, 16, p.legs);
  c.rect(0, 28, 16, 4, p.boots);
  c.rect(16, 48, 16, 16, p.legs);
  c.rect(16, 60, 16, 4, p.boots);

  return c;
}

const skinsDir = join(root, "resource_packs", "bastion", "textures", "entity");

// Las skins de los soldados ya no se generan: son las de assets/skins/warriors (ver su README).
// La función soldierSkin queda por si hace falta un arte provisional para una unidad nueva.

// ---------------------------------------------------------------- puerta (16x16, estirada en cada cara)
{
  const c = new Canvas(16, 16);
  c.rect(0, 0, 16, 16, [107, 74, 43]);
  for (let y = 0; y < 16; y += 4) c.rect(0, y, 16, 1, [72, 48, 28]); // tablones
  c.rect(0, 0, 16, 1, [200, 162, 74]);
  c.rect(0, 15, 16, 1, [200, 162, 74]);
  c.rect(0, 0, 1, 16, [200, 162, 74]);
  c.rect(15, 0, 1, 16, [200, 162, 74]);
  c.rect(7, 6, 2, 4, [200, 162, 74]); // cerradura
  c.save(join(skinsDir, "gate_core.png"));
}

// ---------------------------------------------------------------- iconos de los packs (128x128)
function packIcon(path, bg, fg) {
  const c = new Canvas(128, 128);
  c.rect(0, 0, 128, 128, bg);
  c.rect(8, 8, 112, 112, fg);
  c.rect(12, 12, 104, 104, bg);
  // torre almenada sencilla
  c.rect(34, 50, 60, 66, fg);
  for (let x = 34; x < 94; x += 20) c.rect(x, 34, 12, 20, fg);
  c.rect(56, 82, 16, 34, bg); // puerta
  c.save(path);
}
packIcon(join(root, "behavior_packs", "bastion", "pack_icon.png"), [38, 54, 92], [201, 206, 214]);
packIcon(join(root, "resource_packs", "bastion", "pack_icon.png"), [92, 38, 38], [214, 201, 201]);
