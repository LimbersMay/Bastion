import type { MapDef, Vec3 } from "../maps/types";

/**
 * La base: la zona del castillo dentro de la cual un monstruo del juego es un intruso y los aliados van a por él.
 * Un cilindro alrededor de lo que defienden los aliados (sus puestos, el patio, la meta de cada puerta).
 */
export interface BaseZone {
  readonly center: Vec3;
  /** Radio horizontal. */
  readonly radius: number;
  readonly minY: number;
  readonly maxY: number;
}

/** Holgura alrededor de los puntos del castillo: el monstruo pegado a la muralla también cuenta. */
export const BASE_MARGIN = 8;
/** Lo que se cuenta por encima del punto más alto (torres) y por debajo del más bajo. */
const ABOVE = 12;
const BELOW = 8;
/** Durante cuánto un monstruo que ha atacado a un jugador sigue marcado como intruso. */
export const THREAT_SECONDS = 30;

/** Los puntos que definen el castillo en un mapa: los aliados, sus puestos, el patio, la salida y las metas. */
function basePoints(map: MapDef): Vec3[] {
  return [
    ...map.allies.map((a) => a.position),
    ...(map.defensePosts ?? []).map((p) => p.at),
    ...(map.rallyPoints ?? []),
    ...(map.sortiePoint ? [map.sortiePoint] : []),
    ...map.gates.map((g) => g.objective),
  ];
}

export function baseZone(map: MapDef): BaseZone {
  const points = basePoints(map);
  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
    z: points.reduce((s, p) => s + p.z, 0) / points.length,
  };
  const radius = Math.max(...points.map((p) => Math.hypot(p.x - center.x, p.z - center.z))) + BASE_MARGIN;
  return {
    center,
    radius,
    minY: Math.min(...points.map((p) => p.y)) - BELOW,
    maxY: Math.max(...points.map((p) => p.y)) + ABOVE,
  };
}

export function inBase(zone: BaseZone, at: Vec3): boolean {
  return at.y >= zone.minY && at.y <= zone.maxY && Math.hypot(at.x - zone.center.x, at.z - zone.center.z) <= zone.radius;
}
