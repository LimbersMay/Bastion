import { describe, expect, it } from "vitest";
import { stalledUnits, trackAnchors } from "../scripts/systems/stallLogic";

const at = (x: number) => ({ x, y: 0, z: 0 });

describe("oleadas colgadas", () => {
  it("quien no se mueve de su sitio durante la espera, sin avances en la pelea, abandona", () => {
    let anchors = trackAnchors(new Map(), [{ id: "quieto", at: at(0) }, { id: "anda", at: at(0) }], 0);
    for (let t = 1; t <= 10; t++) anchors = trackAnchors(anchors, [{ id: "quieto", at: at(t % 2 ? 3 : 0) }, { id: "anda", at: at(t * 3) }], t);
    expect(stalledUnits(anchors, 10, 0, 10)).toEqual(["quieto"]);
  });

  it("un avance de la pelea (una baja, un bloque roto) vuelve a empezar la cuenta de todos", () => {
    const anchors = trackAnchors(new Map(), [{ id: "quieto", at: at(0) }], 0);
    expect(stalledUnits(anchors, 10, 5, 10)).toEqual([]);
    expect(stalledUnits(anchors, 15, 5, 10)).toEqual(["quieto"]);
  });

  it("quien sale de la lista (en reserva, regresando) empieza de cero al volver", () => {
    let anchors = trackAnchors(new Map(), [{ id: "a", at: at(0) }], 0);
    anchors = trackAnchors(anchors, [], 5);
    anchors = trackAnchors(anchors, [{ id: "a", at: at(0) }], 6);
    expect(stalledUnits(anchors, 10, 0, 10)).toEqual([]);
    expect(stalledUnits(anchors, 16, 0, 10)).toEqual(["a"]);
  });
});
