import { createRequire } from "node:module";
import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { quickFindAsyncAssets } from "../comparison/quick-find-critical.mjs";

const require = createRequire(import.meta.url);
const sharp = require("../node_modules/.pnpm/node_modules/sharp");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(repoRoot, "comparison", "after-assets");
const appCssPath = path.join(assetsRoot, "_next", "static", "chunks", "1j8ahw0e9ui5v.css");
const katexCssPath = path.join(assetsRoot, "_next", "static", "chunks", "3c4-ozf1dxam2.css");
const coverRoot = path.join(assetsRoot, "catalog-artwork", "books", "covers");
const logoRoot = path.join(assetsRoot, "catalog-artwork", "boards", "logos");
const reportPath = path.join(repoRoot, "comparison", "phase2-asset-report.json");
const catalogArtworkCssPath = path.join(assetsRoot, "catalog-artwork.css");
const catalogArtworkModulePath = path.join(repoRoot, "comparison", "catalog-artwork-inline.mjs");
const themeCssPath = path.join(assetsRoot, "theme.css");
const themeModulePath = path.join(repoRoot, "comparison", "theme-inline.mjs");
const latinFontPath = path.join(assetsRoot, "_next", "static", "media", "ibm-plex-sans-latin-v23.woff2");
const recoveredPreloadPath = path.join(assetsRoot, "_next", "static", "media", "a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2");
const recoveredPreloadUrl = "/_next/static/media/a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2";

const latinRange = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const greekRange = "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF";
const devanagariRange = "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09";

const fontFaces = [
  `@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:100 700;font-stretch:100%;font-display:swap;src:url(../media/a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2) format("woff2");unicode-range:${latinRange}}`,
  `@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:100 700;font-stretch:100%;font-display:swap;src:url(../media/ibm-plex-sans-greek-v23.woff2) format("woff2");unicode-range:${greekRange}}`,
  ...[400, 600, 700].map((weight) => `@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:${weight};font-display:swap;src:url(../media/ibm-plex-sans-devanagari-${weight}-v12.woff2) format("woff2");unicode-range:${devanagariRange}}`),
  '@font-face{font-family:"IBM Plex Sans Fallback";src:local(Arial);ascent-override:101.32%;descent-override:27.18%;line-gap-override:0%;size-adjust:101.17%}',
].join("");

async function patchFontCss() {
  const css = await readFile(appCssPath, "utf8");
  const selectors = css.match(/(\.manrope_[^{]+__className)\{font-family:[^}]+\}(\.manrope_[^{]+__variable)\{--font-manrope:[^}]+\}/);
  if (!selectors || selectors.index === undefined) throw new Error("Unable to locate the generated font selectors");
  const selectorCss = `${selectors[1]}{font-family:"IBM Plex Sans","IBM Plex Sans Fallback",Arial,sans-serif;font-style:normal}${selectors[2]}{--font-manrope:"IBM Plex Sans", "IBM Plex Sans Fallback"}`;
  const nextCss = fontFaces + selectorCss + css.slice(selectors.index + selectors[0].length);
  await writeFile(appCssPath, nextCss);
}

async function patchKatexCss() {
  const css = await readFile(katexCssPath, "utf8");
  await writeFile(katexCssPath, css.replaceAll("font-display:block", "font-display:swap"));
}

