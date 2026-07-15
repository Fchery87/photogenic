import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ExportPanel } from "../../app/src/components/ExportPanel.js";

afterEach(() => cleanup());

test("ExportPanel renders format select with label[for]/id pair", () => {
  render(React.createElement(ExportPanel));
  assert.ok(document.getElementById("export-format"));
  assert.ok(document.querySelector('label[for="export-format"]'));
});

test("ExportPanel renders quality slider with label[for]/id pair", () => {
  render(React.createElement(ExportPanel));
  assert.ok(document.getElementById("export-quality"));
  assert.ok(document.querySelector('label[for="export-quality"]'));
});

test("ExportPanel export button dispatches status when no image selected", () => {
  let statusText = null;
  const handler = (e) => { statusText = e.detail.text; };
  document.addEventListener("photogenic:status", handler);

  render(React.createElement(ExportPanel));
  fireEvent.click(screen.getByText("Queue Export"));

  document.removeEventListener("photogenic:status", handler);
  assert.ok(statusText?.includes("Select an image"));
});

test("ExportPanel format select includes all format options", () => {
  render(React.createElement(ExportPanel));
  assert.ok(screen.getByText("PNG (8-bit)"));
  assert.ok(screen.getByText("JPEG"));
  assert.ok(screen.getByText("TIFF (8-bit)"));
  assert.ok(screen.getByText("TIFF (16-bit)"));
});
