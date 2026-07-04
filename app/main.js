import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createPreviewFoundation } from "../src/preview/foundation.js";
import { GATE_LADDER, evaluateViewportProof } from "../src/viewport-proof/gates.js";

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

function collectResults(_gradientDrawn) {
  return [];
}

function renderPreviewFoundation(canvas) {
  const foundation = createPreviewFoundation({ clock: () => "2025-07-01T00:00:00.000Z" });
  const request = foundation.createRequest({
    source: {
      imageId: "harness-preview",
      width: canvas.width,
      height: canvas.height,
      revision: "phase0-placeholder",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe(),
    viewport: { width: canvas.width, height: canvas.height },
  });
  const resolved = foundation.fulfillRequest(request);
  document.getElementById("preview-status").innerHTML = `
    <div class="gate"><span>proxyKey</span><span>${resolved.proxy.proxyKey.slice(0, 12)}…</span></div>
    <div class="gate"><span>requestStatus</span><span class="pass">${resolved.status.toUpperCase()}</span></div>
    <div class="gate"><span>behaviorSignature</span><span>${resolved.previewArtifact.behaviorSignature.slice(0, 12)}…</span></div>
  `;
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

  renderPreviewFoundation(canvas);
}

render();