async function patchStaticHomepage() {
  const homepagePath = path.join(assetsRoot, "index.html");
  const [catalogArtworkCss, themeCss] = await Promise.all([
    readFile(catalogArtworkCssPath, "utf8"),
    readFile(themeCssPath, "utf8"),
  ]);
  let html = await readFile(homepagePath, "utf8");
  html = html.replace(/\/_next\/static\/media\/[^"']+\.woff2/g, recoveredPreloadUrl);
  html = html.replace(/href="\/quick-find\.css(?:\?[^"']*)?"/g, 'href="/quick-find.css?v=20260818-phase2"');
  html = html.replace(/<script src="\/quick-find\.js(?:\?[^"']*)?"[^>]*><\/script>/g, '<script src="/quick-find.js?v=20260818-phase2" defer data-studywudy-comparison="after"></script>');
  html = html.replace(/<script src="\/theme\.js(?:\?[^"']*)?"[^>]*><\/script>/g, '<script src="/theme.js?v=20260818-phase2" defer data-studywudy-theme="true"></script>');
  html = html.replace(/\/catalog-artwork\/boards\/logos\/(maharashtra-board|cbse|cisce|tamil-nadu-board)\.(?:png|webp)/g, "/catalog-artwork/boards/logos/$1-384.webp");
  if (!html.includes('data-studywudy-theme="bootstrap"')) {
    const bootstrap = '<script data-studywudy-theme="bootstrap">try{document.documentElement.dataset.theme=localStorage.getItem("studywudy-theme")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}</script>';
    html = html.replace('<link rel="stylesheet" href="/theme.css?v=20260818-phase2"', `${bootstrap}<link rel="stylesheet" href="/theme.css?v=20260818-phase2"`);
  }
  html = html.replace(/<style data-studywudy-theme="inline">[\s\S]*?<\/style>/, "");
  html = html.replace(/<link rel="stylesheet" href="\/theme\.css(?:\?[^"']*)?"[^>]*\/>/, "");
  html = html.replace(
    /(<script data-studywudy-theme="bootstrap">[\s\S]*?<\/script>)/,
    `$1<style data-studywudy-theme="inline">${themeCss}</style>`,
  );
  const catalogArtworkStyle = `<style data-studywudy-catalog-artwork="inline">${catalogArtworkCss}</style>`;
  const catalogArtworkStyleOrLink = /(?:<style data-studywudy-catalog-artwork="inline">[\s\S]*?<\/style>|<link rel="stylesheet" href="\/catalog-artwork\.css(?:\?[^"']*)?"[^>]*\/>)/;
  if (catalogArtworkStyleOrLink.test(html)) {
    html = html.replace(catalogArtworkStyleOrLink, catalogArtworkStyle);
  } else {
    html = html.replace("</head>", `${catalogArtworkStyle}</head>`);
  }
  html = html.replace(/<style data-studywudy-quick-find="critical">[\s\S]*?<\/noscript>/, '<link rel="stylesheet" href="/quick-find.css?v=20260818-phase2" data-studywudy-comparison="after"/>');
  html = html.replace(/<link rel="stylesheet" href="\/quick-find\.css(?:\?[^"']*)?"[^>]*\/>/, quickFindAsyncAssets("/quick-find.css?v=20260818-phase2"));
  html = html.replace(/<section class="qf-section"[^>]*data-phase2-static="true"[\s\S]*?<\/section>/, "");
  await writeFile(homepagePath, html);
}

async function buildInlineThemeModule() {
  const themeCss = await readFile(themeCssPath, "utf8");
  await writeFile(themeModulePath, `// Generated by scripts/phase2-build-assets.mjs.\nexport const THEME_CSS = ${JSON.stringify(themeCss)};\n`);
}

async function buildInlineCatalogArtworkModule() {
  const css = await readFile(catalogArtworkCssPath, "utf8");
  await writeFile(catalogArtworkModulePath, `// Generated by scripts/phase2-build-assets.mjs.\nexport const CATALOG_ARTWORK_CSS = ${JSON.stringify(css)};\n`);
}

async function filesUnder(directory, extension) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(fullPath, extension));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) found.push(fullPath);
  }
  return found;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function buildCovers() {
  const sources = await filesUnder(coverRoot, ".jpg");
  return mapWithConcurrency(sources, 8, async (sourcePath) => {
    const outputPath = sourcePath.replace(/\.jpg$/i, ".webp");
    await sharp(sourcePath)
      .rotate()
      .resize({ width: 432, height: 600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4, smartSubsample: true })
      .toFile(outputPath);
    const [sourceInfo, outputInfo] = await Promise.all([stat(sourcePath), stat(outputPath)]);
    return { sourceBytes: sourceInfo.size, outputBytes: outputInfo.size };
  });
}

async function buildLogos() {
  const entries = (await readdir(logoRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:png|webp)$/i.test(entry.name) && !/-384\.(?:avif|webp)$/i.test(entry.name));
  return mapWithConcurrency(entries, 4, async (entry) => {
    const sourcePath = path.join(logoRoot, entry.name);
    const stem = entry.name.replace(/\.(?:png|webp)$/i, "");
    const webpPath = path.join(logoRoot, `${stem}-384.webp`);
    const avifPath = path.join(logoRoot, `${stem}-384.avif`);
    const pipeline = sharp(sourcePath).rotate().resize({
      width: 384,
      height: 384,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    });
    await Promise.all([
      pipeline.clone().webp({ quality: 82, effort: 5, smartSubsample: true }).toFile(webpPath),
      pipeline.clone().avif({ quality: 55, effort: 5 }).toFile(avifPath),
    ]);
    const [sourceInfo, webpInfo, avifInfo] = await Promise.all([stat(sourcePath), stat(webpPath), stat(avifPath)]);
    return { slug: stem, sourceBytes: sourceInfo.size, webpBytes: webpInfo.size, avifBytes: avifInfo.size };
  });
}

await copyFile(latinFontPath, recoveredPreloadPath);
await Promise.all([
  patchFontCss(),
  patchKatexCss(),
  patchStaticHomepage(),
  buildInlineCatalogArtworkModule(),
  buildInlineThemeModule(),
]);
const [covers, logos] = await Promise.all([buildCovers(), buildLogos()]);
const sourceCoverBytes = covers.reduce((total, item) => total + item.sourceBytes, 0);
const webpCoverBytes = covers.reduce((total, item) => total + item.outputBytes, 0);
const report = {
  generatedAt: "2026-08-18",
  fonts: {
    family: "IBM Plex Sans",
    display: "optional",
    preload: recoveredPreloadUrl,
    subsets: ["latin", "greek", "devanagari"],
  },
  katex: { serverRendered: true, fontDisplay: "swap" },
  covers: {
    count: covers.length,
    sourceBytes: sourceCoverBytes,
    webpBytes: webpCoverBytes,
    reductionPercent: Number(((1 - webpCoverBytes / sourceCoverBytes) * 100).toFixed(1)),
    renderedWidth: 216,
    renderedHeight: 300,
  },
  boardLogos: logos,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
