import { test } from "node:test";
import assert from "node:assert/strict";
import { measureHarnessWebviewGates } from "../src/viewport-proof/webview.js";

function nativeFrameContext() {
  return {
    sourceFileId: "viewport-proof-native-frame",
    recipeFingerprint: "f".repeat(64),
    frameWidth: 2,
    frameHeight: 2,
    transferMethod: "cpu-linear-float32",
    frameHash: "a".repeat(64),
    renderDurationMs: 4,
    red: 51,
    green: 102,
    blue: 153,
    alpha: 255,
  };
}

function createFakeDocument({ hitOverlay = true, colorData = [51, 102, 153, 255] } = {}) {
  let creationIndex = 0;

  class FakeElement {
    constructor(role) {
      this.role = role;
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.width = 0;
      this.height = 0;
    }

    append(...children) {
      for (const child of children) {
        child.parentNode = this;
        this.children.push(child);
      }
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }

    contains(target) {
      if (!target) return false;
      if (target === this) return true;
      return this.children.some((child) => child.contains(target));
    }

    getBoundingClientRect() {
      if (this.role === "host") return { left: 24, top: 24, width: 160, height: 100 };
      if (this.role === "viewport") return { left: 24, top: 24, width: 120, height: 80 };
      if (this.role === "overlay") return { left: 24, top: 24, width: 120, height: 80 };
      if (this.role === "surface") {
        if (this.style.transform === "translate(12px, 8px) scale(1.5)") return { left: 36, top: 32, width: 180, height: 120 };
        return { left: 24, top: 24, width: 120, height: 80 };
      }
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    getContext(kind) {
      if (this.role !== "canvas" || kind !== "2d") return null;
      return {
        fillStyle: "#000000",
        fillRect() {},
        getImageData() {
          return { data: colorData };
        },
      };
    }
  }

  const body = new FakeElement("body");
  const document = {
    body,
    createElement(tag) {
      if (tag === "canvas") return new FakeElement("canvas");
      creationIndex += 1;
      if (creationIndex === 1) return new FakeElement("host");
      if (creationIndex === 2) return new FakeElement("viewport");
      if (creationIndex === 3) return new FakeElement("surface");
      return new FakeElement("overlay");
    },
    elementFromPoint() {
      if (hitOverlay) return body.children[0]?.children[0]?.children[1] ?? null;
      return body.children[0]?.children[0]?.children[0] ?? null;
    },
  };

  return document;
}

test("measures harness DOM zoom/pan, overlay, and color behavior without overclaiming other gates", () => {
  const results = measureHarnessWebviewGates({ document: createFakeDocument(), nativeFrame: nativeFrameContext() });

  assert.deepEqual(
    results.map((result) => ({ id: result.id, passed: result.passed })),
    [
      { id: "zoom_pan", passed: true },
      { id: "overlay", passed: true },
      { id: "color_managed", passed: true },
    ],
  );
  assert.match(results[0].note, /translate\+scale/i);
  assert.match(results[0].note, /native frame/i);
  assert.deepEqual(results[0].metrics, {
    frameWidth: 2,
    frameHeight: 2,
    frameHash: "a".repeat(64),
  });
  assert.match(results[1].note, /topmost at the viewport center/i);
  assert.deepEqual(results[1].metrics, {
    frameWidth: 2,
    frameHeight: 2,
    frameHash: "a".repeat(64),
  });
  assert.match(results[2].note, /native Pipeline patch rgba\(51, 102, 153, 255\)/i);
  assert.deepEqual(results[2].metrics, {
    red: 51,
    green: 102,
    blue: 153,
    alpha: 255,
    frameHash: "a".repeat(64),
  });
});

test("does not pass zoom/pan overlay or color measurements without native frame context", () => {
  const results = measureHarnessWebviewGates({ document: createFakeDocument() });

  assert.deepEqual(
    results.map((result) => ({ id: result.id, passed: result.passed })),
    [
      { id: "zoom_pan", passed: false },
      { id: "overlay", passed: false },
      { id: "color_managed", passed: false },
    ],
  );
  assert.match(results[0].note, /native frame/i);
  assert.match(results[1].note, /native frame/i);
  assert.match(results[2].note, /native frame/i);
});

test("returns readable failed measurements when the harness DOM is unavailable", () => {
  const results = measureHarnessWebviewGates({ document: { body: null } });

  assert.deepEqual(
    results.map((result) => ({ id: result.id, passed: result.passed })),
    [
      { id: "zoom_pan", passed: false },
      { id: "overlay", passed: false },
      { id: "color_managed", passed: false },
    ],
  );
  assert.match(results[0].note, /document\.body was unavailable/i);
  assert.match(results[1].note, /document\.body was unavailable/i);
  assert.match(results[2].note, /document\.body was unavailable/i);
});
