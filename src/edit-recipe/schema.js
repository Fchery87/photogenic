import { createHash } from "node:crypto";
export const RECIPE_SCHEMA_VERSION = 1;
export const ALLOWED_OPERATION_TYPES = new Set(["exposure","contrast","highlights","shadows","temperature","tint","crop","straighten","mask"]);
const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const canonicalize = (v) => Array.isArray(v) ? v.map(canonicalize) : isPlainObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonicalize(v[k])])) : v;
function validateOperation(op, index) {
  if (!isPlainObject(op)) throw new TypeError(`operation ${index} must be an object`);
  if (typeof op.type !== "string" || !ALLOWED_OPERATION_TYPES.has(op.type)) throw new RangeError(`operation ${index} has unsupported type: ${String(op.type)}`);
  if (!isPlainObject(op.params)) throw new TypeError(`operation ${index} params must be an object`);
}
export function normalizeRecipe(recipe) {
  if (!isPlainObject(recipe)) throw new TypeError("recipe must be an object");
  const version = recipe.version ?? RECIPE_SCHEMA_VERSION;
  if (version !== RECIPE_SCHEMA_VERSION) throw new RangeError(`unsupported recipe version: ${String(version)} (expected ${RECIPE_SCHEMA_VERSION})`);
  const operations = recipe.operations ?? [];
  if (!Array.isArray(operations)) throw new TypeError("recipe.operations must be an array");
  operations.forEach(validateOperation);
  return { version: RECIPE_SCHEMA_VERSION, operations: clone(operations), meta: isPlainObject(recipe.meta) ? clone(recipe.meta) : {} };
}
export const validateRecipe = normalizeRecipe;
export function recipeFingerprint(recipe) { return createHash("sha256").update(JSON.stringify(canonicalize(normalizeRecipe(recipe)))).digest("hex"); }
