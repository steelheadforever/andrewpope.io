// Layout + hit-testing. Pure geometry over the circuit graph: where each node
// box and pin sits, the curve a wire follows, and what (if anything) lies under
// a given point. Node coordinates (node.x, node.y) are the CENTER of the body.
//
// Phase 1 has no pan/zoom, so screen coords === graph coords. The seam for a
// camera later is small: map the incoming point and node positions through a
// transform here and nothing else needs to change.

import type { Circuit, Node, NodeId, Wire, WireId } from "../engine/types";
import { gateDef } from "../engine/gates";

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const NODE_W = 62;
export const NODE_H = 44;
export const PIN_R = 5;
export const PIN_HIT_R = 12;
const WIRE_HIT_DIST = 6;

export function nodeRect(node: Node): Rect {
  return {
    x: node.x - NODE_W / 2,
    y: node.y - NODE_H / 2,
    w: NODE_W,
    h: NODE_H,
  };
}

export function inPinPos(node: Node, port: number): Point {
  const n = gateDef(node.kind).inPorts;
  const r = nodeRect(node);
  return { x: r.x, y: r.y + (r.h * (port + 1)) / (n + 1) };
}

export function outPinPos(node: Node, port: number): Point {
  const n = gateDef(node.kind).outPorts;
  const r = nodeRect(node);
  return { x: r.x + r.w, y: r.y + (r.h * (port + 1)) / (n + 1) };
}

const WIRE_STUB = 13;
const STRAIGHT_TOL = 16; // px: near-level pins connect straight rather than jog

/**
 * Route for a committed wire (output pin -> input pin). When the two pins sit
 * within STRAIGHT_TOL of the same height, a 90° jog would look worse than a
 * shallow diagonal, so we draw a straight line. Otherwise: exit the output
 * rightward a short stub, run vertically at the midpoint, then enter the input
 * from the left (rounded corners are applied by the renderer).
 */
export function wirePath(from: Point, to: Point): Point[] {
  if (Math.abs(from.y - to.y) <= STRAIGHT_TOL) return [from, to];
  const a = { x: from.x + WIRE_STUB, y: from.y };
  const b = { x: to.x - WIRE_STUB, y: to.y };
  const midX = (a.x + b.x) / 2;
  return [from, a, { x: midX, y: a.y }, { x: midX, y: b.y }, b, to];
}

/** Route for the in-progress drag, where one end is the cursor (same tolerance). */
export function orthoPath(from: Point, to: Point): Point[] {
  if (Math.abs(from.y - to.y) <= STRAIGHT_TOL) return [from, to];
  const midX = (from.x + to.x) / 2;
  return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
}

function pathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  return len;
}

/** Point at fraction `t` (0..1) of a polyline's arc length. */
export function pointAlong(pts: Point[], t: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const total = pathLength(pts);
  if (total === 0) return pts[0];
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (target <= seg) {
      const f = seg === 0 ? 0 : target / seg;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
    }
    target -= seg;
  }
  return pts[pts.length - 1];
}

/** Fraction (0..1) along a polyline of the point nearest `p` — i.e. where a tap lands. */
export function projectFraction(pts: Point[], p: Point): number {
  if (pts.length < 2) return 0;
  const total = pathLength(pts);
  if (total === 0) return 0;
  let acc = 0;
  let best = Infinity;
  let bestFrac = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const segLen = Math.hypot(vx, vy);
    let t = segLen === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / (segLen * segLen);
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
    if (d < best) {
      best = d;
      bestFrac = total === 0 ? 0 : (acc + segLen * t) / total;
    }
    acc += segLen;
  }
  return bestFrac;
}

/**
 * The polyline a wire is actually drawn along. Normally output pin -> input pin,
 * but a tapped wire (`tapOf`) originates from a junction on its source wire's
 * path. Recurses through chained taps (depth-capped). Returns [] if endpoints
 * are missing.
 */
export function wireRenderPath(circuit: Circuit, wire: Wire, depth = 0): Point[] {
  const fromNode = circuit.nodes.get(wire.from.node);
  const toNode = circuit.nodes.get(wire.to.node);
  if (!fromNode || !toNode) return [];
  const target = inPinPos(toNode, wire.to.port);
  let origin = outPinPos(fromNode, wire.from.port);
  if (wire.tapOf !== undefined && depth < 8) {
    const src = circuit.wires.find((w) => w.id === wire.tapOf);
    if (src) {
      const srcPath = wireRenderPath(circuit, src, depth + 1);
      if (srcPath.length >= 2) origin = pointAlong(srcPath, wire.tapT ?? 0.5);
    }
  }
  return wirePath(origin, target);
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function polylineHit(pts: Point[], p: Point, tol: number): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(p, pts[i], pts[i + 1]) <= tol) return true;
  }
  return false;
}

export type Hit =
  | { type: "pin"; node: NodeId; port: number; dir: "in" | "out"; pos: Point }
  | { type: "node"; node: NodeId }
  | { type: "wire"; wire: WireId }
  | { type: "empty" };

/**
 * What lies under `p`. Priority: pins (easiest to miss) > node bodies > wires >
 * nothing. Within each layer, topmost (last-drawn) node wins.
 */
export function hitTest(circuit: Circuit, p: Point): Hit {
  const nodes = [...circuit.nodes.values()];

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const def = gateDef(node.kind);
    for (let port = 0; port < def.outPorts; port++) {
      const pos = outPinPos(node, port);
      if (dist2(p, pos) <= PIN_HIT_R * PIN_HIT_R)
        return { type: "pin", node: node.id, port, dir: "out", pos };
    }
    for (let port = 0; port < def.inPorts; port++) {
      const pos = inPinPos(node, port);
      if (dist2(p, pos) <= PIN_HIT_R * PIN_HIT_R)
        return { type: "pin", node: node.id, port, dir: "in", pos };
    }
  }

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (pointInRect(p, nodeRect(node))) return { type: "node", node: node.id };
  }

  for (let i = circuit.wires.length - 1; i >= 0; i--) {
    const w = circuit.wires[i];
    const path = wireRenderPath(circuit, w);
    if (path.length >= 2 && polylineHit(path, p, WIRE_HIT_DIST)) {
      return { type: "wire", wire: w.id };
    }
  }

  return { type: "empty" };
}
