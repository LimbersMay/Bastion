import type { MapDef, Vec3 } from "./types";
import { GATE_HEALTH_TIERS } from "../constants";
import { isUnitId } from "../units/catalog";

/** Devuelve la lista de problemas de un mapa. Vacía = el mapa es válido. */
export function validateMap(map: MapDef): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(`[${map.id}] ${msg}`);

  if (!/^[a-z0-9_-]+$/.test(map.id)) err("el id solo admite minúsculas, números, _ y -.");
  if (map.name.trim() === "") err("falta el nombre.");

  const checkVec = (label: string, v: Vec3) => {
    if (![v.x, v.y, v.z].every((n) => Number.isFinite(n))) err(`${label}: coordenadas no válidas.`);
  };

  if (map.gates.length === 0) err("gates necesita al menos una puerta.");
  const gateIds = new Set<string>();
  map.gates.forEach((g, gi) => {
    const label = `gates[${gi}]`;
    if (!/^[a-z0-9_-]+$/.test(g.id)) err(`${label}: el id solo admite minúsculas, números, _ y -.`);
    if (gateIds.has(g.id)) err(`${label}: id repetido "${g.id}".`);
    gateIds.add(g.id);
    checkVec(`${label}.position`, g.position);
    if (g.health !== undefined && !(GATE_HEALTH_TIERS as readonly number[]).includes(g.health)) {
      err(`${label}.health debe ser uno de ${GATE_HEALTH_TIERS.join(", ")}.`);
    }
    (g.barriers ?? []).forEach((b, i) => {
      checkVec(`${label}.barriers[${i}].from`, b.from);
      checkVec(`${label}.barriers[${i}].to`, b.to);
      if (b.block.trim() === "") err(`${label}.barriers[${i}]: falta el bloque.`);
      const volume =
        (Math.abs(b.to.x - b.from.x) + 1) * (Math.abs(b.to.y - b.from.y) + 1) * (Math.abs(b.to.z - b.from.z) + 1);
      if (!(volume <= 32768)) err(`${label}.barriers[${i}]: demasiado grande (máx. 32768 bloques).`);
    });
    if (g.breachSpawns.length === 0) err(`${label}: breachSpawns necesita al menos un punto.`);
    g.breachSpawns.forEach((v, i) => checkVec(`${label}.breachSpawns[${i}]`, v));
    g.breachTroops.forEach((t, i) => {
      if (!isUnitId(t.unit)) err(`${label}.breachTroops[${i}]: unidad desconocida "${t.unit}".`);
      if (!Number.isInteger(t.count) || t.count < 0) err(`${label}.breachTroops[${i}]: cantidad inválida.`);
    });
  });
  if (map.playerSpawns.length === 0) err("playerSpawns necesita al menos un punto.");
  map.playerSpawns.forEach((v, i) => checkVec(`playerSpawns[${i}]`, v));

  if (map.invaderSpawns.length === 0) err("invaderSpawns necesita al menos un punto.");
  map.invaderSpawns.forEach((v, i) => checkVec(`invaderSpawns[${i}]`, v));

  map.allies.forEach((a, i) => {
    if (!isUnitId(a.unit)) err(`allies[${i}]: unidad desconocida "${a.unit}".`);
    checkVec(`allies[${i}]`, a.position);
  });

  if (map.waves.length === 0) err("waves necesita al menos una oleada.");
  map.waves.forEach((w, i) => {
    if (w.groups.length === 0) err(`waves[${i}]: sin grupos.`);
    if (!Number.isInteger(w.batchSize) || w.batchSize <= 0) err(`waves[${i}]: batchSize inválido.`);
    if (w.batchIntervalTicks < 0) err(`waves[${i}]: batchIntervalTicks negativo.`);
    w.groups.forEach((g, j) => {
      if (!isUnitId(g.unit)) err(`waves[${i}].groups[${j}]: unidad desconocida "${g.unit}".`);
      if (!Number.isInteger(g.count) || g.count <= 0) err(`waves[${i}].groups[${j}]: cantidad inválida.`);
    });
  });

  if (!Number.isInteger(map.lives) || map.lives <= 0) err("lives debe ser un entero mayor que 0.");
  if (map.countdownSeconds < 0) err("countdownSeconds negativo.");
  if (map.intermissionSeconds < 0) err("intermissionSeconds negativo.");

  if (map.tickingArea) {
    const r = map.tickingArea.radiusChunks;
    if (!Number.isInteger(r) || r < 1 || r > 4) err("tickingArea.radiusChunks debe ser un entero de 1 a 4.");
    checkVec("tickingArea.center", map.tickingArea.center);
  }

  return errors;
}
