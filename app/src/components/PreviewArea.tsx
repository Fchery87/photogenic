import React from "react";

export interface PreviewAreaProps {
  hasSelection: boolean;
  provenanceText?: string;
}

export function PreviewArea({ hasSelection, provenanceText }: PreviewAreaProps) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("div", {
      id: "preview-empty",
      className: "empty-state",
      style: { display: hasSelection ? "none" : "block" },
    }, "Select an image to begin."),
    React.createElement("canvas", {
      id: "preview-canvas",
      style: { display: hasSelection ? "block" : "none" },
    }),
    React.createElement("div", {
      id: "preview-provenance",
      className: "provenance-bar",
      style: { display: provenanceText ? "block" : "none" },
    }, provenanceText || ""),
  );
}
