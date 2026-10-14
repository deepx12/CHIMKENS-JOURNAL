import { get } from "@vercel/blob";
import { blobAuth } from "./_blobAuth.js";

// Vercel Serverless Function — /api/image?p=<pathname>
// Serves journal images when the Blob store is private (see api/upload.js).
// Pathnames carry a random suffix and never change, so they cache forever.

const IMAGE_PREFIX = "journal/images/";
const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

export default async function handler(req, res) {
  const pathname = String(req.query.p || "");
  if (!pathname.startsWith(IMAGE_PREFIX) || pathname.includes("..")) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  try {
    const result = await get(pathname, { ...blobAuth(req), access: "private" });
    if (!result || result.statusCode !== 200) return res.status(404).json({ error: "Image not found" });
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    const ext = pathname.split(".").pop().toLowerCase();
    res.setHeader("Content-Type", result.blob.contentType || TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("Image read error:", error);
    return res.status(500).json({ error: "Image storage is unavailable" });
  }
}
