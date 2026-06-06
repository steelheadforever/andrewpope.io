// Canvas renderer. Stateless with respect to interaction: each frame it draws
// whatever RenderState it is handed. The main loop owns the dirty flag and the
// requestAnimationFrame cadence (see main.ts) and calls draw() when something
// changed. Colours come from the site's tokens (theme.ts) so the board stays
// dark and quiet, with amber glow reserved for live current — the only light.

import type { Circuit, Node, NodeId, WireId } from "../engine/types";
import { gateDef } from "../engine/gates";
import type { SimResult } from "../engine/simulate";
import { inputValue, pinValue } from "../engine/simulate";
import type { Theme } from "../theme";
import {
  PIN_R,
  inPinPos,
  nodeRect,
  orthoPath,
  outPinPos,
  wireRenderPath,
  type Point,
} from "./geometry";

const FONT_MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", "JetBrains Mono", Menlo, monospace';
const GRID = 22;
const GLOW = 9;
const CORNER_R = 6; // rounding on orthogonal wire bends

export type Selection =
  | { type: "node"; id: NodeId }
  | { type: "wire"; id: WireId }
  | null;

export interface PendingWire {
  from: Point;
  to: Point;
  /** true when the cursor is over a legal drop target */
  valid: boolean;
}

export interface HoverPin {
  node: NodeId;
  port: number;
  dir: "in" | "out";
}

export interface RenderState {
  circuit: Circuit;
  sim: SimResult;
  selection: Selection;
  pendingWire: PendingWire | null;
  hoverPin: HoverPin | null;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private theme: Theme,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Circuit Box: 2D canvas context unavailable");
    this.ctx = ctx;
    this.resize();
  }

  /** Match backing store to CSS size × devicePixelRatio for crisp lines. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(state: RenderState): void {
    const { ctx, theme } = this;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    this.drawGrid();

    for (const w of state.circuit.wires) {
      const path = wireRenderPath(state.circuit, w);
      if (path.length < 2) continue;
      const live = pinValue(state.sim, w.from);
      const selected = state.selection?.type === "wire" && state.selection.id === w.id;
      this.drawWire(path, live, selected);
      if (w.tapOf !== undefined) this.drawJunction(path[0], live);
    }

    if (state.pendingWire) this.drawPendingWire(state.pendingWire);

    for (const node of state.circuit.nodes.values()) {
      this.drawNode(node, state);
    }
  }

  private drawGrid(): void {
    const { ctx, theme } = this;
    ctx.fillStyle = theme.rule;
    for (let x = GRID; x < this.cssW; x += GRID) {
      for (let y = GRID; y < this.cssH; y += GRID) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  private drawWire(path: Point[], live: boolean, selected: boolean): void {
    const { ctx, theme } = this;
    ctx.save();
    ctx.lineCap = "round";
    if (selected) {
      ctx.strokeStyle = theme.red;
      ctx.lineWidth = 3.5;
    } else if (live) {
      ctx.strokeStyle = theme.amber;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = theme.amber;
      ctx.shadowBlur = GLOW;
    } else {
      ctx.strokeStyle = theme.rule;
      ctx.lineWidth = 2;
    }
    roundedPolyline(ctx, path, CORNER_R);
    ctx.stroke();
    ctx.restore();
  }

  private drawJunction(pos: Point, live: boolean): void {
    const { ctx, theme } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2);
    if (live) {
      ctx.fillStyle = theme.amber;
      ctx.shadowColor = theme.amber;
      ctx.shadowBlur = GLOW;
    } else {
      ctx.fillStyle = theme.muted;
    }
    ctx.fill();
    ctx.restore();
  }

  private drawPendingWire(p: PendingWire): void {
    const { ctx, theme } = this;
    ctx.save();
    ctx.strokeStyle = p.valid ? theme.amber : theme.amberDim;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    roundedPolyline(ctx, orthoPath(p.from, p.to), CORNER_R);
    ctx.stroke();
    ctx.restore();
  }

  private drawNode(node: Node, state: RenderState): void {
    const { ctx, theme } = this;
    const def = gateDef(node.kind);
    const r = nodeRect(node);
    const selected = state.selection?.type === "node" && state.selection.id === node.id;

    // Source/sink nodes act as lamps: lit when carrying a 1.
    let lit = false;
    if (node.kind === "INPUT") lit = node.state === true;
    else if (node.kind === "OUTPUT")
      lit = inputValue(state.circuit, state.sim, { node: node.id, port: 0 });

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 6);
    if (lit) {
      ctx.fillStyle = theme.amber;
      ctx.shadowColor = theme.amber;
      ctx.shadowBlur = GLOW;
    } else {
      ctx.fillStyle = theme.bgSoft;
    }
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 6);
    ctx.strokeStyle = selected ? theme.amber : theme.rule;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    ctx.restore();

    // label
    ctx.fillStyle = lit ? theme.bg : theme.muted;
    ctx.font = `600 12px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label =
      node.kind === "INPUT" ? (node.state ? "1" : "0") : def.label;
    ctx.fillText(label, node.x, node.y);

    // pins
    for (let p = 0; p < def.inPorts; p++) {
      const val = inputValue(state.circuit, state.sim, { node: node.id, port: p });
      const hovered = isHover(state.hoverPin, node.id, p, "in");
      this.drawPin(inPinPos(node, p), val, hovered);
    }
    for (let p = 0; p < def.outPorts; p++) {
      const val = pinValue(state.sim, { node: node.id, port: p });
      const hovered = isHover(state.hoverPin, node.id, p, "out");
      this.drawPin(outPinPos(node, p), val, hovered);
    }
  }

  private drawPin(pos: Point, live: boolean, hovered: boolean): void {
    const { ctx, theme } = this;
    if (hovered) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, PIN_R + 4, 0, Math.PI * 2);
      ctx.strokeStyle = theme.amber;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, PIN_R, 0, Math.PI * 2);
    if (live) {
      ctx.fillStyle = theme.amber;
      ctx.shadowColor = theme.amber;
      ctx.shadowBlur = GLOW;
    } else {
      ctx.fillStyle = theme.bgSoft;
    }
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, PIN_R, 0, Math.PI * 2);
    ctx.strokeStyle = live ? theme.amberDim : theme.muted;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function isHover(
  hover: HoverPin | null,
  node: NodeId,
  port: number,
  dir: "in" | "out",
): boolean {
  return (
    hover !== null && hover.node === node && hover.port === port && hover.dir === dir
  );
}

/**
 * Trace an open polyline with rounded corners via arcTo. Collinear or coincident
 * vertices (e.g. a wire whose endpoints share a row) degrade gracefully to a
 * straight run. Caller sets stroke style and calls stroke().
 */
function roundedPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  radius: number,
): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, radius);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}
