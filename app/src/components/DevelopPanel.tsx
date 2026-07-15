import React, { useState, useEffect, useCallback } from "react";
import { DevelopControl } from "./DevelopControl.js";

interface SliderConfig {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  opType: string;
  param: string;
  format: (v: number) => string;
}

const SLIDERS: SliderConfig[] = [
  { id: "exposure", label: "Exposure (EV)", min: -3, max: 3, step: 0.1, opType: "exposure", param: "ev", format: (v) => v.toFixed(1) },
  { id: "temperature", label: "Temperature (KΔ)", min: -2000, max: 2000, step: 50, opType: "temperature", param: "kelvinDelta", format: (v) => String(v) },
  { id: "tint", label: "Tint", min: -50, max: 50, step: 1, opType: "tint", param: "amount", format: (v) => String(v) },
  { id: "contrast", label: "Contrast", min: -100, max: 100, step: 1, opType: "contrast", param: "amount", format: (v) => String(v) },
  { id: "highlights", label: "Highlights", min: -100, max: 100, step: 1, opType: "highlights", param: "amount", format: (v) => String(v) },
  { id: "shadows", label: "Shadows", min: -100, max: 100, step: 1, opType: "shadows", param: "amount", format: (v) => String(v) },
  { id: "whites", label: "Whites", min: -100, max: 100, step: 1, opType: "whites", param: "amount", format: (v) => String(v) },
  { id: "blacks", label: "Blacks", min: -100, max: 100, step: 1, opType: "blacks", param: "amount", format: (v) => String(v) },
  { id: "sharpen", label: "Sharpening", min: 0, max: 100, step: 1, opType: "sharpen", param: "amount", format: (v) => String(v) },
  { id: "noise", label: "Noise Reduction", min: 0, max: 100, step: 1, opType: "noiseReduction", param: "amount", format: (v) => String(v) },
];

const DEFAULT_VALUES: Record<string, number> = {
  exposure: 0, temperature: 0, tint: 0, contrast: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0,
  sharpen: 0, noise: 0,
  toneCurve: 0, "hsl-hue": 0, "hsl-sat": 0, "hsl-lum": 0,
  "crop-x": 0, "crop-y": 0, "crop-w": 1, "crop-h": 1,
  straighten: 0,
};

function buildRecipe(values: Record<string, number>, rotate: string) {
  const operations: any[] = [];
  for (const s of SLIDERS) {
    const v = values[s.id] ?? 0;
    if (v === 0) continue;
    operations.push({ type: s.opType, params: { [s.param]: v } });
  }
  const tcVal = values["toneCurve"] ?? 0;
  if (tcVal !== 0) {
    const y = 0.5 + tcVal / 200;
    operations.push({ type: "toneCurve", params: { points: [[0, 0], [0.5, y], [1, 1]] } });
  }
  const hue = values["hsl-hue"] ?? 0;
  const sat = values["hsl-sat"] ?? 0;
  const lum = values["hsl-lum"] ?? 0;
  if (hue !== 0 || sat !== 0 || lum !== 0) {
    operations.push({ type: "hsl", params: { target: "red", hue, saturation: sat, luminance: lum } });
  }
  const cx = values["crop-x"] ?? 0;
  const cy = values["crop-y"] ?? 0;
  const cw = values["crop-w"] ?? 1;
  const ch = values["crop-h"] ?? 1;
  if ((cx > 0 || cy > 0 || cw < 1 || ch < 1) && cw > 0 && ch > 0) {
    operations.push({ type: "crop", params: { x: cx, y: cy, w: cw, h: ch } });
  }
  if (rotate && rotate !== "0") {
    operations.push({ type: "rotate", params: { degrees: parseInt(rotate, 10) } });
  }
  const stVal = values["straighten"] ?? 0;
  if (stVal !== 0) {
    operations.push({ type: "straighten", params: { angle: stVal } });
  }
  return { version: 1, operations };
}

