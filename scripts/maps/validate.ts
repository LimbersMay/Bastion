import type { MapDef, Vec3 } from "./types";
import { MAX_POSTS, MAX_RETURN_ROUTES, MAX_RETURN_STAGES } from "../constants";
import { isUnitId } from "../units/catalog";
import { boxVolume, inBox } from "../systems/wallLogic";

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
    checkVec(`${label}.objective`, g.objective);
    if (g.walls.length === 0) err(`${label}: walls necesita al menos un tramo de muro.`);
    g.blockers?.forEach((b, i) => {
      checkVec(`${label}.blockers[${i}].from`, b.from);
      checkVec(`${label}.blockers[${i}].to`, b.to);
      if (!(boxVolume(b) <= 32768)) err(`${label}.blockers[${i}]: demasiado grande (máx. 32768 bloques).`);
      if (inBox(g.objective, b)) err(`${label}.blockers[${i}]: la meta (objective) no puede quedar tapada.`);
    });
    g.walls.forEach((w, i) => {
      checkVec(`${label}.walls[${i}].from`, w.from);
      checkVec(`${label}.walls[${i}].to`, w.to);
      if (!/^[a-z0-9_]+(:[a-z0-9_]+)?$/.test(w.block)) err(`${label}.walls[${i}]: bloque inválido "${w.block}" (id sin estados, ej. dark_oak_planks).`);
      const volume = boxVolume(w);
      if (!(volume <= 32768)) err(`${label}.walls[${i}]: demasiado grande (máx. 32768 bloques).`);
      if (Math.abs(w.to.y - w.from.y) + 1 < 2) err(`${label}.walls[${i}]: el muro necesita al menos 2 bloques de alto.`);
      if (inBox(g.objective, w)) err(`${label}.walls[${i}]: la meta (objective) no puede estar dentro del muro.`);
      if (inBox({ x: Math.floor(g.position.x), y: Math.floor(g.position.y), z: Math.floor(g.position.z) }, w)) {
        err(`${label}.walls[${i}]: el punto de referencia (position) no puede estar dentro del muro.`);
      }
    });
    if (g.breachSpawns.length === 0) err(`${label}: breachSpawns necesita al menos un punto.`);
    g.breachSpawns.forEach((v, i) => checkVec(`${label}.breachSpawns[${i}]`, v));
    g.breachTroops.forEach((t, i) => {
      if (!isUnitId(t.unit)) err(`${label}.breachTroops[${i}]: unidad desconocida "${t.unit}".`);
      if (!Number.isInteger(t.count) || t.count < 0) err(`${label}.breachTroops[${i}]: cantidad inválida.`);
    });
  });
  if ((map.returnRoutes?.length ?? 0) + (map.approachRoutes?.length ?? 0) > MAX_RETURN_ROUTES) {
    err(`returnRoutes + approachRoutes: máximo ${MAX_RETURN_ROUTES} rutas entre las dos.`);
  }
  for (const [name, routes] of [["returnRoutes", map.returnRoutes], ["approachRoutes", map.approachRoutes]] as const) {
    routes?.forEach((route, r) => {
      if (route.length === 0 || route.length > MAX_RETURN_STAGES) err(`${name}[${r}]: de 1 a ${MAX_RETURN_STAGES} hitos.`);
      route.forEach((p, i) => checkVec(`${name}[${r}][${i}]`, p));
    });
  }

  if (map.playerSpawns.length === 0) err("playerSpawns necesita al menos un punto.");
  map.playerSpawns.forEach((v, i) => checkVec(`playerSpawns[${i}]`, v));

  if (map.invaderSpawns.length === 0) err("invaderSpawns necesita al menos un punto.");
  map.invaderSpawns.forEach((v, i) => checkVec(`invaderSpawns[${i}]`, v));

  if (map.flankSpawns && !map.siege) err("flankSpawns requiere siege: sin él, esas unidades no tienen a dónde ir.");
  map.flankSpawns?.forEach((v, i) => checkVec(`flankSpawns[${i}]`, v));
  if (map.siege) {
    checkVec("siege.zone.from", map.siege.zone.from);
    checkVec("siege.zone.to", map.siege.zone.to);
  }
  map.rallyPoints?.forEach((v, i) => checkVec(`rallyPoints[${i}]`, v));
  if (map.keep) checkVec("keep", map.keep);
  if (map.sortiePoint) checkVec("sortiePoint", map.sortiePoint);
  if ((map.defensePosts?.length ?? 0) > MAX_POSTS) err(`defensePosts: máximo ${MAX_POSTS} puestos.`);
  map.defensePosts?.forEach((post, i) => {
    checkVec(`defensePosts[${i}].at`, post.at);
    if (post.capacity !== undefined && (!Number.isInteger(post.capacity) || post.capacity < 1)) err(`defensePosts[${i}].capacity: un entero de 1 o más.`);
  });

  const r = map.reinforcements;
  if (r) {
    if (r.spawns.length === 0) err("reinforcements.spawns necesita al menos un punto.");
    r.spawns.forEach((v, i) => checkVec(`reinforcements.spawns[${i}]`, v));
    if (r.units.length === 0) err("reinforcements.units necesita al menos una unidad.");
    r.units.forEach((u) => {
      if (!isUnitId(u)) err(`reinforcements.units: unidad desconocida "${u}".`);
    });
    for (const [name, value] of [["minField", r.minField], ["reservePerWave", r.reservePerWave], ["batch", r.batch]] as const) {
      if (!Number.isInteger(value) || value < 0) err(`reinforcements.${name} debe ser un entero sin signo.`);
    }
    if (!(r.everySeconds > 0)) err("reinforcements.everySeconds debe ser mayor que 0.");
  }

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

  const areas = [...(map.tickingArea ? [map.tickingArea] : []), ...(map.extraTickingAreas ?? [])];
  for (const area of areas) {
    const radius = area.radiusChunks;
    if (!Number.isInteger(radius) || radius < 1 || radius > 4) err("tickingArea.radiusChunks debe ser un entero de 1 a 4.");
    checkVec("tickingArea.center", area.center);
  }

  return errors;
}
