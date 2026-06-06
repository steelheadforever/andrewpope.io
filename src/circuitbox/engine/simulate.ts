// The simulator: evaluate a circuit to a fixed point.
//
// We use iterative settling rather than a one-shot topological evaluation.
// For the combinational DAGs of Phase 1 this is equivalent but slightly more
// work; we choose it deliberately because it is the model that survives the
// "sequential cliff." When clocked, stateful gates arrive (latches, registers,
// a CPU), a clock edge simply becomes the moment we sample, and feedback loops
// settle through this exact same iteration — with the oscillation detection
// below already in place. The evaluator generalizes; it does not get rewritten.

import type { Circuit, NodeId, PinRef } from "./types";
import { gateDef } from "./gates";

/** Map key for an output pin's value. */
function outKey(node: NodeId, port: number): string {
  return `${node}:${port}`;
}

export interface SimResult {
  /** value carried by each OUTPUT pin; key = `${nodeId}:${port}` */
  outValues: Map<string, boolean>;
  /** true if the network failed to settle (an illegal feedback cycle) */
  oscillating: boolean;
}

export function simulate(circuit: Circuit): SimResult {
  const outValues = new Map<string, boolean>();

  // Pre-build, per node, the wire feeding each of its input ports (or null).
  // Avoids an O(wires) scan inside the settle loop.
  const inWires = new Map<NodeId, Array<PinRef | null>>();
  for (const node of circuit.nodes.values()) {
    const def = gateDef(node.kind);
    inWires.set(node.id, new Array(def.inPorts).fill(null));
    for (let p = 0; p < def.outPorts; p++) {
      outValues.set(outKey(node.id, p), false);
    }
  }
  for (const w of circuit.wires) {
    const slots = inWires.get(w.to.node);
    if (slots && w.to.port >= 0 && w.to.port < slots.length) {
      slots[w.to.port] = w.from;
    }
  }

  const maxPasses = circuit.nodes.size + 2;
  let oscillating = true;

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const node of circuit.nodes.values()) {
      const def = gateDef(node.kind);
      const slots = inWires.get(node.id) ?? [];
      const inputs: boolean[] = [];
      for (let p = 0; p < def.inPorts; p++) {
        const src = slots[p];
        inputs.push(src ? (outValues.get(outKey(src.node, src.port)) ?? false) : false);
      }
      const outs = def.eval(inputs, node);
      for (let p = 0; p < def.outPorts; p++) {
        const key = outKey(node.id, p);
        const next = outs[p] ?? false;
        if (outValues.get(key) !== next) {
          outValues.set(key, next);
          changed = true;
        }
      }
    }
    if (!changed) {
      oscillating = false;
      break;
    }
  }

  return { outValues, oscillating };
}

/** Value of a specific output pin (false if unknown). */
export function pinValue(result: SimResult, pin: PinRef): boolean {
  return result.outValues.get(outKey(pin.node, pin.port)) ?? false;
}

/** Value arriving at an input pin, following its driving wire (false if floating). */
export function inputValue(circuit: Circuit, result: SimResult, to: PinRef): boolean {
  const wire = circuit.wires.find(
    (w) => w.to.node === to.node && w.to.port === to.port,
  );
  if (!wire) return false;
  return pinValue(result, wire.from);
}
