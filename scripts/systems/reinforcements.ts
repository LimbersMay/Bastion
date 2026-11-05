import type { Entity } from "@minecraft/server";
import { LOGIC_INTERVAL_TICKS, TICKS_PER_SECOND } from "../constants";
import type { MapDef } from "../maps/types";
import type { UnitId } from "../units/catalog";
import { reinforcementsDue } from "./wavePlan";

/** Lo que hace falta del gestor para sacar una unidad al campo. */
type SpawnUnit = (unit: UnitId, index: number) => Entity | undefined;

/** Ajustes que se pueden cambiar en caliente para las pruebas a gran escala. */
export interface ReinforcementTuning {
  readonly minField: number;
  readonly reservePerWave: number;
  readonly batch: number;
}

/** Durante la oleada, repone aliados desde una reserva limitada cuando quedan pocos en el campo. */
export class Reinforcements {
  private reserve = 0;
  private clock = 0;
  private served = 0;
  private tuning: ReinforcementTuning | undefined;
  /** Se avisa una sola vez por oleada de que la reserva se acabó. */
  private announcedEmpty = false;

  constructor(private readonly map: MapDef) {}

  get remaining(): number {
    return this.reserve;
  }

  tune(tuning: ReinforcementTuning): void {
    this.tuning = tuning;
    this.reserve = tuning.reservePerWave;
    this.announcedEmpty = false;
  }

  startWave(): void {
    const plan = this.tuning ?? this.map.reinforcements;
    this.reserve = plan?.reservePerWave ?? 0;
    this.clock = 0;
    this.announcedEmpty = false;
  }

  /**
   * Revisión periódica. Saca una tanda si toca y devuelve las unidades nuevas;
   * `emptied` es `true` la vez que se gasta la última reserva.
   */
  tick(alive: number, spawn: SpawnUnit): { arrived: Entity[]; emptied: boolean } {
    const plan = this.map.reinforcements;
    const arrived: Entity[] = [];
    if (!plan) return { arrived, emptied: false };

    this.clock += LOGIC_INTERVAL_TICKS;
    if (this.clock < plan.everySeconds * TICKS_PER_SECOND) return { arrived, emptied: false };
    this.clock = 0;

    const minField = this.tuning?.minField ?? plan.minField;
    const batch = this.tuning?.batch ?? plan.batch;
    const due = reinforcementsDue(alive, minField, this.reserve, batch);
    for (let i = 0; i < due; i++) {
      const unit = plan.units[this.served % plan.units.length];
      const entity = spawn(unit, this.served);
      this.served++;
      this.reserve--;
      if (entity) arrived.push(entity);
    }
    const emptied = this.reserve === 0 && due > 0 && !this.announcedEmpty;
    if (emptied) this.announcedEmpty = true;
    return { arrived, emptied };
  }

  reset(): void {
    this.reserve = 0;
    this.clock = 0;
    this.served = 0;
    this.tuning = undefined;
    this.announcedEmpty = false;
  }
}
