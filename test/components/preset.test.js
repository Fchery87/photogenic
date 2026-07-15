import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PresetPanel } from "../../app/src/components/PresetPanel.js";

afterEach(() => cleanup());

test("PresetPanel renders save, select, and apply controls", () => {
  render(React.createElement(PresetPanel));
  assert.ok(screen.getByText("Save as Preset"));
  assert.ok(screen.getByText("Apply"));
  assert.ok(document.getElementById("preset-select"));
  assert.ok(document.getElementById("recipe-revision"));
});

test("PresetPanel save button dispatches status when no operations", () => {
  let statusText = null;
  const handler = (e) => { statusText = e.detail.text; };
  document.addEventListener("photogenic:status", handler);

  render(React.createElement(PresetPanel));
  fireEvent.click(screen.getByText("Save as Preset"));

  document.removeEventListener("photogenic:status", handler);
  assert.ok(statusText?.includes("No operations"));
});

test("PresetPanel apply dispatches status when no preset selected", () => {
  let statusText = null;
  const handler = (e) => { statusText = e.detail.text; };
  document.addEventListener("photogenic:status", handler);

  render(React.createElement(PresetPanel));
  fireEvent.click(screen.getByText("Apply"));

  document.removeEventListener("photogenic:status", handler);
  assert.ok(statusText?.includes("Select a preset"));
});
