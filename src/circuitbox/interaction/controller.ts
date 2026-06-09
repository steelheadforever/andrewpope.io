// Pointer state machine for the breadboard. Translates mouse gestures into
// circuit mutations, then asks the host to re-simulate / re-render. All
// transient interaction state (selection set, marquee box, the wire being
// dragged, the hovered pin) lives on the shared RenderState the renderer reads.

import type { Circuit, NodeId, PinRef, WireId } from "../engine/types";
import { addWire, isInputDriven, removeNode, removeWire } from "../engine/circuit";
import {
  hitTest,
  pointAlong,
  projectFraction,
  wireRenderPath,
  type Hit,
  type Point,
} from "../render/geometry";
import type { RenderState } from "../render/renderer";

export interface ControllerHost {
  /** recompute the simulation after a topology/state change */
  resimulate(): void;
  /** mark the canvas dirty so the next frame redraws */
  requestRender(): void;
}

const MOVE_THRESHOLD = 3; // px before a press counts as a drag

type Mode =
  | { kind: "idle" }
  | {
      kind: "node";
      primary: NodeId;
      start: Point;
      origins: Map<NodeId, { x: number; y: number }>;
      moved: boolean;
      wasInput: boolean;
    }
  | { kind: "wire"; from: Point; dir: "in" | "out"; node: string; port: number }
  | { kind: "branch"; sourceWire: WireId; source: PinRef; tapT: number; origin: Point; moved: boolean }
  | { kind: "marquee"; additive: boolean };

export class Controller {
  private mode: Mode = { kind: "idle" };

