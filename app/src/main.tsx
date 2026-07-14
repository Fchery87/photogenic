import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { LibrarySidebar } from "./components/LibrarySidebar.js";

const topBarRoot = document.getElementById("react-root");
if (topBarRoot) {
  createRoot(topBarRoot).render(React.createElement(App));
}

const libraryRoot = document.getElementById("react-library");
if (libraryRoot) {
  createRoot(libraryRoot).render(React.createElement(LibrarySidebar));
}
