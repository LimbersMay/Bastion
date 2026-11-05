import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLY_FIGHT_EVENT, GATE_HEALTH_TIERS } from "../scripts/constants";

const readEntity = (name: string) =>
  JSON.parse(readFileSync(`behavior_packs/bastion/entities/${name}.json`, "utf-8"))["minecraft:entity"];

describe("gate_core.json", () => {
  const gate = readEntity("gate_core");

  for (const tier of GATE_HEALTH_TIERS) {
    it(`tiene el evento y el grupo de vida ${tier}`, () => {
      expect(gate.events[`bastion:hp_${tier}`]).toBeDefined();
      expect(gate.component_groups[`bastion:hp_${tier}`]["minecraft:health"]).toEqual({ value: tier, max: tier });
    });
  }

  it("no tiene tramos de vida que el código no conozca", () => {
    const tiers = Object.keys(gate.events).map((e) => Number(e.replace("bastion:hp_", "")));
    expect(tiers.sort((a, b) => a - b)).toEqual([...GATE_HEALTH_TIERS]);
  });
});

describe("ally_soldier.json", () => {
  const ally = readEntity("ally_soldier");

  it("patrulla al aparecer y pasa a combatir con el evento de brecha", () => {
    expect(ally.events["minecraft:entity_spawned"].add.component_groups).toContain("bastion:patrol");
    const fight = ally.events[ALLY_FIGHT_EVENT];
    expect(fight.remove.component_groups).toContain("bastion:patrol");
    expect(fight.add.component_groups).toContain("bastion:fight");
  });

  it("no ataca hasta el combate: el objetivo solo está en el grupo de combate", () => {
    expect(ally.components["minecraft:behavior.nearest_attackable_target"]).toBeUndefined();
    expect(ally.component_groups["bastion:fight"]["minecraft:behavior.nearest_attackable_target"]).toBeDefined();
  });
});
