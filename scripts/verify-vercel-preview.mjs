import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { previewSnapshotRelativePath } from "./vercel-preview-routes.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(repositoryRoot, "vercel-dist");
const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "vercel-preview/manifest.json"), "utf8"),
);

const failures = [];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function assetPath(value, referencePath) {
  const normalized = value.trim().replace(/^['"]|['"]$/gu, "");
  if (!normalized || normalized.startsWith("#") || normalized.startsWith("data:")) return null;
  let url;
  try {
    url = new URL(normalized, new URL(`/${referencePath}`, "https://preview.invalid"));
  } catch {
    return null;
  }
  if (url.origin !== "https://preview.invalid" || !/\.[a-z0-9]{1,10}$/iu.test(url.pathname)) return null;
  return decodeURIComponent(url.pathname).replace(/^\//u, "");
}

function referencedAssets(contents, extension, referencePath) {
  const values = [];
  if (extension === ".html") {
    for (const match of contents.matchAll(/\b(?:src|href|poster)=(?:"([^"]+)"|'([^']+)')/giu)) {
      values.push(match[1] || match[2] || "");
    }
    for (const match of contents.matchAll(/\bsrcset=(?:"([^"]+)"|'([^']+)')/giu)) {
      for (const candidate of (match[1] || match[2] || "").split(",")) {
        values.push(candidate.trim().split(/\s+/u)[0] || "");
      }
    }
  }
  if (extension === ".html" || extension === ".css") {
    for (const match of contents.matchAll(/url\(([^)]+)\)/giu)) values.push(match[1] || "");
  }
  return values.map((value) => assetPath(value, referencePath)).filter(Boolean);
}
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

for (const required of ["robots.txt", "404.html", "preview-scope/index.html", "preview-manifest.json", "vercel.json"]) {
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

const outputFiles = await walk(outputRoot);
const availableFiles = new Set(
  outputFiles.map((path) => relative(outputRoot, path).split(sep).join("/")),
);
const missingAssets = new Map();
for (const file of outputFiles) {
  const extension = file.endsWith(".html") ? ".html" : file.endsWith(".css") ? ".css" : "";
  if (!extension) continue;
  const contents = await readFile(file, "utf8");
  const referencePath = relative(outputRoot, file).split(sep).join("/");
  for (const path of referencedAssets(contents, extension, referencePath)) {
    if (!availableFiles.has(path)) {
      const pages = missingAssets.get(path) || [];
      if (pages.length < 3) pages.push(relative(outputRoot, file));
      missingAssets.set(path, pages);
    }
  }
}
for (const [path, pages] of missingAssets) {
  failures.push(`${path}: missing static asset referenced by ${pages.join(", ")}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Vercel preview verification passed: ${manifest.routeCount} isolated HTML routes`);
}
