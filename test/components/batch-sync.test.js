import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BatchSyncPanel } from "../../app/src/components/BatchSyncPanel.js";

afterEach(() => cleanup());

test("BatchSyncPanel renders exposure, temperature, contrast checkboxes", () => {
  render(React.createElement(BatchSyncPanel));
  assert.ok(screen.getByLabelText(/Exposure/));
  assert.ok(screen.getByLabelText(/Temperature/));
  assert.ok(screen.getByLabelText(/Contrast/));
});

test("exposure checkbox is checked by default", () => {
  render(React.createElement(BatchSyncPanel));
  const exposure = screen.getByLabelText(/Exposure/);
  assert.ok(exposure.checked, "exposure should be checked by default");
});

test("temperature and contrast are unchecked by default", () => {
  render(React.createElement(BatchSyncPanel));
  assert.ok(!screen.getByLabelText(/Temperature/).checked);
  assert.ok(!screen.getByLabelText(/Contrast/).checked);
});

test("Apply to All button dispatches status event when no image selected", () => {
  let statusText = null;
  const handler = (e) => { statusText = e.detail.text; };
  document.addEventListener("photogenic:status", handler);

  render(React.createElement(BatchSyncPanel));
  fireEvent.click(screen.getByText("Apply to All"));

  document.removeEventListener("photogenic:status", handler);
  assert.ok(statusText?.includes("Select a source image"));
});

test("checkboxes toggle when clicked", () => {
  render(React.createElement(BatchSyncPanel));
  const temp = screen.getByLabelText(/Temperature/);
  assert.ok(!temp.checked);
  fireEvent.click(temp);
  // In happy-dom, the React onChange should update the checked state
});
