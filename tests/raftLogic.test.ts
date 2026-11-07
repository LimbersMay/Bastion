import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTITY_IDS, FAMILY } from "../scripts/constants";
import { RAFT_MAX_TICKS, RAFT_SPEED, RAFT_STALL_TICKS, RaftCourse, raftImpulse, yawToward } from "../scripts/systems/raftLogic";

const shore = { x: 10, y: 80, z: 0 };
const at = (x: number, z = 0) => ({ x, y: 79, z });

describe("balsas", () => {
  it("navega hacia la orilla a velocidad fija sin tocar la vertical", () => {
    const push = raftImpulse(at(0), shore, { x: 0, y: -0.1, z: 0 });
    expect(push.x).toBeCloseTo(RAFT_SPEED);
    expect(push.y).toBe(0);
    expect(push.z).toBeCloseTo(0);
    // Si ya va a esa velocidad, no empuja más.
    expect(raftImpulse(at(0), shore, { x: RAFT_SPEED, y: 0, z: 0 }).x).toBeCloseTo(0);
  });

  it("mira hacia donde va (0 = sur, 90 = oeste)", () => {
    expect(yawToward(at(0), { x: 0, y: 0, z: 5 })).toBeCloseTo(0);
    expect(yawToward(at(0), { x: -5, y: 0, z: 0 })).toBeCloseTo(90);
  });

  it("atraca al llegar a la orilla", () => {
    const course = new RaftCourse(shore, 0);
    expect(course.step(at(0), 2)).toBe("sail");
    expect(course.step(at(8), 40)).toBe("land");
  });

  it("atraca si deja de avanzar (chocó con algo) y si tarda demasiado", () => {
    const stuck = new RaftCourse(shore, 0);
    expect(stuck.step(at(0), 2)).toBe("sail");
    expect(stuck.step(at(0.2), RAFT_STALL_TICKS - 2)).toBe("sail");
    expect(stuck.step(at(0.3), RAFT_STALL_TICKS + 2)).toBe("land");

    const slow = new RaftCourse({ x: 1000, y: 80, z: 0 }, 0);
    let x = 0;
    for (let t = 2; t < RAFT_MAX_TICKS; t += 2) expect(slow.step(at((x += 1)), t)).toBe("sail");
    expect(slow.step(at(x + 1), RAFT_MAX_TICKS)).toBe("land");
  });

  it("la balsa flota, nadie la daña y solo suben unidades", () => {
    const raft = JSON.parse(readFileSync("behavior_packs/bastion/entities/raft.json", "utf-8"))["minecraft:entity"];
    expect(raft.description.identifier).toBe(ENTITY_IDS.raft);
    expect(raft.components["minecraft:type_family"].family).toContain(FAMILY.raft);
    expect(raft.components["minecraft:buoyant"].liquid_blocks).toContain("minecraft:water");
    expect(raft.components["minecraft:rideable"].family_types).toEqual(["bastion_unit"]);
    expect(raft.components["minecraft:damage_sensor"].triggers[0].deals_damage).toBe("no");
    expect(raft.components["minecraft:persistent"]).toBeUndefined();
  });
});
