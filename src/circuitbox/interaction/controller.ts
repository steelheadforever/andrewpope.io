// Pointer state machine for the breadboard. Translates mouse gestures into
// circuit mutations, then asks the host to re-simulate / re-render. All
// transient interaction state (selection, the wire being dragged, the hovered
// pin) lives on the shared RenderState object the renderer reads each frame.

import type { Circuit, PinRef, WireId } from "../engine/types";
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
  | { kind: "node"; node: string; dx: number; dy: number; moved: boolean; wasInput: boolean }
  | { kind: "wire"; from: Point; dir: "in" | "out"; node: string; port: number }
  | { kind: "branch"; sourceWire: WireId; source: PinRef; tapT: number; origin: Point; moved: boolean };

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

  private onPointerDown = (e: PointerEvent): void => {
    const p = this.pointOf(e);
    const hit = hitTest(this.circuit, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw for non-active (e.g. synthetic) pointers
    }

    if (hit.type === "pin") {
      // Start a wire from either end; orientation resolved on release.
      this.mode = {
        kind: "wire",
        from: hit.pos,
        dir: hit.dir,
        node: hit.node,
        port: hit.port,
      };
      this.state.pendingWire = { from: hit.pos, to: p, valid: false };
      this.state.selection = null;
      this.host.requestRender();
      return;
    }

    if (hit.type === "node") {
      const node = this.circuit.nodes.get(hit.node);
      if (!node) return;
      this.mode = {
        kind: "node",
        node: node.id,
        dx: p.x - node.x,
        dy: p.y - node.y,
        moved: false,
        wasInput: node.kind === "INPUT",
      };
      this.state.selection = { type: "node", id: node.id };
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
      this.state.selection = { type: "wire", id: hit.wire };
      this.host.requestRender();
      return;
    }

    // empty space: clear selection
    this.state.selection = null;
    this.mode = { kind: "idle" };
    this.host.requestRender();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointOf(e);

    if (this.mode.kind === "node") {
      const node = this.circuit.nodes.get(this.mode.node);
      if (!node) return;
      if (Math.hypot(p.x - (node.x + this.mode.dx), p.y - (node.y + this.mode.dy)) > MOVE_THRESHOLD)
        this.mode.moved = true;
      node.x = p.x - this.mode.dx;
      node.y = p.y - this.mode.dy;
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
        this.state.selection = null; // don't keep the source wire highlighted while drawing
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

    // hover affordance when idle
    this.updateHoverCursor(p);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const p = this.pointOf(e);

    if (this.mode.kind === "node") {
      // a click (no drag) on an INPUT toggles it
      if (!this.mode.moved && this.mode.wasInput) {
        const node = this.circuit.nodes.get(this.mode.node);
        if (node) {
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
        // orient: output end is `from`, input end is `to`
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

    this.mode = { kind: "idle" };
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const sel = this.state.selection;
    if (!sel) return;
    e.preventDefault();
    if (sel.type === "node") removeNode(this.circuit, sel.id);
    else removeWire(this.circuit, sel.id);
    this.state.selection = null;
    this.host.resimulate();
    this.host.requestRender();
  };

  /**
   * Given the in-progress wire and what's under the cursor, return the pin we
   * would connect to — or null if illegal (same node, wrong direction, or an
   * already-driven input).
   */
  private legalTarget(
    start: { dir: "in" | "out"; node: string; port: number },
    hit: Hit,
  ): { node: string; port: number; dir: "in" | "out" } | null {
    if (hit.type !== "pin") return null;
    if (hit.dir === start.dir) return null; // need one out + one in
    if (hit.node === start.node) return null; // no self-loops in Phase 1
    const inputPin = start.dir === "in"
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
