import type { DefensePost, PostKind, Vec3 } from "../maps/types";
import type { Role } from "../units/catalog";

/**
 * Lógica PURA de los puestos de defensa: con la orden de retirada cada aliado ocupa un puesto del castillo.
 * Los que pelean cuerpo a cuerpo cortan el paso (frente) o lo cubren (lados); los que disparan suben a lo
 * alto. Si su tipo de puesto está lleno prueban el siguiente; sin sitio, esperan en el patio como reserva.
 */

/** Plazas de un puesto si el mapa no dice otra cosa. */
export const DEFAULT_CAPACITY: Readonly<Record<PostKind, number>> = { front: 3, side: 2, high: 2 };

/** Preferencia de puesto de cada rol, en orden. */
export const POST_PREFERENCE: Readonly<Record<Role, readonly PostKind[]>> = {
  melee: ["front", "side"],
  caster: ["high", "side"],
  archer: ["high", "side"],
};

export const capacityOf = (post: DefensePost) => post.capacity ?? DEFAULT_CAPACITY[post.kind];

const distanceSq = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/**
 * El puesto para una unidad: el más cercano con sitio del primer tipo que prefiera su rol.
 * `occupied[i]` son las plazas ya tomadas del puesto `i`. `undefined` = a la reserva.
 */
export function choosePost(role: Role, at: Vec3, posts: readonly DefensePost[], occupied: readonly number[]): number | undefined {
  for (const kind of POST_PREFERENCE[role]) {
    let best: number | undefined;
    posts.forEach((post, i) => {
      if (post.kind !== kind || (occupied[i] ?? 0) >= capacityOf(post)) return;
      if (best === undefined || distanceSq(at, post.at) < distanceSq(at, posts[best].at)) best = i;
    });
    if (best !== undefined) return best;
  }
  return undefined;
}

/**
 * Reparte a varias unidades a la vez. Eligen primero las que están más cerca de algún puesto, para que
 * nadie cruce el castillo hacia un puesto que otro tenía al lado.
 */
export function assignPosts(
  units: readonly { readonly id: string; readonly role: Role; readonly at: Vec3 }[],
  posts: readonly DefensePost[]
): Map<string, number | undefined> {
  const nearest = (at: Vec3) => Math.min(...posts.map((p) => distanceSq(at, p.at)));
  const order = [...units].sort((a, b) => nearest(a.at) - nearest(b.at));
  const occupied = posts.map(() => 0);
  const result = new Map<string, number | undefined>();
  for (const unit of order) {
    const post = posts.length > 0 ? choosePost(unit.role, unit.at, posts, occupied) : undefined;
    if (post !== undefined) occupied[post]++;
    result.set(unit.id, post);
  }
  return result;
}
