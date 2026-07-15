import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DevelopControl } from "../../app/src/components/DevelopControl.js";
import { DevelopPanel } from "../../app/src/components/DevelopPanel.js";

afterEach(() => cleanup());

// -- DevelopControl accessibility tests --------------------------------------

test("DevelopControl has label[for] matching input id", () => {
  render(
    React.createElement(DevelopControl, {
      id: "exposure", label: "Exposure (EV)",
      min: -3, max: 3, step: 0.1, value: 0,
      format: (v) => v.toFixed(1),
      onChange: () => {},
    }),
  );
  const input = document.getElementById("ctrl-exposure");
  assert.ok(input, "input with id ctrl-exposure must exist");
  const label = document.querySelector('label[for="ctrl-exposure"]');
  assert.ok(label, "label with for=ctrl-exposure must exist");
  assert.ok(label?.textContent?.includes("Exposure"));
});

test("DevelopControl shows formatted value display", () => {
  render(
    React.createElement(DevelopControl, {
      id: "temp", label: "Temperature",
      min: -100, max: 100, step: 1, value: 42,
      format: (v) => `K${v}`,
      onChange: () => {},
    }),
  );
  assert.ok(screen.getByText("K42"));
});

test("DevelopControl calls onChange with parsed float on input", () => {
  let changedValue = null;
  render(
    React.createElement(DevelopControl, {
      id: "contrast", label: "Contrast",
      min: -100, max: 100, step: 1, value: 0,
      format: (v) => String(v),
      onChange: (v) => { changedValue = v; },
    }),
  );
  const input = document.getElementById("ctrl-contrast");
  fireEvent.input(input, { target: { value: "50" } });
  assert.equal(changedValue, 50);
});

// -- DevelopPanel tests -------------------------------------------------------

test("DevelopPanel renders all 10 simple slider controls with label[for]/id pairs", () => {
  render(React.createElement(DevelopPanel));
  for (const id of ["exposure", "temperature", "tint", "contrast", "highlights", "shadows", "whites", "blacks", "sharpen", "noise"]) {
    const input = document.getElementById(`ctrl-${id}`);
    assert.ok(input, `ctrl-${id} must exist`);
    const label = document.querySelector(`label[for="ctrl-${id}"]`);
    assert.ok(label, `label[for=ctrl-${id}] must exist`);
  }
});

test("DevelopPanel includes tone curve control with proper label association", () => {
  render(React.createElement(DevelopPanel));
  assert.ok(document.getElementById("ctrl-toneCurve"));
  assert.ok(document.querySelector('label[for="ctrl-toneCurve"]'));
});

test("DevelopPanel includes rotate select with proper label association", () => {
  render(React.createElement(DevelopPanel));
  assert.ok(document.getElementById("ctrl-rotate"));
  assert.ok(document.querySelector('label[for="ctrl-rotate"]'));
});

test("changing a slider dispatches photogenic:recipe-changed with the operation", () => {
  let capturedRecipe = null;
  const handler = (e) => { capturedRecipe = e.detail.recipe; };
  document.addEventListener("photogenic:recipe-changed", handler);

  render(React.createElement(DevelopPanel));
  const input = document.getElementById("ctrl-exposure");
  fireEvent.input(input, { target: { value: "1.5" } });

  document.removeEventListener("photogenic:recipe-changed", handler);
  assert.ok(capturedRecipe, "recipe-changed event must fire");
  const exposureOp = capturedRecipe.operations.find((op) => op.type === "exposure");
  assert.ok(exposureOp, "recipe must include exposure operation");
  assert.equal(exposureOp.params.ev, 1.5);
});

test("changing contrast slider adds correct operation type", () => {
  let capturedRecipe = null;
  const handler = (e) => { capturedRecipe = e.detail.recipe; };
  document.addEventListener("photogenic:recipe-changed", handler);

  render(React.createElement(DevelopPanel));
  fireEvent.input(document.getElementById("ctrl-contrast"), { target: { value: "-25" } });

  document.removeEventListener("photogenic:recipe-changed", handler);
  const op = capturedRecipe.operations.find((o) => o.type === "contrast");
  assert.ok(op);
  assert.equal(op.params.amount, -25);
});

test("zero-value controls do not appear in the recipe", () => {
  let capturedRecipe = null;
  const handler = (e) => { capturedRecipe = e.detail.recipe; };
  document.addEventListener("photogenic:recipe-changed", handler);

  render(React.createElement(DevelopPanel));
  fireEvent.input(document.getElementById("ctrl-sharpen"), { target: { value: "10" } });
  // After changing only sharpen, exposure should not be in the recipe
  document.removeEventListener("photogenic:recipe-changed", handler);
  const exposureOp = capturedRecipe.operations.find((o) => o.type === "exposure");
  assert.equal(exposureOp, undefined, "exposure should not appear when its value is 0");
  const sharpenOp = capturedRecipe.operations.find((o) => o.type === "sharpen");
  assert.ok(sharpenOp);
});
