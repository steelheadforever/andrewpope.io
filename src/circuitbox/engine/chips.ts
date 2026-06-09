// Chips: a saved sub-circuit that behaves like a gate. A CHIP node references a
// ChipDef here; the simulator evaluates it by running its internal circuit
// (inputs drive the internal INPUT nodes, outputs read the internal OUTPUT
// nodes). This is the "eval() is a sub-circuit" seam the engine was built for.
//
// The registry is a module-level singleton: there is one breadboard per page,
// and threading a registry handle through geometry/render/sim/controller would
// be far more invasive than it's worth. Tests populate it directly.

import type { ChipId, Circuit, NodeId } from "./types";

export interface ChipPin {
  /** display label, e.g. "a" / "q" */
  label: string;
  /** the internal INPUT node (for inputs) or OUTPUT node (for outputs) this maps to */
  node: NodeId;
}

export interface ChipDef {
  id: ChipId;
  name: string;
  inputs: ChipPin[];
  outputs: ChipPin[];
  /** the internal sub-circuit; its INPUT/OUTPUT nodes are the interface above */
  circuit: Circuit;
}

const registry = new Map<ChipId, ChipDef>();

let chipSeq = 0;
export function makeChipId(): ChipId {
  return `chip${++chipSeq}`;
}

export function registerChip(def: ChipDef): void {
  registry.set(def.id, def);
  // keep the id counter ahead of any loaded ids so new local chips don't collide
  const m = /^chip(\d+)$/.exec(def.id);
  if (m) chipSeq = Math.max(chipSeq, Number(m[1]));
}

export function getChip(id: ChipId): ChipDef | undefined {
  return registry.get(id);
}

/** All registered chips, in registration order (palette display order). */
export function allChips(): ChipDef[] {
  return [...registry.values()];
}

export function clearChips(): void {
  registry.clear();
}
