import React, { useState, useEffect, useCallback } from "react";
import { LibraryGrid } from "./LibraryGrid.js";
import { bridge } from "../bridge.js";
import type { LibraryImage, CullingInfo } from "./LibraryGrid.js";

function unwrap<T>(result: { status: string; data?: T; error?: string }): T | null {
  if (result && result.status === "ok") return result.data ?? null;
  return null;
}

export function LibrarySidebar() {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [cullingMap, setCullingMap] = useState<Record<string, CullingInfo>>({});
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    if (!bridge.available) return;
    try {
      const libResult = await bridge.listLibrary();
      const lib = unwrap(libResult as any);
      if (!lib) return;
      const normalized: LibraryImage[] = (lib as any[]).map((r: any) => ({
        imageId: r.imageId ?? r.image_id,
        sourcePath: r.sourcePath ?? r.source_path,
        fileName: r.fileName ?? r.file_name,
        observedFormat: r.observedFormat ?? r.observed_format,
        byteSize: r.byteSize ?? r.byte_size,
        modifiedAt: r.modifiedAt ?? r.modified_at,
      }));
      setImages(normalized);
      document.dispatchEvent(
        new CustomEvent("photogenic:library-updated", { detail: { images: normalized } }),
      );

      try {
        const cullingResult = await bridge.listCulling();
        const culling = unwrap(cullingResult as any);
        const map: Record<string, CullingInfo> = {};
        for (const c of (culling as any[]) || []) {
          const id = c.imageId ?? c.image_id;
          map[id] = {
            imageId: id,
            rating: c.rating ?? 0,
            flagged: c.flagged ?? false,
            rejected: c.rejected ?? false,
            colorLabel: c.colorLabel ?? c.color_label ?? null,
          };
        }
        setCullingMap(map);
      } catch { /* non-fatal */ }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const handler = () => refreshLibrary();
    document.addEventListener("photogenic:refresh-library", handler);
    return () => document.removeEventListener("photogenic:refresh-library", handler);
  }, [refreshLibrary]);

  const handleSelect = useCallback((imageId: string) => {
    setSelectedImageId(imageId);
    const img = images.find((i) => i.imageId === imageId);
    document.dispatchEvent(
      new CustomEvent("photogenic:select-image", { detail: { imageId, image: img } }),
    );
  }, [images]);

  const handleRate = useCallback(async (imageId: string, rating: number) => {
    try {
      const result = await bridge.updateCulling(imageId, rating, null, null, null);
      const updated = unwrap(result as any);
      if (updated) {
        const id = (updated as any).imageId ?? imageId;
        setCullingMap((prev) => ({ ...prev, [id]: { ...prev[id], ...(updated as any), imageId: id } }));
      }
    } catch { /* non-fatal */ }
  }, []);

  const handleFlag = useCallback(async (imageId: string) => {
    const current = cullingMap[imageId];
    try {
      const result = await bridge.updateCulling(imageId, null, !(current?.flagged ?? false), null, null);
      const updated = unwrap(result as any);
      if (updated) {
        setCullingMap((prev) => ({ ...prev, [imageId]: { ...prev[imageId], ...(updated as any), imageId } }));
      }
    } catch { /* non-fatal */ }
  }, [cullingMap]);

  const handleReject = useCallback(async (imageId: string) => {
    const current = cullingMap[imageId];
    try {
      const result = await bridge.updateCulling(imageId, null, null, !(current?.rejected ?? false), null);
      const updated = unwrap(result as any);
      if (updated) {
        setCullingMap((prev) => ({ ...prev, [imageId]: { ...prev[imageId], ...(updated as any), imageId } }));
      }
    } catch { /* non-fatal */ }
  }, [cullingMap]);

  const handleImport = useCallback(async () => {
    if (!bridge.available) return;
    const input = prompt("Enter image file path(s), comma-separated:");
    if (!input) return;
    const paths = input.split(",").map((s) => s.trim()).filter(Boolean);
    if (paths.length === 0) return;
    try {
      await bridge.importImages(paths);
      await refreshLibrary();
    } catch { /* non-fatal */ }
  }, [refreshLibrary]);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { className: "sidebar-header" },
      React.createElement("h2", null, "Library"),
      React.createElement(
        "button",
        { id: "btn-import", className: "btn btn--small", title: "Import sources", onClick: handleImport },
        "+ Import",
      ),
    ),
    React.createElement(LibraryGrid, {
      images,
      cullingMap,
      selectedImageId,
      onRate: handleRate,
      onFlag: handleFlag,
      onReject: handleReject,
      onSelect: handleSelect,
    }),
  );
}
