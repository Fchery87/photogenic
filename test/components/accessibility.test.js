import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import axe from "axe-core";
import { LibraryGrid } from "../../app/src/components/LibraryGrid.js";
import { DevelopControl } from "../../app/src/components/DevelopControl.js";
import { DevelopPanel } from "../../app/src/components/DevelopPanel.js";
import { BatchSyncPanel } from "../../app/src/components/BatchSyncPanel.js";
import { PresetPanel } from "../../app/src/components/PresetPanel.js";
import { ExportPanel } from "../../app/src/components/ExportPanel.js";

afterEach(() => cleanup());

const AXE_OPTIONS = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: {
    // Component-level tests don't have page landmarks
    region: { enabled: false },
    "page-has-heading-one": { enabled: false },
    "landmark-one-main": { enabled: false },
    "color-contrast": { enabled: false }, // no CSS in happy-dom
  },
};

async function runAxe(container) {
  const results = await axe.run(container, AXE_OPTIONS);
  const violations = results.violations.filter((v) => v.id !== "color-contrast");
  if (violations.length > 0) {
    const details = violations
      .map((v) => `  [${v.id}] ${v.description}: ${v.nodes.map((n) => n.html).join(", ")}`)
      .join("\n");
    throw new assert.AssertionError({
      message: `axe found ${violations.length} accessibility violation(s):\n${details}`,
    });
  }
}

const mockImages = [
  { imageId: "img-1", sourcePath: "/photos/a.nef", fileName: "a.nef", observedFormat: "nef" },
  { imageId: "img-2", sourcePath: "/photos/b.jpg", fileName: "b.jpg", observedFormat: "jpg" },
];
const mockCulling = {
  "img-1": { imageId: "img-1", rating: 3, flagged: true, rejected: false, colorLabel: null },
};

test("LibraryGrid passes axe accessibility check", async () => {
  const { container } = render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: "img-1",
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  await runAxe(container);
});

test("DevelopControl passes axe accessibility check", async () => {
  const { container } = render(
    React.createElement(DevelopControl, {
      id: "exposure", label: "Exposure (EV)",
      min: -3, max: 3, step: 0.1, value: 0,
      format: (v) => v.toFixed(1),
      onChange: () => {},
    }),
  );
  await runAxe(container);
});

test("DevelopPanel passes axe accessibility check", async () => {
  const { container } = render(React.createElement(DevelopPanel));
  await runAxe(container);
});

test("BatchSyncPanel passes axe accessibility check", async () => {
  const { container } = render(React.createElement(BatchSyncPanel));
  await runAxe(container);
});

test("PresetPanel passes axe accessibility check", async () => {
  const { container } = render(React.createElement(PresetPanel));
  await runAxe(container);
});

test("ExportPanel passes axe accessibility check", async () => {
  const { container } = render(React.createElement(ExportPanel));
  await runAxe(container);
});
