function normalizeLicenseStatus(license) {
  if (typeof license?.status === "string" && license.status) {
    return license.status;
  }
  return "missing";
}

function normalizeCreditBalance(credits) {
  return Number.isInteger(credits?.balance) ? credits.balance : 0;
}

export function createLicensingFoundation() {
  return {
    summarizeEntitlements({ license, credits } = {}) {
      const licenseStatus = normalizeLicenseStatus(license);
      const creditBalance = normalizeCreditBalance(credits);
      return {
        licenseStatus,
        creditBalance,
        hasActiveLicense: licenseStatus === "active",
        hasCloudCredits: creditBalance > 0,
        offlineValidUntil: typeof license?.offlineValidUntil === "string" ? license.offlineValidUntil : null,
        validUntil: typeof license?.validUntil === "string" ? license.validUntil : null,
      };
    },
  };
}