export function DevelopPanel() {
  const [values, setValues] = useState<Record<string, number>>({ ...DEFAULT_VALUES });
  const [rotate, setRotate] = useState("0");

  const handleChange = useCallback((id: string, value: number) => {
    setValues((prev) => {
      const next = { ...prev, [id]: value };
      const recipe = buildRecipe(next, rotate);
      document.dispatchEvent(new CustomEvent("photogenic:recipe-changed", { detail: { recipe } }));
      return next;
    });
  }, [rotate]);

  const handleRotateChange = useCallback((value: string) => {
    setRotate(value);
    const recipe = buildRecipe(values, value);
    document.dispatchEvent(new CustomEvent("photogenic:recipe-changed", { detail: { recipe } }));
  }, [values]);

  // Listen for recipe loaded from main.js (when selecting an image)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.recipe) return;
      const byType = new Map<string, any>();
      for (const op of detail.recipe.operations ?? []) byType.set(op.type, op.params);
      const next: Record<string, number> = { ...DEFAULT_VALUES };
      for (const s of SLIDERS) {
        const params = byType.get(s.opType);
        next[s.id] = params?.[s.param] ?? 0;
      }
      const tcParams = byType.get("toneCurve");
      const tcMidY = tcParams?.points?.[1]?.[1];
      next["toneCurve"] = tcMidY != null ? Math.round((tcMidY - 0.5) * 200) : 0;
      const hslParams = byType.get("hsl");
      next["hsl-hue"] = hslParams?.hue ?? 0;
      next["hsl-sat"] = hslParams?.saturation ?? 0;
      next["hsl-lum"] = hslParams?.luminance ?? 0;
      const cropParams = byType.get("crop");
      next["crop-x"] = cropParams?.x ?? 0;
      next["crop-y"] = cropParams?.y ?? 0;
      next["crop-w"] = cropParams?.w ?? 1;
      next["crop-h"] = cropParams?.h ?? 1;
      const strParams = byType.get("straighten");
      next["straighten"] = strParams?.angle ?? 0;
      const rotParams = byType.get("rotate");
      setRotate(String(rotParams?.degrees ?? 0));
      setValues(next);
    };
    document.addEventListener("photogenic:recipe-loaded", handler as EventListener);
    return () => document.removeEventListener("photogenic:recipe-loaded", handler as EventListener);
  }, []);

  return React.createElement(
    "section",
    { className: "panel", id: "develop-panel" },
    React.createElement("h2", null, "Develop"),
    // Simple sliders
    ...SLIDERS.map((s) =>
      React.createElement(DevelopControl, {
        key: s.id,
        id: s.id,
        label: s.label,
        min: s.min,
        max: s.max,
        step: s.step,
        value: values[s.id] ?? 0,
        format: s.format,
        onChange: (v: number) => handleChange(s.id, v),
      }),
    ),
    // Tone curve
    React.createElement(DevelopControl, {
      id: "toneCurve",
      label: "Tone Curve (Midpoint)",
      min: -100, max: 100, step: 1,
      value: values["toneCurve"] ?? 0,
      format: (v: number) => String(v),
      onChange: (v: number) => handleChange("toneCurve", v),
    }),
    // HSL details
    React.createElement(
      "details",
      { className: "control-group" },
      React.createElement("summary", { style: { fontSize: "0.8rem", cursor: "pointer" } }, "HSL (Red Channel)"),
      React.createElement("div", { style: { marginTop: "6px" } },
        React.createElement(DevelopControl, { id: "hsl-hue", label: "Hue", min: -180, max: 180, step: 1, value: values["hsl-hue"] ?? 0, format: (v: number) => String(v), onChange: (v: number) => handleChange("hsl-hue", v) }),
        React.createElement(DevelopControl, { id: "hsl-sat", label: "Saturation", min: -100, max: 100, step: 1, value: values["hsl-sat"] ?? 0, format: (v: number) => String(v), onChange: (v: number) => handleChange("hsl-sat", v) }),
        React.createElement(DevelopControl, { id: "hsl-lum", label: "Luminance", min: -100, max: 100, step: 1, value: values["hsl-lum"] ?? 0, format: (v: number) => String(v), onChange: (v: number) => handleChange("hsl-lum", v) }),
      ),
    ),
    // Crop details
    React.createElement(
      "details",
      { className: "control-group" },
      React.createElement("summary", { style: { fontSize: "0.8rem", cursor: "pointer" } }, "Crop / Rotate / Straighten"),
      React.createElement("div", { style: { marginTop: "6px" } },
        React.createElement(DevelopControl, { id: "crop-x", label: "Crop X", min: 0, max: 1, step: 0.01, value: values["crop-x"] ?? 0, format: (v: number) => String(v), onChange: (v: number) => handleChange("crop-x", v) }),
        React.createElement(DevelopControl, { id: "crop-y", label: "Crop Y", min: 0, max: 1, step: 0.01, value: values["crop-y"] ?? 0, format: (v: number) => String(v), onChange: (v: number) => handleChange("crop-y", v) }),
        React.createElement(DevelopControl, { id: "crop-w", label: "Crop W", min: 0.01, max: 1, step: 0.01, value: values["crop-w"] ?? 1, format: (v: number) => String(v), onChange: (v: number) => handleChange("crop-w", v) }),
        React.createElement(DevelopControl, { id: "crop-h", label: "Crop H", min: 0.01, max: 1, step: 0.01, value: values["crop-h"] ?? 1, format: (v: number) => String(v), onChange: (v: number) => handleChange("crop-h", v) }),
        React.createElement(
          "div",
          { style: { marginTop: "6px" } },
          React.createElement("label", { htmlFor: "ctrl-rotate" }, "Rotate"),
          React.createElement("select", {
            id: "ctrl-rotate",
            value: rotate,
            onChange: (e: any) => handleRotateChange(e.target.value),
          },
            React.createElement("option", { value: "0" }, "0°"),
            React.createElement("option", { value: "90" }, "90°"),
            React.createElement("option", { value: "180" }, "180°"),
            React.createElement("option", { value: "270" }, "270°"),
          ),
        ),
        React.createElement(DevelopControl, { id: "straighten", label: "Straighten (°)", min: -45, max: 45, step: 0.1, value: values["straighten"] ?? 0, format: (v: number) => v.toFixed(1), onChange: (v: number) => handleChange("straighten", v) }),
      ),
    ),
  );
}
