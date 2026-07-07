import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createPreviewFoundation } from "../src/preview/foundation.js";
import { measureAnimationFrameFps } from "../src/viewport-proof/fps.js";
import { createViewportProofReport } from "../src/viewport-proof/report.js";
import { loadViewportProofResults, resolveTauriInvoke } from "../src/viewport-proof/shell-source.js";
import { measureHarnessWebviewGates } from "../src/viewport-proof/webview.js";

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

function renderReport(report) {
  const gatesEl = document.getElementById("gates");
  gatesEl.innerHTML = report.gates
    .map(
      (gate) => `
    <div class="gate-stack">
      <div class="gate"><span>${gate.id}</span>
        <span class="${gate.tone}">${gate.label}</span></div>
      <div class="gate-detail">${gate.detail}</div>
      ${gate.metricsSummary ? `<div class="gate-detail">${gate.metricsSummary}</div>` : ""}
    </div>
  `,
    )
    .join("");

  document.getElementById("evidence-summary").textContent = report.evidenceSummary;
  document.getElementById("progress-summary").textContent = report.progressSummary;
  document.getElementById("verdict").textContent = `${report.headline} — ${report.verdict.reason}`;
}

async function render() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("gradient"));
  const gradientDrawn = drawGradient(canvas);
  const invoke = resolveTauriInvoke();
  const results = await loadViewportProofResults({
    gradientDrawn,
    invoke,
    measureSustainedFps: invoke ? () => measureAnimationFrameFps() : null,
    measureWebviewGates: invoke ? () => measureHarnessWebviewGates() : null,
  });
  renderReport(createViewportProofReport(results));
  renderPreviewFoundation(canvas);
}

render().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  document.getElementById("verdict").textContent = `PROVISIONAL — Harness failed to load viewport-proof evidence: ${message}`;
});
