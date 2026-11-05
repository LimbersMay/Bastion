import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLY_FIGHT_EVENT, ALLY_PATROL_EVENT, ENTITY_IDS, FAMILY, MAX_RETURN_STAGES, RALLY_TAG, RETURN_EVENT, SOLDIER_MARCH_EVENT, WIZARD_ASSAULT_EVENT, WIZARD_SIEGE_EVENT } from "../scripts/constants";

const readEntity = (name: string) =>
  JSON.parse(readFileSync(`behavior_packs/bastion/entities/${name}.json`, "utf-8"))["minecraft:entity"];

describe("invader_wizard.json y arcane_bolt.json", () => {
  const wizard = readEntity("invader_wizard");
  const bolt = readEntity("arcane_bolt");

  it("el mago dispara el proyectil arcano", () => {
    expect(wizard.components["minecraft:shooter"].def).toBe(ENTITY_IDS.arcaneBolt);
    expect(wizard.component_groups["bastion:siege"]["minecraft:behavior.ranged_attack"]).toBeDefined();
    expect(wizard.component_groups["bastion:assault"]["minecraft:behavior.ranged_attack"]).toBeDefined();
    expect(wizard.component_groups["bastion:returning"]["minecraft:behavior.ranged_attack"]).toBeUndefined();
  });

  it("el mago cuenta como invasor y el proyectil no (si no, la oleada no terminaría)", () => {
    expect(wizard.components["minecraft:type_family"].family).toContain(FAMILY.invader);
    expect(bolt.components["minecraft:type_family"].family).toContain(FAMILY.bolt);
    expect(bolt.components["minecraft:type_family"].family).not.toContain(FAMILY.invader);
  });

  it("los aliados no se queman, pero las explosiones sí les hacen daño", () => {
    for (const name of ["ally_soldier", "ally_wizard"]) {
      const triggers = readEntity(name).components["minecraft:damage_sensor"].triggers as { cause?: string; deals_damage?: string }[];
      for (const cause of ["fire", "fire_tick"]) expect(triggers.find((t) => t.cause === cause)?.deals_damage).toBe("no");
      expect(triggers.find((t) => t.cause === "entity_explosion")).toBeUndefined();
    }
  });

  it("los invasores ignoran el daño de sus propios proyectiles, explosiones y fuego", () => {
    for (const name of ["invader_soldier", "invader_wizard"]) {
      const sensor = JSON.stringify(readEntity(name).components["minecraft:damage_sensor"]);
      expect(sensor).toContain(FAMILY.bolt);
      for (const cause of ["entity_explosion", "fire", "fire_tick"]) expect(sensor).toContain(`"cause":"${cause}"`);
    }
  });

  it("el proyectil explota y prende fuego como la bola del Ghast", () => {
    const event = bolt.components["minecraft:projectile"].on_hit.definition_event.event_trigger.event;
    const [group] = bolt.events[event].add.component_groups;
    const explode = bolt.component_groups[group]["minecraft:explode"];
    expect(explode.power).toBe(1);
    expect(explode.causes_fire).toBe(true);
    expect(explode.destroy_affected_by_griefing).toBe(true);
  });
});

