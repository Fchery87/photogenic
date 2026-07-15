import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { LibrarySidebar } from "./components/LibrarySidebar.js";
import { PreviewArea } from "./components/PreviewArea.js";
import { DevelopPanel } from "./components/DevelopPanel.js";
import { BatchSyncPanel } from "./components/BatchSyncPanel.js";
import { PresetPanel } from "./components/PresetPanel.js";
import { ExportPanel } from "./components/ExportPanel.js";

const topBarRoot = document.getElementById("react-root");
if (topBarRoot) {
  createRoot(topBarRoot).render(React.createElement(App));
}

const libraryRoot = document.getElementById("react-library");
if (libraryRoot) {
  createRoot(libraryRoot).render(React.createElement(LibrarySidebar));
}

const previewRoot = document.getElementById("react-preview");
if (previewRoot) {
  createRoot(previewRoot).render(React.createElement(PreviewArea, { hasSelection: false }));
}

const developRoot = document.getElementById("react-develop");
if (developRoot) {
  createRoot(developRoot).render(React.createElement(DevelopPanel));
}

const batchRoot = document.getElementById("react-batch");
if (batchRoot) {
  createRoot(batchRoot).render(React.createElement(BatchSyncPanel));
}

const presetRoot = document.getElementById("react-preset");
if (presetRoot) {
  createRoot(presetRoot).render(React.createElement(PresetPanel));
}

const exportRoot = document.getElementById("react-export");
if (exportRoot) {
  createRoot(exportRoot).render(React.createElement(ExportPanel));
}
