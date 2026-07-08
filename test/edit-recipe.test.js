import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_OPERATION_TYPES,
  RECIPE_SCHEMA_VERSION,
  normalizeRecipe,
  recipeFingerprint,
  validateRecipe,
} from "../src/edit-recipe/schema.js";
import {
  cloneRecipe,
  createRecipe,
  recipesEqual,
  subsetRecipe,
  withOperation,
} from "../src/edit-recipe/recipe.js";

test("createRecipe produces a normalized versioned Edit Recipe", () => {
  const recipe = createRecipe({
    operations: [{ type: "exposure", params: { ev: 0.4 } }],
    meta: { label: "Hero develop" },
  });
  assert.equal(recipe.version, RECIPE_SCHEMA_VERSION);
  assert.deepEqual(recipe.meta, { label: "Hero develop" });
  assert.deepEqual(recipe.operations, [{ type: "exposure", params: { ev: 0.4 } }]);
});

test("validateRecipe rejects unsupported operations", () => {
  assert.throws(
    () => validateRecipe({ version: RECIPE_SCHEMA_VERSION, operations: [{ type: "gen-fill", params: {} }] }),
    /unsupported type/i,
  );
});

test("normalizeRecipe defaults missing fields and deep clones", () => {
  const input = { operations: [{ type: "contrast", params: { amount: 12 } }] };
  const normalized = normalizeRecipe(input);
  input.operations[0].params.amount = 999;
  assert.equal(normalized.version, RECIPE_SCHEMA_VERSION);
  assert.deepEqual(normalized.meta, {});
  assert.deepEqual(normalized.operations, [{ type: "contrast", params: { amount: 12 } }]);
});

test("withOperation appends a new operation without mutating the original", () => {
  const base = createRecipe();
  const next = withOperation(base, { type: "temperature", params: { kelvinDelta: 350 } });
  assert.deepEqual(base.operations, []);
  assert.deepEqual(next.operations, [{ type: "temperature", params: { kelvinDelta: 350 } }]);
});

test("validateRecipe accepts finite white balance temperature and tint params", () => {
  assert.deepEqual(
    validateRecipe({
      version: RECIPE_SCHEMA_VERSION,
      operations: [
        { type: "temperature", params: { kelvinDelta: 450 } },
        { type: "tint", params: { amount: -12 } },
      ],
    }).operations,
    [
      { type: "temperature", params: { kelvinDelta: 450 } },
      { type: "tint", params: { amount: -12 } },
    ],
  );
});

test("validateRecipe rejects malformed white balance params", () => {
  assert.throws(
    () => validateRecipe({ version: RECIPE_SCHEMA_VERSION, operations: [{ type: "temperature", params: { kelvinDelta: "warm" } }] }),
    /kelvinDelta/i,
  );
  assert.throws(
    () => validateRecipe({ version: RECIPE_SCHEMA_VERSION, operations: [{ type: "tint", params: { amount: null } }] }),
    /amount/i,
  );
});

test("validateRecipe accepts finite contrast params", () => {
  assert.deepEqual(
    validateRecipe({
      version: RECIPE_SCHEMA_VERSION,
      operations: [{ type: "contrast", params: { amount: 25 } }],
    }).operations,
    [{ type: "contrast", params: { amount: 25 } }],
  );
});

test("validateRecipe rejects malformed contrast params", () => {
  assert.throws(
    () => validateRecipe({ version: RECIPE_SCHEMA_VERSION, operations: [{ type: "contrast", params: { amount: "punchy" } }] }),
    /amount/i,
  );
});

test("validateRecipe accepts finite tone range params", () => {
  assert.deepEqual(
    validateRecipe({
      version: RECIPE_SCHEMA_VERSION,
      operations: [
        { type: "highlights", params: { amount: -10 } },
        { type: "shadows", params: { amount: 20 } },
        { type: "whites", params: { amount: 10 } },
        { type: "blacks", params: { amount: -20 } },
      ],
    }).operations,
    [
      { type: "highlights", params: { amount: -10 } },
      { type: "shadows", params: { amount: 20 } },
      { type: "whites", params: { amount: 10 } },
      { type: "blacks", params: { amount: -20 } },
    ],
  );
});

