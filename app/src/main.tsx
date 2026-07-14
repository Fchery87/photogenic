import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { LibrarySidebar } from "./components/LibrarySidebar.js";
import { PreviewArea } from "./components/PreviewArea.js";

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
