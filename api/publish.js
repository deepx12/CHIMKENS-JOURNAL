// Vercel Serverless Function — /api/publish
// Receives journal state from admin, pushes baked index.html to GitHub
// using the Git Data API (blob + tree + commit) which has no 1 MB file
// size limit, unlike the Contents API which silently returns empty
// content for files over 1 MB and caused earlier data loss.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password, state } = req.body || {};

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  if (!state) {
    return res.status(400).json({ error: "No state provided" });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO || "deepx12/CHIMKENS-JOURNAL";
  const FILE_PATH = "index.html";
  const BRANCH = "main";
  const base = `https://api.github.com/repos/${REPO}`;
  const auth = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "chimkens-publish",
  };

  const gh = async (path, init = {}) => {
    const r = await fetch(base + path, { ...init, headers: { ...auth, ...(init.headers || {}) } });
    const text = await r.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!r.ok) {
      const err = new Error(`GitHub ${path} ${r.status}: ${json.message || text.slice(0, 200)}`);
      err.status = r.status; err.body = json;
      throw err;
    }
    return json;
  };

  try {
    // 1. Resolve current HEAD of main
    const ref = await gh(`/git/ref/heads/${BRANCH}`);
    const headSha = ref.object.sha;

    // 2. Fetch the commit to get its tree SHA
    const headCommit = await gh(`/git/commits/${headSha}`);
    const baseTreeSha = headCommit.tree.sha;

    // 3. Read current index.html via raw.githubusercontent.com — no 1MB
    //    limit like the Contents API, and it returns actual file bytes.
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE_PATH}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );
    if (!rawRes.ok) {
      throw new Error(`Raw fetch failed (${rawRes.status}) — repo/branch/path correct?`);
    }
    const currentContent = await rawRes.text();
    if (!currentContent || currentContent.length < 1000) {
      // Guard against pushing over a corrupt / missing file.
      throw new Error(`Refusing to publish: current ${FILE_PATH} is empty or too small (${currentContent.length} bytes). The file may already be corrupted — restore from git history before publishing again.`);
    }

    // 4. Bake new state + version
    const version = Date.now();
    const stateWithVersion = { ...state, __version: version };
    let newContent = currentContent.replace(
      /\/\* __BAKED_STATE__ \*\/[\s\S]*?;\n(const __BAKED_VERSION__ = \d+;\n)?/g,
      ""
    );
    const baked =
      `/* __BAKED_STATE__ */\n` +
      `const __BAKED__ = ${JSON.stringify(stateWithVersion)};\n` +
      `const __BAKED_VERSION__ = ${version};\n`;
    const marker = "function Flipbook()";
    if (!newContent.includes(marker)) {
      throw new Error(`Injection marker "${marker}" not found in ${FILE_PATH}`);
    }
    newContent = newContent.replace(marker, baked + marker);

    // 5. Sanity check output size before pushing
    if (newContent.length < 1000) {
      throw new Error(`Refusing to publish: rendered output is only ${newContent.length} bytes.`);
    }

    // 6. Create a blob for the new HTML (no size limit on blobs endpoint).
    const blob = await gh(`/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: Buffer.from(newContent, "utf8").toString("base64"),
        encoding: "base64",
      }),
    });

    // 7. Create a new tree that replaces index.html with the new blob.
    const tree = await gh(`/git/trees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [{ path: FILE_PATH, mode: "100644", type: "blob", sha: blob.sha }],
      }),
    });

    // 8. Create a commit pointing to the new tree.
    const commit = await gh(`/git/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Admin: update journal pages",
        tree: tree.sha,
        parents: [headSha],
      }),
    });

    // 9. Fast-forward the branch ref to the new commit.
    await gh(`/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return res.status(200).json({ ok: true, message: "Published! Visitors will see changes in ~30 seconds." });
  } catch (err) {
    console.error("Publish error:", err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}
