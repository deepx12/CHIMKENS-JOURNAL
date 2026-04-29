// Vercel Serverless Function — /api/version
// Lightweight endpoint: returns the currently published __BAKED_VERSION__
// so open tabs can poll and auto-refresh when a new publish lands.

export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO || "deepx12/CHIMKENS-JOURNAL";
  const FILE_PATH = "index.html";
  const BRANCH = "main";

  // Short CDN cache so we don't hammer GitHub but still propagate fast.
  res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");

  try {
    // Use raw.githubusercontent.com — no 1MB limit unlike the Contents API,
    // which silently returns empty content for files over 1MB (index.html is ~4MB).
    const r = await fetch(
      `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE_PATH}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );
    if (!r.ok) return res.status(500).json({ version: 0 });
    const html = await r.text();
    const m = html.match(/const __BAKED_VERSION__ = (\d+);/);
    const version = m ? parseInt(m[1], 10) : 0;
    return res.status(200).json({ version });
  } catch (err) {
    return res.status(500).json({ version: 0, error: err.message });
  }
}
