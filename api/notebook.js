import { get, put, list } from "@vercel/blob";

// Private Blob-backed persistence for the editor.  The immutable history
// objects make recovery possible without growing index.html on every save.
const CURRENT_PATH = "notebooks/chimkens/current.json";
const HISTORY_PREFIX = "notebooks/chimkens/history/";

const readJson = async (pathname) => {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).json();
};

const isAdmin = (req) => {
  const supplied = req.headers["x-admin-password"];
  return Boolean(process.env.ADMIN_PASSWORD) && supplied === process.env.ADMIN_PASSWORD;
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");

  try {
    if (req.method === "GET") {
      if (!isAdmin(req)) return res.status(401).json({ error: "Authentication required" });
      const state = await readJson(CURRENT_PATH);
      return res.status(200).json({ state, source: "blob" });
    }

    if (req.method === "POST") {
      if (!isAdmin(req)) return res.status(401).json({ error: "Wrong password" });
      const { state } = req.body || {};
      if (!state || typeof state !== "object") return res.status(400).json({ error: "No notebook state provided" });

      const version = Date.now();
      const snapshot = JSON.stringify({ version, savedAt: new Date(version).toISOString(), state });
      const options = {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      };

      // Save an immutable version first, then advance the current pointer.
      await put(`${HISTORY_PREFIX}${version}.json`, snapshot, options);
      await put(CURRENT_PATH, snapshot, options);
      return res.status(200).json({ ok: true, version });
    }

    if (req.method === "HEAD") {
      return res.status(204).end();
    }

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method === "PUT") {
      return res.status(405).json({ error: "Use POST to save a notebook" });
    }

    if (req.method === "DELETE") {
      return res.status(405).json({ error: "Version deletion is not enabled" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Notebook storage error:", error);
    return res.status(500).json({ error: "Notebook storage is unavailable" });
  }
}

// Kept as a named export for a later authenticated version-history route.
export const listVersions = async () => {
  const { blobs } = await list({ prefix: HISTORY_PREFIX, limit: 1000 });
  return blobs.map(({ pathname, uploadedAt }) => ({ pathname, uploadedAt }));
};
