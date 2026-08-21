import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { previewSnapshotRelativePath } from "./vercel-preview-routes.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(repositoryRoot, "vercel-dist");
const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "vercel-preview/manifest.json"), "utf8"),
);

const failures = [];
for (const { route } of manifest.routes) {
  const file = resolve(outputRoot, previewSnapshotRelativePath(route, false));
  try {
    const html = await readFile(file, "utf8");
    if (!html.includes('name="studywudy-preview"')) failures.push(`${route}: preview marker missing`);
    if (!html.includes("noindex, nofollow, noarchive")) failures.push(`${route}: noindex meta missing`);
    if (/\b(?:src|action)="https:\/\/[^"]*workers\.dev/iu.test(html)) {
      failures.push(`${route}: production Cloudflare runtime request found`);
    }
  } catch (error) {
    failures.push(`${route}: ${error.message}`);
  }
}

for (const required of ["robots.txt", "404.html", "preview-scope/index.html", "preview-manifest.json"]) {
  try {
    await access(resolve(outputRoot, required));
  } catch {
    failures.push(`${required}: required preview file missing`);
  }
}

for (const forbidden of ["sitemap.xml", "sitemaps", "monitoring"]) {
  try {
    await access(resolve(outputRoot, forbidden));
    failures.push(`${forbidden}: production-only asset must not ship in the preview`);
  } catch {
    // Expected.
  }
}

const robots = await readFile(resolve(outputRoot, "robots.txt"), "utf8");
if (!robots.includes("Disallow: /")) failures.push("robots.txt does not block crawling");

const rootFiles = await readdir(outputRoot);
if (!rootFiles.length) failures.push("Vercel output directory is empty");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Vercel preview verification passed: ${manifest.routeCount} isolated HTML routes`);
}
