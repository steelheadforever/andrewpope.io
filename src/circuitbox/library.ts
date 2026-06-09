// Serialize / deserialize the chip library to JSON — the bridge between the
// local workshop and the published frontier. The author exports this, commits
// it as library.json, and the app loads that committed file at startup so every
// visitor sees the author's current frontier in the chips palette.
//
// A ChipDef holds a live Circuit (nodes are a Map); the serial form flattens
// nodes to an array. Chip ids are preserved so nested-chip references survive a
// round trip (and registerChip keeps the id counter ahead of loaded ids).

import type { Circuit, Node, Wire } from "./engine/types";
import { emptyCircuit } from "./engine/types";
import {
  allChips,
  clearChips,
  registerChip,
  type ChipDef,
  type ChipPin,
} from "./engine/chips";

const LIBRARY_VERSION = 1;

interface SerialChip {
  id: string;
  name: string;
  inputs: ChipPin[];
  outputs: ChipPin[];
  nodes: Node[];
  wires: Wire[];
}

export interface SerialLibrary {
  version: number;
  chips: SerialChip[];
}

export function serializeLibrary(): SerialLibrary {
  return {
    version: LIBRARY_VERSION,
    chips: allChips().map((d) => ({
      id: d.id,
      name: d.name,
      inputs: d.inputs,
      outputs: d.outputs,
      nodes: [...d.circuit.nodes.values()],
      wires: d.circuit.wires,
    })),
  };
}

export function libraryToJson(): string {
  return JSON.stringify(serializeLibrary(), null, 2);
}

export interface LoadResult {
  ok: boolean;
  count: number;
  error?: string;
}

/** Replace the registry with the chips in `data` (a parsed SerialLibrary). */
export function loadLibrary(data: unknown): LoadResult {
  if (!data || typeof data !== "object") return { ok: false, count: 0, error: "not an object" };
  const lib = data as Partial<SerialLibrary>;
  if (!Array.isArray(lib.chips)) return { ok: false, count: 0, error: "missing chips[]" };
  clearChips();
  let count = 0;
  for (const sc of lib.chips) {
    const circuit: Circuit = emptyCircuit();
    for (const n of sc.nodes ?? []) circuit.nodes.set(n.id, { ...n });
    circuit.wires = (sc.wires ?? []).map((w) => ({ ...w }));
    const def: ChipDef = {
      id: sc.id,
      name: sc.name,
      inputs: sc.inputs,
      outputs: sc.outputs,
      circuit,
    };
    registerChip(def);
    count++;
  }
  return { ok: true, count };
}
