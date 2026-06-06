// Bootstrap: wire the DOM (canvas + palette buttons + clear) to the engine,
// renderer, and controller. Owns the dirty flag and the rAF cadence — the
// renderer only draws when something changed.

import type { GateKind } from "./engine/types";
import { emptyCircuit } from "./engine/types";
import { addNode, clear } from "./engine/circuit";
import { simulate } from "./engine/simulate";
import { readTheme } from "./theme";
import { Renderer, type RenderState } from "./render/renderer";
import { Controller } from "./interaction/controller";

function mount(): void {
  const canvas = document.getElementById("cb-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const theme = readTheme();
  const circuit = emptyCircuit();
  const state: RenderState = {
    circuit,
    sim: simulate(circuit),
    selection: null,
    pendingWire: null,
    hoverPin: null,
  };

  const renderer = new Renderer(canvas, theme);

  let dirty = true;
  const requestRender = (): void => {
    dirty = true;
  };
  const resimulate = (): void => {
    state.sim = simulate(circuit);
    dirty = true;
  };

  const frame = (): void => {
    if (dirty) {
      renderer.draw(state);
      dirty = false;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  new Controller(canvas, state, { resimulate, requestRender });

  // Palette: lay fresh gates out on a tidy grid in the upper-left so they don't
  // overlap and are easy to grab and drag into place.
  let placed = 0;
  const placeNode = (kind: GateKind): void => {
    const col = placed % 4;
    const row = Math.floor(placed / 4) % 3;
    placed++;
    const node = addNode(circuit, kind, 92 + col * 86, 64 + row * 72);
    state.selection = { type: "node", id: node.id };
    resimulate();
  };

  document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => placeNode(btn.dataset.kind as GateKind));
  });

  document.getElementById("cb-clear")?.addEventListener("click", () => {
    clear(circuit);
    state.selection = null;
    placed = 0;
    resimulate();
  });

  // Keep the backing store matched to the canvas's CSS size (full-bleed +
  // responsive). The initial callback also fixes sizing once layout settles.
  const ro = new ResizeObserver(() => {
    renderer.resize();
    requestRender();
  });
  ro.observe(canvas);
}

mount();