  constructor(
    private canvas: HTMLCanvasElement,
    private state: RenderState,
    private host: ControllerHost,
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  private get circuit(): Circuit {
    return this.state.circuit;
  }

  private pointOf(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private clearSelection(): void {
    this.state.selectedNodes = new Set();
    this.state.selectedWire = null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    const p = this.pointOf(e);
    const shift = e.shiftKey;
    const hit = hitTest(this.circuit, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw for non-active (e.g. synthetic) pointers
    }

    if (hit.type === "pin") {
      // Start a wire from either end; orientation resolved on release.
      this.mode = { kind: "wire", from: hit.pos, dir: hit.dir, node: hit.node, port: hit.port };
      this.state.pendingWire = { from: hit.pos, to: p, valid: false };
      this.clearSelection();
      this.host.requestRender();
      return;
    }

    if (hit.type === "node") {
      if (shift) {
        // toggle membership, no drag
        if (this.state.selectedNodes.has(hit.node)) this.state.selectedNodes.delete(hit.node);
        else this.state.selectedNodes.add(hit.node);
        this.state.selectedWire = null;
        this.mode = { kind: "idle" };
        this.host.requestRender();
        return;
      }
      // non-shift: if this node isn't already in the selection, make it the sole one
      if (!this.state.selectedNodes.has(hit.node)) {
        this.state.selectedNodes = new Set([hit.node]);
      }
      this.state.selectedWire = null;
      const node = this.circuit.nodes.get(hit.node);
      const origins = new Map<NodeId, { x: number; y: number }>();
      for (const id of this.state.selectedNodes) {
        const n = this.circuit.nodes.get(id);
        if (n) origins.set(id, { x: n.x, y: n.y });
      }
      this.mode = {
        kind: "node",
        primary: hit.node,
        start: p,
        origins,
        moved: false,
        wasInput: node?.kind === "INPUT",
      };
      this.host.requestRender();
      return;
    }

    if (hit.type === "wire") {
      // Press-and-drag taps a new branch off this wire; press-and-release selects it.
      const w = this.circuit.wires.find((x) => x.id === hit.wire);
      if (w) {
        const srcPath = wireRenderPath(this.circuit, w);
        const tapT = projectFraction(srcPath, p);
        this.mode = {
          kind: "branch",
          sourceWire: w.id,
          source: w.from,
          tapT,
          origin: pointAlong(srcPath, tapT),
          moved: false,
        };
      } else {
        this.mode = { kind: "idle" };
      }
      this.state.selectedNodes = new Set();
      this.state.selectedWire = hit.wire;
      this.host.requestRender();
      return;
    }

    // empty space: begin a marquee (clearing selection unless shift-adding)
    if (!shift) this.clearSelection();
    this.mode = { kind: "marquee", additive: shift };
    this.state.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    this.host.requestRender();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointOf(e);

    if (this.mode.kind === "node") {
      const dx = p.x - this.mode.start.x;
      const dy = p.y - this.mode.start.y;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) this.mode.moved = true;
      for (const [id, o] of this.mode.origins) {
        const n = this.circuit.nodes.get(id);
        if (n) {
          n.x = o.x + dx;
          n.y = o.y + dy;
        }
      }
      this.host.requestRender();
      return;
    }

    if (this.mode.kind === "wire") {
      const pending = this.state.pendingWire;
      if (!pending) return;
      pending.to = p;
      const hit = hitTest(this.circuit, p);
      const target = this.legalTarget(this.mode, hit);
      pending.valid = target !== null;
      this.state.hoverPin = target;
      this.host.requestRender();
      return;
    }

    if (this.mode.kind === "branch") {
      if (
        !this.mode.moved &&
        Math.hypot(p.x - this.mode.origin.x, p.y - this.mode.origin.y) > MOVE_THRESHOLD
      ) {
        this.mode.moved = true;
        this.state.selectedWire = null; // don't keep the source wire highlighted while drawing
        this.state.pendingWire = { from: this.mode.origin, to: p, valid: false };
      }
      if (this.mode.moved && this.state.pendingWire) {
        this.state.pendingWire.to = p;
        const hit = hitTest(this.circuit, p);
        const target = this.legalTarget(
          { dir: "out", node: this.mode.source.node, port: this.mode.source.port },
          hit,
        );
        this.state.pendingWire.valid = target !== null;
        this.state.hoverPin = target;
      }
      this.host.requestRender();
      return;
    }

    if (this.mode.kind === "marquee" && this.state.marquee) {
      this.state.marquee.x1 = p.x;
      this.state.marquee.y1 = p.y;
      this.host.requestRender();
      return;
    }

    // hover affordance when idle
    this.updateHoverCursor(p);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const p = this.pointOf(e);

    if (this.mode.kind === "node") {
      // a click (no drag) collapses the selection to this node, toggling an INPUT
      if (!this.mode.moved) {
        this.state.selectedNodes = new Set([this.mode.primary]);
        this.state.selectedWire = null;
        const node = this.circuit.nodes.get(this.mode.primary);
        if (node && node.kind === "INPUT") {
          node.state = !node.state;
          this.host.resimulate();
        }
      }
      this.mode = { kind: "idle" };
      this.host.requestRender();
      return;
    }

    if (this.mode.kind === "wire") {
      const hit = hitTest(this.circuit, p);
      const target = this.legalTarget(this.mode, hit);
      if (target) {
        const start = this.mode;
        if (start.dir === "out")
          addWire(this.circuit, { node: start.node, port: start.port }, { node: target.node, port: target.port });
        else
          addWire(this.circuit, { node: target.node, port: target.port }, { node: start.node, port: start.port });
        this.host.resimulate();
      }
      this.state.pendingWire = null;
      this.state.hoverPin = null;
      this.mode = { kind: "idle" };
      this.host.requestRender();
      return;
    }

    if (this.mode.kind === "branch") {
      if (this.mode.moved) {
        const hit = hitTest(this.circuit, p);
        const target = this.legalTarget(
          { dir: "out", node: this.mode.source.node, port: this.mode.source.port },
          hit,
        );
        if (target) {
          const w = addWire(this.circuit, this.mode.source, { node: target.node, port: target.port });
          if (w) {
            w.tapOf = this.mode.sourceWire;
            w.tapT = this.mode.tapT;
          }
          this.host.resimulate();
        }
        this.state.pendingWire = null;
        this.state.hoverPin = null;
      }
      this.mode = { kind: "idle" };
      this.host.requestRender();
      return;
    }

    if (this.mode.kind === "marquee") {
      this.commitMarquee(this.mode.additive);
      this.state.marquee = null;
      this.mode = { kind: "idle" };
      this.host.requestRender();
      return;
    }

    this.mode = { kind: "idle" };
  };

  /** Select all nodes whose centre falls inside the marquee box. */
  private commitMarquee(additive: boolean): void {
    const m = this.state.marquee;
    if (!m) return;
    const minX = Math.min(m.x0, m.x1);
    const maxX = Math.max(m.x0, m.x1);
    const minY = Math.min(m.y0, m.y1);
    const maxY = Math.max(m.y0, m.y1);
    const next = additive ? new Set(this.state.selectedNodes) : new Set<NodeId>();
    for (const n of this.circuit.nodes.values()) {
      if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) next.add(n.id);
    }
    this.state.selectedNodes = next;
    this.state.selectedWire = null;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    // don't hijack Backspace/Delete while typing in a field (e.g. chip name)
    const ae = document.activeElement;
    if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) return;
    const { selectedNodes, selectedWire } = this.state;
    if (selectedNodes.size === 0 && selectedWire === null) return;
    e.preventDefault();
    for (const id of selectedNodes) removeNode(this.circuit, id);
    if (selectedWire !== null) removeWire(this.circuit, selectedWire);
    this.clearSelection();
    this.host.resimulate();
    this.host.requestRender();
  };

  /**
   * Given an in-progress wire/branch source and what's under the cursor, return
   * the pin we'd connect to — or null if illegal (same node, wrong direction, or
   * an already-driven input).
   */
  private legalTarget(
    start: { dir: "in" | "out"; node: string; port: number },
    hit: Hit,
  ): { node: string; port: number; dir: "in" | "out" } | null {
    if (hit.type !== "pin") return null;
    if (hit.dir === start.dir) return null; // need one out + one in
    if (hit.node === start.node) return null; // no self-loops in Phase 1
    const inputPin =
      start.dir === "in"
        ? { node: start.node, port: start.port }
        : { node: hit.node, port: hit.port };
    if (isInputDriven(this.circuit, inputPin)) return null;
    return { node: hit.node, port: hit.port, dir: hit.dir };
  }

  private updateHoverCursor(p: Point): void {
    const hit = hitTest(this.circuit, p);
    let cursor = "default";
    if (hit.type === "pin") cursor = "crosshair";
    else if (hit.type === "node") cursor = "move";
    else if (hit.type === "wire") cursor = "pointer";
    this.canvas.style.cursor = cursor;
  }
}
