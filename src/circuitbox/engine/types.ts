// Core graph model for the Circuit Box breadboard.
//
// A circuit is a set of nodes (gate instances) connected by wires. Each wire
// runs from an OUTPUT pin of one node to an INPUT pin of another. Pins are
// addressed by (nodeId, port-index) — see PinRef.
//
// Design seam: GateKind is deliberately a closed union of primitives now, but
// the engine treats gate behaviour as data (see gates.ts), so a composite
// 'CHIP' kind can join later (Phase 2) without touching the simulator.

export type NodeId = string;
export type WireId = string;
export type ChipId = string;

export type GateKind = "INPUT" | "OUTPUT" | "AND" | "OR" | "NOT" | "CHIP";

export interface Node {
  id: NodeId;
  kind: GateKind;
  x: number;
  y: number;
  /** INPUT nodes hold their toggle state here; unused by other kinds. */
  state?: boolean;
  /** CHIP nodes reference a registered ChipDef whose sub-circuit defines them. */
  chip?: ChipId;
}

/**
 * A reference to one pin on a node. `port` indexes into the node's input OR
 * output port list — which list is determined by context (a wire's `from` is
 * always an output pin, its `to` always an input pin).
 */
export interface PinRef {
  node: NodeId;
  port: number;
}

export interface Wire {
  id: WireId;
  /** source — always an OUTPUT pin */
  from: PinRef;
  /** destination — always an INPUT pin */
  to: PinRef;
  /**
   * Purely visual: if set, this wire was branched ("tapped") off another wire
   * and should render from a junction on that wire at fraction `tapT` of its
   * length, rather than from the output pin. The signal source is still `from`,
   * so the simulator ignores these entirely.
   */
  tapOf?: WireId;
  tapT?: number;
}

export interface Circuit {
  nodes: Map<NodeId, Node>;
  wires: Wire[];
}

export function emptyCircuit(): Circuit {
  return { nodes: new Map(), wires: [] };
}
