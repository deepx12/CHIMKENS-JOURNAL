// Vercel Serverless Function — /api/version
// Lightweight endpoint: returns the currently published __BAKED_VERSION__
// so open tabs can poll and auto-refresh when a new publish lands.

export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO || "deepx12/CHIMKENS-JOURNAL";
  const FILE_PATH = "index.html";
  const API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

  // Short CDN cache so we don't hammer GitHub but still propagate fast.
  res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");

  try {
    const r = await fetch(API, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const j = await r.json();
    if (!j.content) return res.status(500).json({ version: 0 });
    const html = Buffer.from(j.content, "base64").toString("utf8");
    const m = html.match(/const __BAKED_VERSION__ = (\d+);/);
    const version = m ? parseInt(m[1], 10) : 0;
    return res.status(200).json({ version });
  } catch (err) {
    return res.status(500).json({ version: 0, error: err.message });
  }
}
