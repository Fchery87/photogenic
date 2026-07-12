import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { importShoot } from "../src/catalog/import-workflow.js";

import { createSqliteCatalogBackend } from "../src/catalog/sqlite-backend.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { createLibraryStore } from "../src/catalog/library-store.js";
import { createPresetStore } from "../src/catalog/preset-store.js";
import { createWorkspaceSessionStore } from "../src/catalog/workspace-session-store.js";

let seq = 0;
function tempDbPath() {
  return path.join(tmpdir(), `photogenic-catalog-test-${Date.now()}-${seq++}.sqlite`);
}

function cleanup(p) {
  try { rmSync(p); } catch { /* ignore */ }
  try { rmSync(`${p}-wal`); } catch { /* ignore */ }
  try { rmSync(`${p}-shm`); } catch { /* ignore */ }
}

const fixedClock = () => "2025-07-01T00:00:00.000Z";

test("SQLite catalog backend initializes empty database with durable tables", () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    assert.equal(backend.schemaVersion(), 1);
    assert.deepEqual(backend.tableNames().sort(), [
      "catalog_images",
      "catalog_presets",
      "catalog_recipes",
      "catalog_workspace_state",
    ]);
    backend.close();
  } finally {
    cleanup(dbPath);
  }
});

test("SQLite catalog backend reopens an existing database without losing tables", () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    assert.equal(reopened.schemaVersion(), 1);
    assert.equal(reopened.tableNames().length, 4);
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

// ---------------------------------------------------------------------------
// Recipe store — SQLite-backed
// ---------------------------------------------------------------------------

test("SQLite recipe store saves and loads a recipe that survives process restart", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const store = await createCatalogRecipeStore({ catalogBackend: backend.recipe, clock: fixedClock });
    const saved = await store.save("img-sqlite-001", {
      version: 1,
      operations: [{ type: "exposure", params: { ev: 0.5 } }],
    });
    assert.equal(saved.revision, 1);
    assert.ok(saved.recipeFingerprint);
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createCatalogRecipeStore({ catalogBackend: reopened.recipe, clock: fixedClock });
    const survived = await store2.get("img-sqlite-001");
    assert.equal(survived.imageId, "img-sqlite-001");
    assert.equal(survived.revision, 1);
    assert.equal(survived.recipeFingerprint, saved.recipeFingerprint);
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

test("SQLite recipe store revision increments across restarts", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const store = await createCatalogRecipeStore({ catalogBackend: backend.recipe, clock: fixedClock });
    await store.save("img-rev", { version: 1, operations: [] });
    await store.save("img-rev", { version: 1, operations: [{ type: "exposure", params: { ev: 0.3 } }] });
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createCatalogRecipeStore({ catalogBackend: reopened.recipe, clock: fixedClock });
    await store2.save("img-rev", { version: 1, operations: [{ type: "exposure", params: { ev: 0.7 } }] });
    const final = await store2.get("img-rev");
    assert.equal(final.revision, 3);
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

// ---------------------------------------------------------------------------
// Library store — SQLite-backed
// ---------------------------------------------------------------------------

test("SQLite library store imports an image and it survives restart", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const store = await createLibraryStore({ catalogBackend: backend.library, clock: fixedClock });
    const imported = await store.importImage({
      imageId: "lib-sqlite-001",
      sourcePath: "/shoots/hero.nef",
      fileName: "hero.nef",
      observedFormat: "nef",
      byteSize: 4096,
      modifiedAt: "2025-06-01T12:00:00Z",
    });
    assert.equal(imported.imageId, "lib-sqlite-001");
    assert.equal(imported.sourcePath, "/shoots/hero.nef");
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createLibraryStore({ catalogBackend: reopened.library, clock: fixedClock });
    const survived = await store2.get("lib-sqlite-001");
    assert.equal(survived.sourcePath, "/shoots/hero.nef");
    assert.equal(survived.observedFormat, "nef");
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

test("SQLite library store preserves culling metadata (rating, flag, color label) across restart", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const store = await createLibraryStore({ catalogBackend: backend.library, clock: fixedClock });
    await store.importImage({
      imageId: "lib-culling",
      sourcePath: "/shoots/cull.nef",
      fileName: "cull.nef",
      observedFormat: "nef",
    });
    await store.setRating("lib-culling", 4);
    await store.setFlag("lib-culling", true);
    await store.setColorLabel("lib-culling", "red");
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createLibraryStore({ catalogBackend: reopened.library, clock: fixedClock });
    const survived = await store2.get("lib-culling");
    assert.equal(survived.rating, 4);
    assert.equal(survived.flagged, true);
    assert.equal(survived.colorLabel, "red");
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

test("SQLite library store refresh updates file size and modified time without duplicating images", async () => {
  const dbPath = tempDbPath();
  const sourceFile = path.join(tmpdir(), `photogenic-source-${Date.now()}.nef`);
  writeFileSync(sourceFile, Buffer.alloc(1024, 0));
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const store = await createLibraryStore({ catalogBackend: backend.library, clock: fixedClock });
    await store.importImage({
      imageId: "lib-refresh",
      sourcePath: sourceFile,
      fileName: path.basename(sourceFile),
      observedFormat: "nef",
    });
    // Simulate the source file changing on disk (bigger file, newer mtime)
    writeFileSync(sourceFile, Buffer.alloc(2048, 0));
    const newMtime = new Date("2025-06-02T12:00:00Z");
    utimesSync(sourceFile, newMtime, newMtime);
    await store.refreshSourceMetadata("lib-refresh");
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createLibraryStore({ catalogBackend: reopened.library, clock: fixedClock });
    const ids = await store2.list();
    assert.equal(ids.length, 1, "no duplicate image rows");
    const refreshed = await store2.get("lib-refresh");
    assert.equal(refreshed.byteSize, 2048);
    reopened.close();
  } finally {
    cleanup(dbPath);
    try { rmSync(sourceFile); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// Preset store — SQLite-backed
// ---------------------------------------------------------------------------

test("SQLite preset store saves and loads a preset that survives restart", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const store = await createPresetStore({ catalogBackend: backend.preset, clock: fixedClock });
    await store.savePreset("preset-sqlite-001", {
      name: "Warm Landscapes",
      recipe: { version: 1, operations: [{ type: "exposure", params: { ev: 0.5 } }] },
      includedTypes: ["exposure"],
    });
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createPresetStore({ catalogBackend: reopened.preset, clock: fixedClock });
    const survived = await store2.getPreset("preset-sqlite-001");
    assert.equal(survived.name, "Warm Landscapes");
    assert.deepEqual(survived.includedTypes, ["exposure"]);
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

// ---------------------------------------------------------------------------
// Workspace session store — SQLite-backed
// ---------------------------------------------------------------------------

test("SQLite workspace session store saves and loads a snapshot that survives restart", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const store = await createWorkspaceSessionStore({ catalogBackend: backend.workspace, clock: fixedClock });
    await store.saveSnapshot("ws-sqlite-001", {
      selectedImageId: "img-selected",
      activeFilter: "all",
      expandedImageIds: ["img-1", "img-2"],
    });
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createWorkspaceSessionStore({ catalogBackend: reopened.workspace, clock: fixedClock });
    const survived = await store2.getSnapshot("ws-sqlite-001");
    assert.equal(survived.selectedImageId, "img-selected");
    assert.deepEqual(survived.expandedImageIds, ["img-1", "img-2"]);
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

// ---------------------------------------------------------------------------
// Shared database — all stores in one file
// ---------------------------------------------------------------------------

test("SQLite catalog backend supports all store types in a single shared database", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });

    const recipeStore = await createCatalogRecipeStore({ catalogBackend: backend.recipe, clock: fixedClock });
    const libraryStore = await createLibraryStore({ catalogBackend: backend.library, clock: fixedClock });
    const presetStore = await createPresetStore({ catalogBackend: backend.preset, clock: fixedClock });
    const workspaceStore = await createWorkspaceSessionStore({ catalogBackend: backend.workspace, clock: fixedClock });

    await recipeStore.save("shared-img", { version: 1, operations: [{ type: "exposure", params: { ev: 1.0 } }] });
    await libraryStore.importImage({
      imageId: "shared-img",
      sourcePath: "/shared.nef",
      fileName: "shared.nef",
      observedFormat: "nef",
    });
    await libraryStore.setRating("shared-img", 5);
    await presetStore.savePreset("shared-preset", {
      name: "Shared",
      recipe: { version: 1, operations: [] },
      includedTypes: ["exposure"],
    });
    await workspaceStore.saveSnapshot("shared-ws", { selectedImageId: "shared-img", activeFilter: "all" });
    backend.close();

    // Reopen and verify all four stores have their data
    const reopened = createSqliteCatalogBackend({ dbPath });
    const r2 = await createCatalogRecipeStore({ catalogBackend: reopened.recipe, clock: fixedClock });
    const l2 = await createLibraryStore({ catalogBackend: reopened.library, clock: fixedClock });
    const p2 = await createPresetStore({ catalogBackend: reopened.preset, clock: fixedClock });
    const w2 = await createWorkspaceSessionStore({ catalogBackend: reopened.workspace, clock: fixedClock });

    assert.equal((await r2.get("shared-img")).revision, 1);
    assert.equal((await l2.get("shared-img")).rating, 5);
    assert.equal((await p2.getPreset("shared-preset")).name, "Shared");
    assert.equal((await w2.getSnapshot("shared-ws")).selectedImageId, "shared-img");
    reopened.close();
  } finally {
    cleanup(dbPath);
  }
});

test("SQLite catalog backend handles empty store load gracefully", async () => {
  const dbPath = tempDbPath();
  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const recipeStore = await createCatalogRecipeStore({ catalogBackend: backend.recipe, clock: fixedClock });
    const empty = await recipeStore.listImageIds();
    assert.deepEqual(empty, []);
    backend.close();
  } finally {
    cleanup(dbPath);
  }
});

// ---------------------------------------------------------------------------
// Import workflow — SQLite-backed durable image rows
// ---------------------------------------------------------------------------

test("SQLite-backed import workflow writes one durable image row per supported source", async () => {
  const dbPath = tempDbPath();
  const shootDir = path.join(tmpdir(), `photogenic-shoot-${Date.now()}`);
  mkdirSync(shootDir, { recursive: true });
  const sources = [
    path.join(shootDir, "hero.nef"),
    path.join(shootDir, "portrait.jpg"),
    path.join(shootDir, "scan.tif"),
    path.join(shootDir, "graphic.png"),
    path.join(shootDir, "notes.txt"), // unsupported — should be skipped
  ];
  for (const src of sources) writeFileSync(src, Buffer.alloc(512, 0));

  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const libraryStore = await createLibraryStore({ catalogBackend: backend.library, clock: fixedClock });
    const result = await importShoot({ libraryStore, files: sources });
    assert.equal(result.imported.length, 4, "one row per supported source");
    assert.equal(result.skipped.length, 1, "unsupported file skipped");
    assert.equal(result.skipped[0].reason, "unsupported-format");
    backend.close();

    // Reopen and verify all four images are durable
    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createLibraryStore({ catalogBackend: reopened.library, clock: fixedClock });
    const entries = await store2.list();
    assert.equal(entries.length, 4, "all imported images survived restart");
    const observedFormats = entries.map((f) => f.observedFormat).sort();
    assert.ok(observedFormats.includes("raw"), "RAW format classified");
    assert.ok(observedFormats.includes("jpeg"), "JPEG format classified");
    assert.ok(observedFormats.includes("tiff"), "TIFF format classified");
    assert.ok(observedFormats.includes("png"), "PNG format classified");
    reopened.close();
  } finally {
    cleanup(dbPath);
    try { rmSync(shootDir, { recursive: true }); } catch { /* ignore */ }
  }
});

test("SQLite-backed import workflow does not duplicate re-imported images", async () => {
  const dbPath = tempDbPath();
  const sourceFile = path.join(tmpdir(), `photogenic-dedupe-${Date.now()}.nef`);
  writeFileSync(sourceFile, Buffer.alloc(256, 0));

  try {
    const backend = createSqliteCatalogBackend({ dbPath });
    const libraryStore = await createLibraryStore({ catalogBackend: backend.library, clock: fixedClock });
    await importShoot({ libraryStore, files: [sourceFile] });
    await importShoot({ libraryStore, files: [sourceFile] });
    backend.close();

    const reopened = createSqliteCatalogBackend({ dbPath });
    const store2 = await createLibraryStore({ catalogBackend: reopened.library, clock: fixedClock });
    const entries = await store2.list();
    assert.equal(entries.length, 1, "re-importing the same source does not create a duplicate");
    reopened.close();
  } finally {
    cleanup(dbPath);
    try { rmSync(sourceFile); } catch { /* ignore */ }
  }
});
