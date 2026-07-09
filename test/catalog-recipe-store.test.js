import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { readSidecarFile } from "../src/catalog/sidecar.js";

async function makeTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-catalog-"));
  const clockValues = [
    "2025-07-01T00:00:00.000Z",
    "2025-07-01T00:00:01.000Z",
    "2025-07-01T00:00:02.000Z",
    "2025-07-01T00:00:03.000Z",
  ];
  let i = 0;
  const store = await createCatalogRecipeStore({
    path: path.join(dir, "catalog.json"),
    clock: () => clockValues[i++] ?? clockValues.at(-1),
  });
  return { dir, store };
}

function createMemoryCatalogBackend() {
  let persisted = null;
  return {
    async loadStore() {
      return persisted ? JSON.parse(JSON.stringify(persisted)) : null;
    },
    async saveStore(store) {
      persisted = JSON.parse(JSON.stringify(store));
    },
  };
}

test("catalog save/get round-trips a versioned Edit Recipe", async () => {
  const { store } = await makeTempStore();
  const recipe = createRecipe({
    operations: [{ type: "exposure", params: { ev: 0.5 } }],
    meta: { label: "keeper" },
  });
  const saved = await store.save("img-001", recipe);
  const loaded = await store.get("img-001");
  assert.equal(saved.imageId, "img-001");
  assert.equal(saved.revision, 1);
  assert.equal(loaded.recipe.version, 1);
  assert.deepEqual(loaded.recipe.operations, recipe.operations);
  assert.deepEqual(await store.listImageIds(), ["img-001"]);
});

test("catalog recipe store can use an injected backend adapter", async () => {
  const catalogBackend = createMemoryCatalogBackend();
  const recipe = createRecipe({
    operations: [{ type: "exposure", params: { ev: 0.75 } }],
  });
  const store = await createCatalogRecipeStore({
    catalogBackend,
    clock: () => "2025-07-01T00:00:00.000Z",
  });
  await store.save("img-backend", recipe);

  const reopened = await createCatalogRecipeStore({
    catalogBackend,
    clock: () => "2025-07-01T00:00:01.000Z",
  });
  const loaded = await reopened.get("img-backend");

  assert.equal(loaded.imageId, "img-backend");
  assert.deepEqual(loaded.recipe.operations, recipe.operations);
  assert.deepEqual(await reopened.listImageIds(), ["img-backend"]);
});

test("saving again increments catalog revision while preserving source-of-truth semantics", async () => {
  const { store } = await makeTempStore();
  await store.save("img-001", createRecipe());
  const saved = await store.save(
    "img-001",
    createRecipe({ operations: [{ type: "contrast", params: { amount: 18 } }] }),
  );
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.recipe.operations, [{ type: "contrast", params: { amount: 18 } }]);
});

test("exportSidecar writes a portable Sidecar copy of the catalog recipe", async () => {
  const { dir, store } = await makeTempStore();
  await store.save(
    "img-raw-01",
    createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 500 } }] }),
  );
  const sidecarPath = path.join(dir, "shoot", "img-raw-01.photogenic.json");
  const exportResult = await store.exportSidecar("img-raw-01", sidecarPath);
  const payload = await readSidecarFile(sidecarPath);
  assert.equal(exportResult.imageId, "img-raw-01");
  assert.equal(payload.imageId, "img-raw-01");
  assert.equal(payload.catalogRevision, 1);
  const linked = await store.get("img-raw-01");
  assert.equal(linked.sidecarLinkedAt, "2025-07-01T00:00:02.000Z");
  assert.deepEqual(payload.recipe.operations, [
    { type: "temperature", params: { kelvinDelta: 500 } },
  ]);
});

test("importSidecar inserts into the Catalog when no catalog entry exists", async () => {
  const { dir, store } = await makeTempStore();
  const sidecarPath = path.join(dir, "new.photogenic.json");
  await writeFile(
    sidecarPath,
    JSON.stringify(
      {
        sidecarVersion: 1,
        imageId: "img-002",
        exportedAt: "2025-07-01T00:00:00.000Z",
        catalogRevision: 3,
        recipe: {
          version: 1,
          operations: [{ type: "shadows", params: { amount: -8 } }],
          meta: {},
        },
      },
      null,
      2,
    ) + "\n",
  );
  const result = await store.importSidecar("img-002", sidecarPath);
  const loaded = await store.get("img-002");
  assert.equal(result.status, "imported");
  assert.equal(result.winner, "sidecar");
  assert.equal(loaded.sidecarLinkedAt, "2025-07-01T00:00:01.000Z");
  assert.deepEqual(loaded.recipe.operations, [{ type: "shadows", params: { amount: -8 } }]);
});

