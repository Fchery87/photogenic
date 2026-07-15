import React from "react";

export interface DevelopControlProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (value: number) => void;
}

export function DevelopControl({
  id,
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: DevelopControlProps) {
  const inputId = `ctrl-${id}`;
  const displayId = `val-${id}`;
  const displayValue = format(value);

  return React.createElement(
    "div",
    { className: "control-group" },
    React.createElement("label", { htmlFor: inputId }, label),
    React.createElement("input", {
      type: "range",
      id: inputId,
      min,
      max,
      step,
      value,
      onChange: (e: any) => onChange(parseFloat(e.target.value)),
    }),
    React.createElement(
      "span",
      { className: "value-display", id: displayId },
      displayValue,
    ),
  );
}
