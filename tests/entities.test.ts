import { readFileSync } from "node:fs";
import { HOLD_ENGAGE } from "../scripts/systems/stanceLogic";
import { RESELECT_TARGETS } from "../tools/units/behavior";
import { describe, expect, it } from "vitest";
import { isUnitId, UNIT_LIST, UNITS } from "../scripts/units/catalog";
import { HOLD_LINE_TAG, ALLY_ESCORT_EVENT, ALLY_FIGHT_EVENT, ALLY_GUARD_EVENT, escortMarkerTag, escortTag, MAX_ESCORTS, ALLY_PATROL_EVENT, ENTITY_IDS, FAMILY, HUNT_TRAILS, huntTrailTag, INTRUDER_TAG, MAX_POSTS, MAX_RETURN_ROUTES, postMarkerTag, postTag, MAX_RETURN_STAGES, RALLY_TAG, returnWaypointTag, RETURN_EVENT, SOLDIER_MARCH_EVENT, WIZARD_ASSAULT_EVENT, WIZARD_SIEGE_EVENT, MAX_SQUADS, squadMarkerTag, SQUAD_ENGAGE, SQUAD_TAG, SQUAD_WAIT_TAG, KEEP_TAG, TO_KEEP_TAG } from "../scripts/constants";

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
    for (const { id: name } of UNIT_LIST.filter((u) => u.side === "ally")) {
      const triggers = readEntity(name).components["minecraft:damage_sensor"].triggers as { cause?: string; deals_damage?: string }[];
      for (const cause of ["fire", "fire_tick"]) expect(triggers.find((t) => t.cause === cause)?.deals_damage).toBe("no");
      expect(triggers.find((t) => t.cause === "entity_explosion")).toBeUndefined();
    }
  });

  it("los invasores ignoran el daño de sus propios proyectiles, explosiones y fuego", () => {
    for (const { id: name } of UNIT_LIST.filter((u) => u.side === "invader")) {
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
    for (const { id: name } of UNIT_LIST) {
      const entity = readEntity(name);
      const types = entity.component_groups["bastion:returning"]["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types;
      expect(types[0].priority).toBe(0);
      expect(types[0].max_dist).toBeLessThan(types[1].max_dist);
      expect(types.slice(1)).toHaveLength(MAX_RETURN_ROUTES * MAX_RETURN_STAGES);
      const last = JSON.stringify(types[types.length - 1]);
      expect(last).toContain(`bastion_stage_${MAX_RETURN_STAGES - 1}`);
      expect(last).toContain(returnWaypointTag(MAX_RETURN_ROUTES - 1, MAX_RETURN_STAGES - 1));
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
    expect(wizard.events["minecraft:entity_spawned"].sequence[0].add.component_groups).toContain("bastion:siege");
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

  it("el soldado invasor caza: sigue su rastro, si no su grupo, si no va al enemigo vivo más cercano, y la puerta queda para el final", () => {
    const types = readEntity("invader_soldier").component_groups["bastion:march"]["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types as { priority: number }[];
    expect(types).toHaveLength(HUNT_TRAILS + MAX_SQUADS + 2);
    for (let slot = 0; slot < HUNT_TRAILS; slot++) {
      expect(types[slot].priority).toBe(0);
      expect(JSON.stringify(types[slot])).toContain(huntTrailTag(slot));
    }
    for (let slot = 0; slot < MAX_SQUADS; slot++) {
      expect(types[HUNT_TRAILS + slot].priority).toBe(1);
      expect(JSON.stringify(types[HUNT_TRAILS + slot])).toContain(squadMarkerTag(slot));
    }
    const [prey, gate] = types.slice(HUNT_TRAILS + MAX_SQUADS);
    expect(prey.priority).toBe(2);
    expect(JSON.stringify(prey)).toContain(FAMILY.ally);
    expect(JSON.stringify(prey)).toContain("player");
    // La reserva de un grupo no va a por nadie.
    expect(JSON.stringify(prey)).toContain(SQUAD_WAIT_TAG);
    expect(gate.priority).toBe(3);
    expect(JSON.stringify(gate)).toContain(FAMILY.objective);
  });

  it("en un grupo solo se lanzan contra quien tienen cerca; sin grupo, como siempre", () => {
    const march = readEntity("invader_soldier").component_groups["bastion:march"]["minecraft:behavior.nearest_attackable_target"];
    const sortie = readEntity("ally_soldier").component_groups["bastion:sortie"]["minecraft:behavior.nearest_attackable_target"];
    for (const goal of [march, sortie]) {
      const [loose, grouped] = goal.entity_types;
      expect(loose.max_dist).toBe(24);
      expect(JSON.stringify(loose.filters)).toContain(SQUAD_TAG);
      expect(grouped.max_dist).toBe(SQUAD_ENGAGE);
    }
  });

  it("todas las unidades abren puertas, en tierra evitan el agua y al regresar del agua nadan", () => {
    for (const { id: name } of UNIT_LIST) {
      const entity = readEntity(name);
      expect(entity.components["minecraft:annotation.open_door"]).toBeDefined();
      expect(entity.components["minecraft:navigation.walk"]).toBeUndefined();
      for (const [mode, group] of Object.entries<Record<string, any>>(entity.component_groups)) {
        if (mode.startsWith("bastion:skin_")) continue; // la skin no es un modo: no cambia cómo se mueve
        const nav = mode === "bastion:returning" ? group["minecraft:navigation.generic"] : group["minecraft:navigation.walk"];
        expect(nav, `${name} ${mode}`).toBeDefined();
        expect(nav.can_open_doors).toBe(true);
        expect(nav.avoid_water).toBe(mode !== "bastion:returning");
        if (mode === "bastion:returning") expect(nav.can_swim).toBe(true);
      }
    }
  });

  it("los aliados en combate solo eligen invasores alcanzables y vuelven a su puesto", () => {
    const fight = readEntity("ally_soldier").component_groups["bastion:fight"];
    expect(fight["minecraft:behavior.nearest_prioritized_attackable_target"].must_reach).toBe(true);
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
      expect(JSON.stringify(g["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types)).toContain(FAMILY.invader);
    }
  });

  it("su proyectil no explota ni prende fuego: no daña el propio castillo", () => {
    expect(bolt.description.identifier).toBe(ENTITY_IDS.allyBolt);
    expect(bolt.component_groups).toBeUndefined();
    expect(bolt.components["minecraft:projectile"].on_hit.definition_event).toBeUndefined();
    expect(bolt.components["minecraft:projectile"].on_hit.impact_damage.damage).toBeGreaterThan(0);
  });
});

describe("escolta del cuerno", () => {
  for (const { id: name } of UNIT_LIST.filter((u) => u.side === "ally" && u.role === "melee")) {
    const entity = readEntity(name);

    it(`${name}: de camino pelea con quien tiene encima y, si no, sigue el marcador de su jugador`, () => {
      const types = entity.component_groups[ALLY_ESCORT_EVENT]["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types;
      const foes = types.filter((t: { priority: number }) => t.priority < 2);
      const markers = types.filter((t: { priority: number }) => t.priority === 2);
      expect(JSON.stringify(foes[0])).toContain(FAMILY.invader);
      for (const f of foes) expect(f.max_dist).toBeLessThanOrEqual(8);
      expect(markers).toHaveLength(MAX_ESCORTS);
      markers.forEach((m: unknown, slot: number) => {
        expect(JSON.stringify(m)).toContain(`"${escortTag(slot)}"`);
        expect(JSON.stringify(m)).toContain(`"${escortMarkerTag(slot)}"`);
      });
    });

    it(`${name}: al lado de su jugador vigila sin seguir ningún marcador`, () => {
      const guard = entity.component_groups[ALLY_GUARD_EVENT];
      expect(guard["minecraft:behavior.melee_attack"]).toBeDefined();
      expect(guard["minecraft:behavior.random_stroll"]).toBeDefined();
      expect(JSON.stringify(guard)).not.toContain("bastion_escortmark_");
    });
  }
});

describe("aliados en desventaja: aguantan en su sitio", () => {
  for (const { id: name } of UNIT_LIST.filter((u) => u.side === "ally" && u.role === "melee")) {
    const entity = readEntity(name);
    const holding = JSON.stringify({ test: "has_tag", subject: "self", value: HOLD_LINE_TAG });
    const holds = (e: { filters: unknown }) => JSON.stringify(e.filters).includes(holding);

    for (const mode of ["bastion:patrol", "bastion:fight", "bastion:hold"]) {
      it(`${name} (${mode}): quien aguanta solo va a por quien tiene a ${HOLD_ENGAGE} bloques`, () => {
        const types = entity.component_groups[mode]["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types;
        const held = types.filter(holds);
        const free = types.filter((t: { filters: unknown }) => !holds(t));
        expect(held.length).toBeGreaterThan(0);
        expect(free.length).toBe(held.length);
        for (const t of held) expect(t.max_dist).toBeLessThanOrEqual(HOLD_ENGAGE);
        expect(Math.max(...free.map((t: { max_dist: number }) => t.max_dist))).toBeGreaterThan(HOLD_ENGAGE);
      });
    }

    it(`${name}: aguantando, no sale tras quien le dispara de lejos`, () => {
      const types = entity.component_groups["bastion:hold"]["minecraft:behavior.hurt_by_target"].entity_types;
      const held = types.filter(holds);
      expect(held).toHaveLength(1);
      expect(held[0].max_dist).toBeLessThanOrEqual(8);
    });
  }
});

describe("órdenes a los aliados", () => {
  const orders = ["bastion:patrol", "bastion:fight", "bastion:returning", "bastion:hold", "bastion:retreat", "bastion:sortie"];

  for (const { id: name, role } of UNIT_LIST.filter((u) => u.side === "ally")) {
    const entity = readEntity(name);
    // Solo quien pelea cuerpo a cuerpo puede ser escolta del cuerno.
    const groups = role === "melee" ? [...orders, ALLY_ESCORT_EVENT, ALLY_GUARD_EVENT] : orders;

    it(`${name}: cada orden deja activo un solo modo`, () => {
      expect(Object.keys(entity.component_groups).filter((g) => !g.startsWith("bastion:skin_")).sort()).toEqual([...groups].sort());
      for (const group of groups) {
        const event = entity.events[group === "bastion:returning" ? "bastion:return" : group];
        expect(event.add.component_groups).toEqual([group]);
        expect([...event.remove.component_groups, group].sort()).toEqual([...groups].sort());
      }
    });

    it(`${name}: al retirarse corre a su puesto (o al patio) y solo se defiende de quien tiene encima`, () => {
      const types = entity.component_groups["bastion:retreat"]["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types;
      const [foes, ...rest] = types;
      const posts = rest.slice(0, MAX_POSTS);
      // Repliegue por la moral: a la torre, tan urgente como un puesto, antes que el patio.
      const keep = rest[MAX_POSTS];
      const rally = rest[MAX_POSTS + 1];
      expect(JSON.stringify(keep)).toContain(KEEP_TAG);
      expect(JSON.stringify(keep)).toContain(TO_KEEP_TAG);
      expect(keep.priority).toBeLessThan(rally.priority);
      expect(JSON.stringify(foes)).toContain(FAMILY.invader);
      expect(foes.max_dist).toBeLessThanOrEqual(6);
      posts.forEach((post: { priority: number }, i: number) => {
        expect(JSON.stringify(post)).toContain(postTag(i));
        expect(JSON.stringify(post)).toContain(postMarkerTag(i));
        expect(foes.priority).toBeLessThan(post.priority);
        expect(post.priority).toBeLessThan(rally.priority);
      });
      expect(posts).toHaveLength(MAX_POSTS);
      expect(JSON.stringify(rally)).toContain(RALLY_TAG);
    });

    it(`${name}: al salir va a por los invasores sin límite de distancia`, () => {
      const hunt = entity.component_groups["bastion:sortie"]["minecraft:behavior.nearest_prioritized_attackable_target"];
      const invaders = hunt.entity_types.find((t: object) => JSON.stringify(t).includes(FAMILY.invader));
      expect(invaders.max_dist).toBeGreaterThanOrEqual(200);
    });

    it(`${name}: al salir no se queda atado a su puesto y va a por los invasores cercanos`, () => {
      const sortie = entity.component_groups["bastion:sortie"];
      expect(sortie["minecraft:home"]).toBeUndefined();
      expect(sortie["minecraft:behavior.nearest_attackable_target"].entity_types[0].max_dist).toBe(24);
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
    // El golpe es el de la ficha: el generador descuenta del daño base lo que suma el arma.
    if (!isUnitId(attackerName)) throw new Error(attackerName);
    // Con la vida media: cada unidad nace con un ±10 % (ver `VARIATION` en el generador).
    const health = defender.components["minecraft:health"].value;
    const average = typeof health === "number" ? health : (health.range_min + health.range_max) / 2;
    return Math.ceil(average / UNITS[attackerName].damage) * (melee?.cooldown_time ?? 1);
  };

  // Limbers eligió el daño completo de las armas (2026-11-06): duelos de 6 a 10,5 s.
  it("un duelo entre soldados dura entre 6 y 15 segundos: rápido, pero no un trámite", () => {
    for (const time of [seconds("ally_soldier", "invader_soldier"), seconds("invader_soldier", "ally_soldier")]) {
      expect(time).toBeGreaterThanOrEqual(6);
      expect(time).toBeLessThanOrEqual(15);
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
    expect(ally.events["minecraft:entity_spawned"].sequence[0].add.component_groups).toContain("bastion:patrol");
    const fight = ally.events[ALLY_FIGHT_EVENT];
    expect(fight.remove.component_groups).toContain("bastion:patrol");
    expect(fight.add.component_groups).toContain("bastion:fight");
  });

  it("también se defiende patrullando, pero solo de lo que tiene cerca y puede alcanzar", () => {
    const patrol = ally.component_groups["bastion:patrol"];
    const fight = ally.component_groups["bastion:fight"];
    expect(patrol["minecraft:behavior.melee_attack"]).toBeDefined();
    expect(patrol["minecraft:behavior.hurt_by_target"]).toBeDefined();
    const near = patrol["minecraft:behavior.nearest_prioritized_attackable_target"];
    expect(near.must_reach).toBe(true);
    expect(near.entity_types[0].max_dist).toBeLessThan(fight["minecraft:behavior.nearest_prioritized_attackable_target"].entity_types[0].max_dist);
  });
});

describe("coste de elegir enemigo en batallas grandes", () => {
  const TARGETERS = ["minecraft:behavior.nearest_attackable_target", "minecraft:behavior.nearest_prioritized_attackable_target"];
  const each = (node: unknown, fn: (n: Record<string, any>) => void): void => {
    if (Array.isArray(node)) node.forEach((n) => each(n, fn));
    else if (node && typeof node === "object") {
      fn(node as Record<string, any>);
      Object.values(node).forEach((v) => each(v, fn));
    }
  };

  for (const { id: name } of UNIT_LIST) {
    const entity = readEntity(name);

    it(`${name}: solo comprueba si puede llegar a pie a enemigos a 24 bloques o menos (es lo más caro)`, () => {
      each(entity, (n) => {
        if (n.must_reach) for (const t of n.entity_types) expect(t.max_dist).toBeLessThanOrEqual(24);
      });
    });

    it(`${name}: busca enemigo cada 2 s, no a cada momento`, () => {
      let found = 0;
      each(entity, (n) => {
        for (const k of TARGETERS)
          if (n[k]) {
            found++;
            expect(n[k].scan_interval).toBe(40);
          }
      });
      expect(found).toBeGreaterThan(0);
    });

    // `reselect_targets` hunde la batalla de 400 unidades a 2-4 ticks/s (sin él, 19-20), pero sin él quien tiene
    // objetivo no lo suelta al cambiarle las etiquetas y los invasores se quedaban en el primer hito de Stonehill.
    // Se queda puesto mientras se decide la migración a Java (v0.1.55, docs/IA.md, «Coste en batallas grandes, otra vez»).
    it(`${name}: revisa su objetivo en cada tick (reselect_targets), para seguir rutas, grupos y rastros`, () => {
      let found = 0;
      each(entity, (n) => {
        for (const k of TARGETERS)
          if (n[k]) {
            found++;
            expect(n[k].reselect_targets).toBe(RESELECT_TARGETS);
            expect(RESELECT_TARGETS).toBe(true);
          }
      });
      expect(found).toBeGreaterThan(0);
    });
  }
});

describe("arqueros y guerrero (cifras elegidas por Limbers, 2026-11-06)", () => {
  const arrow = (name: string) => JSON.parse(readFileSync(`behavior_packs/bastion/entities/${name}.json`, "utf-8"))["minecraft:entity"];

  it("las flechas hacen 5 (aliada) y 4 (invasora), y desaparecen al chocar", () => {
    expect(arrow("ally_arrow").components["minecraft:projectile"].on_hit.impact_damage.damage).toBe(5);
    expect(arrow("invader_arrow").components["minecraft:projectile"].on_hit.impact_damage.damage).toBe(4);
    for (const name of ["ally_arrow", "invader_arrow"]) expect(arrow(name).components["minecraft:projectile"].on_hit.remove_on_hit).toBeDefined();
  });

  it("las flechas no hieren a los de su bando", () => {
    expect(arrow("ally_arrow").components["minecraft:type_family"].family).toContain("bastion_ally_bolt");
    expect(arrow("invader_arrow").components["minecraft:type_family"].family).toContain(FAMILY.bolt);
  });

  it("cada arquero dispara su flecha con el ritmo y el alcance de su ficha", () => {
    for (const [name, projectile, interval, radius] of [
      ["ally_archer", ENTITY_IDS.allyArrow, [1.5, 2], 24],
      ["invader_archer", ENTITY_IDS.invaderArrow, [2, 3], 20],
    ] as const) {
      const entity = readEntity(name);
      expect(entity.components["minecraft:shooter"].def).toBe(projectile);
      const group = entity.component_groups[name === "ally_archer" ? "bastion:hold" : "bastion:march"];
      const attack = group["minecraft:behavior.ranged_attack"];
      expect([attack.attack_interval_min, attack.attack_interval_max]).toEqual(interval);
      expect(attack.attack_radius).toBe(radius);
      const targeting = group["minecraft:behavior.nearest_attackable_target"] ?? group["minecraft:behavior.nearest_prioritized_attackable_target"];
      expect(targeting.must_see).toBe(true);
    }
  });

  it("el arquero aliado dispara desde su puesto sin moverse", () => {
    const archer = readEntity("ally_archer");
    for (const group of ["bastion:patrol", "bastion:fight", "bastion:hold"]) {
      expect(archer.component_groups[group]["minecraft:behavior.ranged_attack"].speed_multiplier, group).toBe(0);
    }
  });

  it("el arquero invasor no apunta a la meta ni al muro: solo a aliados y jugadores", () => {
    const march = JSON.stringify(readEntity("invader_archer").component_groups["bastion:march"]);
    expect(march).not.toContain(FAMILY.objective);
    expect(march).not.toContain(FAMILY.aim);
  });

  it("los arqueros se apartan de quien se les echa encima antes de seguir disparando", () => {
    for (const [name, group] of [["ally_archer", "bastion:patrol"], ["ally_archer", "bastion:hold"], ["ally_archer", "bastion:sortie"], ["invader_archer", "bastion:march"]] as const) {
      const g = readEntity(name).component_groups[group];
      const avoid = g["minecraft:behavior.avoid_mob_type"];
      expect(avoid, `${name} ${group}`).toBeDefined();
      expect(avoid.priority).toBeLessThan(g["minecraft:behavior.ranged_attack"].priority);
      expect(avoid.remove_target).toBe(false);
    }
  });

  it("los arqueros dibujan el arco (attachable); los demás no lo necesitan", () => {
    for (const unit of UNIT_LIST) {
      const client = JSON.parse(readFileSync(`resource_packs/bastion/entity/${unit.id}.entity.json`, "utf-8"))["minecraft:client_entity"].description;
      expect(Boolean(client.enable_attachables), unit.id).toBe(unit.role === "archer");
    }
  });

  it("el guerrero aguanta los empujones", () => {
    expect(readEntity("ally_warrior").components["minecraft:knockback_resistance"].value).toBe(1);
    expect(UNITS.ally_warrior.health).toBe(80);
    expect(UNITS.ally_warrior.damage).toBe(13);
  });
});

describe("monstruos del juego (creepers, endermen, brujas...)", () => {
  const ALLIES = ["ally_soldier", "ally_warrior", "ally_wizard", "ally_archer"];
  const types = (entity: string, group: string, key = "minecraft:behavior.nearest_prioritized_attackable_target") => readEntity(entity).component_groups[group][key].entity_types as Array<Record<string, any>>;
  const isInvader = (t: Record<string, any>) => JSON.stringify(t.filters).includes(FAMILY.invader);
  const isMonster = (t: Record<string, any>) => JSON.stringify(t.filters).includes('"monster"');

  it("los aliados los ven a todos como enemigos: ninguna familia de monstruo queda fuera", () => {
    for (const name of ALLIES) {
      const text = JSON.stringify(types(name, "bastion:patrol"));
      expect(text, name).toContain('"monster"');
      expect(text, name).not.toContain("creeper");
      expect(text, name).not.toContain("enderman");
    }
  });

  it("pero los invasores van antes: los monstruos tienen peor rango en patrulla, combate y defensa", () => {
    for (const name of ALLIES) {
      for (const group of ["bastion:patrol", "bastion:fight", "bastion:hold"]) {
        const list = types(name, group);
        const invader = Math.min(...list.filter(isInvader).map((t) => t.priority));
        const monster = Math.min(...list.filter(isMonster).map((t) => t.priority));
        expect(invader, `${name} ${group}`).toBeLessThan(monster);
      }
    }
  });

  it("a un monstruo se le busca de lejos solo si está en el castillo o ataca a un jugador; si no, solo de cerca", () => {
    for (const name of ALLIES) {
      for (const t of types(name, "bastion:fight").filter(isMonster)) {
        if (!JSON.stringify(t.filters).includes(INTRUDER_TAG)) expect(t.max_dist, name).toBeLessThanOrEqual(6);
      }
    }
  });

  it("con la orden de ataque, cuerpo a cuerpo solo eligen invasores; en la caza, los monstruos van detrás", () => {
    for (const name of ALLIES) {
      const near = types(name, "bastion:sortie", "minecraft:behavior.nearest_attackable_target");
      expect(near.every(isInvader), name).toBe(true);
      expect(JSON.stringify(near), name).not.toContain('"monster"');
      const hunt = types(name, "bastion:sortie");
      const invader = hunt.find(isInvader)!;
      expect(invader.max_dist).toBe(256);
      for (const t of hunt.filter(isMonster)) expect(t.priority, name).toBeGreaterThan(invader.priority);
    }
  });
});
