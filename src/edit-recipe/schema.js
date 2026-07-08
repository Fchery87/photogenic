import { createHash } from "node:crypto";

export const RECIPE_SCHEMA_VERSION = 1;
export const ALLOWED_OPERATION_TYPES = new Set([
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "toneCurve",
  "hsl",
  "sharpen",
  "noiseReduction",
  "temperature",
  "tint",
  "crop",
  "rotate",
  "straighten",
  "mask",
]);

const isPlainObject = (v) =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isJsonPrimitive = (v) =>
  v === null || typeof v === "string" || typeof v === "boolean" || isFiniteNumber(v);

const canonicalize = (v) =>
  Array.isArray(v)
    ? v.map(canonicalize)
    : isPlainObject(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonicalize(v[k])]),
        )
      : v;

function describeValue(v) {
  if (typeof v === "number") return Number.isNaN(v) ? "NaN" : String(v);
  if (typeof v === "bigint") return "bigint";
  if (typeof v === "function") return "function";
  if (typeof v === "symbol") return "symbol";
  if (v instanceof Date) return "Date";
  if (v === undefined) return "undefined";
  return Object.prototype.toString.call(v);
}

function cloneJsonValue(v, path = "recipe") {
  if (isJsonPrimitive(v)) return v;
  if (Array.isArray(v)) {
    return v.map((item, index) => cloneJsonValue(item, `${path}[${index}]`));
  }
  if (isPlainObject(v)) {
    return Object.fromEntries(
      Object.entries(v).map(([key, value]) => [key, cloneJsonValue(value, `${path}.${key}`)]),
    );
  }
  throw new TypeError(`recipe contains unsupported non-JSON value at ${path}: ${describeValue(v)}`);
}

function validateOperation(op, index) {
  if (!isPlainObject(op)) throw new TypeError(`operation ${index} must be an object`);
  if (typeof op.type !== "string" || !ALLOWED_OPERATION_TYPES.has(op.type)) {
    throw new RangeError(`operation ${index} has unsupported type: ${String(op.type)}`);
  }
  if (!isPlainObject(op.params)) throw new TypeError(`operation ${index} params must be an object`);
  if (op.type === "temperature" && !isFiniteNumber(op.params.kelvinDelta)) {
    throw new TypeError(`operation ${index} params.kelvinDelta must be a finite number`);
  }
  if (op.type === "tint" && !isFiniteNumber(op.params.amount)) {
    throw new TypeError(`operation ${index} params.amount must be a finite number`);
  }
  if (op.type === "contrast" && !isFiniteNumber(op.params.amount)) {
    throw new TypeError(`operation ${index} params.amount must be a finite number`);
  }
  if (
    ["highlights", "shadows", "whites", "blacks"].includes(op.type) &&
    !isFiniteNumber(op.params.amount)
  ) {
    throw new TypeError(`operation ${index} params.amount must be a finite number`);
  }
  if (op.type === "toneCurve" && !isConstrainedToneCurve(op.params.points)) {
    throw new TypeError(`operation ${index} tone curve points must be [[0,0],[0.5,y],[1,1]]`);
  }
  if (op.type === "hsl" && !isRedHslAdjustment(op.params)) {
    throw new TypeError(`operation ${index} hsl params must target red with finite hue, saturation, and luminance`);
  }
  if (op.type === "sharpen" && !isFiniteNumber(op.params.amount)) {
    throw new TypeError(`operation ${index} params.amount must be a finite number`);
  }
  if (op.type === "noiseReduction" && !isFiniteNumber(op.params.amount)) {
    throw new TypeError(`operation ${index} params.amount must be a finite number`);
  }
  if (op.type === "crop" && !isValidCrop(op.params)) {
    throw new TypeError(`operation ${index} crop params must be finite normalized x, y, w, and h`);
  }
  if (op.type === "rotate" && !isRightAngleRotation(op.params.degrees)) {
    throw new TypeError(`operation ${index} rotate degrees must be 0, 90, 180, or 270`);
  }
  if (op.type === "straighten" && !isFiniteNumber(op.params.angle)) {
    throw new TypeError(`operation ${index} params.angle must be a finite number`);
  }
}

function isConstrainedToneCurve(points) {
  return (
    Array.isArray(points) &&
    points.length === 3 &&
    points.every((point) => Array.isArray(point) && point.length === 2 && point.every(isFiniteNumber)) &&
    points[0][0] === 0 &&
    points[0][1] === 0 &&
    points[1][0] === 0.5 &&
    points[2][0] === 1 &&
    points[2][1] === 1
  );
}

function isRedHslAdjustment(params) {
  return (
    params.range === "red" &&
    isFiniteNumber(params.hue) &&
    isFiniteNumber(params.saturation) &&
    isFiniteNumber(params.luminance)
  );
}

function isValidCrop(params) {
  const width = params.w ?? params.width;
  const height = params.h ?? params.height;
  return (
    isFiniteNumber(params.x) &&
    isFiniteNumber(params.y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    params.x >= 0 &&
    params.y >= 0 &&
    width > 0 &&
    height > 0 &&
    params.x + width <= 1 &&
    params.y + height <= 1
  );
}

function isRightAngleRotation(degrees) {
  return isFiniteNumber(degrees) && [0, 90, 180, 270, -90, -180, -270].includes(degrees);
}

export function normalizeRecipe(recipe) {
  if (!isPlainObject(recipe)) throw new TypeError("recipe must be an object");

  const version = recipe.version ?? RECIPE_SCHEMA_VERSION;
  if (version !== RECIPE_SCHEMA_VERSION) {
    throw new RangeError(
      `unsupported recipe version: ${String(version)} (expected ${RECIPE_SCHEMA_VERSION})`,
    );
  }

  const operations = recipe.operations ?? [];
  if (!Array.isArray(operations)) throw new TypeError("recipe.operations must be an array");
  const normalizedOperations = cloneJsonValue(operations, "recipe.operations");
  normalizedOperations.forEach(validateOperation);

  return {
    version: RECIPE_SCHEMA_VERSION,
    operations: normalizedOperations,
    meta: isPlainObject(recipe.meta) ? cloneJsonValue(recipe.meta, "recipe.meta") : {},
  };
}

export const validateRecipe = normalizeRecipe;

export function recipeFingerprint(recipe) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(normalizeRecipe(recipe))))
    .digest("hex");
}
