import { describe, expect, it } from "vitest";
import { MAPS } from "../scripts/maps";
import type { DefensePost } from "../scripts/maps/types";
import { assignPosts, capacityOf, choosePost } from "../scripts/systems/postLogic";

const posts: DefensePost[] = [
  { at: { x: 0, y: 0, z: 0 }, kind: "front", capacity: 2 },
  { at: { x: 20, y: 0, z: 0 }, kind: "side", capacity: 1 },
  { at: { x: 0, y: 10, z: 20 }, kind: "high", capacity: 1 },
];
const at = (x: number, z = 0) => ({ x, y: 0, z });

describe("puestos de defensa", () => {
  it("quien pelea cuerpo a cuerpo va al frente y quien dispara, a lo alto", () => {
    expect(choosePost("melee", at(19), posts, [0, 0, 0])).toBe(0);
    expect(choosePost("caster", at(0), posts, [0, 0, 0])).toBe(2);
  });

  it("si su tipo de puesto está lleno prueba el siguiente y, sin sitio, va a la reserva", () => {
    expect(choosePost("melee", at(0), posts, [2, 0, 0])).toBe(1);
    expect(choosePost("melee", at(0), posts, [2, 1, 0])).toBeUndefined();
    expect(choosePost("caster", at(0), posts, [0, 0, 1])).toBe(1);
  });

  it("el reparto respeta las plazas y eligen primero los que están más cerca", () => {
    const units = [
      { id: "lejos", role: "melee" as const, at: at(-30) },
      { id: "cerca", role: "melee" as const, at: at(1) },
      { id: "medio", role: "melee" as const, at: at(-5) },
      { id: "lado", role: "melee" as const, at: at(19) },
    ];
    const result = assignPosts(units, posts);
    expect(result.get("cerca")).toBe(0);
    expect(result.get("lado")).toBe(0);
    expect(result.get("medio")).toBe(1);
    expect(result.get("lejos")).toBeUndefined();
  });

  it("sin puestos, todos a la reserva", () => {
    expect(assignPosts([{ id: "a", role: "caster", at: at(0) }], []).get("a")).toBeUndefined();
  });

  it("los mapas con puestos tienen sitio de cada tipo para ambos roles", () => {
    for (const map of Object.values(MAPS)) {
      if (!map.defensePosts?.length) continue;
      const kinds = new Set(map.defensePosts.map((p) => p.kind));
      expect(kinds.has("front") || kinds.has("side"), map.id).toBe(true);
      expect(kinds.has("high") || kinds.has("side"), map.id).toBe(true);
      for (const p of map.defensePosts) expect(capacityOf(p)).toBeGreaterThan(0);
    }
  });
});
