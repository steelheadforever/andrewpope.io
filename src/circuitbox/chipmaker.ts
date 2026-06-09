// Turn a marquee selection into a reusable chip: extract the selected nodes and
// the wires fully internal to them into a ChipDef, register it, then collapse
// the selection on the board into a single CHIP instance at its centroid.
//
// The selection's IN/OUT nodes define the interface (per the design): each
// INPUT becomes an input pin, each OUTPUT an output pin, ordered top-to-bottom.
// Wires crossing the selection boundary are dropped (their endpoint is absorbed).

import type { Circuit, Node, NodeId } from "./engine/types";
import { emptyCircuit } from "./engine/types";
import { addNode, removeNode } from "./engine/circuit";
import { makeChipId, registerChip, type ChipDef, type ChipPin } from "./engine/chips";

export interface MakeChipResult {
  ok: boolean;
  error?: string;
  chipNode?: Node;
}

function pinLabel(i: number): string {
  return i < 26 ? String.fromCharCode(97 + i) : `p${i}`;
}

export function makeChipFromSelection(
  board: Circuit,
  selected: Set<NodeId>,
  name: string,
): MakeChipResult {
  if (selected.size === 0) return { ok: false, error: "Select some gates first (marquee-drag)." };

  const nodes: Node[] = [];
  for (const id of selected) {
    const n = board.nodes.get(id);
    if (n) nodes.push(n);
  }
  const ins = nodes.filter((n) => n.kind === "INPUT").sort((a, b) => a.y - b.y);
  const outs = nodes.filter((n) => n.kind === "OUTPUT").sort((a, b) => a.y - b.y);
  if (ins.length === 0 || outs.length === 0) {
    return { ok: false, error: "A chip needs at least one IN and one OUT in the selection." };
  }

  // Build the internal sub-circuit: clone the selected nodes and the wires whose
  // both endpoints are selected (boundary-crossing wires are left out).
  const sub = emptyCircuit();
  for (const n of nodes) {
    sub.nodes.set(n.id, { id: n.id, kind: n.kind, x: n.x, y: n.y, state: n.state, chip: n.chip });
  }
  for (const w of board.wires) {
    if (selected.has(w.from.node) && selected.has(w.to.node)) {
      sub.wires.push({ id: w.id, from: { ...w.from }, to: { ...w.to }, tapOf: w.tapOf, tapT: w.tapT });
    }
  }

  const inputs: ChipPin[] = ins.map((n, i) => ({ label: pinLabel(i), node: n.id }));
  const outputs: ChipPin[] = outs.map((n, i) => ({ label: pinLabel(i), node: n.id }));

  const def: ChipDef = {
    id: makeChipId(),
    name: name.trim().slice(0, 16) || "CHIP",
    inputs,
    outputs,
    circuit: sub,
  };
  registerChip(def);

  // Collapse on the board: place the instance at the selection's centroid, then
  // remove the originals (removeNode also drops their wires, incl. crossing ones).
  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  for (const id of selected) removeNode(board, id);

  const chipNode = addNode(board, "CHIP", cx, cy);
  chipNode.chip = def.id;
  return { ok: true, chipNode };
}
