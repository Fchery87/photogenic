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

function createResult(id, passed, note, metrics) {
  return metrics ? { id, passed, metrics, note } : { id, passed, note };
}

function nativeFrameMetrics(nativeFrame) {
  if (!nativeFrame || typeof nativeFrame !== "object") return null;
  const frameWidth = nativeFrame.frameWidth;
  const frameHeight = nativeFrame.frameHeight;
  const frameHash = nativeFrame.frameHash;
  if (
    typeof frameWidth !== "number" ||
    !Number.isFinite(frameWidth) ||
    frameWidth <= 0 ||
    typeof frameHeight !== "number" ||
    !Number.isFinite(frameHeight) ||
    frameHeight <= 0 ||
    typeof frameHash !== "string" ||
    frameHash.length < 12
  ) {
    return null;
  }
  return { frameWidth, frameHeight, frameHash };
}

function nativeFramePatch(nativeFrame) {
  const metrics = nativeFrameMetrics(nativeFrame);
  if (!metrics) return null;
  for (const key of ["red", "green", "blue", "alpha"]) {
    const value = nativeFrame[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
  }
  return {
    ...metrics,
    red: nativeFrame.red,
    green: nativeFrame.green,
    blue: nativeFrame.blue,
    alpha: nativeFrame.alpha,
  };
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

function measureZoomPanResult(surface, nativeFrame) {
  const frameMetrics = nativeFrameMetrics(nativeFrame);
  if (!frameMetrics) {
    return createResult(
      "zoom_pan",
      false,
      "Shell bridge connected, but zoom/pan cannot pass without native frame bounds and hash tying the measurement to rendered Pipeline output.",
    );
  }
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
      ? `Measured harness DOM zoom/pan behavior over native frame ${frameMetrics.frameWidth}x${frameMetrics.frameHeight} (${frameMetrics.frameHash.slice(0, 12)}): transformed viewport proxy from ${formatRect(before)} to ${formatRect(after)} using CSS translate+scale.`
      : `Harness DOM zoom/pan sample tied to native frame ${frameMetrics.frameHash.slice(0, 12)} did not show the expected translated/scaled bounds (before ${formatRect(before)}, after ${formatRect(after)}).`,
    frameMetrics,
  );
}

function measureOverlayResult(document, viewport, overlay, nativeFrame) {
  const frameMetrics = nativeFrameMetrics(nativeFrame);
  if (!frameMetrics) {
    return createResult(
      "overlay",
      false,
      "Shell bridge connected, but overlay cannot pass without native frame bounds and hash tying the measurement to rendered Pipeline output.",
    );
  }
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
      ? `Measured harness DOM overlay behavior over native frame ${frameMetrics.frameWidth}x${frameMetrics.frameHeight} (${frameMetrics.frameHash.slice(0, 12)}): overlay covered ${formatRect(overlayRect)}${hit ? " and was topmost at the viewport center" : " with matching viewport bounds"}.`
      : `Harness DOM overlay sample tied to native frame ${frameMetrics.frameHash.slice(0, 12)} did not keep the overlay aligned/topmost (viewport ${formatRect(viewportRect)}, overlay ${formatRect(overlayRect)}${hit ? `, top hit ${hit === overlay ? "overlay" : "another element"}` : ""}).`,
    frameMetrics,
  );
}

function rgbaToCss({ red, green, blue, alpha }) {
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function measureColorManagedResult(document, nativeFrame) {
  const patch = nativeFramePatch(nativeFrame);
  if (!patch) {
    return createResult(
      "color_managed",
      false,
      "Shell bridge connected, but color-management cannot pass without a native frame Pipeline output patch and frame hash.",
    );
  }
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

  ctx.fillStyle = rgbaToCss(patch);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const passed = r === patch.red && g === patch.green && b === patch.blue && a === patch.alpha;

  return {
    id: "color_managed",
    passed,
    metrics: { red: r, green: g, blue: b, alpha: a, frameHash: patch.frameHash },
    note: passed
      ? `Measured harness DOM color sample against native Pipeline patch rgba(${patch.red}, ${patch.green}, ${patch.blue}, ${patch.alpha}) from frame ${patch.frameHash.slice(0, 12)}; read back rgba(${r}, ${g}, ${b}, ${a}).`
      : `Harness DOM color sample did not preserve the native Pipeline patch rgba(${patch.red}, ${patch.green}, ${patch.blue}, ${patch.alpha}) from frame ${patch.frameHash.slice(0, 12)} (got rgba(${r}, ${g}, ${b}, ${a})).`,
  };
}

export function measureHarnessWebviewGates({ document = globalThis.document, nativeFrame } = {}) {
  if (!document?.body || typeof document.createElement !== "function") {
    return createUnavailableResults();
  }

  const { host, viewport, surface, overlay } = createHost(document);
  try {
    return [
      measureZoomPanResult(surface, nativeFrame),
      measureOverlayResult(document, viewport, overlay, nativeFrame),
      measureColorManagedResult(document, nativeFrame),
    ];
  } finally {
    host.remove();
  }
}