test("validateRecipe rejects malformed tone range params", () => {
  for (const type of ["highlights", "shadows", "whites", "blacks"]) {
    assert.throws(
      () => validateRecipe({ version: RECIPE_SCHEMA_VERSION, operations: [{ type, params: { amount: "bad" } }] }),
      /amount/i,
    );
  }
});

test("validateRecipe accepts constrained RGB tone curve params", () => {
  assert.deepEqual(
    validateRecipe({
      version: RECIPE_SCHEMA_VERSION,
      operations: [{ type: "toneCurve", params: { points: [[0, 0], [0.5, 0.6], [1, 1]] } }],
    }).operations,
    [{ type: "toneCurve", params: { points: [[0, 0], [0.5, 0.6], [1, 1]] } }],
  );
});

test("validateRecipe rejects malformed tone curve params", () => {
  assert.throws(
    () => validateRecipe({ version: RECIPE_SCHEMA_VERSION, operations: [{ type: "toneCurve", params: { points: [[0, 0], [0.4, 0.6], [1, 1]] } }] }),
    /tone curve/i,
  );
  assert.throws(
    () => validateRecipe({ version: RECIPE_SCHEMA_VERSION, operations: [{ type: "toneCurve", params: { points: [[0, 0], [0.5, "lift"], [1, 1]] } }] }),
    /tone curve/i,
  );
});

test("subsetRecipe supports Batch Sync subsets by operation type", () => {
  const recipe = createRecipe({
    operations: [
      { type: "exposure", params: { ev: 0.7 } },
      { type: "crop", params: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 } },
      { type: "mask", params: { kind: "subject", exposure: 0.2 } },
    ],
  });
  const synced = subsetRecipe(recipe, ["exposure", "mask"]);
  assert.deepEqual(synced.operations, [
    { type: "exposure", params: { ev: 0.7 } },
    { type: "mask", params: { kind: "subject", exposure: 0.2 } },
  ]);
});

test("recipesEqual and recipeFingerprint are content-based", () => {
  const a = createRecipe({ operations: [{ type: "shadows", params: { amount: -15 } }] });
  const b = cloneRecipe(a);
  const c = createRecipe({ operations: [{ type: "shadows", params: { amount: -10 } }] });
  assert.equal(recipesEqual(a, b), true);
  assert.equal(recipeFingerprint(a), recipeFingerprint(b));
  assert.equal(recipesEqual(a, c), false);
});

test("recipeFingerprint ignores object key order for semantically identical recipes", () => {
  const a = createRecipe({
    operations: [{ type: "mask", params: { exposure: 0.2, kind: "subject" } }],
    meta: { b: 2, a: 1 },
  });
  const b = createRecipe({
    operations: [{ type: "mask", params: { kind: "subject", exposure: 0.2 } }],
    meta: { a: 1, b: 2 },
  });
  assert.equal(recipeFingerprint(a), recipeFingerprint(b));
  assert.equal(recipesEqual(a, b), true);
});

test("allowed operation list covers the foundation set", () => {
  for (const op of [
    "exposure",
    "contrast",
    "highlights",
    "shadows",
    "whites",
    "blacks",
    "toneCurve",
    "temperature",
    "tint",
    "crop",
    "straighten",
    "mask",
  ]) {
    assert.equal(ALLOWED_OPERATION_TYPES.has(op), true);
  }
});

test("normalizeRecipe rejects unsupported non-JSON values instead of silently coercing them", () => {
  assert.throws(
    () => normalizeRecipe({ operations: [{ type: "exposure", params: { ev: NaN } }] }),
    /non-JSON value/i,
  );
  assert.throws(
    () => normalizeRecipe({ operations: [{ type: "mask", params: { createdAt: new Date("2025-07-01T00:00:00.000Z") } }] }),
    /non-JSON value/i,
  );
  assert.throws(
    () => normalizeRecipe({ operations: [{ type: "contrast", params: { amount: undefined } }] }),
    /finite number|non-JSON value/i,
  );
  assert.throws(
    () => normalizeRecipe({ operations: [{ type: "crop", params: { w: 1n } }] }),
    /non-JSON value|bigint/i,
  );
});
