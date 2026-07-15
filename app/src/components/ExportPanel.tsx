import React, { useState, useCallback, useEffect } from "react";
import { bridge } from "../bridge.js";

interface ExportJob {
  id: string;
  format: string;
  status: string;
}

function unwrap<T>(result: { status: string; data?: T }): T | null {
  return result && result.status === "ok" ? (result.data ?? null) : null;
}

export function ExportPanel() {
  const [format, setFormat] = useState("png");
  const [quality, setQuality] = useState(92);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => setSelectedImageId((e as CustomEvent).detail?.imageId ?? null);
    document.addEventListener("photogenic:select-image", handler as EventListener);
    return () => document.removeEventListener("photogenic:select-image", handler as EventListener);
  }, []);

  const dispatchStatus = useCallback((text: string) => {
    document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text } }));
  }, []);

  const handleExport = useCallback(async () => {
    if (!selectedImageId) {
      dispatchStatus("Select an image to export.");
      return;
    }
    // Licensing gate
    if (bridge.available) {
      try {
        const licResult = await bridge.checkLicense();
        const lic = unwrap(licResult as any) as any;
        if (lic && !lic.activated) {
          dispatchStatus(`Export blocked: ${lic.reason ?? "no license"}`);
          return;
        }
      } catch {
        dispatchStatus("License check failed.");
        return;
      }
    }
    const jobId = `export-${jobs.length + 1}`;
    setJobs((prev) => [...prev, { id: jobId, format, status: "queued" }]);
    dispatchStatus(`Queued ${format.toUpperCase()} export for ${selectedImageId}.`);
  }, [selectedImageId, format, jobs.length, dispatchStatus]);

  return React.createElement(
    "section",
    { className: "panel", id: "export-panel" },
    React.createElement("h2", null, "Export"),
    React.createElement(
      "div",
      { className: "control-group" },
      React.createElement("label", { htmlFor: "export-format" }, "Format"),
      React.createElement(
        "select",
        {
          id: "export-format",
          value: format,
          onChange: (e: any) => setFormat(e.target.value),
        },
        React.createElement("option", { value: "png" }, "PNG (8-bit)"),
        React.createElement("option", { value: "jpeg" }, "JPEG"),
        React.createElement("option", { value: "tiff-8" }, "TIFF (8-bit)"),
        React.createElement("option", { value: "tiff-16" }, "TIFF (16-bit)"),
      ),
    ),
    React.createElement(
      "div",
      { className: "control-group" },
      React.createElement("label", { htmlFor: "export-quality" }, "Quality"),
      React.createElement("input", {
        type: "range",
        id: "export-quality",
        min: 1, max: 100, step: 1,
        value: quality,
        onChange: (e: any) => setQuality(parseInt(e.target.value, 10)),
      }),
      React.createElement("span", { className: "value-display", id: "val-quality" }, String(quality)),
    ),
    React.createElement("button", { id: "btn-export", className: "btn btn--primary", onClick: handleExport }, "Queue Export"),
    React.createElement(
      "div",
      { id: "export-jobs", className: "job-list" },
      ...jobs.map((job) =>
        React.createElement(
          "div",
          { key: job.id, className: "job-item", "data-job-id": job.id },
          React.createElement("span", null, `${job.id}: ${job.format.toUpperCase()}`),
          React.createElement("span", { className: `status--${job.status}` }, job.status),
        ),
      ),
    ),
  );
}
