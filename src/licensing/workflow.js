import { evaluateCloudEntitlement, evaluateLocalEntitlement } from "./entitlements.js";
import { createLicensingFoundation } from "./foundation.js";

export function createLicensingWorkflow({ licensingFoundation = createLicensingFoundation() } = {}) {
  return {
    licensingFoundation,
    evaluateFeatureAccess({ feature, license, credits, now } = {}) {
      if (feature === "local-edit" || feature === "local-export") {
        const local = evaluateLocalEntitlement({ feature, license, credits, now });
        return {
          channel: "local-license",
          feature,
          ...local,
        };
      }

      if (feature === "cloud-generative") {
        const cloud = evaluateCloudEntitlement({ feature, credits });
        return {
          channel: "cloud-credits",
          feature,
          ...cloud,
        };
      }

      throw new RangeError(`unsupported feature: ${String(feature)}`);
    },

    summarizeAccessMetadata(snapshot = {}) {
      return licensingFoundation.summarizeEntitlements({
        license: snapshot.license,
        credits: snapshot.credits,
      });
    },

    summarizeAccessReport(snapshot = {}) {
      const metadata = this.summarizeAccessMetadata(snapshot);
      const access = this.summarizeAccess(snapshot);
      return {
        operation: {
          kind: "summarize-licensing-access",
          now: snapshot.now ?? null,
          hasLicense: snapshot.license != null,
          hasCredits: snapshot.credits != null,
        },
        metadata,
        access,
      };
    },

    summarizeAccess(snapshot = {}) {
      const localEdit = this.evaluateFeatureAccess({
        feature: "local-edit",
        license: snapshot.license,
        credits: snapshot.credits,
        now: snapshot.now,
      });
      const localExport = this.evaluateFeatureAccess({
        feature: "local-export",
        license: snapshot.license,
        credits: snapshot.credits,
        now: snapshot.now,
      });
      const cloudGenerative = this.evaluateFeatureAccess({
        feature: "cloud-generative",
        license: snapshot.license,
        credits: snapshot.credits,
        now: snapshot.now,
      });
      return {
        localEdit,
        localExport,
        cloudGenerative,
      };
    },
  };
}
