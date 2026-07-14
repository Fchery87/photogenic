import React from "react";

export interface LibraryImage {
  imageId: string;
  sourcePath: string;
  fileName: string;
  observedFormat: string;
  byteSize?: number | null;
  modifiedAt?: string | null;
}

export interface CullingInfo {
  imageId: string;
  rating: number;
  flagged: boolean;
  rejected: boolean;
  colorLabel?: string | null;
}

export interface LibraryGridProps {
  images: LibraryImage[];
  cullingMap: Record<string, CullingInfo>;
  selectedImageId: string | null;
  onRate: (imageId: string, rating: number) => void;
  onFlag: (imageId: string) => void;
  onReject: (imageId: string) => void;
  onSelect: (imageId: string) => void;
}

export function LibraryGrid({
  images,
  cullingMap,
  selectedImageId,
  onRate,
  onFlag,
  onReject,
  onSelect,
}: LibraryGridProps) {
  if (images.length === 0) {
    return React.createElement("p", { className: "empty-state" }, "No images imported yet.");
  }

  return React.createElement(
    "div",
    { className: "library-grid" },
    images.map((img) => {
      const culling = cullingMap[img.imageId] || {
        imageId: img.imageId,
        rating: 0,
        flagged: false,
        rejected: false,
        colorLabel: null,
      };
      const isSelected = img.imageId === selectedImageId;

      return React.createElement(
        "div",
        {
          key: img.imageId,
          className: `library-item${isSelected ? " selected" : ""}`,
          onClick: (e: any) => {
            if ((e.target as HTMLElement).closest(".culling")) return;
            onSelect(img.imageId);
          },
        },
        React.createElement("div", { className: "thumb" }, (img.observedFormat || "?").toUpperCase().slice(0, 3)),
        React.createElement(
          "div",
          { className: "meta" },
          React.createElement("div", { className: "name" }, img.fileName || img.imageId),
          React.createElement("div", { className: "format" }, img.observedFormat || "unknown"),
        ),
        React.createElement(
          "div",
          { className: "culling" },
          React.createElement(
            "div",
            { className: "stars" },
            [1, 2, 3, 4, 5].map((i) =>
              React.createElement(
                "span",
                {
                  key: i,
                  className: `star${i <= culling.rating ? " star--on" : ""}`,
                  onClick: (e: any) => {
                    e.stopPropagation();
                    onRate(img.imageId, i);
                  },
                },
                "★",
              ),
            ),
          ),
          React.createElement(
            "div",
            { className: "culling-actions" },
            React.createElement("button", {
              className: `cull-btn${culling.flagged ? " cull-btn--active" : ""}`,
              title: "Flag",
              onClick: (e: any) => {
                e.stopPropagation();
                onFlag(img.imageId);
              },
            }, "⚑"),
            React.createElement("button", {
              className: `cull-btn${culling.rejected ? " cull-btn--reject" : ""}`,
              title: "Reject",
              onClick: (e: any) => {
                e.stopPropagation();
                onReject(img.imageId);
              },
            }, "✕"),
            culling.colorLabel
              ? React.createElement("span", { className: `color-dot color-dot--${culling.colorLabel}` })
              : null,
          ),
        ),
      );
    }),
  );
}