describe("inteligencia de objetivos", () => {
  it("los invasores solo apuntan a quien nada si ellos también están en el agua", () => {
    const soldier = readEntity("invader_soldier").component_groups["bastion:march"]["minecraft:behavior.nearest_attackable_target"];
    const wizard = readEntity("invader_wizard").component_groups["bastion:assault"]["minecraft:behavior.nearest_attackable_target"];
    for (const target of [soldier, wizard]) {
      const filters = JSON.stringify(target.entity_types[0].filters);
      expect(filters).toContain('{"test":"in_water","subject":"self","value":true}');
      expect(filters).toContain('{"test":"in_water","subject":"other","operator":"!=","value":true}');
    }
  });

  it("todas las unidades tienen el regreso a pie: pelean cerca y si no van al hito de su tramo", () => {
    for (const name of ["invader_soldier", "invader_wizard", "ally_soldier", "ally_wizard"]) {
      const entity = readEntity(name);
      const types = entity.component_groups["bastion:returning"]["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types;
      expect(types[0].priority).toBe(0);
      expect(types[0].max_dist).toBeLessThan(types[1].max_dist);
      expect(types.slice(1)).toHaveLength(MAX_RETURN_STAGES);
      expect(JSON.stringify(types[MAX_RETURN_STAGES])).toContain(`bastion_stage_${MAX_RETURN_STAGES - 1}`);
      expect(JSON.stringify(types[MAX_RETURN_STAGES])).toContain(`bastion_wp_${MAX_RETURN_STAGES - 1}`);
      expect(entity.events[RETURN_EVENT].add.component_groups).toContain("bastion:returning");
    }
  });

  it("al terminar el regreso cada unidad recupera su comportamiento", () => {
    const resumes: [string, string][] = [
      ["invader_soldier", SOLDIER_MARCH_EVENT],
      ["invader_wizard", WIZARD_SIEGE_EVENT],
      ["invader_wizard", WIZARD_ASSAULT_EVENT],
      ["ally_soldier", ALLY_PATROL_EVENT],
      ["ally_soldier", ALLY_FIGHT_EVENT],
    ];
    for (const [name, event] of resumes) {
      expect(readEntity(name).events[event].remove.component_groups).toContain("bastion:returning");
    }
  });

  it("el mago ataca el muro hasta la brecha y solo entonces a aliados y jugadores", () => {
    const wizard = readEntity("invader_wizard");
    const targets = (group: string) => JSON.stringify(wizard.component_groups[group]["minecraft:behavior.nearest_attackable_target"].entity_types);
    expect(wizard.events["minecraft:entity_spawned"].add.component_groups).toContain("bastion:siege");
    expect(targets("bastion:siege")).toContain(FAMILY.aim);
    expect(targets("bastion:siege")).not.toContain(FAMILY.ally);
    expect(targets("bastion:assault")).toContain(FAMILY.ally);
    expect(targets("bastion:assault")).not.toContain(FAMILY.aim);
    expect(wizard.events[WIZARD_ASSAULT_EVENT].remove.component_groups).toContain("bastion:siege");
    expect(wizard.events[WIZARD_ASSAULT_EVENT].add.component_groups).toContain("bastion:assault");
  });

  it("el soldado invasor solo persigue a quien puede alcanzar; si no hay nadie, va a la meta", () => {
    const march = readEntity("invader_soldier").component_groups["bastion:march"];
    const foes = march["minecraft:behavior.nearest_attackable_target"];
    const goal = march["minecraft:behavior.nearest_prioritized_attackable_target"];
    expect(foes.must_reach).toBe(true);
    expect(JSON.stringify(foes.entity_types)).not.toContain(FAMILY.objective);
    expect(goal.must_reach).toBeUndefined();
    expect(JSON.stringify(goal.entity_types)).toContain(FAMILY.objective);
    expect(goal.priority).toBeGreaterThan(foes.priority);
  });

  it("todas las unidades que caminan saben abrir puertas", () => {
    for (const name of ["invader_soldier", "invader_wizard", "ally_soldier", "ally_wizard"]) {
      const components = readEntity(name).components;
      expect(components["minecraft:navigation.walk"].can_open_doors).toBe(true);
      expect(components["minecraft:annotation.open_door"]).toBeDefined();
    }
  });

  it("los aliados en combate solo eligen invasores alcanzables y vuelven a su puesto", () => {
    const fight = readEntity("ally_soldier").component_groups["bastion:fight"];
    expect(fight["minecraft:behavior.nearest_attackable_target"].must_reach).toBe(true);
    expect(fight["minecraft:home"]).toBeDefined();
    expect(fight["minecraft:behavior.move_towards_home_restriction"]).toBeDefined();
  });
});

describe("ally_wizard.json", () => {
  const wizard = readEntity("ally_wizard");
  const bolt = readEntity("ally_bolt");

  it("dispara desde su puesto a los invasores y no se mueve de la muralla", () => {
    expect(wizard.components["minecraft:shooter"].def).toBe(ENTITY_IDS.allyBolt);
    expect(wizard.components["minecraft:type_family"].family).toContain(FAMILY.ally);
    for (const group of ["bastion:patrol", "bastion:fight"]) {
      const g = wizard.component_groups[group];
      expect(g["minecraft:behavior.ranged_attack"].speed_multiplier).toBe(0);
      expect(JSON.stringify(g["minecraft:behavior.nearest_attackable_target"].entity_types)).toContain(FAMILY.invader);
    }
  });

  it("su proyectil no explota ni prende fuego: no daña el propio castillo", () => {
    expect(bolt.description.identifier).toBe(ENTITY_IDS.allyBolt);
    expect(bolt.component_groups).toBeUndefined();
    expect(bolt.components["minecraft:projectile"].on_hit.definition_event).toBeUndefined();
    expect(bolt.components["minecraft:projectile"].on_hit.impact_damage.damage).toBeGreaterThan(0);
  });
});

describe("órdenes a los aliados", () => {
  const groups = ["bastion:patrol", "bastion:fight", "bastion:returning", "bastion:hold", "bastion:retreat", "bastion:sortie"];

  for (const name of ["ally_soldier", "ally_wizard"]) {
    const entity = readEntity(name);

    it(`${name}: cada orden deja activo un solo modo`, () => {
      for (const group of groups) {
        const event = entity.events[group === "bastion:returning" ? "bastion:return" : group];
        expect(event.add.component_groups).toEqual([group]);
        expect([...event.remove.component_groups, group].sort()).toEqual([...groups].sort());
      }
    });

    it(`${name}: al retirarse corre al punto de reunión y solo se defiende de quien tiene encima`, () => {
      const [foes, rally] = entity.component_groups["bastion:retreat"]["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types;
      expect(JSON.stringify(foes)).toContain(FAMILY.invader);
      expect(foes.max_dist).toBeLessThanOrEqual(6);
      expect(foes.priority).toBeLessThan(rally.priority);
      expect(JSON.stringify(rally)).toContain(RALLY_TAG);
    });

    it(`${name}: al salir busca invasores lejos y sin quedarse atado a su puesto`, () => {
      const sortie = entity.component_groups["bastion:sortie"];
      expect(sortie["minecraft:home"]).toBeUndefined();
      expect(sortie["minecraft:behavior.nearest_attackable_target"].entity_types[0].max_dist).toBe(100);
    });

    it(`${name}: al salir no se queda pegado a una pared mirando a un enemigo inalcanzable`, () => {
      expect(entity.component_groups["bastion:sortie"]["minecraft:behavior.nearest_attackable_target"].must_reach).toBe(true);
    });
  }

  it("el mago aliado solo camina al salir: de guardia dispara desde su puesto", () => {
    const wizard = readEntity("ally_wizard");
    expect(wizard.component_groups["bastion:hold"]["minecraft:behavior.ranged_attack"].speed_multiplier).toBe(0);
    expect(wizard.component_groups["bastion:sortie"]["minecraft:behavior.ranged_attack"].speed_multiplier).toBeGreaterThan(0);
  });
});

describe("ritmo de combate", () => {
  const seconds = (attackerName: string, defenderName: string) => {
    const attacker = readEntity(attackerName);
    const defender = readEntity(defenderName);
    const melee = Object.values<Record<string, { cooldown_time: number }>>(attacker.component_groups)
      .map((g) => g["minecraft:behavior.melee_attack"])
      .concat(attacker.components["minecraft:behavior.melee_attack"])
      .find(Boolean);
    return Math.ceil(defender.components["minecraft:health"].value / attacker.components["minecraft:attack"].damage) * (melee?.cooldown_time ?? 1);
  };

  it("un duelo entre soldados dura entre 15 y 30 segundos, sin ser un trámite ni eterno", () => {
    for (const time of [seconds("ally_soldier", "invader_soldier"), seconds("invader_soldier", "ally_soldier")]) {
      expect(time).toBeGreaterThanOrEqual(15);
      expect(time).toBeLessThanOrEqual(30);
    }
  });

  it("el soldado aliado aguanta algo más que el invasor, pero no el doble", () => {
    const ratio = seconds("invader_soldier", "ally_soldier") / seconds("ally_soldier", "invader_soldier");
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(2);
  });
});

describe("aim_point.json", () => {
  const aim = readEntity("aim_point");

  it("flota delante del muro y no se puede destruir", () => {
    expect(aim.description.identifier).toBe(ENTITY_IDS.aimPoint);
    expect(aim.components["minecraft:type_family"].family).toContain(FAMILY.aim);
    expect(aim.components["minecraft:physics"].has_gravity).toBe(false);
    expect(aim.components["minecraft:damage_sensor"].triggers[0].deals_damage).toBe("no");
  });
});

describe("objective.json", () => {
  const objective = readEntity("objective");

  it("es la meta invisible: familia propia y no recibe daño", () => {
    expect(objective.components["minecraft:type_family"].family).toContain(FAMILY.objective);
    expect(objective.components["minecraft:damage_sensor"].triggers[0].deals_damage).toBe("no");
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

  it("también se defiende patrullando, pero solo de lo que tiene cerca y puede alcanzar", () => {
    const patrol = ally.component_groups["bastion:patrol"];
    const fight = ally.component_groups["bastion:fight"];
    expect(patrol["minecraft:behavior.melee_attack"]).toBeDefined();
    expect(patrol["minecraft:behavior.hurt_by_target"]).toBeDefined();
    const near = patrol["minecraft:behavior.nearest_attackable_target"];
    expect(near.must_reach).toBe(true);
    expect(near.entity_types[0].max_dist).toBeLessThan(fight["minecraft:behavior.nearest_attackable_target"].entity_types[0].max_dist);
  });
});
