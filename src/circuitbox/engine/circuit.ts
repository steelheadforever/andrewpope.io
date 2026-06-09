// Mutation + validation helpers for a Circuit. All structural changes go
// through here so the invariants (unique ids, single-driver input pins, valid
// port indices) live in one place.

import type { Circuit, GateKind, Node, NodeId, PinRef, Wire, WireId } from "./types";
import { portsOf } from "./gates";

let nodeSeq = 0;
let wireSeq = 0;

export function makeNodeId(): NodeId {
  return `n${++nodeSeq}`;
}
function makeWireId(): WireId {
  return `w${++wireSeq}`;
}

export function addNode(circuit: Circuit, kind: GateKind, x: number, y: number): Node {
  const node: Node = { id: makeNodeId(), kind, x, y };
  if (kind === "INPUT") node.state = false;
  circuit.nodes.set(node.id, node);
  return node;
}

export function removeNode(circuit: Circuit, id: NodeId): void {
  circuit.nodes.delete(id);
  circuit.wires = circuit.wires.filter(
    (w) => w.from.node !== id && w.to.node !== id,
  );
}

function pinsEqual(a: PinRef, b: PinRef): boolean {
  return a.node === b.node && a.port === b.port;
}

/** Whether an input pin already has a wire driving it. */
export function isInputDriven(circuit: Circuit, to: PinRef): boolean {
  return circuit.wires.some((w) => pinsEqual(w.to, to));
}

/**
 * Connect an output pin (`from`) to an input pin (`to`). Returns the new wire,
 * or null if the connection is illegal: missing node, self-connection, bad port
 * index, or an input pin that is already driven (one driver per input pin).
 */
export function addWire(circuit: Circuit, from: PinRef, to: PinRef): Wire | null {
  const fromNode = circuit.nodes.get(from.node);
  const toNode = circuit.nodes.get(to.node);
  if (!fromNode || !toNode) return null;
  if (from.node === to.node) return null; // no self-loops in Phase 1
  if (from.port < 0 || from.port >= portsOf(fromNode).outPorts) return null;
  if (to.port < 0 || to.port >= portsOf(toNode).inPorts) return null;
  if (isInputDriven(circuit, to)) return null;
  const wire: Wire = { id: makeWireId(), from, to };
  circuit.wires.push(wire);
  return wire;
}

export function removeWire(circuit: Circuit, id: WireId): void {
  circuit.wires = circuit.wires.filter((w) => w.id !== id);
}

export function clear(circuit: Circuit): void {
  circuit.nodes.clear();
  circuit.wires = [];
}
