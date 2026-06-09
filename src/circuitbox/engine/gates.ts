// Gate definitions. Behaviour is data, not code branches in the simulator:
// each kind declares its port counts and a pure evaluation function. Keeping
// `eval` a pure (boolean[], node) -> boolean[] is the seam that lets a future
// composite CHIP kind (whose eval runs an embedded sub-circuit) drop in with
// no change to circuit.ts or simulate.ts.

import type { GateKind, Node } from "./types";
import { getChip } from "./chips";

/** The built-in gate kinds (everything except composite CHIP). */
export type PrimitiveKind = Exclude<GateKind, "CHIP">;

export interface GateDef {
  kind: GateKind;
  /** short label drawn on the gate body and used in the palette */
  label: string;
  inPorts: number;
  outPorts: number;
  /**
   * Pure combinational evaluation. `inputs` always has length === inPorts
   * (the simulator fills unconnected pins with false). Returns an array of
   * length === outPorts. `node` is passed so stateful sources (INPUT) can read
   * their own toggle state.
   */
  eval(inputs: boolean[], node: Node): boolean[];
}

export const GATE_DEFS: Record<PrimitiveKind, GateDef> = {
  INPUT: {
    kind: "INPUT",
    label: "IN",
    inPorts: 0,
    outPorts: 1,
    eval: (_inputs, node) => [node.state === true],
  },
  OUTPUT: {
    kind: "OUTPUT",
    label: "OUT",
    inPorts: 1,
    outPorts: 0,
    eval: () => [],
  },
  AND: {
    kind: "AND",
    label: "AND",
    inPorts: 2,
    outPorts: 1,
    eval: (i) => [i[0] && i[1]],
  },
  OR: {
    kind: "OR",
    label: "OR",
    inPorts: 2,
    outPorts: 1,
    eval: (i) => [i[0] || i[1]],
  },
  NOT: {
    kind: "NOT",
    label: "NOT",
    inPorts: 1,
    outPorts: 1,
    eval: (i) => [!i[0]],
  },
};

export function gateDef(kind: PrimitiveKind): GateDef {
  return GATE_DEFS[kind];
}

export interface Ports {
  inPorts: number;
  outPorts: number;
  label: string;
}

/**
 * Port counts + label for a node, resolving CHIP nodes through the registry
 * (whose interface defines their pins). Primitives read GATE_DEFS. Use this
 * everywhere geometry/render/validation needs a node's shape — gateDef() alone
 * can't describe a chip.
 */
export function portsOf(node: Node): Ports {
  if (node.kind === "CHIP") {
    const def = node.chip !== undefined ? getChip(node.chip) : undefined;
    return {
      inPorts: def?.inputs.length ?? 0,
      outPorts: def?.outputs.length ?? 0,
      label: def?.name ?? "?",
    };
  }
  const d = GATE_DEFS[node.kind];
  return { inPorts: d.inPorts, outPorts: d.outPorts, label: d.label };
}

/** Kinds offered in the palette, in display order. */
export const PALETTE_KINDS: GateKind[] = ["INPUT", "AND", "OR", "NOT", "OUTPUT"];
