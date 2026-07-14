import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("react-root");
if (root) {
  createRoot(root).render(React.createElement(App));
}
