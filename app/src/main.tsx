import React from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { App } from "./App.js";
import { LibrarySidebar } from "./components/LibrarySidebar.js";
import { PreviewArea } from "./components/PreviewArea.js";
import { DevelopPanel } from "./components/DevelopPanel.js";
import { BatchSyncPanel } from "./components/BatchSyncPanel.js";
import { PresetPanel } from "./components/PresetPanel.js";
import { ExportPanel } from "./components/ExportPanel.js";
import { init } from "./runtime.js";

function withBoundary(element: React.ReactElement) {
  return React.createElement(ErrorBoundary, null, element);
}

const topBarRoot = document.getElementById("react-root");
if (topBarRoot) createRoot(topBarRoot).render(withBoundary(React.createElement(App)));

const libraryRoot = document.getElementById("react-library");
if (libraryRoot) createRoot(libraryRoot).render(withBoundary(React.createElement(LibrarySidebar)));

const previewRoot = document.getElementById("react-preview");
if (previewRoot) createRoot(previewRoot).render(withBoundary(React.createElement(PreviewArea, { hasSelection: false })));

const developRoot = document.getElementById("react-develop");
if (developRoot) createRoot(developRoot).render(withBoundary(React.createElement(DevelopPanel)));

const batchRoot = document.getElementById("react-batch");
if (batchRoot) createRoot(batchRoot).render(withBoundary(React.createElement(BatchSyncPanel)));

const presetRoot = document.getElementById("react-preset");
if (presetRoot) createRoot(presetRoot).render(withBoundary(React.createElement(PresetPanel)));

const exportRoot = document.getElementById("react-export");
if (exportRoot) createRoot(exportRoot).render(withBoundary(React.createElement(ExportPanel)));

init();
