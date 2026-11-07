import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UNIT_LIST, unitOf, UNITS } from "../scripts/units/catalog";
import { baseDamage, behaviorEntity, modeEvent, type Range, skinGroup, unitFiles, unitRenderControllers, VARIATION, WEAPON_BONUS } from "../tools/units/generate";

const read = (path: string) => readFileSync(path, "utf-8").replace(/\r\n/g, "\n");

describe("generador de unidades", () => {
  it("los archivos de las unidades están al día con las fichas (si falla: npm run units)", () => {
    for (const [path, text] of unitFiles(read)) expect(read(path), path).toBe(text);
  });

  it("cada modo deja activo solo ese modo y la unidad aparece en el primero", () => {
    for (const unit of UNIT_LIST) {
      const entity = behaviorEntity(unit)["minecraft:entity"] as { component_groups: object; events: Record<string, any> };
      const modes = Object.keys(entity.component_groups).filter((g) => !g.startsWith("bastion:skin_"));
      expect(entity.events["minecraft:entity_spawned"].sequence[0].add.component_groups).toEqual([modes[0]]);
      for (const mode of modes) {
        const event = entity.events[modeEvent(mode)];
        expect(event.add.component_groups).toEqual([mode]);
        expect([...event.remove.component_groups, mode].sort()).toEqual([...modes].sort());
      }
    }
  });

  it("cada unidad aparece con una de sus skins al azar, y su render controller la pinta", () => {
    const controllers = unitRenderControllers().render_controllers as Record<string, any>;
    for (const unit of UNIT_LIST) {
      const entity = behaviorEntity(unit)["minecraft:entity"] as { component_groups: Record<string, any>; events: Record<string, any> };
      const choices = entity.events["minecraft:entity_spawned"].sequence[1].randomize;
      expect(choices.map((c: any) => c.add.component_groups[0])).toEqual(unit.skins.map((_, i) => skinGroup(i)));
      unit.skins.forEach((_, i) => expect(entity.component_groups[skinGroup(i)]["minecraft:variant"].value).toBe(i));
      // Ningún modo quita la skin.
      for (const [name, event] of Object.entries(entity.events)) {
        if (name !== "minecraft:entity_spawned") expect(event.remove.component_groups.some((g: string) => g.startsWith("bastion:skin_")), name).toBe(false);
      }
      const controller = controllers[`controller.render.bastion.${unit.id}`];
      expect(controller.arrays.textures["Array.skins"]).toHaveLength(unit.skins.length);
    }
  });
});

describe("fichas de unidad", () => {
  it("cada ficha tiene sus skins (64x64) y un id que coincide con su clave", () => {
    for (const [key, unit] of Object.entries(UNITS)) {
      expect(unit.id).toBe(key);
      expect(unit.entityId).toBe(`bastion:${key}`);
      expect(unit.skins.length).toBeGreaterThan(0);
      for (const skin of unit.skins) {
        const path = `resource_packs/bastion/textures/entity/${skin}.png`;
        expect(existsSync(path), skin).toBe(true);
        const png = readFileSync(path);
        expect([png.readUInt32BE(16), png.readUInt32BE(20)], skin).toEqual([64, 64]);
      }
    }
  });

  it("cada skin tiene su origen y autor en docs/SKINS.md", () => {
    const credits = readFileSync("docs/SKINS.md", "utf-8");
    for (const unit of UNIT_LIST) for (const skin of unit.skins) expect(credits, skin).toContain("`" + skin + "`");
  });

  it("quien dispara tiene proyectil y quien pelea cuerpo a cuerpo no", () => {
    for (const unit of UNIT_LIST) expect(Boolean(unit.projectile), unit.id).toBe(unit.role !== "melee");
  });

  it("vida, daño y velocidad son razonables", () => {
    for (const unit of UNIT_LIST) {
      expect(unit.health).toBeGreaterThan(0);
      expect(unit.damage).toBeGreaterThan(0);
      expect(unit.speed).toBeGreaterThan(0.1);
      expect(unit.speed).toBeLessThan(0.5);
    }
  });

  it("el arma en la mano no cambia el golpe: el daño base descuenta lo que suma (medido en el servidor)", () => {
    for (const unit of UNIT_LIST) {
      const entity = behaviorEntity(unit)["minecraft:entity"] as { components: Record<string, any> };
      const bonus = unit.weapon ? WEAPON_BONUS[unit.weapon] : 0;
      expect(bonus, `${unit.id}: ${unit.weapon}`).toBeDefined();
      expect(middle(entity.components["minecraft:attack"].damage) + bonus).toBe(unit.damage);
      expect(baseDamage(unit)).toBe(unit.damage - bonus);
      if (unit.weapon) expect(entity.components["minecraft:equipment"].slot_drop_chance[0].drop_chance).toBe(0);
    }
  });

  it("vida y golpe varían un 10 % alrededor de la ficha; las cifras pequeñas quedan fijas", () => {
    for (const unit of UNIT_LIST) {
      const entity = behaviorEntity(unit)["minecraft:entity"] as { components: Record<string, any> };
      const bonus = unit.weapon ? WEAPON_BONUS[unit.weapon] : 0;
      const health = entity.components["minecraft:health"];
      expect(health.max, `${unit.id}: sin máximo fijo, el juego toma lo que sale`).toBeUndefined();
      for (const [value, generated] of [
        [unit.health, health.value],
        [unit.damage, shift(entity.components["minecraft:attack"].damage, bonus)],
      ] as const) {
        expect(middle(generated), unit.id).toBe(value);
        const spread = typeof generated === "number" ? 0 : generated.range_max - value;
        expect(spread, unit.id).toBe(Math.round(value * VARIATION));
      }
    }
    expect(behaviorEntity(UNITS.ally_soldier)["minecraft:entity"]).toMatchObject({
      components: { "minecraft:health": { value: { range_min: 54, range_max: 66 } }, "minecraft:attack": { damage: { range_min: 3, range_max: 5 } } },
    });
  });

  it("se encuentra la ficha de una entidad por su id", () => {
    expect(unitOf("bastion:invader_wizard")?.role).toBe("caster");
    expect(unitOf("bastion:arcane_bolt")).toBeUndefined();
  });
});

/** Centro de una cifra del juego, fija o con rango. */
function middle(value: number | Range): number {
  return typeof value === "number" ? value : (value.range_min + value.range_max) / 2;
}

/** La misma cifra, fija o con rango, desplazada en `by`. */
function shift(value: number | Range, by: number): number | Range {
  return typeof value === "number" ? value + by : { range_min: value.range_min + by, range_max: value.range_max + by };
}
