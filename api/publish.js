// Vercel Serverless Function — /api/publish
// Receives journal state from admin, pushes baked index.html to GitHub
// Vercel detects the push and auto-redeploys for all visitors

export default async function handler(req, res) {
  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password, state } = req.body || {};

  // Check admin password (set in Vercel env vars)
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  if (!state) {
    return res.status(400).json({ error: "No state provided" });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO || "deepx12/CHIMKENS-JOURNAL";
  const FILE_PATH = "index.html";
  const API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

  try {
    // 1. Get current file SHA (required by GitHub API to update)
    const getRes = await fetch(API, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const getJson = await getRes.json();
    if (!getJson.sha) throw new Error("Could not fetch current file SHA");

    // 2. Decode current content
    const currentContent = Buffer.from(getJson.content, "base64").toString("utf8");

    // 3. Bake new state into the HTML with a version timestamp so
    // visitor devices can detect a new publish and drop their stale
    // localStorage cache automatically (no manual RESET needed).
    const version = Date.now();
    const stateWithVersion = { ...state, __version: version };
    // Remove any previous baked state / version
    let newContent = currentContent.replace(
      /\/\* __BAKED_STATE__ \*\/[\s\S]*?;\n(const __BAKED_VERSION__ = \d+;\n)?/g,
      ""
    );
    // Inject new baked state + version before function Flipbook()
    const baked =
      `/* __BAKED_STATE__ */\n` +
      `const __BAKED__ = ${JSON.stringify(stateWithVersion)};\n` +
      `const __BAKED_VERSION__ = ${version};\n`;
    newContent = newContent.replace("function Flipbook()", baked + "function Flipbook()");

    // 4. Push updated file to GitHub
    const putRes = await fetch(API, {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Admin: update journal pages",
        content: Buffer.from(newContent).toString("base64"),
        sha: getJson.sha,
        branch: "main",
      }),
    });

    const putJson = await putRes.json();
    if (!putRes.ok) throw new Error(putJson.message || "GitHub push failed");

    return res.status(200).json({ ok: true, message: "Published! Visitors will see changes in ~30 seconds." });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
