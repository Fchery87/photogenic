import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { TopBar } from "../../app/src/components/TopBar.js";

afterEach(() => cleanup());

test("TopBar renders brand text 'Photogenic'", () => {
  render(
    React.createElement(TopBar, {
      pipelineBadgeText: "GPU",
      pipelineBadgeClass: "badge--ok",
      licenseBadgeText: "License: active",
      licenseBadgeClass: "badge--ok",
    }),
  );
  assert.ok(screen.getByText("Photogenic"));
});

test("TopBar reflects pipeline badge state via props", () => {
  render(
    React.createElement(TopBar, {
      pipelineBadgeText: "CPU",
      pipelineBadgeClass: "badge--warn",
      licenseBadgeText: "License: offline",
      licenseBadgeClass: "badge--error",
    }),
  );
  const pipelineBadge = screen.getByText("CPU");
  assert.ok(pipelineBadge);
  assert.ok(pipelineBadge.className.includes("badge--warn"));
});

test("TopBar reflects license badge state via props", () => {
  render(
    React.createElement(TopBar, {
      pipelineBadgeText: "Pipeline: offline",
      pipelineBadgeClass: "badge--error",
      licenseBadgeText: "License: expired",
      licenseBadgeClass: "badge--warn",
    }),
  );
  const licenseBadge = screen.getByText("License: expired");
  assert.ok(licenseBadge);
  assert.ok(licenseBadge.className.includes("badge--warn"));
});

test("TopBar updates when badge props change", () => {
  const { rerender } = render(
    React.createElement(TopBar, {
      pipelineBadgeText: "Pipeline: …",
      pipelineBadgeClass: "badge--unknown",
      licenseBadgeText: "Checking…",
      licenseBadgeClass: "badge--unknown",
    }),
  );
  assert.ok(screen.getByText("Pipeline: …"));

  rerender(
    React.createElement(TopBar, {
      pipelineBadgeText: "GPU",
      pipelineBadgeClass: "badge--ok",
      licenseBadgeText: "License: active",
      licenseBadgeClass: "badge--ok",
    }),
  );
  assert.ok(screen.getByText("GPU"));
  assert.ok(!screen.queryByText("Pipeline: …"));
});
