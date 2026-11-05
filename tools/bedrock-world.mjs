// Lector mínimo (sin dependencias) de mundos de Minecraft Bedrock: LevelDB + subchunks.
// Solo lectura. Sirve para analizar mapas de terceros y sacar coordenadas sin entrar al juego.
//
// Uso como librería:
//   import { openWorld } from "./bedrock-world.mjs";
//   const w = openWorld("ruta/al/mundo");
//   for (const [cx, cz, subY, blocks, palette] of w.subchunks()) { ... }

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";

// ------------------------------------------------------------------ utilidades
function varint(buf, p) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    b = buf[p++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80);
  return [result, p];
}

function snappyDecompress(src) {
  let [outLen, p] = varint(src, 0);
  const out = Buffer.alloc(outLen);
  let o = 0;
  while (p < src.length) {
    const tag = src[p++];
    const kind = tag & 3;
    if (kind === 0) {
      let len = tag >> 2;
      if (len >= 60) {
        const extra = len - 59;
        len = 0;
        for (let i = 0; i < extra; i++) len |= src[p++] << (8 * i);
      }
      len += 1;
      src.copy(out, o, p, p + len);
      p += len;
      o += len;
    } else {
      let len;
      let offset;
      if (kind === 1) {
        len = ((tag >> 2) & 7) + 4;
        offset = ((tag >> 5) << 8) | src[p++];
      } else if (kind === 2) {
        len = (tag >> 2) + 1;
        offset = src.readUInt16LE(p);
        p += 2;
      } else {
        len = (tag >> 2) + 1;
        offset = src.readUInt32LE(p);
        p += 4;
      }
      for (let i = 0; i < len; i++) {
        out[o] = out[o - offset];
        o++;
      }
    }
  }
  return out;
}

function decompressBlock(data, type) {
  switch (type) {
    case 0:
      return data;
    case 1:
      return snappyDecompress(data);
    case 2:
      return inflateSync(data);
    case 4:
      return inflateRawSync(data);
    default:
      throw new Error(`Compresión de bloque desconocida: ${type}`);
  }
}

// ------------------------------------------------------------------ SSTable (.ldb)
function readBlock(file, offset, size) {
  const raw = file.subarray(offset, offset + size);
  const type = file[offset + size];
  return decompressBlock(raw, type);
}

function* blockEntries(block) {
  const numRestarts = block.readUInt32LE(block.length - 4);
  const end = block.length - 4 - numRestarts * 4;
  let p = 0;
  let key = Buffer.alloc(0);
  while (p < end) {
    let shared;
    let nonShared;
    let valueLen;
    [shared, p] = varint(block, p);
    [nonShared, p] = varint(block, p);
    [valueLen, p] = varint(block, p);
    key = Buffer.concat([key.subarray(0, shared), block.subarray(p, p + nonShared)]);
    p += nonShared;
    const value = block.subarray(p, p + valueLen);
    p += valueLen;
    yield [key, value];
  }
}

function* readTable(file) {
  const footer = file.length - 48;
  let p = footer;
  let metaOff;
  let metaSize;
  let idxOff;
  let idxSize;
  [metaOff, p] = varint(file, p);
  [metaSize, p] = varint(file, p);
  [idxOff, p] = varint(file, p);
  [idxSize, p] = varint(file, p);
  const index = readBlock(file, idxOff, idxSize);
  for (const [, handle] of blockEntries(index)) {
    let off;
    let size;
    let q = 0;
    [off, q] = varint(handle, q);
    [size, q] = varint(handle, q);
    const data = readBlock(file, off, size);
    for (const [ikey, value] of blockEntries(data)) {
      const userKey = ikey.subarray(0, ikey.length - 8);
      const trailer = ikey.readBigUInt64LE(ikey.length - 8);
      yield { key: userKey, seq: trailer >> 8n, type: Number(trailer & 0xffn), value };
    }
  }
}

// ------------------------------------------------------------------ registro (.log)
function* readLog(file) {
  const BLOCK = 32768;
  let payload = [];
  for (let blockStart = 0; blockStart < file.length; blockStart += BLOCK) {
    let p = blockStart;
    const blockEnd = Math.min(blockStart + BLOCK, file.length);
    while (p + 7 <= blockEnd) {
      const len = file.readUInt16LE(p + 4);
      const type = file[p + 6];
      p += 7;
      if (type === 0 && len === 0) break;
      const chunk = file.subarray(p, p + len);
      p += len;
      if (type === 1) {
        yield* parseBatch(chunk);
      } else if (type === 2) {
        payload = [chunk];
      } else if (type === 3) {
        payload.push(chunk);
      } else if (type === 4) {
        payload.push(chunk);
        yield* parseBatch(Buffer.concat(payload));
        payload = [];
      }
    }
  }
}

