function roundCssPx(value) {
  return Math.round(value * 10) / 10;
}

function formatCssPx(value) {
  return `${roundCssPx(value)} CSS px`;
}

function formatRect(rect) {
  return `${formatCssPx(rect.width)} × ${formatCssPx(rect.height)} at (${formatCssPx(rect.left)}, ${formatCssPx(rect.top)})`;
}

function snapshotRect(element) {
  const rect = element.getBoundingClientRect();
  return {
    left: roundCssPx(rect.left),
    top: roundCssPx(rect.top),
    width: roundCssPx(rect.width),
    height: roundCssPx(rect.height),
  };
}

function createResult(id, passed, note) {
  return { id, passed, note };
}

function createUnavailableResults() {
  return [
    createResult(
      "zoom_pan",
      false,
      "Shell bridge connected, but the harness DOM zoom/pan measurement could not run because document.body was unavailable. Raw-frame and color-management proof remain separate gates.",
    ),
    createResult(
      "overlay",
      false,
      "Shell bridge connected, but the harness DOM overlay measurement could not run because document.body was unavailable. Raw-frame and color-management proof remain separate gates.",
    ),
    createResult(
      "color_managed",
      false,
      "Shell bridge connected, but the harness DOM color-management sample could not run because document.body was unavailable. Raw-frame provenance remains a separate gate.",
    ),
  ];
}

function createHost(document) {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    top: "24px",
    left: "24px",
    width: "160px",
    height: "100px",
    opacity: "0.001",
    pointerEvents: "auto",
    zIndex: "2147483647",
  });

  const viewport = document.createElement("div");
  Object.assign(viewport.style, {
    position: "relative",
    width: "120px",
    height: "80px",
    overflow: "hidden",
  });

  const surface = document.createElement("div");
  Object.assign(surface.style, {
    position: "absolute",
    inset: "0",
    background: "linear-gradient(90deg, #3b82f6, #ec4899)",
    zIndex: "1",
    transformOrigin: "top left",
  });

  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    border: "1px solid rgba(255,255,255,0.8)",
    background: "rgba(17,17,17,0.45)",
    zIndex: "2",
  });

  viewport.append(surface, overlay);
  host.append(viewport);
  document.body.append(host);

  return { host, viewport, surface, overlay };
}

function measureZoomPanResult(surface) {
  const before = snapshotRect(surface);
  surface.style.transform = "translate(12px, 8px) scale(1.5)";
  const after = snapshotRect(surface);

  const scaled = after.width > before.width && after.height > before.height;
  const translated = after.left > before.left && after.top > before.top;
  const passed = scaled && translated;

  return createResult(
    "zoom_pan",
    passed,
    passed
      ? `Measured harness DOM zoom/pan behavior: transformed viewport proxy from ${formatRect(before)} to ${formatRect(after)} using CSS translate+scale. This is a webview DOM interaction sample only; raw-frame and color-management proof remain separate gates.`
      : `Harness DOM zoom/pan sample did not show the expected translated/scaled bounds (before ${formatRect(before)}, after ${formatRect(after)}). This is still only a webview DOM interaction sample, not raw-frame or color-management proof.`,
  );
}

function measureOverlayResult(document, viewport, overlay) {
  const viewportRect = snapshotRect(viewport);
  const overlayRect = snapshotRect(overlay);
  const sameBounds =
    overlayRect.left === viewportRect.left &&
    overlayRect.top === viewportRect.top &&
    overlayRect.width === viewportRect.width &&
    overlayRect.height === viewportRect.height;

  const pointX = viewportRect.left + viewportRect.width / 2;
  const pointY = viewportRect.top + viewportRect.height / 2;
  const hit = typeof document.elementFromPoint === "function" ? document.elementFromPoint(pointX, pointY) : null;
  const hitOverlay = hit === overlay || (typeof overlay.contains === "function" && overlay.contains(hit));
  const passed = sameBounds && (hit ? hitOverlay : true);

  return createResult(
    "overlay",
    passed,
    passed
      ? `Measured harness DOM overlay behavior: overlay covered ${formatRect(overlayRect)}${hit ? " and was topmost at the viewport center" : " with matching viewport bounds"}. This checks DOM stacking only; raw-frame and color-management proof remain separate gates.`
      : `Harness DOM overlay sample did not keep the overlay aligned/topmost (viewport ${formatRect(viewportRect)}, overlay ${formatRect(overlayRect)}${hit ? `, top hit ${hit === overlay ? "overlay" : "another element"}` : ""}). This checks DOM stacking only, not raw-frame or color-management proof.`,
  );
}

function measureColorManagedResult(document) {
  const sampleCanvas = document.createElement("canvas");
  if (!sampleCanvas || typeof sampleCanvas.getContext !== "function") {
    return createResult(
      "color_managed",
      false,
      "Shell bridge connected, but the harness DOM color-management sample could not create a canvas context. Raw-frame provenance remains a separate gate.",
    );
  }

  sampleCanvas.width = 1;
  sampleCanvas.height = 1;
  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || typeof ctx.getImageData !== "function") {
    return createResult(
      "color_managed",
      false,
      "Shell bridge connected, but the harness DOM color-management sample could not read back canvas pixels. Raw-frame provenance remains a separate gate.",
    );
  }

  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const passed = r === 59 && g === 130 && b === 246 && a === 255;

  return {
    id: "color_managed",
    passed,
    metrics: { red: r, green: g, blue: b, alpha: a },
    note: passed
      ? `Measured harness DOM color sample: canvas readback preserved sRGB patch rgba(${r}, ${g}, ${b}, ${a}) for #3b82f6. This is a shell-webview color sample only; raw-frame provenance remains a separate gate.`
      : `Harness DOM color sample did not preserve the expected sRGB patch for #3b82f6 (got rgba(${r}, ${g}, ${b}, ${a})). This is a shell-webview color sample only, not raw-frame provenance.`,
  };
}

export function measureHarnessWebviewGates({ document = globalThis.document } = {}) {
  if (!document?.body || typeof document.createElement !== "function") {
    return createUnavailableResults();
  }

  const { host, viewport, surface, overlay } = createHost(document);
  try {
    return [measureZoomPanResult(surface), measureOverlayResult(document, viewport, overlay), measureColorManagedResult(document)];
  } finally {
    host.remove();
  }
}
