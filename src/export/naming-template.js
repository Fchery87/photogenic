function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

export function renderFileNameTemplate(template, context) {
  if (typeof template !== "string" || !template) {
    throw new TypeError("template is required");
  }
  if (!context || typeof context !== "object") {
    throw new TypeError("context is required");
  }

  const values = {
    imageId: context.imageId ?? "",
    fileName: context.fileName ?? "",
    baseName: context.baseName ?? "",
    sequence: typeof context.sequence === "number" ? String(context.sequence) : "",
    rating: typeof context.rating === "number" ? String(context.rating) : "",
    date: formatDate(context.captureAt ?? context.date),
  };

  return template.replace(/\{(imageId|fileName|baseName|sequence|rating|date)\}/g, (_, key) => values[key] ?? "");
}
