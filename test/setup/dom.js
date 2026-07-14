import { Window } from "happy-dom";

const window = new Window();

globalThis.window = window;
globalThis.document = window.document;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.MutationObserver = window.MutationObserver;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;

// navigator is read-only in Node 22+ — override via defineProperty
try {
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    writable: true,
    configurable: true,
  });
} catch {
  // If it still can't be set, it's not critical for RTL
}
