// Gate definitions. Behaviour is data, not code branches in the simulator:
// each kind declares its port counts and a pure evaluation function. Keeping
// `eval` a pure (boolean[], node) -> boolean[] is the seam that lets a future
// composite CHIP kind (whose eval runs an embedded sub-circuit) drop in with
// no change to circuit.ts or simulate.ts.

import type { GateKind, Node } from "./types";

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

export const GATE_DEFS: Record<GateKind, GateDef> = {
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

export function gateDef(kind: GateKind): GateDef {
  return GATE_DEFS[kind];
}

/** Kinds offered in the palette, in display order. */
export const PALETTE_KINDS: GateKind[] = ["INPUT", "AND", "OR", "NOT", "OUTPUT"];
