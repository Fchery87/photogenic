import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LibraryGrid } from "../../app/src/components/LibraryGrid.js";

afterEach(() => cleanup());

const mockImages = [
  { imageId: "img-1", sourcePath: "/photos/a.nef", fileName: "a.nef", observedFormat: "nef" },
  { imageId: "img-2", sourcePath: "/photos/b.jpg", fileName: "b.jpg", observedFormat: "jpg" },
  { imageId: "img-3", sourcePath: "/photos/c.png", fileName: "c.png", observedFormat: "png" },
];

const mockCulling = {
  "img-1": { imageId: "img-1", rating: 3, flagged: true, rejected: false, colorLabel: null },
  "img-2": { imageId: "img-2", rating: 0, flagged: false, rejected: false, colorLabel: null },
};

test("LibraryGrid renders one card per catalog entry", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  assert.ok(screen.getByText("a.nef"));
  assert.ok(screen.getByText("b.jpg"));
  assert.ok(screen.getByText("c.png"));
});

test("LibraryGrid shows empty state when no images", () => {
  render(
    React.createElement(LibraryGrid, {
      images: [],
      cullingMap: {},
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  assert.ok(screen.getByText("No images imported yet."));
});

test("clicking a card calls onSelect with the image id", () => {
  let selectedId = null;
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: (id) => { selectedId = id; },
    }),
  );
  fireEvent.click(screen.getByText("b.jpg"));
  assert.equal(selectedId, "img-2");
});

test("clicking a star calls onRate with image id and rating", () => {
  let ratedId = null;
  let ratedValue = null;
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: (id, r) => { ratedId = id; ratedValue = r; },
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  const stars = screen.getAllByText("★");
  fireEvent.click(stars[4]);
  assert.equal(ratedId, "img-1");
  assert.equal(ratedValue, 5);
});

test("clicking flag button calls onFlag with image id", () => {
  let flaggedId = null;
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: (id) => { flaggedId = id; },
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  const flagBtn = screen.getAllByTitle("Flag")[0];
  fireEvent.click(flagBtn);
  assert.equal(flaggedId, "img-1");
});

test("selected card has 'selected' class", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: "img-2",
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  const itemName = screen.getByText("b.jpg");
  const item = itemName.closest(".library-item");
  assert.ok(item?.className.includes("selected"));
});

test("clicking culling controls does not trigger onSelect", () => {
  let selectedCalled = false;
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => { selectedCalled = true; },
    }),
  );
  const flagBtn = screen.getAllByTitle("Flag")[0];
  fireEvent.click(flagBtn);
  assert.equal(selectedCalled, false);
});

// -- Accessibility: ARIA roles + keyboard navigation ---------------------------

test("LibraryGrid container has role=grid", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  assert.ok(screen.getByRole("grid"));
});

test("each image card has role=gridcell", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  const cells = screen.getAllByRole("gridcell");
  assert.equal(cells.length, mockImages.length);
});

test("ArrowRight moves focus to the next card", () => {
  let selectedId = null;
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: "img-1",
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: (id) => { selectedId = id; },
    }),
  );
  const cells = screen.getAllByRole("gridcell");
  cells[0].focus();
  assert.equal(document.activeElement, cells[0]);
  fireEvent.keyDown(cells[0], { key: "ArrowRight" });
  assert.equal(document.activeElement, cells[1], "focus should move to second card");
  assert.equal(selectedId, "img-2", "selecting card on focus move");
});

test("ArrowLeft moves focus to the previous card", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: "img-2",
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  const cells = screen.getAllByRole("gridcell");
  cells[1].focus();
  fireEvent.keyDown(cells[1], { key: "ArrowLeft" });
  assert.equal(document.activeElement, cells[0], "focus should move to first card");
});

test("ArrowDown moves focus to the next card", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: "img-1",
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  const cells = screen.getAllByRole("gridcell");
  cells[0].focus();
  fireEvent.keyDown(cells[0], { key: "ArrowDown" });
  assert.equal(document.activeElement, cells[1]);
});

test("ArrowUp on the first card does not move focus", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: "img-1",
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  const cells = screen.getAllByRole("gridcell");
  cells[0].focus();
  fireEvent.keyDown(cells[0], { key: "ArrowUp" });
  assert.equal(document.activeElement, cells[0], "focus should stay on first card");
});

test("Enter on a focused card selects it", () => {
  let selectedId = null;
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: "img-1",
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: (id) => { selectedId = id; },
    }),
  );
  const cells = screen.getAllByRole("gridcell");
  cells[1].focus();
  fireEvent.keyDown(cells[1], { key: "Enter" });
  assert.equal(selectedId, "img-2");
});

test("flag button has accessible aria-label", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  assert.ok(screen.getAllByLabelText("Flag").length > 0, "flag button must have aria-label");
});

test("reject button has accessible aria-label", () => {
  render(
    React.createElement(LibraryGrid, {
      images: mockImages,
      cullingMap: mockCulling,
      selectedImageId: null,
      onRate: () => {},
      onFlag: () => {},
      onReject: () => {},
      onSelect: () => {},
    }),
  );
  assert.ok(screen.getAllByLabelText("Reject").length > 0, "reject button must have aria-label");
});