test("conflicting Sidecar import does not overwrite the authoritative Catalog by default", async () => {
  const { dir, store } = await makeTempStore();
  await store.save("img-003", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.2 } }] }));
  const sidecarPath = path.join(dir, "img-003.photogenic.json");
  await writeFile(
    sidecarPath,
    JSON.stringify(
      {
        sidecarVersion: 1,
        imageId: "img-003",
        exportedAt: "2025-07-01T00:00:09.000Z",
        catalogRevision: 99,
        recipe: {
          version: 1,
          operations: [{ type: "exposure", params: { ev: 1.4 } }],
          meta: {},
        },
      },
      null,
      2,
    ) + "\n",
  );
  const result = await store.importSidecar("img-003", sidecarPath);
  const loaded = await store.get("img-003");
  assert.equal(result.status, "conflict");
  assert.equal(result.winner, "catalog");
  assert.match(result.reason, /source of truth/i);
  assert.equal(loaded.sidecarLinkedAt, "2025-07-01T00:00:01.000Z");
  assert.deepEqual(loaded.recipe.operations, [{ type: "exposure", params: { ev: 0.2 } }]);
});

test("replace-catalog conflict mode allows explicit/manual Sidecar import", async () => {
  const { dir, store } = await makeTempStore();
  await store.save("img-004", createRecipe({ operations: [{ type: "contrast", params: { amount: 5 } }] }));
  const sidecarPath = path.join(dir, "img-004.photogenic.json");
  await writeFile(
    sidecarPath,
    JSON.stringify(
      {
        sidecarVersion: 1,
        imageId: "img-004",
        exportedAt: "2025-07-01T00:00:09.000Z",
        catalogRevision: 1,
        recipe: {
          version: 1,
          operations: [{ type: "contrast", params: { amount: 30 } }],
          meta: { label: "imported" },
        },
      },
      null,
      2,
    ) + "\n",
  );
  const result = await store.importSidecar("img-004", sidecarPath, {
    onConflict: "replace-catalog",
  });
  const loaded = await store.get("img-004");
  assert.equal(result.status, "imported");
  assert.equal(result.winner, "sidecar");
  assert.equal(loaded.revision, 2);
  assert.equal(loaded.sidecarLinkedAt, "2025-07-01T00:00:02.000Z");
  assert.deepEqual(loaded.recipe.operations, [{ type: "contrast", params: { amount: 30 } }]);
});

test("exported catalog file remains readable as a black-box persistence artifact", async () => {
  const { dir, store } = await makeTempStore();
  await store.save(
    "img-010",
    createRecipe({ operations: [{ type: "crop", params: { x: 0, y: 0, w: 1, h: 1 } }] }),
  );
  const parsed = JSON.parse(await readFile(path.join(dir, "catalog.json"), "utf8"));
  assert.equal(parsed.version, 1);
  assert.deepEqual(Object.keys(parsed.images), ["img-010"]);
});

test("reordered Sidecar params are treated as in-sync, not a false conflict", async () => {
  const { dir, store } = await makeTempStore();
  await store.save(
    "img-020",
    createRecipe({
      operations: [{ type: "mask", params: { exposure: 0.2, kind: "subject" } }],
      meta: { b: 2, a: 1 },
    }),
  );
  const sidecarPath = path.join(dir, "img-020.photogenic.json");
  await writeFile(
    sidecarPath,
    JSON.stringify(
      {
        sidecarVersion: 1,
        imageId: "img-020",
        exportedAt: "2025-07-01T00:00:09.000Z",
        catalogRevision: 1,
        recipe: {
          version: 1,
          operations: [{ type: "mask", params: { kind: "subject", exposure: 0.2 } }],
          meta: { a: 1, b: 2 },
        },
      },
      null,
      2,
    ) + "\n",
  );
  const result = await store.importSidecar("img-020", sidecarPath);
  assert.equal(result.status, "in-sync");
  assert.equal(result.winner, "catalog");
});

test("loading a persisted catalog with an unsupported recipe version fails validation", async () => {
  const { dir } = await makeTempStore();
  const catalogPath = path.join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        version: 1,
        images: {
          "bad-1": {
            imageId: "bad-1",
            recipe: { version: 999, operations: [], meta: {} },
            revision: 1,
            updatedAt: "2025-07-01T00:00:00.000Z",
            sidecarPath: null,
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  const store = await createCatalogRecipeStore({ path: catalogPath });
  await assert.rejects(() => store.get("bad-1"), /unsupported recipe version/i);
});

test("concurrent saves do not lose independent catalog entries", async () => {
  const { store } = await makeTempStore();
  await Promise.all([
    store.save("img-a", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.1 } }] })),
    store.save("img-b", createRecipe({ operations: [{ type: "contrast", params: { amount: 8 } }] })),
  ]);
  assert.deepEqual(await store.listImageIds(), ["img-a", "img-b"]);
  assert.deepEqual((await store.get("img-a")).recipe.operations, [
    { type: "exposure", params: { ev: 0.1 } },
  ]);
  assert.deepEqual((await store.get("img-b")).recipe.operations, [
    { type: "contrast", params: { amount: 8 } },
  ]);
});
