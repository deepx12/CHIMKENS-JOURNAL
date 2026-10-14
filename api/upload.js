import { put } from "@vercel/blob";

// Vercel Serverless Function — /api/upload
// Stores ONE image in Vercel Blob and returns the URL the page should use.
// Publishing used to send every image inline in a single request, which hit
// Vercel's ~4.5MB request-body cap. Uploading images one at a time keeps
// each request small; publish then only sends their URLs.

const IMAGE_PREFIX = "journal/images/";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password, dataUrl } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  const match = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return res.status(400).json({ error: "Expected a base64 image data URL" });

  const contentType = match[1].toLowerCase();
  const ext = (contentType.split("/")[1] || "bin").replace("jpeg", "jpg").replace(/\+.*/, "");
  const body = Buffer.from(match[2], "base64");
  const pathname = `${IMAGE_PREFIX}${Date.now()}.${ext}`;
  const options = { contentType, addRandomSuffix: true, cacheControlMaxAge: 31536000 };

  try {
    // The store is private, so visitors load images through /api/image.
    const blob = await put(pathname, body, { ...options, access: "private" });
    return res.status(200).json({ url: `/api/image?p=${encodeURIComponent(blob.pathname)}` });
  } catch (error) {
    console.error("Image upload error:", error);
    return res.status(500).json({ error: "Image storage is unavailable: " + error.message });
  }
}
