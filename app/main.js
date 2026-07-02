import { GATE_LADDER, evaluateViewportProof } from "../src/viewport-proof/gates.js";

// Draw the gradient — this proves ONLY the first gate (ADR-0004).
function drawGradient(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
  g.addColorStop(0, "#3b82f6");
  g.addColorStop(1, "#ec4899");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return true;
}

// IMPORTANT (ADR-0004): this harness draws a gradient with the 2D canvas, which
// does NOT exercise the GPU-texture->webview compositing path that the real
// gradient gate requires. So we deliberately DO NOT report the `gradient` gate as
// passed here — a 2D fill must never masquerade as the GPU gradient gate.
// The remaining gates are intentionally UNPROVEN until a real shell measures them.
function collectResults(_gradientDrawn) {
  return []; // no ladder gate is genuinely proven by a 2D-canvas placeholder
}

function render() {
  const canvas = /** @type {HTMLCanvasElement} */ (
    document.getElementById("gradient")
  );
  const gradientDrawn = drawGradient(canvas);
  const results = collectResults(gradientDrawn);
  const verdict = evaluateViewportProof(results);
  const passed = new Set(verdict.passedGates);

  const gatesEl = document.getElementById("gates");
  gatesEl.innerHTML = GATE_LADDER.map((id) => {
    const done = passed.has(id);
    return `<div class="gate"><span>${id}</span>
      <span class="${done ? "pass" : "todo"}">${done ? "PASS" : "TODO"}</span></div>`;
  }).join("");

  document.getElementById("verdict").textContent =
    `${verdict.shellDecisionUnlocked ? "UNLOCKED" : "PROVISIONAL"} — ${verdict.reason}`;
}

render();
