// Bootstrap: wire the DOM (canvas + palette buttons + clear) to the engine,
// renderer, and controller. Owns the dirty flag and the rAF cadence — the
// renderer only draws when something changed.

import type { ChipId, GateKind } from "./engine/types";
import { emptyCircuit } from "./engine/types";
import { addNode, clear } from "./engine/circuit";
import { allChips } from "./engine/chips";
import { makeChipFromSelection } from "./chipmaker";
import { loadLibrary, libraryToJson } from "./library";
import committedLibrary from "./library.json";
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
    selectedNodes: new Set(),
    selectedWire: null,
    pendingWire: null,
    hoverPin: null,
    marquee: null,
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

  // Palette: lay fresh nodes out on a tidy grid in the upper-left so they don't
  // overlap and are easy to grab and drag into place.
  let placed = 0;
  const placeAt = (kind: GateKind, chipId?: ChipId): void => {
    const col = placed % 4;
    const row = Math.floor(placed / 4) % 3;
    placed++;
    const node = addNode(circuit, kind, 92 + col * 86, 64 + row * 72);
    if (chipId !== undefined) node.chip = chipId;
    state.selectedNodes = new Set([node.id]);
    state.selectedWire = null;
    resimulate();
  };

  document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => placeAt(btn.dataset.kind as GateKind));
  });

  document.getElementById("cb-clear")?.addEventListener("click", () => {
    clear(circuit);
    state.selectedNodes = new Set();
    state.selectedWire = null;
    state.marquee = null;
    placed = 0;
    resimulate();
  });

  // Chips: the saved-chip palette + the make-chip flow.
  const chipsEl = document.getElementById("cb-chips");
  const nameEl = document.getElementById("cb-chip-name") as HTMLInputElement | null;
  const msgEl = document.getElementById("cb-msg");
  const flash = (m: string): void => {
    if (msgEl) msgEl.textContent = m;
  };

  const refreshChips = (): void => {
    if (!chipsEl) return;
    chipsEl.textContent = "";
    for (const def of allChips()) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = def.name;
      b.title = `${def.inputs.length} in / ${def.outputs.length} out`;
      b.addEventListener("click", () => placeAt("CHIP", def.id));
      chipsEl.appendChild(b);
    }
  };

  // Load the committed frontier so every visitor sees the author's chips.
  loadLibrary(committedLibrary);
  refreshChips();

  // Authoring tools (make chip / export / import) are author-only: shown on
  // localhost or with ?author. Visitors get the curated frontier, read-only.
  const author =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    new URLSearchParams(location.search).has("author");

  if (author) {
    document.querySelectorAll(".cb-author").forEach((el) => el.removeAttribute("hidden"));

    const doMakeChip = (): void => {
      const res = makeChipFromSelection(circuit, state.selectedNodes, nameEl?.value ?? "");
      if (!res.ok) {
        flash(res.error ?? "couldn't make chip");
        return;
      }
      flash("");
      if (nameEl) nameEl.value = "";
      refreshChips();
      if (res.chipNode) {
        state.selectedNodes = new Set([res.chipNode.id]);
        state.selectedWire = null;
      }
      resimulate();
    };
    document.getElementById("cb-makechip")?.addEventListener("click", doMakeChip);
    nameEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doMakeChip();
    });

    document.getElementById("cb-export")?.addEventListener("click", () => {
      const d = new Date();
      const pad = (n: number): string => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      // Use a data: URL rather than a blob: URL. blob downloads can lose their
      // filename in some Chrome setups (saving a UUID); data URLs honor the
      // download name reliably, and the library is small enough that size is fine.
      const href = "data:application/json;charset=utf-8," + encodeURIComponent(libraryToJson());
      const a = document.createElement("a");
      a.href = href;
      a.download = `library-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      flash(`exported ${allChips().length} chip(s) → commit as src/circuitbox/library.json`);
    });

    // Build the file input on demand inside the gesture — far more reliable than
    // a persistent hidden input for opening the OS picker.
    document.getElementById("cb-import")?.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "application/json,.json";
      inp.addEventListener("change", () => {
        const f = inp.files?.[0];
        if (!f) return;
        f.text()
          .then((text) => {
            let data: unknown;
            try {
              data = JSON.parse(text);
            } catch {
              flash(`import failed: "${f.name}" isn't valid JSON`);
              console.warn("[circuitbox] import: JSON parse error for", f.name);
              return;
            }
            const res = loadLibrary(data);
            if (!res.ok) {
              flash(`import failed: ${res.error ?? "unrecognized file"}`);
              console.warn("[circuitbox] import: loadLibrary rejected:", res.error);
              return;
            }
            refreshChips();
            flash(`imported ${res.count} chip(s) from ${f.name}`);
            console.info(`[circuitbox] imported ${res.count} chip(s) from ${f.name}`);
          })
          .catch((err) => {
            flash("import failed: could not read file");
            console.warn("[circuitbox] import read error", err);
          });
      });
      inp.click();
    });
  }

  // Keep the backing store matched to the canvas's CSS size (full-bleed +
  // responsive). The initial callback also fixes sizing once layout settles.
  const ro = new ResizeObserver(() => {
    renderer.resize();
    requestRender();
  });
  ro.observe(canvas);

  // build marker — confirms the freshest code is loaded (check DevTools console)
  console.info("[circuitbox] ready — build: data-url-export + import-feedback");
}

mount();
