const LOCAL_LICENSE_FEATURES = new Set(["local-edit", "local-export"]);
const CLOUD_CREDIT_FEATURES = new Set(["cloud-generative"]);

const toMillis = (value) => {
  if (typeof value !== "string") return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
};

export { LOCAL_LICENSE_FEATURES, CLOUD_CREDIT_FEATURES };

export function evaluateLocalEntitlement({ license, feature, now = new Date().toISOString(), credits } = {}) {
  if (!LOCAL_LICENSE_FEATURES.has(feature)) {
    throw new RangeError(`unsupported local feature: ${String(feature)}`);
  }
  if (!license || typeof license !== "object") {
    return { allowed: false, reason: "No local license snapshot is available.", creditsIgnored: credits !== undefined };
  }
  if (license.status !== "active") {
    return { allowed: false, reason: "Local license is inactive.", creditsIgnored: credits !== undefined };
  }
  const nowMs = toMillis(now) ?? Date.now();
  const offlineValidUntil = toMillis(license.offlineValidUntil);
  const validUntil = toMillis(license.validUntil);
  if (offlineValidUntil !== null && nowMs > offlineValidUntil) {
    return { allowed: false, reason: "Local license snapshot expired for offline use.", creditsIgnored: credits !== undefined };
  }
  if (validUntil !== null && nowMs > validUntil) {
    return { allowed: false, reason: "Local license validity window has expired.", creditsIgnored: credits !== undefined };
  }
  return {
    allowed: true,
    reason: `Local feature '${feature}' is allowed by the cached license snapshot.`,
    creditsIgnored: credits !== undefined,
    offlineValidUntil: license.offlineValidUntil ?? null,
  };
}

export function evaluateCloudEntitlement({ credits, feature } = {}) {
  if (!CLOUD_CREDIT_FEATURES.has(feature)) {
    throw new RangeError(`unsupported cloud feature: ${String(feature)}`);
  }
  const balance = Number.isInteger(credits?.balance) ? credits.balance : 0;
  if (balance <= 0) {
    return { allowed: false, reason: "Cloud credits are required for this feature.", balance };
  }
  return { allowed: true, reason: "Cloud credits are available.", balance };
}
