import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { previewSnapshotRelativePath } from "./vercel-preview-routes.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const assetsRoot = resolve(repositoryRoot, "comparison/after-assets");
const previewRoot = resolve(repositoryRoot, "vercel-preview");
const snapshotsRoot = resolve(previewRoot, "snapshots");
const outputRoot = resolve(repositoryRoot, "vercel-dist");

const excludedAssetRoots = new Set(["monitoring", "pages", "sitemaps"]);
const excludedAssetFiles = new Set(["robots.txt", "sitemap.xml"]);

function copyAsset(source) {
  const assetPath = relative(assetsRoot, source);
  if (!assetPath) return true;
  const [rootName] = assetPath.split(sep);
  if (excludedAssetRoots.has(rootName)) return false;
  return !excludedAssetFiles.has(assetPath);
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)} | StudyWudy Preview</title><style>body{margin:0;background:#f5f0e6;color:#101316;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:min(900px,calc(100% - 32px));margin:56px auto}.card{padding:clamp(20px,4vw,40px);border:1px solid #b8b0a1;border-radius:18px;background:#fff;box-shadow:0 12px 36px rgba(16,19,22,.08)}h1{font-size:clamp(30px,6vw,54px);line-height:1.05;margin:0 0 16px}a{color:#0e5a36;font-weight:750}li{margin:.45rem 0}.eyebrow{color:#6a4e00;font-size:.8rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}</style></head><body><main class="shell"><section class="card"><p class="eyebrow">Static Vercel QA preview</p>${body}</section></main></body></html>`;
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve(previewRoot, "manifest.json"), "utf8"));
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await cp(assetsRoot, outputRoot, { recursive: true, filter: copyAsset });

  const snapshotFiles = (await walk(snapshotsRoot)).filter((path) => path.endsWith(".html.gz"));
  for (const snapshotFile of snapshotFiles) {
    const destination = resolve(
      outputRoot,
      relative(snapshotsRoot, snapshotFile).replace(/\.gz$/u, ""),
    );
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, gunzipSync(await readFile(snapshotFile)));
  }

  const routeList = manifest.routes
    .map(({ route }) => `<li><a href="${escapeHtml(route)}">${escapeHtml(route)}</a></li>`)
    .join("");
  const scopeHtml = shell(
    "Verification scope",
    `<h1>Preview verification scope</h1><p>This deployment contains ${manifest.routeCount} read-only snapshots rendered from the local StudyWudy backup. It has no production Cloudflare bindings. Forms and writes are disabled.</p><ol>${routeList}</ol>`,
  );
  const unavailableHtml = shell(
    "Route outside preview scope",
    '<h1>This route is outside the static preview.</h1><p>The production corpus is intentionally not connected. Use the <a href="/preview-scope">preview scope</a> to inspect the included pages.</p><p><a href="/">Return to StudyWudy preview</a></p>',
  );

  await mkdir(resolve(outputRoot, "preview-scope"), { recursive: true });
  await writeFile(resolve(outputRoot, "preview-scope/index.html"), scopeHtml);
  await writeFile(resolve(outputRoot, "404.html"), unavailableHtml);
  await writeFile(resolve(outputRoot, "robots.txt"), "User-agent: *\nDisallow: /\n");
  await writeFile(resolve(outputRoot, "preview-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(outputRoot, "vercel.json"), `${JSON.stringify({
    cleanUrls: true,
    trailingSlash: false,
    headers: [{
      source: "/(.*)",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "X-StudyWudy-Environment", value: "vercel-static-qa-preview" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }],
  }, null, 2)}\n`);

  const rootIndex = resolve(outputRoot, previewSnapshotRelativePath("/", false));
  const rootStats = await stat(rootIndex);
  if (!rootStats.isFile()) throw new Error("Preview root snapshot is missing");
  console.log(`Vercel preview build ready: ${manifest.routeCount} HTML routes`);
}

await main();
