import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "../../app/src/components/ErrorBoundary.js";

afterEach(() => cleanup());

const ThrowError = ({ message }) => {
  throw new Error(message);
};

test("ErrorBoundary renders children when no error", () => {
  render(
    React.createElement(ErrorBoundary, null,
      React.createElement("div", null, "child content"),
    ),
  );
  assert.ok(screen.getByText("child content"));
});

test("ErrorBoundary renders fallback on error", () => {
  render(
    React.createElement(ErrorBoundary, null,
      React.createElement(ThrowError, { message: "kaboom" }),
    ),
  );
  assert.ok(screen.getByText(/Something went wrong/i));
});

test("ErrorBoundary dispatches photogenic:crash event on error", () => {
  let crashDetail = null;
  const handler = (e) => { crashDetail = e.detail; };
  document.addEventListener("photogenic:crash", handler);

  render(
    React.createElement(ErrorBoundary, null,
      React.createElement(ThrowError, { message: "test crash" }),
    ),
  );

  document.removeEventListener("photogenic:crash", handler);
  assert.ok(crashDetail, "crash event must fire");
  assert.ok(crashDetail.message?.includes("test crash"));
  assert.ok(crashDetail.stack, "crash event must include stack trace");
});

test("ErrorBoundary fallback has a reload button", () => {
  render(
    React.createElement(ErrorBoundary, null,
      React.createElement(ThrowError, { message: "kaboom" }),
    ),
  );
  assert.ok(screen.getByRole("button", { name: /Reload/i }));
});
