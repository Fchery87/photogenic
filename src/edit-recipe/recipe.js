import { RECIPE_SCHEMA_VERSION, normalizeRecipe, recipeFingerprint } from "./schema.js";
export const createRecipe = ({ operations = [], meta = {} } = {}) => normalizeRecipe({ version: RECIPE_SCHEMA_VERSION, operations, meta });
export const cloneRecipe = (recipe) => normalizeRecipe(recipe);
export function withOperation(recipe, operation) { const r = normalizeRecipe(recipe); return normalizeRecipe({ ...r, operations: [...r.operations, operation] }); }
export function subsetRecipe(recipe, includedTypes) { const r = normalizeRecipe(recipe); const include = new Set(includedTypes); return normalizeRecipe({ ...r, operations: r.operations.filter((op) => include.has(op.type)) }); }
export const recipesEqual = (a, b) => recipeFingerprint(a) === recipeFingerprint(b);
