import { recipeFingerprint } from "../edit-recipe/schema.js";
import { readSidecarFile, readSidecarFileMetadata } from "./sidecar.js";

function summarizeRevisionDrift(catalogRevision, sidecarRevision) {
  if (!Number.isInteger(catalogRevision) || !Number.isInteger(sidecarRevision)) {
    return { status: "unknown", delta: null };
  }
  const delta = catalogRevision - sidecarRevision;
  if (delta === 0) {
    return { status: "matched", delta };
  }
  return {
    status: delta > 0 ? "catalog-newer" : "sidecar-newer",
    delta,
  };
}

function summarizeSidecarFreshness(sidecarLinkedAt, sidecarFile) {
  if (!sidecarFile || sidecarFile.status !== "present") {
    return { status: "missing", modifiedAfterLink: null };
  }
  if (typeof sidecarLinkedAt !== "string" || !sidecarLinkedAt) {
    return { status: "unknown", modifiedAfterLink: null };
  }
  if (typeof sidecarFile.modifiedAt !== "string" || !sidecarFile.modifiedAt) {
    return { status: "unknown", modifiedAfterLink: null };
  }
  const modifiedAfterLink = sidecarFile.modifiedAt > sidecarLinkedAt;
  return {
    status: modifiedAfterLink ? "modified-after-link" : "unchanged-since-link",
    modifiedAfterLink,
  };
}

export function createSidecarWorkflow({ recipeStore } = {}) {
  if (!recipeStore || typeof recipeStore.exportSidecar !== "function" || typeof recipeStore.importSidecar !== "function") {
    throw new TypeError("recipeStore with exportSidecar() and importSidecar() is required");
  }

  return {
    async exportRecipe(imageId, sidecarPath) {
      const result = await this.exportRecipeReport(imageId, sidecarPath);
      return result.exported;
    },

    async exportRecipeReport(imageId, sidecarPath) {
      const exported = await recipeStore.exportSidecar(imageId, sidecarPath);
      const sidecar = await readSidecarFile(sidecarPath);
      const linkedEntry = typeof recipeStore.get === "function" ? await recipeStore.get(imageId) : null;
      const sidecarFile = await readSidecarFileMetadata(sidecarPath);
      const sidecarLinkedAt = linkedEntry?.sidecarLinkedAt ?? null;
      return {
        operation: {
          kind: "export-sidecar-recipe",
          imageId,
          sidecarPath,
        },
        exported: {
          ...exported,
          sidecarFingerprint: recipeFingerprint(sidecar.recipe),
          sidecar,
          sidecarFile,
          sidecarLinkedAt,
          revisionDrift: summarizeRevisionDrift(exported.revision, sidecar.catalogRevision),
          sidecarFreshness: summarizeSidecarFreshness(sidecarLinkedAt, sidecarFile),
        },
      };
    },

    async importRecipe(imageId, sidecarPath, options) {
      const result = await this.importRecipeReport(imageId, sidecarPath, options);
      return result.imported;
    },

    async importRecipeReport(imageId, sidecarPath, options) {
      const imported = await recipeStore.importSidecar(imageId, sidecarPath, options);
      const sidecar = await readSidecarFile(sidecarPath);
      const sidecarFile = await readSidecarFileMetadata(sidecarPath);
      const sidecarFingerprint = recipeFingerprint(sidecar.recipe);
      const catalogRevision = imported?.entry?.revision ?? null;
      const sidecarRevision = Number.isInteger(sidecar.catalogRevision) ? sidecar.catalogRevision : null;
      const sidecarLinkedAt = imported?.entry?.sidecarLinkedAt ?? null;
      return {
        operation: {
          kind: "import-sidecar-recipe",
          imageId,
          sidecarPath,
          conflictMode: options?.onConflict ?? null,
        },
        imported: {
          ...imported,
          sidecarFile,
          sidecarFingerprint,
          sidecarLinkedAt,
          revisionDrift: summarizeRevisionDrift(catalogRevision, sidecarRevision),
          sidecarFreshness: summarizeSidecarFreshness(sidecarLinkedAt, sidecarFile),
        },
      };
    },

    async inspectSync(imageId, sidecarPath) {
      const result = await this.inspectSyncReport(imageId, sidecarPath);
      return result.sync;
    },

    async inspectSyncReport(imageId, sidecarPath) {
      const catalog = await recipeStore.get(imageId);
      const sidecar = await readSidecarFile(sidecarPath);
      const sidecarFingerprint = recipeFingerprint(sidecar.recipe);
      if (!catalog) {
        const sidecarFile = await readSidecarFileMetadata(sidecarPath);
        const sidecarLinkedAt = null;
        return {
          operation: {
            kind: "inspect-sidecar-sync",
            imageId,
            sidecarPath,
            hasCatalogEntry: false,
          },
          sync: {
            imageId,
            status: "missing-catalog",
            catalogFingerprint: null,
            sidecarFingerprint,
            sidecarFile,
            sidecarLinkedAt,
            revisionDrift: summarizeRevisionDrift(null, sidecar.catalogRevision),
            sidecarFreshness: summarizeSidecarFreshness(sidecarLinkedAt, sidecarFile),
          },
        };
      }
      const inSync = catalog.recipeFingerprint === sidecarFingerprint;
      const sidecarFile = await readSidecarFileMetadata(sidecarPath);
      const sidecarLinkedAt = catalog.sidecarLinkedAt ?? null;
      return {
        operation: {
          kind: "inspect-sidecar-sync",
          imageId,
          sidecarPath,
          hasCatalogEntry: true,
        },
        sync: {
          imageId,
          status: inSync ? "in-sync" : "conflict",
          catalogFingerprint: catalog.recipeFingerprint,
          sidecarFingerprint,
          catalogRevision: catalog.revision,
          sidecarRevision: sidecar.catalogRevision,
          sidecarFile,
          sidecarLinkedAt,
          revisionDrift: summarizeRevisionDrift(catalog.revision, sidecar.catalogRevision),
          sidecarFreshness: summarizeSidecarFreshness(sidecarLinkedAt, sidecarFile),
        },
      };
    },
  };
}
