// Shared Vercel Blob credentials for the API routes. (Files starting with
// "_" are not deployed as routes.)
//
// Connecting a store to a project adds BLOB_STORE_ID, and Vercel sends a
// short-lived OIDC token with each function request. The SDK normally finds
// that token on its own; passing it explicitly covers runtimes where it
// doesn't. A BLOB_READ_WRITE_TOKEN, if set, is used as-is by the SDK.

export const blobAuth = (req) => {
  if (process.env.BLOB_READ_WRITE_TOKEN) return {};
  const oidcToken = req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  return oidcToken && storeId ? { oidcToken, storeId } : {};
};

// Which credentials this deployment can see — presence only, never values.
export const blobAuthReport = (req) => [
  `BLOB_READ_WRITE_TOKEN: ${process.env.BLOB_READ_WRITE_TOKEN ? "yes" : "no"}`,
  `BLOB_STORE_ID: ${process.env.BLOB_STORE_ID ? "yes" : "no"}`,
  `OIDC token: ${req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN ? "yes" : "no"}`,
  `project: ${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "unknown"}`,
].join(", ");
