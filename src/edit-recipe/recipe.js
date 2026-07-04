import {
  ALLOWED_OPERATION_TYPES,
  RECIPE_SCHEMA_VERSION,
  normalizeRecipe,
  recipeFingerprint,
} from "./schema.js";

export const PRESET_ALLOWED_OPERATION_TYPES = new Set([
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "temperature",
  "tint",
]);

export const BATCH_SYNC_ALLOWED_OPERATION_TYPES = new Set(ALLOWED_OPERATION_TYPES);

export const createRecipe = ({ operations = [], meta = {} } = {}) =>
  normalizeRecipe({ version: RECIPE_SCHEMA_VERSION, operations, meta });

export const cloneRecipe = (recipe) => normalizeRecipe(recipe);

export function withOperation(recipe, operation) {
  const r = normalizeRecipe(recipe);
  return normalizeRecipe({ ...r, operations: [...r.operations, operation] });
}

function assertIncludedTypes(includedTypes, allowedSet, label) {
  if (!Array.isArray(includedTypes) || includedTypes.length === 0) {
    throw new TypeError(`${label} must be a non-empty array of operation types`);
  }
  for (const type of includedTypes) {
    if (typeof type !== "string" || !allowedSet.has(type)) {
      throw new RangeError(`${label} contains unsupported type: ${String(type)}`);
    }
  }
}

function replaceOperationsByType(baseOperations, replacementOperations, includedTypes) {
  const include = new Set(includedTypes);
  return [
    ...baseOperations.filter((op) => !include.has(op.type)),
    ...replacementOperations.filter((op) => include.has(op.type)),
  ];
}

export function subsetRecipe(recipe, includedTypes) {
  assertIncludedTypes(includedTypes, ALLOWED_OPERATION_TYPES, "includedTypes");
  const r = normalizeRecipe(recipe);
  const include = new Set(includedTypes);
  return normalizeRecipe({
    ...r,
    operations: r.operations.filter((op) => include.has(op.type)),
  });
}

export function createPresetFromRecipe({ name, recipe, includedTypes = [...PRESET_ALLOWED_OPERATION_TYPES], meta = {} }) {
  if (typeof name !== "string" || !name.trim()) throw new TypeError("preset name is required");
  assertIncludedTypes(includedTypes, PRESET_ALLOWED_OPERATION_TYPES, "preset includedTypes");
  const presetRecipe = subsetRecipe(recipe, includedTypes);
  return {
    name: name.trim(),
    includedTypes: [...includedTypes],
    recipe: presetRecipe,
    meta: { ...meta },
    recipeFingerprint: recipeFingerprint(presetRecipe),
  };
}

export function applyPreset(targetRecipe, preset) {
  const target = normalizeRecipe(targetRecipe);
  if (!preset || typeof preset !== "object") throw new TypeError("preset is required");
  const includedTypes = preset.includedTypes ?? preset.recipe?.operations?.map((op) => op.type) ?? [];
  assertIncludedTypes(includedTypes, PRESET_ALLOWED_OPERATION_TYPES, "preset includedTypes");
  const presetRecipe = subsetRecipe(preset.recipe, includedTypes);
  return normalizeRecipe({
    ...target,
    operations: replaceOperationsByType(target.operations, presetRecipe.operations, includedTypes),
  });
}

export function copyBatchSync(sourceRecipe, targetRecipe, includedTypes = [...BATCH_SYNC_ALLOWED_OPERATION_TYPES]) {
  assertIncludedTypes(includedTypes, BATCH_SYNC_ALLOWED_OPERATION_TYPES, "batch sync includedTypes");
  const sourceSubset = subsetRecipe(sourceRecipe, includedTypes);
  const target = normalizeRecipe(targetRecipe);
  return normalizeRecipe({
    ...target,
    operations: replaceOperationsByType(target.operations, sourceSubset.operations, includedTypes),
  });
}

export const recipesEqual = (a, b) => recipeFingerprint(a) === recipeFingerprint(b);