function* parseBatch(batch) {
  let seq = batch.readBigUInt64LE(0);
  const count = batch.readUInt32LE(8);
  let p = 12;
  for (let i = 0; i < count; i++) {
    const type = batch[p++];
    let klen;
    [klen, p] = varint(batch, p);
    const key = batch.subarray(p, p + klen);
    p += klen;
    let value = Buffer.alloc(0);
    if (type === 1) {
      let vlen;
      [vlen, p] = varint(batch, p);
      value = batch.subarray(p, p + vlen);
      p += vlen;
    }
    yield { key, seq, type, value };
    seq += 1n;
  }
}

// ------------------------------------------------------------------ NBT little-endian (paletas)
function readNbtCompound(buf, start) {
  let p = start;
  const str = () => {
    const n = buf.readUInt16LE(p);
    p += 2;
    const s = buf.toString("utf8", p, p + n);
    p += n;
    return s;
  };
  const val = (t) => {
    switch (t) {
      case 1: return buf.readInt8(p++);
      case 2: { const v = buf.readInt16LE(p); p += 2; return v; }
      case 3: { const v = buf.readInt32LE(p); p += 4; return v; }
      case 4: { const v = buf.readBigInt64LE(p); p += 8; return Number(v); }
      case 5: { const v = buf.readFloatLE(p); p += 4; return v; }
      case 6: { const v = buf.readDoubleLE(p); p += 8; return v; }
      case 7: { const n = buf.readInt32LE(p); p += 4 + n; return null; }
      case 8: return str();
      case 9: {
        const it = buf[p++];
        const n = buf.readInt32LE(p);
        p += 4;
        const a = [];
        for (let i = 0; i < n; i++) a.push(val(it));
        return a;
      }
      case 10: {
        const o = {};
        for (;;) {
          const tt = buf[p++];
          if (tt === 0) break;
          const k = str();
          o[k] = val(tt);
        }
        return o;
      }
      case 11: { const n = buf.readInt32LE(p); p += 4 + 4 * n; return null; }
      case 12: { const n = buf.readInt32LE(p); p += 4 + 8 * n; return null; }
      default: throw new Error(`Etiqueta NBT desconocida ${t}`);
    }
  };
  const t = buf[p++];
  if (t !== 10) throw new Error("Se esperaba un compound NBT");
  str();
  const value = val(10);
  return [value, p];
}

// ------------------------------------------------------------------ subchunks
// Devuelve { palette: string[], blocks: Uint16Array(4096) } de la primera capa; índice = (x<<8)|(z<<4)|y.
function parseSubchunk(buf) {
  let p = 0;
  const version = buf[p++];
  let storages = 1;
  if (version >= 8) storages = buf[p++];
  if (version === 9) p++; // índice Y
  const layers = [];
  for (let s = 0; s < storages; s++) {
    const header = buf[p++];
    const bits = header >> 1;
    const palette = [];
    const blocks = new Uint16Array(4096);
    if (bits === 0) {
      // un único bloque en la paleta, sin palabras
    } else {
      const perWord = Math.floor(32 / bits);
      const words = Math.ceil(4096 / perWord);
      const mask = (1 << bits) - 1;
      for (let w = 0; w < words; w++) {
        const word = buf.readUInt32LE(p + w * 4);
        for (let k = 0; k < perWord; k++) {
          const i = w * perWord + k;
          if (i >= 4096) break;
          blocks[i] = (word >>> (k * bits)) & mask;
        }
      }
      p += words * 4;
    }
    const count = buf.readInt32LE(p);
    p += 4;
    for (let i = 0; i < count; i++) {
      const [nbt, next] = readNbtCompound(buf, p);
      p = next;
      palette.push(nbt.name ?? "?");
    }
    layers.push({ palette, blocks });
  }
  return layers[0];
}

// ------------------------------------------------------------------ mundo
export function openWorld(dir) {
  const dbDir = join(dir, "db");
  const entries = new Map(); // clave hex -> {seq, type, value}
  const keep = (e) => {
    const k = e.key.toString("hex");
    const cur = entries.get(k);
    if (!cur || e.seq >= cur.seq) entries.set(k, e);
  };
  for (const name of readdirSync(dbDir)) {
    const path = join(dbDir, name);
    if (name.endsWith(".ldb")) for (const e of readTable(readFileSync(path))) keep(e);
    else if (name.endsWith(".log")) for (const e of readLog(readFileSync(path))) keep(e);
  }
  return {
    get size() {
      return entries.size;
    },
    /** Todas las claves de datos vivas (no borradas). */
    *keys() {
      for (const e of entries.values()) if (e.type === 1) yield e;
    },
    /** Subchunks del Overworld: [chunkX, chunkZ, subY, layer{palette,blocks}] */
    *subchunks() {
      for (const e of entries.values()) {
        if (e.type !== 1) continue;
        const k = e.key;
        // Overworld: x(4) z(4) tag(1) y(1) = 10 bytes; el tag 47 es SubChunkPrefix
        if (k.length === 10 && k[8] === 47) {
          try {
            yield [k.readInt32LE(0), k.readInt32LE(4), k.readInt8(9), parseSubchunk(e.value)];
          } catch (err) {
            console.error(`subchunk ilegible ${k.toString("hex")}: ${err.message}`);
          }
        }
      }
    },
  };
}
